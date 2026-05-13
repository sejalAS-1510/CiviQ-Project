// @desc    Get average rating for a technician
// @route   GET /api/complaints/technicians/:id/average-rating
// @access  Private (technician or admin)
exports.getTechnicianAverageRating = async (req, res) => {
  try {
    const technicianId = req.params.id;
    // Debug log for troubleshooting
    console.log("[getTechnicianAverageRating] req.user:", req.user);
    console.log("[getTechnicianAverageRating] technicianId:", technicianId);
    // Only allow self or admin
    if (req.user.role !== "admin" && req.user._id.toString() !== technicianId) {
      console.warn("[getTechnicianAverageRating] Not authorized", {
        userId: req.user._id,
        userRole: req.user.role,
        technicianId,
      });
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    // Find all complaints assigned to this technician with at least one rating
    const complaints = await require("../models/Complaint").find({
      technician: technicianId,
      $or: [
        { "ratings.0": { $exists: true } },
        { technicianRating: { $gte: 1 } }, // legacy
      ],
    });
    // Gather all ratings from all complaints
    let allRatings = [];
    for (const c of complaints) {
      if (Array.isArray(c.ratings) && c.ratings.length > 0) {
        allRatings.push(...c.ratings.map((r) => r.rating));
      } else if (c.technicianRating) {
        allRatings.push(c.technicianRating);
      }
    }
    if (!allRatings.length) {
      return res.json({ success: true, averageRating: null, count: 0 });
    }
    const sum = allRatings.reduce((acc, r) => acc + r, 0);
    const avg = sum / allRatings.length;
    res.json({ success: true, averageRating: avg, count: allRatings.length });
  } catch (error) {
    console.error("Get technician average rating error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const Complaint = require("../models/Complaint");
const technicianAssigner = require("../services/technicianAssigner");
const { classifyComplaint } = require("../services/categoryDetector");
const emailService = require("../services/emailService");
const notificationService = require("../services/notificationService");
const {
  generateComplaintReportAttachment,
} = require("../services/excelReportService");

function triggerNotification(promise, label) {
  promise
    .then((result) => {
      if (!result?.success) {
        console.warn(`[notification] ${label} failed`, result);
      } else if (result?.partial) {
        console.warn(`[notification] ${label} partial delivery`, result);
      } else {
        console.log(`[notification] ${label} sent successfully`);
      }
    })
    .catch((error) => {
      console.error(`[notification] ${label} crashed`, error.message);
    });
}

function triggerNotificationBatch(promise, label) {
  promise
    .then((results) => {
      const failures = Array.isArray(results)
        ? results.filter((result) => !result?.success)
        : [];

      if (failures.length) {
        console.warn(
          `[notification] ${label} had ${failures.length} failure(s)`,
          failures,
        );
      } else {
        console.log(
          `[notification] ${label} batch sent successfully (${results.length} items)`,
        );
      }
    })
    .catch((error) => {
      console.error(`[notification] ${label} crashed`, error.message);
    });
}

async function buildReportAttachment(complaint, meta) {
  try {
    return await generateComplaintReportAttachment(complaint, meta);
  } catch (error) {
    console.warn("[report] Failed to generate excel report", {
      complaintId: complaint?._id,
      eventType: meta?.eventType,
      error: error.message,
    });
    return null;
  }
}

// @desc    Create a new complaint
// @route   POST /api/complaints
// @access  Private
exports.createComplaint = async (req, res) => {
  try {
    if (req.user.role === "technician") {
      return res.status(403).json({
        success: false,
        message: "Technicians are not allowed to report new issues",
      });
    }

    // Extract required fields from request body
    const { description, location, category, priority, autoAssign } = req.body;

    const classification = classifyComplaint({
      description,
      category,
    });

    const complaintData = {
      description,
      location,
      category: classification.backendCategory,
      primaryCategory: classification.primaryCategory,
      secondaryCategory: classification.secondaryCategory || undefined,
      classificationConfidence: classification.confidence,
      priority: priority || "Medium",
      userId: req.user._id, // Associate with logged-in user
      ownerId: req.user.ownerId,
    };

    // Handle file upload if present
    if (req.file) {
      complaintData.images = [`/uploads/issue-images/${req.file.filename}`];
    }

    // If admin is reporting and provided resident info, save it
    let residentUser = null;
    if (req.user.role === "admin") {
      if (req.body.residentName)
        complaintData.residentName = req.body.residentName.trim();
      if (req.body.residentEmail) {
        complaintData.residentEmail = req.body.residentEmail
          .trim()
          .toLowerCase();
        // Try to find a user with this email
        residentUser = await require("../models/User").findOne({
          email: complaintData.residentEmail,
        });
        console.log("[DEBUG] Resident user lookup:", {
          inputEmail: complaintData.residentEmail,
          found: !!residentUser,
          residentUserId: residentUser?._id,
          residentUserEmail: residentUser?.email,
        });
        if (residentUser) {
          complaintData.userId = residentUser._id;
        }
      }
    }

    const complaint = new Complaint(complaintData);
    await complaint.save();

    // Notify the reporter (admin)
    triggerNotification(
      notificationService.createNotification({
        recipient: req.user._id,
        title: "Issue submitted",
        message: `Your issue at ${location} has been received and is being reviewed.`,
        type: "info",
        category: "complaint-created",
        complaintId: complaint._id,
        createdBy: req.user._id,
      }),
      `complaint-created-${complaint._id}`,
    );
    // If admin reported for a resident who is a registered user, notify the resident as well
    if (residentUser) {
      triggerNotification(
        notificationService.createNotification({
          recipient: residentUser._id,
          title: "New issue reported on your behalf",
          message: `An issue at ${location} has been reported for you by an administrator.`,
          type: "info",
          category: "complaint-created",
          complaintId: complaint._id,
          createdBy: req.user._id,
        }),
        `complaint-created-resident-${complaint._id}`,
      );
      emailService
        .sendIssueSubmittedNotification(complaint, residentUser)
        .then((result) => {
          console.log(
            "[DEBUG] Email notification result for resident:",
            result,
          );
        })
        .catch((err) => {
          console.error("[ERROR] Email notification failed for resident:", err);
        });
    }

    triggerNotification(
      emailService.sendIssueSubmittedNotification(complaint, req.user),
      `complaint-submitted-email-${complaint._id}`,
    );

    // Auto-assign technician if requested
    let response = {
      success: true,
      message: "Complaint registered successfully",
      data: complaint,
      classification: {
        detectedType: classification.detectedType,
        confidence: classification.confidence,
        backendCategory: classification.backendCategory,
        primaryCategory: classification.primaryCategory,
        secondaryCategory: classification.secondaryCategory,
      },
    };

    if (autoAssign === true || autoAssign === "true") {
      try {
        const assignedTechnician =
          await technicianAssigner.assignTechnician(complaint);
        complaint.technician = assignedTechnician._id;
        await complaint.save();

        // Populate technician details in response

        const updatedComplaint = await Complaint.findById(complaint._id)
          .populate("userId", "name email")
          .populate({
            path: "technician",
            select: "name email specialization ownerId",
            populate: { path: "ownerId", select: "name address" },
          });

        response.data = updatedComplaint;
        response.message = "Complaint registered and assigned to technician";

        triggerNotificationBatch(
          notificationService.createNotifications([
            {
              recipient: req.user._id,
              title: "Issue assigned",
              message: `Your issue at ${location} has been assigned to ${assignedTechnician.name}.`,
              type: "info",
              category: "complaint-assigned",
              complaintId: complaint._id,
              createdBy: req.user._id,
            },
            {
              recipient: assignedTechnician._id,
              title: "New issue assigned",
              message: `You have been assigned a new issue at ${location}.`,
              type: "warning",
              category: "complaint-assigned",
              complaintId: complaint._id,
              createdBy: req.user._id,
            },
          ]),
          `assignment-auto-notifications-${updatedComplaint._id}`,
        );

        // Send assignment email notification (non-blocking)
        triggerNotification(
          (async () => {
            const attachment = await buildReportAttachment(updatedComplaint, {
              eventType: "assignment",
            });
            return emailService.sendAssignmentNotification(
              updatedComplaint,
              attachment,
            );
          })(),
          `assignment-auto-${updatedComplaint._id}`,
        );
      } catch (assignmentError) {
        console.warn(
          "Auto-assignment failed, complaint created without assignment:",
          assignmentError.message,
        );
        // Don't fail the entire request if assignment fails
        response.warning =
          "Complaint created but auto-assignment failed. Admin can assign manually.";
      }
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Create complaint error:", error);

    // If there was an error and a file was uploaded, clean it up
    if (req.file) {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(
        __dirname,
        "..",
        "uploads",
        "issue-images",
        req.file.filename,
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      success: false,
      message: "Server error during complaint creation",
    });
  }
};

// @desc    Get all complaints
// @route   GET /api/complaints
// @access  Private
exports.getComplaints = async (req, res) => {
  try {
    let query = {};

    // Organization-based filtering
    if (req.user.role === "admin") {
      query.ownerId = req.user.ownerId;
    }
    if (req.user.role === "user") {
      query.userId = req.user._id;
      // Do NOT filter by ownerId for users, so they see all their complaints
    }
    if (req.user.role === "technician") {
      query.technician = req.user._id;
      // Optionally, also filter by ownerId if you want to restrict technicians to their org:
      // query.ownerId = req.user.ownerId;
    }

    const complaints = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email")
      .populate({
        path: "technician",
        select: "name email specialization ownerId",
        populate: { path: "ownerId", select: "name address" },
      });

    res.json({
      success: true,
      data: complaints,
    });
  } catch (error) {
    console.error("Get complaints error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get single complaint
// @route   GET /api/complaints/:id
// @desc    Rate technician for a resolved complaint
// @route   PATCH /api/complaints/:id/rate
// @access  Private (user only)
exports.rateTechnician = async (req, res) => {
  try {
    const complaint = await require("../models/Complaint").findById(
      req.params.id,
    );
    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }
    // Only the complaint's user (resident) or admin can rate
    const isReporter = complaint.userId.toString() === req.user._id.toString();
    if (
      !((req.user.role === "user" && isReporter) || req.user.role === "admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to rate this complaint",
      });
    }
    // Only allow rating if complaint is resolved
    if (complaint.status !== "Resolved") {
      return res.status(400).json({
        success: false,
        message: "Can only rate after complaint is resolved",
      });
    }
    const { technicianRating, technicianFeedback } = req.body;
    if (!technicianRating || technicianRating < 1 || technicianRating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }
    // Prevent duplicate ratings by same user/role
    if (!complaint.ratings) complaint.ratings = [];
    const alreadyRated = complaint.ratings.some(
      (r) =>
        r.rater.toString() === req.user._id.toString() &&
        r.role === req.user.role,
    );
    if (alreadyRated) {
      return res.status(400).json({
        success: false,
        message: "You have already rated this complaint.",
      });
    }
    complaint.ratings.push({
      rater: req.user._id,
      role: req.user.role === "user" ? "resident" : req.user.role,
      rating: technicianRating,
      feedback: technicianFeedback || "",
    });
    // For legacy compatibility, update single fields with latest rating
    complaint.technicianRating = technicianRating;
    complaint.technicianFeedback = technicianFeedback || "";
    await complaint.save();
    res.json({
      success: true,
      message: "Thank you for your feedback!",
      data: { technicianRating, technicianFeedback },
    });
  } catch (error) {
    console.error("Rate technician error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// @access  Private
exports.getComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate("userId", "name email phone")
      .populate("technician", "name email phone specialization");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check if user has permission to view this complaint
    if (
      req.user.role === "user" &&
      complaint.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this complaint",
      });
    }

    if (
      req.user.role === "technician" &&
      (!complaint.technician ||
        complaint.technician._id.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this complaint",
      });
    }

    res.json({
      success: true,
      data: complaint,
    });
  } catch (error) {
    console.error("Get complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update complaint
// @route   PUT /api/complaints/:id
// @access  Private
exports.updateComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate("userId", "name email")
      .populate("technician", "name email specialization");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "user" &&
      complaint.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this complaint",
      });
    }

    if (
      req.user.role === "technician" &&
      (!complaint.technician ||
        complaint.technician._id.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this complaint",
      });
    }

    // Track old status for email notifications
    const oldStatus = complaint.status;

    // Update allowed fields based on role
    const allowedUpdates = {};
    const updates = req.body;

    if (req.user.role === "user") {
      // Users can only update description and location
      if (updates.description) allowedUpdates.description = updates.description;
      if (updates.location) allowedUpdates.location = updates.location;
    } else if (req.user.role === "technician" || req.user.role === "admin") {
      // Technicians and admins can update status and assign technicians
      if (updates.status) allowedUpdates.status = updates.status;
      if (updates.technician) allowedUpdates.technician = updates.technician;
      if (updates.category) allowedUpdates.category = updates.category;
    }

    const updatedComplaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      allowedUpdates,
      { returnDocument: "after" },
    )
      .populate("userId", "name email")
      .populate("technician", "name email specialization");

    // Send notifications based on what was updated
    if (updates.status && updates.status !== oldStatus) {
      const statusNotification = {
        recipient: updatedComplaint.userId._id || updatedComplaint.userId,
        title:
          updates.status === "Resolved" ? "Issue resolved" : "Status updated",
        message:
          updates.status === "Resolved"
            ? `Your issue at ${updatedComplaint.location} has been resolved.`
            : `Your issue at ${updatedComplaint.location} is now ${updates.status}.`,
        type: updates.status === "Resolved" ? "success" : "info",
        category:
          updates.status === "Resolved"
            ? "complaint-resolved"
            : "complaint-status",
        complaintId: updatedComplaint._id,
        createdBy: req.user._id,
      };

      triggerNotification(
        notificationService.createNotification(statusNotification),
        `status-notification-${updatedComplaint._id}`,
      );

      // Status changed - send status update email
      const statusMessage =
        updates.statusMessage ||
        `Issue status has been updated to ${updates.status}`;

      if (updates.status === "Resolved") {
        // Send resolution email
        const resolutionDetails =
          updates.resolutionDetails ||
          "Thank you for reporting this issue. Our team has successfully resolved it.";

        triggerNotification(
          (async () => {
            const attachment = await buildReportAttachment(updatedComplaint, {
              eventType: "resolution",
              statusMessage,
              resolutionDetails,
            });
            return emailService.sendResolutionNotification(
              updatedComplaint,
              resolutionDetails,
              attachment,
            );
          })(),
          `resolution-${updatedComplaint._id}`,
        );
      } else {
        // Send status update email
        triggerNotification(
          (async () => {
            const attachment = await buildReportAttachment(updatedComplaint, {
              eventType: "status-update",
              statusMessage,
            });
            return emailService.sendStatusUpdateNotification(
              updatedComplaint,
              statusMessage,
              attachment,
            );
          })(),
          `status-${updatedComplaint._id}`,
        );
      }
    }

    res.json({
      success: true,
      message: "Complaint updated successfully",
      data: updatedComplaint,
    });
  } catch (error) {
    console.error("Update complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete complaint
// @route   DELETE /api/complaints/:id
// @access  Private
exports.deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = complaint.userId?.toString() === req.user._id.toString();

    // Admin can delete any complaint, residents can delete only their own.
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete complaints",
      });
    }

    await Complaint.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Complaint deleted successfully",
    });
  } catch (error) {
    console.error("Delete complaint error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Assign technician to complaint
// @route   PUT /api/complaints/:id/assign
// @access  Private/Admin
// @param   technicianId (optional) - If provided, manually assign. If not, use AI assignment
// @param   useAI (optional) - Force AI assignment even if technicianId provided
exports.assignTechnician = async (req, res) => {
  try {
    const { technicianId, useAI } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Check if user has permission to assign
    if (req.user.role !== "admin" && req.user.role !== "technician") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to assign technicians",
      });
    }

    let assignedTechnician;

    // If AI assignment requested or no technicianId provided, use AI logic
    if (useAI === true || useAI === "true" || !technicianId) {
      try {
        assignedTechnician =
          await technicianAssigner.assignTechnician(complaint);
        complaint.technician = assignedTechnician._id;

        console.log(
          `[AI Assignment] Assigned complaint ${complaint._id} to ${assignedTechnician.name}`,
        );
      } catch (assignmentError) {
        return res.status(400).json({
          success: false,
          message: `AI assignment failed: ${assignmentError.message}`,
        });
      }
    } else {
      // Manual assignment
      const manualAssignedComplaint = await technicianAssigner.manualAssign(
        complaint._id,
        technicianId,
      );
      assignedTechnician = manualAssignedComplaint.technician;
      complaint.technician = assignedTechnician._id;
    }

    complaint.status = "In Progress";
    await complaint.save();

    const updatedComplaint = await Complaint.findById(req.params.id)
      .populate("userId", "name email phone")
      .populate("technician", "name email phone specialization");

    triggerNotificationBatch(
      notificationService.createNotifications([
        {
          recipient: updatedComplaint.userId._id || updatedComplaint.userId,
          title: "Issue assigned",
          message: `Your issue at ${updatedComplaint.location} has been assigned to ${assignedTechnician.name}.`,
          type: "info",
          category: "complaint-assigned",
          complaintId: updatedComplaint._id,
          createdBy: req.user._id,
        },
        {
          recipient: assignedTechnician._id,
          title: "New issue assigned",
          message: `A new issue at ${updatedComplaint.location} has been assigned to you.`,
          type: "warning",
          category: "complaint-assigned",
          complaintId: updatedComplaint._id,
          createdBy: req.user._id,
        },
      ]),
      `assignment-manual-notifications-${updatedComplaint._id}`,
    );

    // Send assignment notification email to user and technician (non-blocking)
    triggerNotification(
      (async () => {
        const attachment = await buildReportAttachment(updatedComplaint, {
          eventType: "assignment",
        });
        return emailService.sendAssignmentNotification(
          updatedComplaint,
          attachment,
        );
      })(),
      `assignment-manual-${updatedComplaint._id}`,
    );

    res.json({
      success: true,
      message: "Technician assigned successfully",
      data: updatedComplaint,
      assignedTechnician: {
        id: assignedTechnician._id,
        name: assignedTechnician.name,
        email: assignedTechnician.email,
        specialization: assignedTechnician.specialization,
      },
    });
  } catch (error) {
    console.error("Assign technician error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during assignment",
      error: error.message,
    });
  }
};

