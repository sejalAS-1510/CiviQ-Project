import { create } from "zustand";
import { useAuthStore } from "@/store/authStore";

export type IssueStatus = "pending" | "in-progress" | "resolved";
export type IssueCategory =
  | "plumbing"
  | "electrical"
  | "cleaning"
  | "security"
  | "infrastructure"
  | "noise"
  | "other";

export interface Issue {
  id: string;
  category: IssueCategory;
  description: string;
  location: string;
  imageUrl?: string;
  status: IssueStatus;
  reportedBy: string;
  reportedAt: Date;
  updatedAt: Date;
}

interface IssueState {
  issues: Issue[];
  loading: boolean;
  error: string | null;
  loadIssues: () => Promise<void>;
  addIssue: (issue: {
    category: IssueCategory;
    description: string;
    location: string;
    imageFile?: File;
  }) => Promise<{ success: boolean; message: string }>;
  updateStatus: (
    id: string,
    status: IssueStatus,
  ) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
}

type BackendStatus = "Pending" | "In Progress" | "Resolved" | "Closed";
type BackendCategory =
  | "Infrastructure"
  | "Sanitation"
  | "Utilities"
  | "Safety"
  | "Environment"
  | "General";

interface BackendComplaint {
  _id: string;
  category: BackendCategory;
  description: string;
  location: string;
  status: BackendStatus;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
  userId?: {
    name?: string;
    email?: string;
  };
}

function toBackendCategory(category: IssueCategory): BackendCategory {
  switch (category) {
    case "infrastructure":
      return "Infrastructure";
    case "cleaning":
      return "Sanitation";
    case "plumbing":
    case "electrical":
      return "Utilities";
    case "security":
      return "Safety";
    case "noise":
    case "other":
    default:
      return "General";
  }
}

function fromBackendCategory(category: BackendCategory): IssueCategory {
  switch (category) {
    case "Infrastructure":
      return "infrastructure";
    case "Sanitation":
      return "cleaning";
    case "Utilities":
      return "electrical";
    case "Safety":
      return "security";
    case "Environment":
      return "other";
    case "General":
    default:
      return "other";
  }
}

function toBackendStatus(status: IssueStatus): BackendStatus {
  if (status === "in-progress") return "In Progress";
  if (status === "resolved") return "Resolved";
  return "Pending";
}

function fromBackendStatus(status: BackendStatus): IssueStatus {
  if (status === "In Progress") return "in-progress";
  if (status === "Resolved" || status === "Closed") return "resolved";
  return "pending";
}

function toIssue(complaint: BackendComplaint): Issue {
  const imagePath = complaint.images?.[0];
  const imageUrl = imagePath
    ? imagePath.startsWith("http")
      ? imagePath
      : imagePath
    : undefined;

  return {
    id: complaint._id,
    category: fromBackendCategory(complaint.category || "General"),
    description: complaint.description,
    location: complaint.location,
    imageUrl,
    status: fromBackendStatus(complaint.status || "Pending"),
    reportedBy: complaint.userId?.name || "Citizen",
    reportedAt: complaint.createdAt
      ? new Date(complaint.createdAt)
      : new Date(),
    updatedAt: complaint.updatedAt ? new Date(complaint.updatedAt) : new Date(),
  };
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const { token } = useAuthStore.getState();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const isFormDataBody = options.body instanceof FormData;
  if (!isFormDataBody) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || "Unexpected response from server" };
  }

  return { response, payload };
}

export const useIssueStore = create<IssueState>((set) => ({
  issues: [],
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  loadIssues: async () => {
    set({ loading: true, error: null });
    try {
      const { response, payload } = await apiRequest("/api/complaints");
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to load issues");
      }

      const complaints = Array.isArray(payload.data) ? payload.data : [];
      set({
        issues: complaints.map(toIssue),
        loading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || "Unable to load issues",
      });
    }
  },
  addIssue: async (issue) => {
    set({ loading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("description", issue.description);
      formData.append("location", issue.location);
      formData.append("category", toBackendCategory(issue.category));
      formData.append("autoAssign", "true");
      if (issue.imageFile) {
        formData.append("image", issue.imageFile);
      }

      const { response, payload } = await apiRequest("/api/complaints", {
        method: "POST",
        body: formData,
      });

      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to create issue";
        set({ loading: false, error: message });
        return { success: false, message };
      }

      const createdIssue = toIssue(payload.data);
      set((state) => ({
        issues: [createdIssue, ...state.issues],
        loading: false,
        error: null,
      }));

      return {
        success: true,
        message: payload?.message || "Issue reported successfully",
      };
    } catch (error: any) {
      const message = error?.message || "Unable to submit issue";
      set({ loading: false, error: message });
      return { success: false, message };
    }
  },
  updateStatus: async (id, status) => {
    try {
      const { response, payload } = await apiRequest(`/api/complaints/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: toBackendStatus(status) }),
      });

      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to update status";
        return { success: false, message };
      }

      set((state) => ({
        issues: state.issues.map((i) =>
          i.id === id ? toIssue(payload.data) : i,
        ),
      }));

      return {
        success: true,
        message: payload?.message || "Status updated successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || "Unable to update status",
      };
    }
  },
}));
