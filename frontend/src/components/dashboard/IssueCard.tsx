import { motion } from "framer-motion";
import { MapPin, Clock } from "lucide-react";
import { Issue } from "@/store/issueStore";
import { StatusBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";

interface IssueCardProps {
  issue: Issue;
  delay?: number;
  onStatusChange?: (id: string, status: Issue["status"]) => void;
  showActions?: boolean;
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
  showActions,
}: IssueCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-xl border border-border p-5 hover-lift shadow-card bg-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {issue.imageUrl && (
            <img
              src={issue.imageUrl}
              alt="Issue"
              className="w-full h-36 object-cover rounded-lg mb-3 border border-border"
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-primary-foreground">
              {categoryLabels[issue.category] || issue.category}
            </span>
            <StatusBadge status={issue.status} />
          </div>
          <p className="text-sm mt-2 line-clamp-2 text-[#b0c4b0]">
            {issue.description}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-neutral-950">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {issue.location}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(issue.reportedAt, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {showActions && onStatusChange && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          {(["pending", "in-progress", "resolved"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(issue.id, s)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                issue.status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {s === "in-progress"
                ? "In Progress"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
