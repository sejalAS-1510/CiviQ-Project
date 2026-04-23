const API_BASE = import.meta.env.VITE_API_URL;
import { create } from "zustand";

type UserPayload = {
  _id: string;
  name: string;
  email: string;
  role: string;
  specialization?: string;
  phone?: string;
  address?: string;
  token?: string;
  avatar?: string;
  ownerId?: string;
};

export type UserRole = "resident" | "technician" | "admin";
export type TechnicianSpecialization =
  | "Plumbing"
  | "Electrical"
  | "Cleaning"
  | "Security"
  | "Infrastructure"
  | "Noise"
  | "General";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  specialization?: TechnicianSpecialization;
  phone?: string;
  address?: string;
  avatar?: string;
  ownerId?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
  signup: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    specialization?: TechnicianSpecialization;
    ownerId?: string;
  }) => Promise<{ success: boolean; message: string }>;
  loginWithCredentials: (payload: {
    email: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  updateProfile: (payload: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    password?: string;
    avatar?: string;
  }) => Promise<{ success: boolean; message: string }>;
  deleteMyAccount: () => Promise<{ success: boolean; message: string }>;
  deleteUserByEmail: (email: string) => Promise<{
    success: boolean;
    message: string;
  }>;
  clearError: () => void;
  logout: () => void;
  uploadAvatar: (file: File) => Promise<{ success: boolean; message: string }>;
}

const AUTH_STORAGE_KEY = "civiq_auth";

type BackendRole = "user" | "technician" | "admin";

function toBackendRole(role: UserRole): BackendRole {
  if (role === "technician") return "technician";
  if (role === "admin") return "admin";
  return "user";
}

function fromBackendRole(role?: string): UserRole {
  if (role === "technician") return "technician";
  if (role === "admin") return "admin";
  return "resident";
}

function normalizeStoredRole(role?: string): UserRole {
  if (role === "authority") return "technician";
  if (role === "technician") return "technician";
  if (role === "admin") return "admin";
  return "resident";
}

function normalizeStoredSpecialization(
  specialization?: string,
): TechnicianSpecialization | undefined {
  const normalized = String(specialization || "")
    .trim()
    .toLowerCase();

  if (!normalized) return undefined;
  if (normalized === "plumbing") return "Plumbing";
  if (normalized === "electrical") return "Electrical";
  if (normalized === "cleaning" || normalized === "sanitation")
    return "Cleaning";
  if (normalized === "security" || normalized === "public safety")
    return "Security";
  if (normalized === "infrastructure") return "Infrastructure";
  if (normalized === "noise" || normalized === "environment") return "Noise";
  if (normalized === "general" || normalized === "utilities") return "General";

  return undefined;
}

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { user: null, token: null, isAuthenticated: false };
    const parsed = JSON.parse(raw) as {
      user: User;
      token: string;
    };
    if (!parsed?.user || !parsed?.token) {
      return { user: null, token: null, isAuthenticated: false };
    }
    const normalizedUser: User = {
      ...parsed.user,
      role: normalizeStoredRole(parsed.user.role),
      specialization: normalizeStoredSpecialization(parsed.user.specialization),
    };

    return {
      user: normalizedUser,
      token: parsed.token,
      isAuthenticated: true,
    };
  } catch {
    return { user: null, token: null, isAuthenticated: false };
  }
}

function persistAuth(user: User, token: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
}

function clearPersistedAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

type ApiPayload = {
  success?: boolean;
  message?: string;
  data?: unknown;
  // [key: string]: any; // Removed index signature for type safety
};
async function parseApiPayload(response: Response): Promise<ApiPayload> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text };
  }
}

