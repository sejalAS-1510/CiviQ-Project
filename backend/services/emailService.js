/**
 * Email Service
 * Handles all email notifications for the CiviQ system
 * Uses Nodemailer with Gmail SMTP
 *
 * 🔐 SECURITY WARNING:
 * App passwords are less secure than modern OAuth2. This approach is suitable for
 * development/small deployments only. For production, consider:
 * - OAuth2 with service accounts (recommended)
 * - SendGrid/Mailgun/AWS SES (third-party email services)
 *
 * See EMAIL_SERVICE_README.md for detailed security guidelines and production recommendations.
 */

const nodemailer = require("nodemailer");

let transporter = null;

/**
 * Initialize email transporter
 * Reads Gmail credentials from environment variables
 * 
 * ⚠️ IMPORTANT: Credentials must be stored in .env, NEVER hardcoded
 * 
 * Environment variables needed:
 * - GMAIL_USER: Gmail address for sending emails
 * - GMAIL_APP_PASSWORD: Gmail app-specific password (not regular password)
 *   * Requires 2-Step Verification enabled on Google Account
 *   * Generate at: https://myaccount.google.com/apppasswords
 *   * Use 16-char password WITHOUT spaces
 * 
 * Best Practices:
 * ✅ Store credentials in .env file
 * ✅ Add .env to .gitignore
 * ✅ Use HTTPS in production
 * ✅ Rotate passwords periodically
 * ✅ Monitor email logs
 * 
 * For production deployment, see README for OAuth2 setup.
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    console.warn(
      "⚠️  Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env",
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

  console.log(`✅ Email service initialized for ${gmailUser}`);
  return transporter;
};

/**
 * Send assignment notification to user and technician
 * Called when a complaint is assigned to a technician
 *
 * @param {Object} complaint - Complaint document with populated user and technician
 * @param {Object} complaint.userId - User object {name, email}
 * @param {Object} complaint.technician - Technician object {name, email}
 * @param {String} complaint.description - Complaint description
 * @param {String} complaint.category - Complaint category
 * @param {String} complaint.priority - Priority level
 * @param {String} complaint._id - Complaint ID
 * @returns {Promise<Object>} - Send result
 */
exports.sendAssignmentNotification = async (complaint) => {
  try {
    const transport = initializeTransporter();
    if (!transport) {
      console.warn("Email service not configured, skipping notification");
      return { success: false, message: "Email service not configured" };
    }

    const {
      userId,
      technician,
      _id,
      description,
      category,
      location,
      priority,
    } = complaint;

    const complaintUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/complaint/${_id}`;
    const issueId = _id.toString().slice(-8).toUpperCase();

    // Email to user
    const userEmailContent = getAssignmentEmailTemplate(
      userId.name,
      issueId,
      category,
      location,
      description,
      technician.name,
      priority,
      complaintUrl,
      "user",
    );

    const userMailOptions = {
      from: process.env.GMAIL_USER,
      to: userId.email,
      subject: `🔧 Issue #${issueId} Assigned - ${category} at ${location}`,
      html: userEmailContent,
    };

    // Email to technician
    const technicianEmailContent = getAssignmentEmailTemplate(
      technician.name,
      issueId,
      category,
      location,
      description,
      null,
      priority,
      complaintUrl,
      "technician",
    );

    const technicianMailOptions = {
      from: process.env.GMAIL_USER,
      to: technician.email,
      subject: `📋 New Assignment #${issueId} - ${priority} Priority - ${category}`,
      html: technicianEmailContent,
    };

    // Send both emails in parallel
    const [userResult, techResult] = await Promise.all([
      transport.sendMail(userMailOptions),
      transport.sendMail(technicianMailOptions),
    ]);

    console.log(
      `✅ Assignment emails sent - User: ${userId.email}, Technician: ${technician.email}`,
    );

    return {
      success: true,
      message: "Assignment notifications sent",
      userEmail: userId.email,
      technicianEmail: technician.email,
    };
  } catch (error) {
    console.error("Error sending assignment notification:", error);
    return {
      success: false,
      message: "Failed to send assignment notification",
      error: error.message,
    };
  }
};

