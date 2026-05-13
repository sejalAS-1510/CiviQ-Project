import { motion } from "framer-motion";
import { MapPin, Clock, Star } from "lucide-react";
import { Issue } from "@/store/issueStore";
import { StatusBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";

import { useState } from "react";
import { useIssueStore } from "@/store/issueStore";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { resolveMediaUrl } from "@/lib/mediaUrl";

interface IssueCardProps {
  issue: Issue;
  delay?: number;
  onStatusChange?: (id: string, status: Issue["status"]) => void;
  onDelete?: (id: string) => void;
  canDelete?: boolean;
  showActions?: boolean;
  showTechnicianDecisionActions?: boolean;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onReschedule?: (id: string) => void;
}

const categoryLabels: Record<string, string> = {
  plumbing: "🔧 Plumbing",
  electrical: "⚡ Electrical",
  cleaning: "🧹 Cleaning",
  security: "🔒 Security",
  infrastructure: "🏗️ Infrastructure",
  noise: "🔊 Noise",
  other: "📋 Other",
};

export function IssueCard({
  issue,
  delay = 0,
  onStatusChange,
  onDelete,
  canDelete,
  showActions,
  showTechnicianDecisionActions,
  onAccept,
  onReject,
  onReschedule,
}: IssueCardProps) {
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rateTechnician = useIssueStore((s) => s.rateTechnician);
  const user = useAuthStore((s) => s.user);

  // Only admin or resident can rate, and only after resolved
  const canRate =
    (user?.role === "admin" || user?.role === "resident") &&
    issue.status === "resolved" &&
    issue.technicianName;
  const [imageError, setImageError] = useState(false);

  const handleOpenRating = () => {
    setShowRatingModal(true);
    setRating(0);
    setFeedback("");
  };
  const handleSubmitRating = async () => {
    if (rating < 1) {
      toast.error("Please select at least 1 star before submitting.");
      return;
    }

    setSubmitting(true);
    const result = await rateTechnician(issue.id, rating, feedback);
    setSubmitting(false);
    if (result.success) {
      setShowRatingModal(false);
      toast.success("Thank you for your feedback!");
    } else {
      toast.error(result.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="w-full rounded-xl border border-border p-4 hover-lift shadow-card bg-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Technician Rating/Feedback - Only for admin/resident after resolved */}
          {canRate && (
            <div className="mt-2 mb-3">
              {typeof issue.technicianRating === "number" ? (
                <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 rounded p-2 border border-yellow-100">
                  <span className="font-semibold">Your Rating:</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${n <= issue.technicianRating ? "fill-yellow-400 stroke-yellow-500" : "stroke-yellow-300"}`}
                      />
                    ))}
                  </span>
                  {issue.technicianFeedback && (
                    <span className="ml-2 italic text-gray-700">
                      "{issue.technicianFeedback}"
                    </span>
                  )}
                </div>
              ) : (
                <button
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                  onClick={handleOpenRating}
                >
                  Rate Technician
                </button>
              )}
            </div>
          )}

          {/* Rating Modal */}
          {showRatingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs">
                <h3 className="text-lg font-semibold mb-2">Rate Technician</h3>
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`p-1 ${n <= rating ? "text-yellow-500" : "text-gray-300"}`}
                      onClick={() => setRating(n)}
                      disabled={submitting}
                      title={`Set rating to ${n} star${n > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-6 w-6 ${n <= rating ? "fill-yellow-400 stroke-yellow-500" : "stroke-gray-300"}`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full border rounded p-2 text-sm mb-3"
                  rows={3}
                  placeholder="Optional feedback..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={submitting}
                  maxLength={500}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium"
                    onClick={() => setShowRatingModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-yellow-500 text-white text-xs font-medium disabled:opacity-60"
                    onClick={handleSubmitRating}
                    disabled={submitting || rating < 1}
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {issue.imageUrl && !imageError && (
            <img
              src={resolveMediaUrl(issue.imageUrl)}
              alt="Issue"
              className="w-full max-h-36 object-contain rounded-md mb-3"
              onError={() => setImageError(true)}
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-primary-foreground">
              {categoryLabels[issue.category] || issue.category}
            </span>
            {/* Show only one status badge for the main status */}
            {issue.status && <StatusBadge status={issue.status} />}
            {issue.technicianDecision &&
              issue.technicianDecision !== "pending" && (
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-muted text-muted-foreground border border-border uppercase tracking-wide font-semibold">
                  {issue.technicianDecision}
                </span>
              )}
          </div>
          <p className="text-sm mt-2 line-clamp-2 text-[#b5c4b0]">
            {issue.description}
          </p>
          <span className="flex items-center gap-1 text-white">
            <MapPin className="h-3 w-3" />
            {issue.location}
          </span>
          <span className="flex items-center gap-1 text-white">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(issue.reportedAt, { addSuffix: true })}
          </span>

          {issue.scheduledFor && (
            <p className="mt-2 text-xs rescheduled-text">
              Rescheduled for: {issue.scheduledFor.toLocaleString()}
            </p>
          )}
          {issue.technicianDecisionNote && (
            <p className="mt-1 text-xs rescheduled-text">
              Note: {issue.technicianDecisionNote}
            </p>
          )}

          {/* Technician info (if assigned) */}
          {issue.technicianName && (
            <div className="mt-2 text-xs text-green-900 bg-green-50 rounded p-2 border border-green-100">
              <span className="font-semibold">Assigned Technician:</span>
              <span className="ml-2">{issue.technicianName}</span>
              {issue.technicianSpecialization && (
                <span className="ml-2">({issue.technicianSpecialization})</span>
              )}
              {issue.technicianEmail && (
                <span className="ml-2">[{issue.technicianEmail}]</span>
              )}
              {issue.technicianOrgName && (
                <span className="ml-2">
                  | <span className="font-semibold">Org:</span>{" "}
                  {issue.technicianOrgName}
                </span>
              )}
              {issue.technicianOrgAddress && (
                <span className="ml-2">({issue.technicianOrgAddress})</span>
              )}
            </div>
          )}

          {/* Resident info (if present) */}
          {(issue.residentName || issue.residentEmail) && (
            <div className="mt-2 text-xs text-blue-900 bg-blue-50 rounded p-2 border border-blue-100">
              <span className="font-semibold">Reported for Resident:</span>
              {issue.residentName && (
                <span className="ml-2">{issue.residentName}</span>
              )}
              {issue.residentEmail && (
                <span className="ml-2">({issue.residentEmail})</span>
              )}
            </div>
          )}

          {showActions && onStatusChange && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
              {/* Only show valid status transitions, not always all, and keep them visually separate from the status badge */}
              {issue.status === "pending" && (
                <button
                  onClick={() => onStatusChange(issue.id, "in-progress")}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-sky-600 text-white hover:bg-sky-700 border border-sky-700"
                >
                  Start Progress
                </button>
              )}
              {issue.status === "in-progress" && (
                <button
                  onClick={() => onStatusChange(issue.id, "resolved")}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700"
                >
                  Mark Resolved
                </button>
              )}
            </div>
          )}

          {canDelete && onDelete && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={() => onDelete(issue.id)}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-red-100 text-red-700 hover:bg-red-200"
              >
                Delete
              </button>
            </div>
          )}

          {showTechnicianDecisionActions && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={() => onAccept?.(issue.id)}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              >
                Accept
              </button>
              <button
                onClick={() => onReschedule?.(issue.id)}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-amber-100 text-amber-700 hover:bg-amber-200"
              >
                Reschedule
              </button>
              <button
                onClick={() => onReject?.(issue.id)}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all bg-red-100 text-red-700 hover:bg-red-200"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