const stored = loadStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  user: stored.user,
  token: stored.token,
  isAuthenticated: stored.isAuthenticated,
  loading: false,
  error: null,
  signup: async ({ name, email, password, role, specialization, ownerId }) => {
    set({ loading: true, error: null });
    try {
      const API_BASE = import.meta.env.VITE_API_URL;
      const response = await fetch(`${API_BASE}/api/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role: toBackendRole(role),
          specialization,
          ownerId,
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Signup failed";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      set({ loading: false, error: null });
      return {
        success: true,
        message: payload?.message || "Signup successful. Please login.",
      };
    } catch (error) {
      const message =
        "Unable to reach server for signup. Ensure the app server is running.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  loginWithCredentials: async ({ email, password }) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = await parseApiPayload(response);
      const userData = payload?.data as UserPayload | undefined;
      if (!response.ok || !payload?.success || !userData?.token) {
        const message = payload?.message || "Login failed";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const user: User = {
        id: userData._id,
        name: userData.name,
        email: userData.email,
        role: fromBackendRole(userData.role),
        specialization: normalizeStoredSpecialization(userData.specialization),
        phone: userData.phone,
        address: userData.address,
        avatar: userData.avatar,
        ownerId: userData.ownerId,
      };

      persistAuth(user, userData.token);
      set({
        user,
        token: userData.token,
        isAuthenticated: true,
        loading: false,
        error: null,
      });

      return { success: true, message: payload?.message || "Login successful" };
    } catch {
      const message =
        "Unable to reach server for login. Ensure the app server is running.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  updateProfile: async ({ name, email, phone, address, password }) => {
    const { token, user } = useAuthStore.getState();

    if (!token || !user) {
      const message = "Please login again to update profile.";
      set({ error: message });
      return { success: false, message };
    }

    set({ loading: true, error: null });
    try {
      const payloadBody = {
        name: typeof name === "string" ? name.trim() : undefined,
        email: typeof email === "string" ? email.trim() : undefined,
        phone: typeof phone === "string" ? phone.trim() : undefined,
        address: typeof address === "string" ? address.trim() : undefined,
        password,
      };

      if (payloadBody.phone && !/^\d{10}$/.test(payloadBody.phone)) {
        const message = "Please enter a valid 10-digit phone number.";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const response = await fetch(`${API_BASE}/api/users/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payloadBody),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to update profile";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const updatedData = payload.data as UserPayload | undefined;
      if (!updatedData) {
        set({ loading: false, error: "Invalid response from server" });
        return { success: false, message: "Invalid response from server" };
      }
      const updatedUser: User = {
        id: updatedData._id,
        name: updatedData.name,
        email: updatedData.email,
        role: fromBackendRole(updatedData.role),
        specialization: normalizeStoredSpecialization(
          updatedData.specialization,
        ),
        phone: updatedData.phone,
        address: updatedData.address,
        avatar: updatedData.avatar,
      };
      const nextToken = updatedData.token || token;
      persistAuth(updatedUser, nextToken);
      set({
        user: updatedUser,
        token: nextToken,
        loading: false,
        error: null,
      });
      return {
        success: true,
        message: payload?.message || "Profile updated successfully",
      };
    } catch {
      const message =
        "Unable to reach server for profile update. Ensure the app server is running.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  deleteMyAccount: async () => {
    const { token } = useAuthStore.getState();

    if (!token) {
      const message = "Please login again to delete your account.";
      set({ error: message });
      return { success: false, message };
    }

    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/profile`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await parseApiPayload(response);
      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to delete account";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      clearPersistedAuth();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        error: null,
      });

      return {
        success: true,
        message: payload?.message || "Account deleted successfully",
      };
    } catch {
      const message =
        "Unable to reach server to delete account. Ensure the app server is running.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  deleteUserByEmail: async (email: string) => {
    const { token, user } = useAuthStore.getState();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!token || !user) {
      const message = "Please login again to continue.";
      set({ error: message });
      return { success: false, message };
    }

    if (user.role !== "admin") {
      const message = "Only admins can delete other accounts.";
      set({ error: message });
      return { success: false, message };
    }

    if (!normalizedEmail) {
      const message = "Please enter an email to delete.";
      set({ error: message });
      return { success: false, message };
    }

    if (normalizedEmail === user.email.toLowerCase()) {
      const message =
        "Use 'Delete my account' in Danger Zone to remove your own account.";
      set({ error: message });
      return { success: false, message };
    }

    set({ loading: true, error: null });
    try {
      const usersResponse = await fetch(
        `${API_BASE}/api/users?page=1&limit=2000`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const usersPayload = await parseApiPayload(usersResponse);
      if (!usersResponse.ok || !usersPayload?.success) {
        const message = usersPayload?.message || "Unable to fetch users";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const usersArr = Array.isArray(usersPayload?.data)
        ? (usersPayload.data as UserPayload[])
        : [];
      const targetUser = usersArr.find(
        (item) => String(item?.email || "").toLowerCase() === normalizedEmail,
      );

      if (!targetUser?._id) {
        const message = "User not found for the provided email.";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const deleteResponse = await fetch(
        `${API_BASE}/api/users/${targetUser._id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const deletePayload = await parseApiPayload(deleteResponse);
      if (!deleteResponse.ok || !deletePayload?.success) {
        const message = deletePayload?.message || "Failed to delete user";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      set({ loading: false, error: null });
      return {
        success: true,
        message: deletePayload?.message || "User deleted successfully",
      };
    } catch {
      const message =
        "Unable to reach server to delete user. Ensure the app server is running.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  clearError: () => set({ error: null }),
  logout: () => {
    clearPersistedAuth();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },
  uploadAvatar: async (
    file: File,
  ): Promise<{ success: boolean; message: string }> => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) {
      const message = "Please login again to upload avatar.";
      set({ error: message });
      return { success: false, message };
    }
    set({ loading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch(`${API_BASE}/api/users/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = await parseApiPayload(response);
      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to upload avatar";
        set({ loading: false, error: message });
        return { success: false, message };
      }
      // Update user avatar in store
      const avatarPayload = payload as { avatar?: string };
      set((state) => ({
        user:
          state.user && typeof avatarPayload.avatar === "string"
            ? { ...state.user, avatar: avatarPayload.avatar }
            : state.user,
        loading: false,
        error: null,
      }));
      // Also update persisted auth
      if (user && token) {
        if (typeof avatarPayload.avatar === "string") {
          persistAuth({ ...user, avatar: avatarPayload.avatar }, token);
        } else {
          persistAuth(user, token);
        }
      }
      return { success: true, message: "Avatar uploaded successfully" };
    } catch {
      const message = "Unable to reach server for avatar upload.";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
}));
