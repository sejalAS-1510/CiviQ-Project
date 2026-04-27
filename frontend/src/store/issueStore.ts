type ApiPayload = {
  success?: boolean;
  message?: string;
  data?: unknown;
};
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
  technicianDecision?: "pending" | "accepted" | "rejected" | "rescheduled";
  technicianDecisionNote?: string;
  scheduledFor?: Date;
  residentName?: string;
  residentEmail?: string;
  technicianName?: string;
  technicianEmail?: string;
  technicianSpecialization?: string;
  technicianOrgName?: string;
  technicianOrgAddress?: string;
  technicianRating?: number;
  technicianFeedback?: string;
  ratings?: Array<{
    rater: string;
    role: "admin" | "resident";
    rating: number;
    feedback?: string;
    createdAt?: string;
  }>;
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
    residentName?: string;
    residentEmail?: string;
  }) => Promise<{ success: boolean; message: string }>;
  updateStatus: (
    id: string,
    status: IssueStatus,
  ) => Promise<{ success: boolean; message: string }>;
  deleteIssue: (id: string) => Promise<{ success: boolean; message: string }>;
  technicianDecision: (
    id: string,
    payload: {
      action: "accept" | "reject" | "reschedule";
      note?: string;
      rescheduleFor?: string;
    },
  ) => Promise<{ success: boolean; message: string }>;
  rateTechnician: (
    id: string,
    rating: number,
    feedback: string,
  ) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
}
// Backend rating type for strict mapping
interface BackendRating {
  rater: string;
  role: "admin" | "resident";
  rating: number;
  feedback?: string;
  createdAt?: string;
}

type BackendStatus = "Pending" | "In Progress" | "Resolved" | "Closed";
type BackendCategory =
  | "Plumbing"
  | "Electrical"
  | "Cleaning"
  | "Security"
  | "Infrastructure"
  | "Noise"
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
  technicianDecision?: "Pending" | "Accepted" | "Rejected" | "Rescheduled";
  technicianDecisionNote?: string;
  scheduledFor?: string;
  userId?: {
    name?: string;
    email?: string;
  };
  technician?: {
    name?: string;
    email?: string;
    specialization?: string;
    ownerId?: {
      name?: string;
      address?: string;
    };
  };
  technicianRating?: number;
  technicianFeedback?: string;
}

function fromBackendTechnicianDecision(
  value?: string,
): Issue["technicianDecision"] {
  if (value === "Accepted") return "accepted";
  if (value === "Rejected") return "rejected";
  if (value === "Rescheduled") return "rescheduled";
  if (value === "Pending") return "pending";
  return undefined;
}

function toBackendCategory(category: IssueCategory): BackendCategory {
  switch (category) {
    case "plumbing":
      return "Plumbing";
    case "electrical":
      return "Electrical";
    case "security":
      return "Security";
    case "infrastructure":
      return "Infrastructure";
    case "noise":
      return "Noise";
    case "cleaning":
      return "Cleaning";
    case "other":
    default:
      return "General";
  }
}

