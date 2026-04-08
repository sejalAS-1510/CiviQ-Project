import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  AlertCircle,
  ListTodo,
  Bell,
  Settings,
  X,
  Edit,
  User,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import civiqLogo from "@/assets/civiq-logo.png";

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { label: "CIVIQ", type: "header" as const },
  { label: "Smart Community Platform", type: "subtitle" as const },
  { label: "MAIN", type: "section" as const },
  { label: "Home", icon: Home, path: "/", type: "link" as const },
  {
    label: "Report Issue",
    icon: AlertCircle,
    path: "/report",
    type: "link" as const,
  },
  { label: "ISSUE MANAGEMENT", type: "section" as const },
  {
    label: "My Issues",
    icon: ListTodo,
    path: "/issues",
    type: "link" as const,
  },
  {
    label: "Notifications",
    icon: Bell,
    path: "/notifications",
    type: "link" as const,
  },
  { label: "SYSTEM", type: "section" as const },
  {
    label: "Settings",
    icon: Settings,
    path: "/settings",
    type: "link" as const,
  },
];

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-foreground/20"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-[260px] glass rounded-r-2xl shadow-card-hover flex flex-col"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Logo area */}
            <div className="px-5 pt-6 pb-2 flex items-center gap-3">
              <img src={civiqLogo} alt="CiviQ Logo" className="h-12 w-12" />
              <div>
                <h2 className="font-bold text-foreground tracking-tight text-base">
                  CIVIQ
                </h2>
                <p className="text-muted-foreground tracking-wide text-xs font-normal">
                  Smart Community Platform
                </p>
              </div>
            </div>

            {/* Menu */}
            <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto">
              {menuItems.map((item, i) => {
                if (item.type === "header" || item.type === "subtitle")
                  return null;
                if (item.type === "section") {
                  return (
                    <p
                      key={i}
                      className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase px-3 pt-5 pb-1.5"
                    >
                      {item.label}
                    </p>
                  );
                }
                const Icon = item.icon!;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path!}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/70 hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User profile card */}
            {isAuthenticated && user && (
              <div className="p-4 mx-3 mb-4 rounded-xl bg-accent/60 border border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {user.role}
                    </p>
                  </div>
                </div>
                <button className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Edit className="h-3 w-3" />
                  Edit Profile
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