/**
 * Send status update notification to user
 *
 * @param {Object} complaint - Complaint document
 * @param {String} complaint.userId.email - User email
 * @param {String} complaint.userId.name - User name
 * @param {String} complaint.status - New status (Pending, In Progress, Resolved, Closed)
 * @param {String} complaint._id - Complaint ID
 * @param {String} statusMessage - Detailed status message
 * @returns {Promise<Object>}
 */
exports.sendStatusUpdateNotification = async (complaint, statusMessage) => {
  try {
    const transport = initializeTransporter();
    if (!transport) {
      console.warn("Email service not configured, skipping status update");
      return { success: false, message: "Email service not configured" };
    }

    const { userId, status, _id, category } = complaint;
    const issueId = _id.toString().slice(-8).toUpperCase();
    const complaintUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/complaint/${_id}`;

    const emailContent = getStatusUpdateEmailTemplate(
      userId.name,
      issueId,
      status,
      statusMessage,
      category,
      complaintUrl,
    );

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: userId.email,
      subject: `📢 Update on Issue #${issueId} - Status: ${status}`,
      html: emailContent,
    };

    const result = await transport.sendMail(mailOptions);

    console.log(`✅ Status update email sent to ${userId.email}`);

    return {
      success: true,
      message: "Status update notification sent",
      email: userId.email,
    };
  } catch (error) {
    console.error("Error sending status update:", error);
    return {
      success: false,
      message: "Failed to send status update",
      error: error.message,
    };
  }
};

/**
 * Send resolution notification (issue resolved)
 *
 * @param {Object} complaint - Complaint document
 * @param {String} resolutionDetails - Details of how issue was resolved
 * @returns {Promise<Object>}
 */
exports.sendResolutionNotification = async (complaint, resolutionDetails) => {
  try {
    const transport = initializeTransporter();
    if (!transport) {
      console.warn("Email service not configured, skipping resolution email");
      return { success: false, message: "Email service not configured" };
    }

    const { userId, technician, _id, category, location } = complaint;
    const issueId = _id.toString().slice(-8).toUpperCase();
    const complaintUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/complaint/${_id}`;

    const emailContent = getResolutionEmailTemplate(
      userId.name,
      issueId,
      category,
      location,
      technician?.name || "Support Team",
      resolutionDetails,
      complaintUrl,
    );

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: userId.email,
      subject: `✅ Issue #${issueId} Resolved - Thank You!`,
      html: emailContent,
    };

    const result = await transport.sendMail(mailOptions);

    console.log(`✅ Resolution notification sent to ${userId.email}`);

    return {
      success: true,
      message: "Resolution notification sent",
      email: userId.email,
    };
  } catch (error) {
    console.error("Error sending resolution notification:", error);
    return {
      success: false,
      message: "Failed to send resolution notification",
      error: error.message,
    };
  }
};

/**
 * Send email with attachment (e.g., Excel report)
 *
 * @param {String} to - Recipient email
 * @param {String} subject - Email subject
 * @param {String} htmlContent - HTML email content
 * @param {Object} attachment - Attachment object {filename, content}
 * @returns {Promise<Object>}
 */
exports.sendEmailWithAttachment = async (
  to,
  subject,
  htmlContent,
  attachment,
) => {
  try {
    const transport = initializeTransporter();
    if (!transport) {
      console.warn("Email service not configured, skipping email");
      return { success: false, message: "Email service not configured" };
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content, // Can be Buffer or string
        },
      ],
    };

    const result = await transport.sendMail(mailOptions);

    console.log(`✅ Email with attachment sent to ${to}`);

    return {
      success: true,
      message: "Email with attachment sent",
      email: to,
    };
  } catch (error) {
    console.error("Error sending email with attachment:", error);
    return {
      success: false,
      message: "Failed to send email with attachment",
      error: error.message,
    };
  }
};

