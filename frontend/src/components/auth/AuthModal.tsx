import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, UserRole } from "@/store/authStore";
import { toast } from "sonner";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("resident");
  const { signup, loginWithCredentials, loading, error, clearError } =
    useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup") {
      const result = await signup({ name, email, password, role });
      if (result.success) {
        toast.success("Signup successful", {
          description: "Your account is created. Please login to continue.",
        });
        setMode("login");
        setPassword("");
      } else {
        toast.error("Signup failed", {
          description: result.message,
        });
      }
      return;
    }

    const result = await loginWithCredentials({ email, password });
    if (result.success) {
      toast.success("Login successful", {
        description: "Welcome back to CiviQ.",
      });
      onOpenChange(false);
      setName("");
      setEmail("");
      setPassword("");
      clearError();
    } else {
      toast.error("Login failed", {
        description: result.message,
      });
    }
  };

  const roles: { value: UserRole; label: string; desc: string }[] = [
    { value: "resident", label: "Resident", desc: "Report and track issues" },
    { value: "authority", label: "Authority", desc: "Manage assigned issues" },
    { value: "admin", label: "Admin", desc: "Full system management" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-2xl shadow-card-hover border border-border overflow-hidden pointer-events-auto"
            >
              <div className="gradient-primary p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-primary-foreground">
                      {mode === "login" ? "Welcome Back" : "Join CiviQ"}
                    </h2>
                    <p className="text-primary-foreground/70 text-sm mt-0.5">
                      {mode === "login"
                        ? "Sign in to your account"
                        : "Create your account"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      clearError();
                    }}
                    aria-label="Close authentication dialog"
                    title="Close"
                    className="p-1.5 rounded-lg hover:bg-primary-foreground/10 transition-colors"
                  >
                    <X className="h-4 w-4 text-primary-foreground" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Role
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {roles.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setRole(r.value)}
                          className={`p-2.5 rounded-lg border text-center transition-all duration-200 ${
                            role === r.value
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border hover:border-primary/30"
                          }`}
                        >
                          <p className="text-xs font-semibold text-foreground">
                            {r.label}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {r.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground shadow-sm hover:shadow-glow transition-shadow"
                >
                  {loading
                    ? "Please wait..."
                    : mode === "login"
                      ? "Sign In"
                      : "Create Account"}
                </Button>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}

                <p className="text-center text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Don't have an account?"
                    : "Already have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === "login" ? "signup" : "login");
                      clearError();
                    }}
                    className="text-primary font-medium hover:underline"
                  >
                    {mode === "login" ? "Sign Up" : "Sign In"}
                  </button>
                </p>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
