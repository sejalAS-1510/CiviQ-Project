import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Shield,
  Eye,
  Globe,
  UserRound,
  TriangleAlert,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

const settingsSections = [
  {
    title: "Notifications",
    icon: Bell,
    settings: [
      {
        id: "email",
        label: "Email Notifications",
        desc: "Receive updates via email",
        defaultChecked: true,
      },
      {
        id: "push",
        label: "Push Notifications",
        desc: "Browser push notifications",
        defaultChecked: false,
      },
      {
        id: "updates",
        label: "Status Updates",
        desc: "Get notified when issue status changes",
        defaultChecked: true,
      },
    ],
  },
  {
    title: "Privacy",
    icon: Shield,
    settings: [
      {
        id: "profile",
        label: "Public Profile",
        desc: "Allow others to see your profile",
        defaultChecked: true,
      },
      {
        id: "activity",
        label: "Activity Visibility",
        desc: "Show your activity to others",
        defaultChecked: false,
      },
    ],
  },
  {
    title: "Appearance",
    icon: Eye,
    settings: [
      {
        id: "compact",
        label: "Compact View",
        desc: "Use compact card layout",
        defaultChecked: false,
      },
    ],
  },
  {
    title: "Language",
    icon: Globe,
    settings: [
      {
        id: "english",
        label: "English",
        desc: "Use English as display language",
        defaultChecked: true,
      },
    ],
  },
];

function getRoleLabel(role?: string) {
  if (role === "technician") return "Technician";
  if (role === "admin") return "Admin";
  return "Resident";
}

function getRoleBadgeClass(role?: string) {
  if (role === "technician")
    return "bg-amber-500/15 text-amber-700 border-amber-500/20";
  if (role === "admin")
    return "bg-rose-500/15 text-rose-700 border-rose-500/20";
  return "bg-primary/15 text-primary border-primary/20";
}

const SettingsPage = () => {
  const { user, updateProfile, deleteMyAccount, deleteUserByEmail, loading } =
    useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [adminDeleteEmail, setAdminDeleteEmail] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setAddress(user.address || "");
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await updateProfile({
      name,
      email,
      phone: phone || undefined,
      address: address || undefined,
      password: password || undefined,
    });

    if (result.success) {
      setPassword("");
      toast.success("Profile updated", {
        description: "Your profile changes have been saved.",
      });
    } else {
      toast.error("Failed to update profile", {
        description: result.message,
      });
    }
  };

  const handleDeleteMyAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      toast.error("Confirmation text mismatch", {
        description: "Type DELETE to confirm account removal.",
      });
      return;
    }

    const result = await deleteMyAccount();
    if (result.success) {
      toast.success("Account deleted", {
        description:
          "Your account has been removed. Please sign in again if needed.",
      });
      return;
    }

    toast.error("Failed to delete account", {
      description: result.message,
    });
  };

  const handleDeleteOtherAccount = async () => {
    const result = await deleteUserByEmail(adminDeleteEmail);
    if (result.success) {
      toast.success("Account deleted", {
        description: result.message,
      });
      setAdminDeleteEmail("");
      return;
    }

    toast.error("Failed to delete account", {
      description: result.message,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your profile and preferences.
        </p>

        <div className="mt-6 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className={`rounded-2xl border p-5 shadow-card ${
              user?.role === "technician"
                ? "bg-gradient-to-br from-amber-50 to-white border-amber-200"
                : "bg-card border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Account Snapshot
                </p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {user?.name || "Profile"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Keep your identity, role, and contact details up to date.
                </p>
              </div>
              <span
                className={`inline-flex h-fit items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${getRoleBadgeClass(
                  user?.role,
                )}`}
              >
                {getRoleLabel(user?.role)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/70 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Email
                </p>
                <p className="mt-1 text-sm font-medium text-foreground break-all">
                  {user?.email || "Not set"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Specialization
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {user?.role === "technician"
                    ? user?.specialization || "General"
                    : "Resident access"}
                </p>
              </div>
            </div>

            {user?.role === "technician" && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">
                  Technician mode enabled
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Your dashboard highlights assigned issues and matches work
                  using your specialization.
                </p>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-card rounded-xl border border-border p-5 shadow-card"
          >
            <div className="flex items-center gap-2 mb-4">
              <UserRound className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Edit Profile
              </h3>
            </div>

            <form className="space-y-4" onSubmit={handleProfileSave}>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Full Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit phone"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Address</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Your address"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  New Password (optional)
                </Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  Role:{" "}
                  {user?.role === "admin"
                    ? "Admin"
                    : user?.role === "technician"
                      ? "Technician"
                      : "Resident"}
                </p>
                <Button
                  type="submit"
                  className="gradient-primary text-primary-foreground"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </motion.div>

          {settingsSections.map((section, si) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + 0.1 * si }}
                className="bg-card rounded-xl border border-border p-5 shadow-card"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {section.title}
                  </h3>
                </div>
                <div className="space-y-4">
                  {section.settings.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <Label className="text-sm font-medium">{s.label}</Label>
                        <p className="text-xs text-muted-foreground">
                          {s.desc}
                        </p>
                      </div>
                      <Switch defaultChecked={s.defaultChecked} />
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-card"
          >
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-semibold text-red-700">
                Danger Zone
              </h3>
            </div>
            <p className="text-xs text-red-700/90 mb-4">
              These actions are permanent and cannot be undone.
            </p>

            {user?.role === "admin" && (
              <div className="mb-5 rounded-lg border border-red-200 bg-white/70 p-4">
                <Label className="text-sm font-medium text-red-700">
                  Delete Any Account (Admin)
                </Label>
                <p className="text-xs text-red-700/80 mt-1 mb-2">
                  Enter the exact user email to delete that account.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="email"
                    value={adminDeleteEmail}
                    onChange={(e) => setAdminDeleteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="bg-white"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={loading || !adminDeleteEmail.trim()}
                    onClick={handleDeleteOtherAccount}
                  >
                    {loading ? "Deleting..." : "Delete Account"}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-red-200 bg-white/70 p-4">
              <Label className="text-sm font-medium text-red-700">
                Delete My Account
              </Label>
              <p className="text-xs text-red-700/80 mt-1 mb-2">
                Type DELETE to confirm, then permanently remove your account.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="bg-white"
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                  onClick={handleDeleteMyAccount}
                >
                  {loading ? "Deleting..." : "Delete My Account"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
