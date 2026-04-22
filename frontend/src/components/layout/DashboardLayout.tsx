import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { AuthModal } from "@/components/auth/AuthModal";
import { RequireAuth } from "@/components/auth/RequireAuth";

const protectedRoutes = ["/report", "/issues", "/notifications", "/settings"];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const location = useLocation();

  const isProtected = protectedRoutes.includes(location.pathname);

  return (
    <div className="bg-page-gradient min-h-screen flex w-full">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar
        onMenuClick={() => setSidebarOpen(true)}
        onLoginClick={() => {
          setAuthMode("login");
          setAuthOpen(true);
        }}
        onSignupClick={() => {
          setAuthMode("signup");
          setAuthOpen(true);
        }}
      />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full relative z-10">
        {isProtected ? (
          <RequireAuth
            onAuthClick={() => {
              setAuthMode("login");
              setAuthOpen(true);
            }}
          >
            {children}
          </RequireAuth>
        ) : (
          children
        )}
      </main>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} mode={authMode} />
    </div>
  );
}
