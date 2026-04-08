import { create } from "zustand";

export type UserRole = "resident" | "authority" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
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
  }) => Promise<{ success: boolean; message: string }>;
  loginWithCredentials: (payload: {
    email: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
  logout: () => void;
}

const AUTH_STORAGE_KEY = "civiq_auth";

type BackendRole = "user" | "technician" | "admin";

function toBackendRole(role: UserRole): BackendRole {
  if (role === "authority") return "technician";
  if (role === "admin") return "admin";
  return "user";
}

function fromBackendRole(role?: string): UserRole {
  if (role === "technician") return "authority";
  if (role === "admin") return "admin";
  return "resident";
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
    return {
      user: parsed.user,
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

async function parseApiPayload(response: Response): Promise<any> {
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
  signup: async ({ name, email, password, role }) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`/api/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role: toBackendRole(role),
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
      const response = await fetch(`/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok || !payload?.success || !payload?.data?.token) {
        const message = payload?.message || "Login failed";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const user: User = {
        id: payload.data._id,
        name: payload.data.name,
        email: payload.data.email,
        role: fromBackendRole(payload.data.role),
      };

      persistAuth(user, payload.data.token);
      set({
        user,
        token: payload.data.token,
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
  clearError: () => set({ error: null }),
  logout: () => {
    clearPersistedAuth();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },
}));
