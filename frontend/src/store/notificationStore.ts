interface NotificationApiItem {
  _id: string;
  title: string;
  message: string;
  type?: NotificationType;
  category?: NotificationCategory;
  isRead?: boolean;
  createdAt: string;
  readAt?: string;
  complaintId?: {
    _id: string;
    description?: string;
    location?: string;
    status?: string;
    category?: string;
  };
  createdBy?: {
    name?: string;
    role?: string;
  };
}
import { create } from "zustand";
import { useAuthStore } from "@/store/authStore";

export type NotificationType = "success" | "info" | "warning" | "error";
export type NotificationCategory =
  | "complaint-created"
  | "complaint-assigned"
  | "complaint-status"
  | "complaint-resolved"
  | "system";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  complaint?: {
    id: string;
    description?: string;
    location?: string;
    status?: string;
    category?: string;
  };
  createdBy?: {
    name?: string;
    role?: string;
  };
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearError: () => void;
}

type NotificationApiPayload = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

async function parseApiPayload(
  response: Response,
): Promise<NotificationApiPayload> {
  const text = await response.text();
  if (!text) return {};

  const trimmed = text.trim();
  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return {
      success: false,
      message:
        "Notifications service is unavailable. Restart the backend and try again.",
    };
  }

  try {
    return JSON.parse(text) as NotificationApiPayload;
  } catch {
    return { success: false, message: text };
  }
}

const API_BASE = import.meta.env.VITE_API_URL;
async function apiRequest(path: string, options: RequestInit = {}) {
  const { token } = useAuthStore.getState();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Prefix all /api calls with API_BASE if not already absolute
  const url = path.startsWith("/api/") ? `${API_BASE}${path}` : path;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await parseApiPayload(response);
  return { response, payload };
}

function toNotification(item: unknown): NotificationItem {
  const i = item as NotificationApiItem;
  return {
    id: i._id,
    title: i.title,
    message: i.message,
    type: i.type || "info",
    category: i.category || "system",
    isRead: Boolean(i.isRead),
    createdAt: i.createdAt,
    readAt: i.readAt,
    complaint: i.complaintId
      ? {
          id: i.complaintId._id,
          description: i.complaintId.description,
          location: i.complaintId.location,
          status: i.complaintId.status,
          category: i.complaintId.category,
        }
      : undefined,
    createdBy: i.createdBy
      ? {
          name: i.createdBy.name,
          role: i.createdBy.role,
        }
      : undefined,
  };
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  loadNotifications: async () => {
    set({ loading: true, error: null });
    try {
      const { response, payload } = await apiRequest("/api/notifications");

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to load notifications");
      }

      const items = Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>[])
        : [];
      const notifications = items.map(toNotification);
      set({
        notifications,
        unreadCount: notifications.filter((item) => !item.isRead).length,
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load notifications",
      });
    }
  },
  loadUnreadCount: async () => {
    try {
      const { response, payload } = await apiRequest(
        "/api/notifications/unread-count",
      );

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.message || "Failed to load notification count",
        );
      }

      set({ unreadCount: (payload.data as { count?: number })?.count || 0 });
    } catch {
      const notifications = get().notifications;
      set({ unreadCount: notifications.filter((item) => !item.isRead).length });
    }
  },
  markAsRead: async (id: string) => {
    try {
      const { response, payload } = await apiRequest(
        `/api/notifications/${id}/read`,
        { method: "PUT" },
      );

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to update notification");
      }

      set((state) => {
        const notifications = state.notifications.map((item) =>
          item.id === id
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item,
        );

        return {
          notifications,
          unreadCount: notifications.filter((item) => !item.isRead).length,
        };
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to update notification",
      });
    }
  },
  markAllAsRead: async () => {
    try {
      const { response, payload } = await apiRequest(
        "/api/notifications/read-all",
        {
          method: "PUT",
        },
      );

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to update notifications");
      }

      set((state) => ({
        notifications: state.notifications.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to update notifications",
      });
    }
  },
}));