// @desc    Technician decision on assigned complaint
// @route   PUT /api/complaints/:id/decision
// @access  Private/Technician
exports.updateTechnicianDecision = async (req, res) => {
  try {
    if (req.user.role !== "technician") {
      return res.status(403).json({
        success: false,
        message: "Only technicians can perform this action",
      });
    }

    const { action, note, rescheduleFor } = req.body;
    const normalizedAction = String(action || "")
      .trim()
      .toLowerCase();

    if (!["accept", "reject", "reschedule"].includes(normalizedAction)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use accept, reject, or reschedule",
      });
    }

    const complaint = await Complaint.findById(req.params.id)
      .populate("userId", "name email")
      .populate("technician", "name email specialization");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (
      !complaint.technician ||
      complaint.technician._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only decide on complaints assigned to you",
      });
    }

    const safeNote = typeof note === "string" ? note.trim().slice(0, 300) : "";

    if (normalizedAction === "accept") {
      complaint.technicianDecision = "Accepted";
      complaint.technicianDecisionAt = new Date();
      complaint.technicianDecisionNote = safeNote || undefined;
      if (complaint.status === "Pending") {
        complaint.status = "In Progress";
      }
    }

    if (normalizedAction === "reject") {
      const previousTechnician = complaint.technician;

      complaint.technicianDecision = "Rejected";
      complaint.technicianDecisionAt = new Date();
      complaint.technicianDecisionNote = safeNote || undefined;
      complaint.status = "Pending";

      // Track all rejected technicians for this complaint
      if (!Array.isArray(complaint.rejectedTechnicianIds)) {
        complaint.rejectedTechnicianIds = [];
      }
      // Add current technician if not already present
      if (
        !complaint.rejectedTechnicianIds.some(
          (id) => id.toString() === req.user._id.toString(),
        )
      ) {
        complaint.rejectedTechnicianIds.push(req.user._id);
      }

      let reassignedTechnician = null;
      try {
        reassignedTechnician = await technicianAssigner.assignTechnician(
          complaint,
          {
            excludeTechnicianIds: complaint.rejectedTechnicianIds,
          },
        );
      } catch (reassignError) {
        console.warn(
          `[assignment] Reassign failed for complaint ${complaint._id}: ${reassignError.message}`,
        );
      }

      if (reassignedTechnician) {
        complaint.technician = reassignedTechnician._id;
        complaint.assignedAt = new Date();
        complaint.technicianDecision = "Pending";
        complaint.technicianDecisionAt = undefined;
        complaint.technicianDecisionNote = undefined;
        complaint.scheduledFor = undefined;

        triggerNotificationBatch(
          notificationService.createNotifications([
            {
              recipient: complaint.userId._id || complaint.userId,
              title: "Issue reassigned",
              message: `Your issue at ${complaint.location} has been reassigned to ${reassignedTechnician.name}.`,
              type: "info",
              category: "complaint-reassignment",
              complaintId: complaint._id,
              createdBy: req.user._id,
            },
            {
              recipient: reassignedTechnician._id,
              title: "New issue assigned",
              message: `A reassigned issue at ${complaint.location} has been assigned to you.`,
              type: "warning",
              category: "complaint-assigned",
              complaintId: complaint._id,
              createdBy: req.user._id,
            },
          ]),
          `tech-reassign-${complaint._id}`,
        );
      } else {
        complaint.technician = undefined;
        complaint.assignedAt = undefined;

        triggerNotification(
          notificationService.createNotification({
            recipient: complaint.userId._id || complaint.userId,
            title: "Issue reassignment pending",
            message: `Technician ${previousTechnician?.name || "assigned"} cannot take your issue at ${complaint.location}. Reassignment is pending.`,
            type: "warning",
            category: "complaint-reassignment",
            complaintId: complaint._id,
            createdBy: req.user._id,
          }),
          `tech-reject-${complaint._id}`,
        );
      }
    }

    if (normalizedAction === "reschedule") {
      const parsedDate = new Date(rescheduleFor || "");
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid reschedule date/time",
        });
      }

      if (parsedDate.getTime() < Date.now()) {
        return res.status(400).json({
          success: false,
          message: "Reschedule time must be in the future",
        });
      }

      complaint.technicianDecision = "Rescheduled";
      complaint.technicianDecisionAt = new Date();
      complaint.technicianDecisionNote = safeNote || undefined;
      complaint.scheduledFor = parsedDate;

      triggerNotification(
        notificationService.createNotification({
          recipient: complaint.userId._id || complaint.userId,
          title: "Issue visit rescheduled",
          message: `Your issue at ${complaint.location} has been rescheduled for ${parsedDate.toLocaleString()}.`,
          type: "info",
          category: "complaint-rescheduled",
          complaintId: complaint._id,
          createdBy: req.user._id,
        }),
        `tech-reschedule-${complaint._id}`,
      );

      triggerNotification(
        emailService.sendRescheduleNotification(
          complaint,
          parsedDate,
          safeNote,
        ),
        `reschedule-email-${complaint._id}`,
      );
    }

    await complaint.save();

    const updatedComplaint = await Complaint.findById(complaint._id)
      .populate("userId", "name email")
      .populate("technician", "name email specialization");

    res.json({
      success: true,
      message:
        normalizedAction === "accept"
          ? "Issue accepted"
          : normalizedAction === "reject"
            ? updatedComplaint.technician
              ? "Issue rejected and reassigned"
              : "Issue rejected and awaiting reassignment"
            : "Issue rescheduled",
      data: updatedComplaint,
    });
  } catch (error) {
    console.error("Technician decision error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get technician stats and availability
// @route   GET /api/complaints/technicians/stats
// @access  Private/Admin
exports.getTechnicianStats = async (req, res) => {
  try {
    // Check permission
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view technician stats",
      });
    }

    const stats = await technicianAssigner.getTechnicianStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get technician stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching technician stats",
    });
  }
};
