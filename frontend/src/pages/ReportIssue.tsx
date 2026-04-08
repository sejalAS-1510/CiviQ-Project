import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, MapPin, Send, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIssueStore, IssueCategory } from "@/store/issueStore";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

const categories: { value: IssueCategory; label: string }[] = [
  { value: "plumbing", label: "🔧 Plumbing" },
  { value: "electrical", label: "⚡ Electrical" },
  { value: "cleaning", label: "🧹 Cleaning" },
  { value: "security", label: "🔒 Security" },
  { value: "infrastructure", label: "🏗️ Infrastructure" },
  { value: "noise", label: "🔊 Noise Complaint" },
  { value: "other", label: "📋 Other" },
];

const ReportIssue = () => {
  const [category, setCategory] = useState<IssueCategory | "">("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { addIssue } = useIssueStore();
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("Please sign in to report an issue.", {
        description: "You need to be logged in to submit an issue report.",
        icon: <ShieldAlert className="h-4 w-4" />,
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl border border-border p-8 shadow-card text-center space-y-4"
        >
          <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-7 w-7 text-warning" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">
            Sign In Required
          </h2>
          <p className="text-muted-foreground text-sm">
            Please sign in to report an issue. Only logged-in residents can
            submit issue reports.
          </p>
          <Button
            onClick={() => navigate("/")}
            className="gradient-primary text-primary-foreground shadow-sm hover:shadow-glow transition-shadow"
          >
            Go to Home & Sign In
          </Button>
        </motion.div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || submitting) return;

    setSubmitting(true);

    const result = await addIssue({
      category,
      description,
      location,
      imageFile: imageFile || undefined,
    });

    if (result.success) {
      toast.success("Issue reported successfully!", {
        description:
          "Your issue has been submitted and will be reviewed shortly.",
      });

      setCategory("");
      setDescription("");
      setLocation("");
      setImageFile(null);
      navigate("/issues");
    } else {
      toast.error("Failed to report issue", {
        description: result.message,
      });
    }

    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Report an Issue
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Help keep your community clean and safe by reporting issues.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl border border-border p-6 shadow-card space-y-5"
          >
            <div className="space-y-2">
              <Label className="text-sm font-medium">Issue Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as IssueCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Block A - Ground Floor"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Upload Image (optional)
              </Label>
              <label
                htmlFor="issue-image-upload"
                className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/30 transition-colors cursor-pointer"
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">
                  Click to upload an image
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG up to 5MB
                </p>
                {imageFile && (
                  <p className="text-xs text-primary mt-2">
                    Selected: {imageFile.name}
                  </p>
                )}
              </label>
              <Input
                id="issue-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast.error("Image too large", {
                      description: "Please select an image up to 5MB.",
                    });
                    return;
                  }
                  setImageFile(file);
                }}
              />
            </div>
          </motion.div>

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground shadow-sm hover:shadow-glow transition-shadow"
            disabled={!category || submitting}
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Submitting..." : "Submit Issue Report"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default ReportIssue;
