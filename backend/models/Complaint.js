const mongoose = require("mongoose");

const ComplaintSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, "Please add a description"],
    trim: true,
  },

  location: {
    type: String,
    required: [true, "Please add a location"],
    trim: true,
  },

  category: {
    type: String,
    enum: [
      "Plumbing",
      "Electrical",
      "Cleaning",
      "Security",
      "Infrastructure",
      "Noise",
      "General",
      // Legacy categories retained for existing records
      "Sanitation",
      "Utilities",
      "Safety",
      "Environment",
    ],
    default: "General",
  },

  primaryCategory: {
    type: String,
    enum: [
      "Plumbing",
      "Electrical",
      "Cleaning",
      "Security",
      "Infrastructure",
      "Noise",
      "General",
    ],
    default: "General",
  },

  secondaryCategory: {
    type: String,
    enum: [
      "Plumbing",
      "Electrical",
      "Cleaning",
      "Security",
      "Infrastructure",
      "Noise",
      "General",
    ],
  },

  classificationConfidence: {
    type: String,
    enum: ["high", "medium", "low"],
    default: "low",
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  status: {
    type: String,
    enum: ["Pending", "In Progress", "Resolved", "Closed"],
    default: "Pending",
  },

  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium",
  },

  images: [
    {
      type: String, // URLs to uploaded images
    },
  ],

  assignedAt: {
    type: Date,
  },

  technicianDecision: {
    type: String,
    enum: ["Pending", "Accepted", "Rejected", "Rescheduled"],
    default: "Pending",
  },

  technicianDecisionAt: {
    type: Date,
  },

  technicianDecisionNote: {
    type: String,
    trim: true,
    maxlength: [300, "Decision note cannot be more than 300 characters"],
  },

  scheduledFor: {
    type: Date,
  },

  resolvedAt: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamps and lifecycle fields before saving
ComplaintSchema.pre("save", function () {
  this.updatedAt = Date.now();

  if (!this.primaryCategory) {
    this.primaryCategory = this.category || "General";
  }

  // Reset assignment decision lifecycle when technician assignment changes.
  if (this.isModified("technician")) {
    if (this.technician) {
      if (!this.assignedAt) {
        this.assignedAt = Date.now();
      }

      this.technicianDecision = "Pending";
      this.technicianDecisionAt = undefined;
      this.technicianDecisionNote = undefined;
      this.scheduledFor = undefined;
    }
  }

  // Set resolvedAt when status changes to resolved
  if (
    this.isModified("status") &&
    this.status === "Resolved" &&
    !this.resolvedAt
  ) {
    this.resolvedAt = Date.now();
  }
});

module.exports = mongoose.model("Complaint", ComplaintSchema);