/**
 * Send reminder email to technician about pending complaints
 *
 * @param {Object} technician - Technician object {name, email}
 * @param {Array} pendingComplaints - Array of pending complaints
 * @returns {Promise<Object>}
 */
exports.sendTechnicianReminder = async (technician, pendingComplaints) => {
  try {
    const transport = initializeTransporter();
    if (!transport) {
      console.warn("Email service not configured, skipping reminder");
      return { success: false, message: "Email service not configured" };
    }

    const emailContent = getTechnicianReminderTemplate(
      technician.name,
      pendingComplaints,
    );

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: technician.email,
      subject: `⏰ Reminder: ${pendingComplaints.length} Pending Issues Assigned to You`,
      html: emailContent,
    };

    const result = await transport.sendMail(mailOptions);

    console.log(`✅ Reminder email sent to technician ${technician.email}`);

    return {
      success: true,
      message: "Reminder sent",
      email: technician.email,
    };
  } catch (error) {
    console.error("Error sending technician reminder:", error);
    return {
      success: false,
      message: "Failed to send reminder",
      error: error.message,
    };
  }
};

// ==================== EMAIL TEMPLATES ====================

/**
 * Assignment notification email template
 */
function getAssignmentEmailTemplate(
  name,
  issueId,
  category,
  location,
  description,
  technicianName,
  priority,
  complaintUrl,
  recipient,
) {
  const isUser = recipient === "user";

  const baseStyle = `
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
  `;

  const priorityColor =
    {
      High: "#d73a49",
      Medium: "#ffa500",
      Low: "#28a745",
    }[priority] || "#666";

  if (isUser) {
    return `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🔧 Your Issue Has Been Assigned</h1>
          </div>

          <!-- Content -->
          <div style="padding: 30px;">
            <p style="font-size: 16px;">Hi ${name},</p>
            
            <p>Great news! Your reported issue has been assigned to our expert technician.</p>

            <!-- Issue Details Card -->
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0;"><strong>Issue ID:</strong></td>
                  <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px;">#${issueId}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Category:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">${category}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Location:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">${location}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Priority:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">
                    <span style="background: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                      ${priority}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Assigned To:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">${technicianName || "Our Team"}</td>
                </tr>
              </table>
            </div>

            <p><strong>Issue Description:</strong></p>
            <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid #667eea; border-radius: 4px;">
              ${description}
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${complaintUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                View Full Details →
              </a>
            </div>

            <p>You can track the progress of your issue anytime by clicking the button above or logging into your dashboard.</p>

            <p>We appreciate your patience and will keep you updated on the resolution status.</p>
          </div>

          <!-- Footer -->
          <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p style="margin: 0;">CiviQ - Civic Issue Tracking System</p>
            <p style="margin: 5px 0;">© 2024 All rights reserved</p>
          </div>
        </div>
      </div>
    `;
  } else {
    // Technician version
    return `
      <div style="${baseStyle}">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📋 New Assignment for You</h1>
          </div>

          <!-- Content -->
          <div style="padding: 30px;">
            <p style="font-size: 16px;">Hi ${name},</p>
            
            <p>A new issue has been assigned to you based on your specialization and current workload.</p>

            <!-- Issue Details Card -->
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0;"><strong>Issue ID:</strong></td>
                  <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px;">#${issueId}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Category:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">${category}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Location:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">${location}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;"><strong>Priority:</strong></td>
                  <td style="padding: 10px 0; text-align: right;">
                    <span style="background: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                      ${priority}
                    </span>
                  </td>
                </tr>
              </table>
            </div>

            <p><strong>Issue Description:</strong></p>
            <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid #667eea; border-radius: 4px;">
              ${description}
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${complaintUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                View Assignment →
              </a>
            </div>

            <p>Please acknowledge receipt of this assignment and update the status as you make progress.</p>
          </div>

          <!-- Footer -->
          <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p style="margin: 0;">CiviQ - Civic Issue Tracking System</p>
            <p style="margin: 5px 0;">© 2024 All rights reserved</p>
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * Status update email template
 */
function getStatusUpdateEmailTemplate(
  name,
  issueId,
  status,
  statusMessage,
  category,
  complaintUrl,
) {
  const statusColor =
    {
      Pending: "#FFA500",
      "In Progress": "#3498db",
      Resolved: "#28a745",
      Closed: "#95a5a6",
    }[status] || "#666";

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">📢 Issue Status Update</h1>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <p style="font-size: 16px;">Hi ${name},</p>
          
          <p>We have an important update on your reported issue.</p>

          <!-- Status Card -->
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid ${statusColor};">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0;"><strong>Issue ID:</strong></td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold;">#${issueId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0;"><strong>Category:</strong></td>
                <td style="padding: 10px 0; text-align: right;">${category}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0;"><strong>Status:</strong></td>
                <td style="padding: 10px 0; text-align: right;">
                  <span style="background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                    ${status}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <p><strong>Status Update:</strong></p>
          <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid ${statusColor}; border-radius: 4px;">
            ${statusMessage}
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${complaintUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Details →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          <p style="margin: 0;">CiviQ - Civic Issue Tracking System</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Resolution email template
 */
function getResolutionEmailTemplate(
  name,
  issueId,
  category,
  location,
  technicianName,
  resolutionDetails,
  complaintUrl,
) {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">✅ Issue Resolved!</h1>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <p style="font-size: 16px;">Hi ${name},</p>
          
          <p style="font-size: 18px; color: #28a745;"><strong>Great news! Your reported issue has been successfully resolved.</strong></p>

          <!-- Resolution Details Card -->
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #28a745;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0;"><strong>Issue ID:</strong></td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold;">#${issueId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0;"><strong>Category:</strong></td>
                <td style="padding: 10px 0; text-align: right;">${category}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0;"><strong>Location:</strong></td>
                <td style="padding: 10px 0; text-align: right;">${location}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0;"><strong>Resolved By:</strong></td>
                <td style="padding: 10px 0; text-align: right;">${technicianName}</td>
              </tr>
            </table>
          </div>

          <p><strong>Resolution Summary:</strong></p>
          <p style="background: #f9f9f9; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px;">
            ${resolutionDetails}
          </p>

          <!-- Feedback Section -->
          <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>📝 Your Feedback Matters</strong></p>
            <p style="margin: 0;">We'd love to hear about your experience. Please rate the resolution and let us know if there's anything else we can help with.</p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${complaintUrl}" style="display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Full Issue Details →
            </a>
          </div>

          <p>Thank you for using CiviQ to report civic issues. Your feedback helps us improve our community!</p>
        </div>

        <!-- Footer -->
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          <p style="margin: 0;">CiviQ - Civic Issue Tracking System</p>
          <p style="margin: 5px 0;">© 2024 All rights reserved</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Technician reminder email template
 */
function getTechnicianReminderTemplate(name, pendingComplaints) {
  const complaintsList = pendingComplaints
    .map(
      (c) => `
    <div style="background: #f9f9f9; padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #667eea;">
      <strong>#${c._id.toString().slice(-8).toUpperCase()}</strong> - ${c.category} at ${c.location}
      <br/><small>${c.description.substring(0, 100)}...</small>
    </div>
  `,
    )
    .join("");

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">⏰ Pending Issues Reminder</h1>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <p style="font-size: 16px;">Hi ${name},</p>
          
          <p>You currently have <strong>${pendingComplaints.length}</strong> pending issues assigned to you. Here's a quick recap:</p>

          <!-- Issues List -->
          <div>${complaintsList}</div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Dashboard →
            </a>
          </div>

          <p>Please prioritize and update the status of these issues to keep the community informed.</p>
        </div>

        <!-- Footer -->
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          <p style="margin: 0;">CiviQ - Civic Issue Tracking System</p>
        </div>
      </div>
    </div>
  `;
}

module.exports = exports;
