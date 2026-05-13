import React, { useEffect, useState } from "react";
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
import { resolveApiBase } from "@/lib/apiBase";
import { toast } from "sonner";
import { resolveMediaUrl } from "@/lib/mediaUrl";

const API_BASE = resolveApiBase();

// Removed non-working settings sections (Notifications, Privacy, Language)
const settingsSections = [];

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

// Show all ratings/feedback for a technician
function AllTechnicianRatings({ technicianId }: { technicianId: string }) {
  const [ratings, setRatings] = useState<
    {
      rating: number;
      feedback?: string;
      role: string;
      createdAt?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!technicianId) return;
    setLoading(true);
    setError(null);
    let token = null;
    try {
      const stored = localStorage.getItem("civiq_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        token = parsed.token;
      }
    } catch {
      // Ignore JSON parse errors, treat as no token
    }
    fetch(`${API_BASE}/api/complaints?technician=${technicianId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          // Flatten all ratings from all complaints
          const allRatings: typeof ratings = [];
          for (const complaint of data.data) {
            if (Array.isArray(complaint.ratings)) {
              for (const r of complaint.ratings) {
                allRatings.push({
                  rating: r.rating,
                  feedback: r.feedback,
                  role: r.role,
                  createdAt: r.createdAt,
                });
              }
            } else if (complaint.technicianRating) {
              allRatings.push({
                rating: complaint.technicianRating,
                feedback: complaint.technicianFeedback,
                role: "resident",
              });
            }
          }
          setRatings(allRatings);
        } else {
          setError("Unable to fetch ratings");
        }
      })
      .catch(() => setError("Unable to fetch ratings"))
      .finally(() => setLoading(false));
  }, [technicianId]);

  if (loading)
    return (
      <div className="mt-2 text-xs text-muted-foreground">
        Loading feedback...
      </div>
    );
  if (error) return <div className="mt-2 text-xs text-red-600">{error}</div>;
  if (!ratings.length)
    return (
      <div className="mt-2 text-xs text-muted-foreground">No feedback yet.</div>
    );

  return (
    <div className="mt-3 w-full">
      <div className="font-semibold text-xs mb-1 text-foreground">
        All Ratings & Feedback:
      </div>
      <div className="flex flex-col gap-2 w-full">
        {ratings.map((r, i) => (
          <div
            key={i}
            className="rounded border border-border bg-yellow-50 p-2 text-xs flex flex-col"
          >
            <span className="font-medium text-yellow-700">{r.rating} / 5</span>
            {r.feedback && (
              <span className="italic text-muted-foreground mt-1">
                "{r.feedback}"
              </span>
            )}
            <span className="text-[10px] text-muted-foreground mt-1">
              {r.role}{" "}
              {r.createdAt
                ? `on ${new Date(r.createdAt).toLocaleDateString()}`
                : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SettingsPage = () => {
  const {
    user,
    updateProfile,
    deleteMyAccount,
    deleteUserByEmail,
    loading,
    uploadAvatar,
  } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [adminDeleteEmail, setAdminDeleteEmail] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Organization state
  const [organization, setOrganization] = useState<{
    name: string;
    address?: string;
  } | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Technician average rating state
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [ratingLoading, setRatingLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setAddress(user.address || "");
      // Fetch organization info
      if (user.ownerId) {
        setOrgLoading(true);
        setOrgError(null);
        fetch(`${API_BASE}/api/organizations`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && Array.isArray(data.data)) {
              type Org = { _id: string; name: string; address?: string };
              const org = (data.data as Org[]).find(
                (o) => o._id === user.ownerId,
              );
              if (org) {
                setOrganization({ name: org.name, address: org.address });
              } else {
                setOrganization(null);
                setOrgError("Organization not found");
              }
            } else {
              setOrgError("Unable to fetch organization");
            }
          })
          .catch(() => setOrgError("Unable to fetch organization"))
          .finally(() => setOrgLoading(false));
      } else {
        setOrganization(null);
      }

      // Fetch technician average rating if technician
      if (user.role === "technician") {
        setRatingLoading(true);
        let token = null;
        try {
          const stored = localStorage.getItem("civiq_auth");
          if (stored) {
            const parsed = JSON.parse(stored);
            token = parsed.token;
          }
        } catch {
          // Ignore JSON parse errors, treat as no token
        }
        fetch(
          `${API_BASE}/api/complaints/technicians/${user.id}/average-rating`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        )
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setAvgRating(data.averageRating);
              setRatingCount(data.count);
            } else {
              setAvgRating(null);
              setRatingCount(0);
            }
          })
          .catch(() => {
            setAvgRating(null);
            setRatingCount(0);
          })
          .finally(() => setRatingLoading(false));
      } else {
        setAvgRating(null);
        setRatingCount(0);
      }
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

  // Avatar upload handler
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setAvatarError(null);
    setAvatarSuccess(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Only image files (JPG, PNG, GIF) are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("File size must be under 5MB.");
      return;
    }
    setAvatarUploading(true);
    const result = await uploadAvatar(file);
    setAvatarUploading(false);
    if (!result.success) {
      setAvatarError(
        result.message || "Failed to upload avatar. Please try again later.",
      );
    } else {
      setAvatarSuccess("Your profile picture has been updated successfully.");
      toast.success("Avatar updated", {
        description: "Your profile picture has been updated.",
      });
    }
  };

  // Avatar remove handler
  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setRemovingAvatar(true);
    // Remove avatar by uploading a special flag or calling a remove endpoint (here, we just set avatar to empty string)
    const result = await updateProfile({ avatar: "" });
    setRemovingAvatar(false);
    if (!result.success) {
      setAvatarError(
        result.message || "Failed to remove avatar. Please try again later.",
      );
    } else {
      setAvatarSuccess("Your profile picture has been removed.");
      toast.success("Avatar removed", {
        description: "Your profile picture has been reset to default.",
      });
    }
  };

  return (
    <div className="w-full px-4 sm:px-8">
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
          {/* Account Snapshot */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className={`rounded-2xl border p-5 shadow-card ${user?.role === "technician" ? "bg-gradient-to-br from-amber-50 to-white border-amber-200" : "bg-card border-border"}`}
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-4 text-center">
              Account
            </p>
            {/* ── Account Snapshot: avatar-left / info-right layout ── */}
            <div className="flex items-start gap-5">
              {/* LEFT: Avatar + Change/Remove buttons + accepted formats */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                {/* Avatar image: ensure absolute URL in production */}
                {(() => {
                  const avatarSrc = resolveMediaUrl(user?.avatar);
                  return (
                    <img
                      src={avatarSrc}
                      alt="User avatar"
                      className="w-20 h-20 rounded-full object-cover border bg-gray-100"
                      onError={(event) => {
                        event.currentTarget.src =
                          "data:image/svg+xml;utf8," +
                          encodeURIComponent(
                            '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#e5e7eb"/><circle cx="40" cy="30" r="14" fill="#9ca3af"/><path d="M16 70c4-16 16-24 24-24s20 8 24 24" fill="#9ca3af"/></svg>',
                          );
                      }}
                    />
                  );
                })()}
                {/* Buttons sit just below avatar with a small top gap */}
                <div className="flex gap-2 mt-1">
                  <label className="inline-block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                      disabled={avatarUploading || loading}
                    />
                    <Button
                      asChild
                      size="sm"
                      className="px-3 text-xs"
                      disabled={avatarUploading || loading}
                      variant="secondary"
                    >
                      <span>{avatarUploading ? "Uploading..." : "Change"}</span>
                    </Button>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="px-3 text-xs"
                    variant="outline"
                    disabled={
                      removingAvatar ||
                      avatarUploading ||
                      loading ||
                      !user?.avatar
                    }
                    onClick={handleRemoveAvatar}
                  >
                    {removingAvatar ? "Removing..." : "Remove"}
                  </Button>
                </div>
                {/* Accepted formats — tight to buttons, subtle */}
                <p className="text-[10px] text-gray-500 leading-tight text-center mt-1">
                  JPG, PNG, GIF · Max 5MB
                </p>
                {avatarError && (
                  <div className="text-xs text-red-600 mt-1 border border-red-200 bg-red-50 rounded p-2 text-center">
                    {avatarError}
                  </div>
                )}
              </div>

              {/* RIGHT: Name + role badge + email + meta */}
              <div className="flex flex-col justify-center gap-3 min-w-0 pt-1">
                {/* Name + role badge on same row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <h3 className="text-base font-semibold text-foreground leading-tight">
                    {user?.name || "Profile"}
                  </h3>
                  <span
                    className={`inline-flex h-fit items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getRoleBadgeClass(user?.role)}`}
                  >
                    {getRoleLabel(user?.role)}
                  </span>
                </div>

                {/* Email */}
                <p className="text-sm text-muted-foreground truncate">
                  {user?.email || "Not set"}
                </p>

                {/* Technician-only: specialization */}
                {user?.role === "technician" && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-widest">
                      Specialization:{" "}
                    </span>
                    {user?.specialization || "General"}
                  </p>
                )}

                {/* Organization */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-widest">
                    Organization:{" "}
                  </span>
                  {orgLoading ? (
                    "Loading..."
                  ) : orgError ? (
                    <span className="text-red-500">{orgError}</span>
                  ) : organization ? (
                    <>
                      <span className="text-foreground font-medium">
                        {organization.name}
                      </span>
                      {organization.address && (
                        <span className="ml-1 text-muted-foreground">
                          ({organization.address})
                        </span>
                      )}
                    </>
                  ) : (
                    "Not set"
                  )}
                </div>

                {/* Technician average rating */}
                {user?.role === "technician" && (
                  <div className="mt-1 text-xs flex flex-col gap-0.5">
                    <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                      Average Rating:
                    </span>
                    {ratingLoading ? (
                      <span className="text-muted-foreground">Loading...</span>
                    ) : avgRating === null ? (
                      <span className="text-muted-foreground">
                        No ratings yet
                      </span>
                    ) : (
                      <span className="text-yellow-700 font-medium flex items-center gap-1">
                        {avgRating.toFixed(2)} / 5
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="#facc15"
                          viewBox="0 0 24 24"
                          stroke="#eab308"
                          className="h-4 w-4 inline-block"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 17.25l-6.172 3.245 1.179-6.873L2 9.755l6.908-1.004L12 2.25l3.092 6.501L22 9.755l-5.007 4.867 1.179 6.873z"
                          />
                        </svg>
                        <span className="text-muted-foreground">
                          ({ratingCount})
                        </span>
                      </span>
                    )}
                    <AllTechnicianRatings technicianId={user.id} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Edit Profile Section */}
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

          {/* Danger Zone Section */}
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

          {/* About/Help Section (only once, after Danger Zone) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-xl border border-border bg-card p-5 shadow-card"
          >
            <h3 className="text-lg font-semibold mb-2 text-foreground">
              About CiviQ
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              CiviQ is a multi-tenant complaint management system for residents,
              technicians, and admins. For help or feedback, contact:
            </p>
            <ul className="text-sm text-muted-foreground mb-2 list-disc pl-5">
              <li>
                Email:{" "}
                <a href="mailto:support@civiq.com" className="underline">
                  support@civiq.com
                </a>
              </li>
              <li>Phone: +91-12345-67890</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} CiviQ. All rights reserved.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
