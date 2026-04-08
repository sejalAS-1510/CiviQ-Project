const Complaint = require("../models/Complaint");
const technicianAssigner = require("../services/technicianAssigner");
const emailService = require("../services/emailService");
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
    const { description, location, category, priority, autoAssign } = req.body;

    const complaintData = {
      description,
      location,
      category: category || "General",
      priority: priority || "Medium",
      userId: req.user._id, // Associate with logged-in user
    };

    // Handle file upload if present
    if (req.file) {
      complaintData.images = [`/uploads/issue-images/${req.file.filename}`];
    }

    const complaint = new Complaint(complaintData);
    await complaint.save();

    // Auto-assign technician if requested
    let response = {
      success: true,
      message: "Complaint registered successfully",
      data: complaint,
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
          .populate("technician", "name email specialization");

        response.data = updatedComplaint;
        response.message = "Complaint registered and assigned to technician";

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

    // Filter by user role
    if (req.user.role === "user") {
      query.userId = req.user._id;
    } else if (req.user.role === "technician") {
      // Technicians see complaints in their category or assigned to them
      query.$or = [
        { category: req.user.specialization },
        { technician: req.user._id },
      ];
    }
    // Admins see all complaints

    const complaints = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email")
      .populate("technician", "name email specialization");

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
// @access  Private/Admin
exports.deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // Only admins can delete complaints
    if (req.user.role !== "admin") {
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