function fromBackendCategory(category: BackendCategory): IssueCategory {
  switch (category) {
    case "Plumbing":
      return "plumbing";
    case "Electrical":
      return "electrical";
    case "Cleaning":
      return "cleaning";
    case "Security":
      return "security";
    case "Infrastructure":
      return "infrastructure";
    case "Noise":
      return "noise";
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

function toIssue(
  complaint: BackendComplaint & { ratings?: BackendRating[] },
): Issue {
  const imagePath = complaint.images?.[0];
  let imageUrl: string | undefined = undefined;
  if (imagePath) {
    if (imagePath.startsWith("http")) {
      imageUrl = imagePath;
    } else if (imagePath.startsWith("/uploads/")) {
      // Always prefix with API_BASE (backend public URL)
      imageUrl = `${API_BASE}${imagePath}`;
    } else {
      imageUrl = imagePath;
    }
  }

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
    technicianDecision: fromBackendTechnicianDecision(
      complaint.technicianDecision,
    ),
    technicianDecisionNote: complaint.technicianDecisionNote,
    scheduledFor: complaint.scheduledFor
      ? new Date(complaint.scheduledFor)
      : undefined,
    technicianName: complaint.technician?.name,
    technicianEmail: complaint.technician?.email,
    technicianSpecialization: complaint.technician?.specialization,
    technicianOrgName: complaint.technician?.ownerId?.name,
    technicianOrgAddress: complaint.technician?.ownerId?.address,
    technicianRating: complaint.technicianRating,
    technicianFeedback: complaint.technicianFeedback,
    ratings: Array.isArray(complaint.ratings)
      ? complaint.ratings.map((r) => ({
          rater: r.rater,
          role: r.role,
          rating: r.rating,
          feedback: r.feedback,
          createdAt: r.createdAt,
        }))
      : undefined,
  };
}
// ...existing code...
// Move apiRequest to top-level scope
// Use VITE_API_URL from env, but fall back to localhost for development to avoid
// accidental relative requests when the env var is not configured.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
if (!import.meta.env.VITE_API_URL) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_URL is not set — using fallback", API_BASE);
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

  // Prefix all /api calls with API_BASE if not already absolute
  const url = path.startsWith("/api/") ? `${API_BASE}${path}` : path;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload: ApiPayload = {};
  try {
    payload = text ? (JSON.parse(text) as ApiPayload) : {};
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

      const complaints = Array.isArray(payload.data)
        ? (payload.data as BackendComplaint[])
        : [];
      set({
        issues: complaints.map(toIssue),
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load issues",
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
      // Add residentName and residentEmail if present
      if (issue.residentName) {
        formData.append("residentName", issue.residentName);
      }
      if (issue.residentEmail) {
        formData.append("residentEmail", issue.residentEmail);
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

      const createdIssue = toIssue(payload.data as BackendComplaint);
      set((state) => ({
        issues: [createdIssue, ...state.issues],
        loading: false,
        error: null,
      }));

      return {
        success: true,
        message: payload?.message || "Issue reported successfully",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit issue";
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
          i.id === id ? toIssue(payload.data as BackendComplaint) : i,
        ),
      }));

      return {
        success: true,
        message: payload?.message || "Status updated successfully",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to update status",
      };
    }
  },
  deleteIssue: async (id) => {
    try {
      const { response, payload } = await apiRequest(`/api/complaints/${id}`, {
        method: "DELETE",
      });

      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to delete issue";
        return { success: false, message };
      }

      set((state) => ({
        issues: state.issues.filter((i) => i.id !== id),
      }));

      return {
        success: true,
        message: payload?.message || "Issue deleted successfully",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to delete issue",
      };
    }
  },
  technicianDecision: async (id, payloadBody) => {
    try {
      const { response, payload } = await apiRequest(
        `/api/complaints/${id}/decision`,
        {
          method: "PUT",
          body: JSON.stringify(payloadBody),
        },
      );

      if (!response.ok || !payload?.success) {
        const message =
          payload?.message || "Failed to update technician decision";
        return { success: false, message };
      }

      set((state) => ({
        issues: state.issues.map((i) =>
          i.id === id ? toIssue(payload.data as BackendComplaint) : i,
        ),
      }));

      return {
        success: true,
        message: payload?.message || "Technician decision updated",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to update technician decision",
      };
    }
  },

  rateTechnician: async (id: string, rating: number, feedback: string) => {
    try {
      const { response, payload } = await apiRequest(
        `/api/complaints/${id}/rate`,
        {
          method: "PATCH",
          body: JSON.stringify({
            technicianRating: rating,
            technicianFeedback: feedback,
          }),
        },
      );
      if (!response.ok || !payload?.success) {
        const message = payload?.message || "Failed to submit rating";
        return { success: false, message };
      }
      set((state) => ({
        issues: state.issues.map((i) => {
          if (i.id !== id) return i;
          // Append to ratings array for immediate UI update
          const newRating = {
            rater: "me", // Optionally replace with actual user id if available
            role: (useAuthStore.getState().user?.role === "admin"
              ? "admin"
              : "resident") as "admin" | "resident",
            rating,
            feedback,
            createdAt: new Date().toISOString(),
          };
          return {
            ...i,
            technicianRating: rating,
            technicianFeedback: feedback,
            ratings: Array.isArray(i.ratings)
              ? [...i.ratings, newRating]
              : [newRating],
          };
        }),
      }));
      return {
        success: true,
        message: payload?.message || "Thank you for your feedback!",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to submit rating",
      };
    }
  },
}));
