import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useIssueStore, IssueStatus } from "@/store/issueStore";
import { useAuthStore } from "@/store/authStore";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { toast } from "sonner";

const statusFilters: { value: "all" | IssueStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const MyIssues = () => {
  const [filter, setFilter] = useState<"all" | IssueStatus>("all");
  const [search, setSearch] = useState("");
  const {
    issues,
    loading,
    error,
    loadIssues,
    updateStatus,
    deleteIssue,
    technicianDecision,
    clearError,
  } = useIssueStore();
  const { user, isAuthenticated } = useAuthStore();

  const canChangeStatus = user?.role === "technician" || user?.role === "admin";
  const canDeleteIssues = user?.role === "admin" || user?.role === "resident";
  const canTechnicianDecide = user?.role === "technician";

  useEffect(() => {
    if (isAuthenticated) {
      loadIssues();
    }
  }, [isAuthenticated, loadIssues]);

  const handleStatusChange = async (id: string, status: IssueStatus) => {
    const result = await updateStatus(id, status);
    if (result.success) {
      toast.success("Issue status updated");
    } else {
      toast.error("Failed to update status", { description: result.message });
    }
  };

  const handleDeleteIssue = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this issue permanently? This action cannot be undone.",
    );
    if (!confirmed) return;

    const result = await deleteIssue(id);
    if (result.success) {
      toast.success("Issue deleted");
      return;
    }

    toast.error("Failed to delete issue", {
      description: result.message,
    });
  };

  const handleTechnicianAccept = async (id: string) => {
    const result = await technicianDecision(id, { action: "accept" });
    if (result.success) {
      toast.success("Issue accepted");
      return;
    }
    toast.error("Failed to accept issue", { description: result.message });
  };

  const handleTechnicianReject = async (id: string) => {
    const confirmed = window.confirm(
      "Reject this assigned issue? It will be unassigned and pending reassignment.",
    );
    if (!confirmed) return;

    const reason = window.prompt("Optional reason for rejection:", "") || "";
    const result = await technicianDecision(id, {
      action: "reject",
      note: reason,
    });
    if (result.success) {
      toast.success("Issue rejected");
      return;
    }
    toast.error("Failed to reject issue", { description: result.message });
  };

  const handleTechnicianReschedule = async (id: string) => {
    const raw = window.prompt(
      "Enter reschedule date/time (YYYY-MM-DDTHH:mm)",
      "",
    );
    if (!raw) return;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Invalid date", {
        description: "Use format YYYY-MM-DDTHH:mm",
      });
      return;
    }

    const note =
      window.prompt(
        "Optional note for resident (e.g., access not available):",
        "",
      ) || "";

    const result = await technicianDecision(id, {
      action: "reschedule",
      rescheduleFor: parsed.toISOString(),
      note,
    });

    if (result.success) {
      toast.success("Issue rescheduled");
      return;
    }
    toast.error("Failed to reschedule issue", { description: result.message });
  };

  const filtered = issues.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (
      search &&
      !i.description.toLowerCase().includes(search.toLowerCase()) &&
      !i.location.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="w-full px-4 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-foreground">My Issues</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track and manage reported issues.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {statusFilters.map((s) => (
              <button
                key={s.value}
                onClick={() => setFilter(s.value)}
                className={`text-xs px-3 py-2 rounded-lg font-medium transition-all ${
                  filter === s.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 mt-6 sm:grid-cols-2">
          {error && (
            <div className="col-span-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              {error}
              <button
                className="ml-3 underline"
                onClick={() => {
                  clearError();
                  loadIssues();
                }}
              >
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div className="col-span-full text-center py-6 text-muted-foreground">
              Loading issues...
            </div>
          )}

          {filtered.map((issue, i) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              delay={0.05 * i}
              showActions={canChangeStatus}
              onStatusChange={handleStatusChange}
              canDelete={canDeleteIssues}
              onDelete={handleDeleteIssue}
              showTechnicianDecisionActions={canTechnicianDecide}
              onAccept={handleTechnicianAccept}
              onReject={handleTechnicianReject}
              onReschedule={handleTechnicianReschedule}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No issues found.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default MyIssues;
