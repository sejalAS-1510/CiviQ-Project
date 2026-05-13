import { IssueStatus } from "@/store/issueStore";

interface StatusBadgeProps {
  status: IssueStatus;
}

const statusConfig: Record<IssueStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Pending",
      className: "bg-amber-100 text-amber-700 border border-amber-200",
    },
    "in-progress": {
      label: "In Progress",
      className: "bg-sky-100 text-sky-700 border border-sky-200",
    },
    resolved: {
      label: "Resolved",
      className: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    },
  };

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.className}`}
    >
      {config.label}
    </span>
  );
}
