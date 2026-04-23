// frontend/src/components/auth/AuthModal.tsx
//
// Changes from original:
//   • Added "forgot" mode alongside "login" | "signup"
//   • "Forgot password?" link appears under the password field in login mode
//   • Forgot-password form: enter email → POST /api/users/forgot-password
//   • After submission shows a "check your inbox" confirmation panel
//   • Back links return cleanly to login mode

import { useState, useEffect } from "react";
// Organization type for dropdown
type Organization = { _id: string; name: string };
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail, Lock, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAuthStore,
  UserRole,
  TechnicianSpecialization,
} from "@/store/authStore";
import { toast } from "sonner";

// Points to the backend. In Vite you can set VITE_API_URL in .env.
const API_BASE = import.meta.env.VITE_API_URL;

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "login" | "signup";
}

type ModalMode = "login" | "signup" | "forgot";

export function AuthModal({
  open,
  onOpenChange,
  mode: modeProp,
}: AuthModalProps) {
  // ── Existing login / signup state (unchanged) ──────────────────────────────
  const [mode, setMode] = useState<ModalMode>("login");
  // If mode prop is provided, sync it with state when modal opens
  useEffect(() => {
    if (open && modeProp) {
      setMode(modeProp as ModalMode);
    }
  }, [open, modeProp]);

  // ── Organization dropdown state ──────────────────────────────────────────
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState("");

  // Fetch organizations for dropdown
  useEffect(() => {
    if (mode !== "signup") return;
    setOrgLoading(true);
    fetch(`${API_BASE}/api/organizations`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setOrganizations(data.data);
          setOrgError("");
        } else {
          setOrgError("Failed to load organizations");
        }
      })
      .catch(() => setOrgError("Failed to load organizations"))
      .finally(() => setOrgLoading(false));
  }, [mode]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("resident");
  const [specialization, setSpecialization] =
    useState<TechnicianSpecialization>("Electrical");
  // ── Add Organization modal state ─────────────────────────────────────────
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [addOrgLoading, setAddOrgLoading] = useState(false);
  const [addOrgError, setAddOrgError] = useState("");
  const { signup, loginWithCredentials, loading, error, clearError } =
    useAuthStore();

  // ── Forgot-password state ──────────────────────────────────────────────────
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // ── Helpers ────────────────────────────────────────────────────────────────
  const switchMode = (next: ModalMode) => {
    setMode(next);
    clearError();
    setForgotError("");
    setForgotSent(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    clearError();
    // Small delay so the exit animation plays before state resets
    setTimeout(() => {
      setMode("login");
      setName("");
      setEmail("");
      setPassword("");
      setForgotEmail("");
      setForgotSent(false);
      setForgotError("");
    }, 300);
  };

  // ── Existing login / signup handler (unchanged) ────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup") {
      if (!name.trim()) {
        toast.error("Please enter your full name");
        return;
      }
      if (!ownerId) {
        toast.error("Please select your organization");
        return;
      }
      if (!email.trim()) {
        toast.error("Please enter your email address");
        return;
      }
      if (!password.trim()) {
        toast.error("Please enter a password");
        return;
      }
      const result = await signup({
        name,
        email,
        password,
        role,
        specialization: role === "technician" ? specialization : undefined,
        ownerId,
      });
      if (result.success) {
        // Automatically log in after signup
        const loginResult = await loginWithCredentials({ email, password });
        if (loginResult.success) {
          toast.success("Signup successful", {
            description: "Your account is created and you are now logged in.",
          });
          onOpenChange(false); // Close modal
          setName("");
          setEmail("");
          setPassword("");
          clearError();
        } else {
          toast.error("Signup succeeded but login failed", {
            description: loginResult.message,
          });
          switchMode("login");
        }
      } else {
        toast.error("Signup failed", { description: result.message });
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
      toast.error("Login failed", { description: result.message });
    }
  };

  // ── Forgot-password handler ────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email address.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (data.success) {
        setForgotSent(true);
      } else {
        setForgotError(
          data.message || "Something went wrong. Please try again.",
        );
      }
    } catch {
      setForgotError("Network error. Please check your connection.");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Role options (unchanged) ───────────────────────────────────────────────
  const roles: { value: UserRole; label: string; desc: string }[] = [
    { value: "resident", label: "Resident", desc: "Report and track issues" },
    {
      value: "technician",
      label: "Technician",
      desc: "Manage assigned issues",
    },
    { value: "admin", label: "Admin", desc: "Full system management" },
  ];

  // ── Header text per mode ───────────────────────────────────────────────────
  const headerTitle: Record<ModalMode, string> = {
    login: "Welcome Back",
    signup: "Join CiviQ",
    forgot: "Forgot Password",
  };
  const headerSub: Record<ModalMode, string> = {
    login: "Sign in to your account",
    signup: "Create your account",
    forgot: "We'll email you a reset link",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-2xl shadow-card-hover border border-border overflow-hidden pointer-events-auto"
            >
              {/* ── Header ─────────────────────────────────────────────────── */}
              <div className="gradient-primary p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-primary-foreground">
                      {headerTitle[mode]}
                    </h2>
                    <p className="text-primary-foreground/70 text-sm mt-0.5">
                      {headerSub[mode]}
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    aria-label="Close authentication dialog"
                    title="Close"
                    className="p-1.5 rounded-lg hover:bg-primary-foreground/10 transition-colors"
                  >
                    <X className="h-4 w-4 text-primary-foreground" />
                  </button>
                </div>
              </div>

              {/* ── Forgot-password form ──────────────────────────────────── */}
              {mode === "forgot" && (
                <div className="p-6 space-y-4">
                  {forgotSent ? (
                    /* Confirmation panel */
                    <div className="text-center space-y-3 py-4">
                      <div className="text-4xl">📧</div>
                      <p className="text-sm font-semibold text-foreground">
                        Check your inbox!
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        If <strong>{forgotEmail}</strong> is registered with
                        CiviQ, a reset link has been sent. It expires in{" "}
                        <strong>30 minutes</strong>. Don't forget to check your
                        spam folder.
                      </p>
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="text-sm text-primary font-medium hover:underline mt-2"
                      >
                        ← Back to login
                      </button>
                    </div>
                  ) : (
                    /* Email input form */
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Your Email Address
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="pl-9"
                            required
                            autoFocus
                          />
                        </div>
                      </div>

                      {forgotError && (
                        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{forgotError}</span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full gradient-primary text-primary-foreground shadow-sm hover:shadow-glow transition-shadow"
                      >
                        {forgotLoading ? "Sending..." : "Send Reset Link"}
                      </Button>

                      <p className="text-center text-sm text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => switchMode("login")}
                          className="text-primary font-medium hover:underline"
                        >
                          ← Back to login
                        </button>
                      </p>
                    </form>
                  )}
                </div>
              )}

              {/* ── Login / Signup form (unchanged logic) ─────────────────── */}
              {mode !== "forgot" && (
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  {/* Full Name — signup only */}
                  {mode === "signup" && (
                    <>
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
                      {/* Organization Dropdown + Add New */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Organization
                        </Label>
                        <div className="flex gap-2">
                          <select
                            value={ownerId}
                            onChange={(e) => setOwnerId(e.target.value)}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            required
                            disabled={orgLoading}
                          >
                            <option value="">
                              {orgLoading
                                ? "Loading..."
                                : "Select your organization"}
                            </option>
                            {organizations.map((org) => (
                              <option key={org._id} value={org._id}>
                                {org.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="h-10 px-3 rounded-md border border-primary text-primary bg-background hover:bg-primary/10 text-xs font-semibold"
                            onClick={() => setShowAddOrg(true)}
                          >
                            Add New
                          </button>
                        </div>
                        {orgError && (
                          <div className="text-xs text-red-600 mt-1">
                            {orgError}
                          </div>
                        )}
                      </div>
                      {/* Add Organization Modal */}
                      {showAddOrg && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm relative">
                            <button
                              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowAddOrg(false)}
                              aria-label="Close"
                            >
                              <X className="h-5 w-5" />
                            </button>
                            <h3 className="text-lg font-bold mb-2">
                              Add Organization
                            </h3>
                            <div className="space-y-3">
                              <Input
                                value={newOrgName}
                                onChange={(e) => setNewOrgName(e.target.value)}
                                placeholder="Organization name"
                                required
                                autoFocus
                              />
                              {addOrgError && (
                                <div className="text-xs text-red-600">
                                  {addOrgError}
                                </div>
                              )}
                              <Button
                                type="button"
                                className="w-full"
                                disabled={addOrgLoading}
                                onClick={async () => {
                                  if (!newOrgName.trim()) return;
                                  setAddOrgLoading(true);
                                  setAddOrgError("");
                                  try {
                                    const res = await fetch(
                                      `${API_BASE}/api/organizations`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          name: newOrgName.trim(),
                                        }),
                                      },
                                    );
                                    const data = await res.json();
                                    if (data.success && data.data) {
                                      setOrganizations((prev) => [
                                        ...prev,
                                        data.data,
                                      ]);
                                      setOwnerId(data.data._id);
                                      setShowAddOrg(false);
                                      setNewOrgName("");
                                      toast.success("Organization added");
                                    } else {
                                      setAddOrgError(
                                        data.message ||
                                          "Failed to add organization",
                                      );
                                    }
                                  } catch {
                                    setAddOrgError(
                                      "Failed to add organization",
                                    );
                                  } finally {
                                    setAddOrgLoading(false);
                                  }
                                }}
                              >
                                {addOrgLoading
                                  ? "Adding..."
                                  : "Add Organization"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Email */}
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

                  {/* Password */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Password</Label>
                      {/* ── "Forgot password?" link — login mode only ── */}
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
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

                  {/* Role + specialization — signup only (unchanged) */}
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

                      {role === "technician" && (
                        <div className="space-y-2 pt-2">
                          <Label className="text-sm font-medium">
                            Technician Specialization
                          </Label>
                          <select
                            value={specialization}
                            onChange={(e) =>
                              setSpecialization(
                                e.target.value as TechnicianSpecialization,
                              )
                            }
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="Electrical">Electrician</option>
                            <option value="Plumbing">Plumber</option>
                            <option value="Cleaning">Cleaning</option>
                            <option value="Security">Security</option>
                            <option value="Infrastructure">
                              Infrastructure
                            </option>
                            <option value="Noise">Noise Control</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit */}
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

                  {/* Backend error */}
                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {error}
                    </p>
                  )}

                  {/* Mode toggle */}
                  <p className="text-center text-sm text-muted-foreground">
                    {mode === "login"
                      ? "Don't have an account?"
                      : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        switchMode(mode === "login" ? "signup" : "login")
                      }
                      className="text-primary font-medium hover:underline"
                    >
                      {mode === "login" ? "Sign Up" : "Sign In"}
                    </button>
                  </p>
                </form>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
