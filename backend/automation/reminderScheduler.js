const cron = require("node-cron");
require("dotenv").config();

const connectDB = require("../config/db");
const Complaint = require("../models/Complaint");
const emailService = require("../services/emailService");

let reminderJob = null;

async function sendPendingIssueReminders() {
  try {
    // Remind only for actionable issues that already have a technician assigned.
    const complaints = await Complaint.find({
      status: { $in: ["Pending", "In Progress"] },
      technician: { $exists: true, $ne: null },
    })
      .populate("technician", "name email")
      .sort({ createdAt: 1 });

    if (!complaints.length) {
      console.log("[automation] No pending issues to remind.");
      return;
    }

    const byTechnician = new Map();
    for (const complaint of complaints) {
      if (!complaint.technician || !complaint.technician.email) continue;
      const key = complaint.technician._id.toString();
      if (!byTechnician.has(key)) {
        byTechnician.set(key, {
          technician: complaint.technician,
          complaints: [],
        });
      }
      byTechnician.get(key).complaints.push(complaint);
    }

    for (const {
      technician,
      complaints: pendingComplaints,
    } of byTechnician.values()) {
      await emailService.sendTechnicianReminder(technician, pendingComplaints);
      console.log(
        `[automation] Reminder sent to ${technician.email} for ${pendingComplaints.length} issue(s).`,
      );
    }
  } catch (error) {
    console.error("[automation] Reminder cycle failed:", error.message);
  }
}

async function startScheduler() {
  await connectDB();

  const schedule = process.env.REMINDER_CRON || "0 */6 * * *";
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid REMINDER_CRON value: ${schedule}`);
  }

  // Run one cycle on startup so automation is verifiable immediately.
  await sendPendingIssueReminders();

  reminderJob = cron.schedule(schedule, sendPendingIssueReminders, {
    timezone: process.env.TZ || "Asia/Kolkata",
  });

  console.log(`[automation] Scheduler running with cron: ${schedule}`);
}

function stopScheduler() {
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
  console.log("[automation] Scheduler stopped.");
}

startScheduler().catch((error) => {
  console.error("[automation] Failed to start scheduler:", error.message);
  process.exit(1);
});

process.on("SIGINT", () => {
  stopScheduler();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopScheduler();
  process.exit(0);
});
