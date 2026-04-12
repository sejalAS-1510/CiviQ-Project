const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, "Please add a notification title"],
    trim: true,
  },
  message: {
    type: String,
    required: [true, "Please add a notification message"],
    trim: true,
  },
  type: {
    type: String,
    enum: ["success", "info", "warning", "error"],
    default: "info",
  },
  category: {
    type: String,
    enum: [
      "complaint-created",
      "complaint-assigned",
      "complaint-status",
      "complaint-resolved",
      "system",
    ],
    default: "system",
  },
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notification", NotificationSchema);
