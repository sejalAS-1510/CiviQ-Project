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
      "Infrastructure",
      "Sanitation",
      "Utilities",
      "Safety",
      "Environment",
      "General",
    ],
    default: "General",
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

  // Set assignedAt when technician is assigned
  if (this.isModified("technician") && this.technician && !this.assignedAt) {
    this.assignedAt = Date.now();
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
