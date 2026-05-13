import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useIssueStore } from "@/store/issueStore";
import { useAuthStore } from "@/store/authStore";
import { StatCard } from "@/components/dashboard/StatCard";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { Button } from "@/components/ui/button";
import communityHero from "@/assets/community-hero.jpg";

const Index = () => {
  const { issues, loading, loadIssues } = useIssueStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      loadIssues();
    }
  }, [isAuthenticated, loadIssues]);

  const stats = {
    total: issues.length,
    pending: issues.filter((i) => i.status === "pending").length,
    inProgress: issues.filter((i) => i.status === "in-progress").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
  };

  const recentIssues = issues.slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative rounded-2xl overflow-hidden shadow-card"
      >
        <img
          src={communityHero}
          alt="Community"
          className="w-full h-48 sm:h-64 object-cover"
        />
        <div className="absolute inset-0 flex items-end">
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary-foreground">
              Welcome to CiviQ
            </h1>
            <p className="text-primary-foreground/80 text-sm sm:text-base mt-1 max-w-lg">
              Smart Community Issue Management — Report, track, and resolve
              issues in your community.
            </p>
            {!isAuthenticated && (
              <Link to="/report">
                <Button className="mt-4 bg-card text-foreground hover:bg-card/90 shadow-sm">
                  Report an Issue
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Issues"
          value={stats.total}
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={AlertCircle}
          delay={0.15}
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          icon={Clock}
          delay={0.2}
        />
        <StatCard
          title="Resolved"
          value={stats.resolved}
          icon={CheckCircle}
          trend="+2 this week"
          delay={0.25}
        />
      </div>

      {/* Recent Issues */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground">
            Recent Issues
          </h2>
          <Link
            to="/issues"
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading && (
            <div className="col-span-full text-center py-6 text-muted-foreground">
              Loading recent issues...
            </div>
          )}
          {recentIssues.map((issue, i) => (
            <IssueCard key={issue.id} issue={issue} delay={0.1 * i} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
