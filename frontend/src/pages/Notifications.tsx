import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Clock,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";

const typeStyles = {
  success: "bg-success/10 text-success",
  info: "status-in-progress",
  warning: "status-pending",
  error: "bg-destructive/10 text-destructive",
};

const categoryIcons = {
  "complaint-created": Bell,
  "complaint-assigned": AlertCircle,
  "complaint-status": Clock,
  "complaint-resolved": CheckCircle,
  system: Bell,
};

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const Notifications = () => {
  const { isAuthenticated } = useAuthStore();
  const {
    notifications,
    unreadCount,
    loading,
    error,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    clearError,
  } = useNotificationStore();

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
    }
  }, [isAuthenticated, loadNotifications]);

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Notifications
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Stay updated on issue activity and important alerts.
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {error}
            <button
              className="ml-3 underline"
              onClick={() => {
                clearError();
                loadNotifications();
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {loading && (
            <div className="text-center py-10 text-muted-foreground">
              Loading notifications...
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="bg-card rounded-xl border border-border p-8 text-center shadow-card">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">
                No notifications yet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Notifications will appear here when issues are assigned,
                updated, or resolved.
              </p>
            </div>
          )}

          {!loading &&
            notifications.map((n, i) => {
              const Icon = categoryIcons[n.category] || Bell;
              return (
                <motion.button
                  key={n.id}
                  type="button"
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className={`w-full text-left bg-card rounded-xl border p-4 hover-lift shadow-card flex items-start gap-3 transition-colors ${
                    n.isRead
                      ? "border-border"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeStyles[n.type]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {n.message}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(n.createdAt)}</span>
                      {n.complaint?.location && (
                        <span>• {n.complaint.location}</span>
                      )}
                      {n.complaint?.status && (
                        <span>• {n.complaint.status}</span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
        </div>
      </motion.div>
    </div>
  );
};

export default Notifications;
