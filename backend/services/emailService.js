const nodemailer = require("nodemailer");
const sendgridMail = require("@sendgrid/mail");

let transporter = null;
let transporterVerified = false;
let emailServiceDisabledReason = null;
let emailConfigWarned = false;

const DEFAULT_FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:8080";
const EMAIL_RETRY_ATTEMPTS = Number(process.env.EMAIL_RETRY_ATTEMPTS || 3);
const EMAIL_RETRY_DELAY_MS = Number(process.env.EMAIL_RETRY_DELAY_MS || 1500);
const EMAIL_SEND_TIMEOUT_MS = Number(
  process.env.EMAIL_SEND_TIMEOUT_MS || 10000,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIssueId(id) {
  return String(id || "")
    .slice(-8)
    .toUpperCase();
}

function getStatusColor(status) {
  return (
    {
      Pending: "#f59e0b",
      "In Progress": "#2563eb",
      Resolved: "#16a34a",
      Closed: "#6b7280",
    }[status] || "#2563eb"
  );
}

function isRetryableError(error) {
  const retryableCodes = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ESOCKET",
    "EMESSAGE",
  ]);

  const responseCode = Number(error?.responseCode || 0);
  const smtpRetryable = [421, 429, 450, 451, 452].includes(responseCode);

  return retryableCodes.has(error?.code) || smtpRetryable;
}

function resolveEmailProvider() {
  const configuredProvider = String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();

  if (configuredProvider === "gmail" || configuredProvider === "sendgrid") {
    return configuredProvider;
  }

  if (process.env.SENDGRID_API_KEY) {
    return "sendgrid";
  }

  return "gmail";
}

function getFromAddress() {
  const provider = resolveEmailProvider();
  const fromEmail =
    process.env.SENDGRID_FROM_EMAIL ||
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    "no-reply@localhost";

  if (
    provider === "sendgrid" &&
    process.env.SENDGRID_FROM_NAME &&
    fromEmail &&
    !/[<>]/.test(fromEmail)
  ) {
    return {
      email: fromEmail,
      name: process.env.SENDGRID_FROM_NAME,
    };
  }

  return process.env.EMAIL_FROM || fromEmail;
}

function normalizeAttachmentForSendGrid(attachment) {
  if (!attachment || !attachment.filename) return null;

  let content = attachment.content;
  if (Buffer.isBuffer(content)) {
    content = content.toString("base64");
  } else if (typeof content === "string") {
    content = Buffer.from(content).toString("base64");
  } else {
    return null;
  }

  return {
    content,
    filename: attachment.filename,
    type:
      attachment.contentType || attachment.type || "application/octet-stream",
    disposition: attachment.disposition || "attachment",
    content_id: attachment.cid,
  };
}

function buildSendGridMessage(mailOptions) {
  const attachments = normalizeAttachments(mailOptions.attachments)
    .map(normalizeAttachmentForSendGrid)
    .filter(Boolean);

  return {
    from: getFromAddress(),
    to: mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html,
    attachments,
  };
}

function createSendGridClient() {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    if (!emailConfigWarned) {
      console.warn(
        "[email] SendGrid not configured. Set SENDGRID_API_KEY in backend/.env",
      );
      emailConfigWarned = true;
    }
    emailServiceDisabledReason = "email-not-configured";
    return null;
  }

  sendgridMail.setApiKey(apiKey);

  return {
    provider: "sendgrid",
    verify: async () => true,
    sendMail: async (mailOptions) => {
      const [response] = await sendgridMail.send(
        buildSendGridMessage(mailOptions),
      );
      return {
        accepted: [mailOptions.to],
        rejected: [],
        messageId:
          response?.headers?.["x-message-id"] ||
          response?.headers?.["x-sg-message-id"] ||
          response?.headers?.["X-Message-Id"],
      };
    },
  };
}

async function withRetry(taskFn, options) {
  const { attempts, delayMs, label } = options;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await taskFn();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && isRetryableError(error);

      if (!canRetry) {
        throw error;
      }

      console.warn(
        `[email] ${label} failed (attempt ${attempt}/${attempts}): ${error.message}. Retrying...`,
      );
      await sleep(delayMs * attempt);
    }
  }

  throw lastError;
}

function initializeTransporter() {
  if (transporter) return transporter;
  if (emailServiceDisabledReason) return null;

  const emailProvider = resolveEmailProvider();

  if (emailProvider === "sendgrid") {
    transporter = createSendGridClient();
    return transporter;
  }

  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailPassword =
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GMAIL_PASS ||
    process.env.EMAIL_PASS;

  if (!gmailUser || !gmailPassword) {
    if (!emailConfigWarned) {
      console.warn(
        "[email] Service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (or GMAIL_PASS) in backend/.env",
      );
      emailConfigWarned = true;
    }
    emailServiceDisabledReason = "email-not-configured";
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

  return transporter;
}

async function ensureTransportReady() {
  const transport = initializeTransporter();
  if (!transport) return null;

  if (!transporterVerified) {
    try {
      if (typeof transport.verify === "function") {
        await transport.verify();
      }
      transporterVerified = true;
      const provider = resolveEmailProvider();
      const verifiedUser =
        provider === "sendgrid"
          ? process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM
          : process.env.GMAIL_USER || process.env.EMAIL_USER;
      console.log(`[email] ${provider} service verified for ${verifiedUser}`);
    } catch (error) {
      const isAuthFailure =
        Number(error?.responseCode) === 535 ||
        /badcredentials|username and password not accepted|auth/i.test(
          error?.message || "",
        );

      emailServiceDisabledReason = isAuthFailure
        ? "email-auth-failed"
        : "email-verify-failed";
      transporter = null;
      transporterVerified = false;

      console.warn(
        `[email] Disabled for this runtime (${emailServiceDisabledReason}): ${error.message}`,
      );
      return null;
    }
  }

  return transport;
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(
          `[email] ${label} timed out after ${timeoutMs}ms`,
        );
        error.code = "ETIMEDOUT";
        reject(error);
      }, timeoutMs);
    }),
  ]);
}

async function sendMailWithRetry(mailOptions, label) {
  const transport = await ensureTransportReady();
  if (!transport) {
    return {
      success: false,
      reason: emailServiceDisabledReason || "email-unavailable",
      label,
    };
  }

  if (!mailOptions?.to || !mailOptions?.subject || !mailOptions?.html) {
    return {
      success: false,
      reason: "invalid-mail-options",
      label,
    };
  }

  const info = await withRetry(
    async () =>
      withTimeout(
        transport.sendMail({
          from: getFromAddress(),
          ...mailOptions,
        }),
        EMAIL_SEND_TIMEOUT_MS,
        label,
      ),
    {
      attempts: EMAIL_RETRY_ATTEMPTS,
      delayMs: EMAIL_RETRY_DELAY_MS,
      label,
    },
  );

  return {
    success: true,
    label,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    messageId: info.messageId,
  };
}

function normalizeAttachments(attachment) {
  if (!attachment) return [];
  if (Array.isArray(attachment)) return attachment;
  return [attachment];
}

function notifyResultSummary(results, type) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (failed.length === 0) {
    console.log(
      `[email] ${type} notification sent (${successful.length}/${results.length})`,
    );
  } else {
    console.warn(
      `[email] ${type} notification partially failed (${successful.length}/${results.length})`,
      failed.map((f) => ({ label: f.label, reason: f.reason || f.error })),
    );
  }

  return {
    success: failed.length === 0,
    partial: failed.length > 0 && successful.length > 0,
    total: results.length,
    sent: successful.length,
    failed: failed.length,
    results,
  };
}

exports.sendAssignmentNotification = async (complaint, attachment = null) => {
  try {
    const {
      userId,
      technician,
      _id,
      description,
      category,
      location,
      priority,
    } = complaint || {};

    const issueId = toIssueId(_id);
    const complaintUrl = `${DEFAULT_FRONTEND_URL}/complaint/${_id}`;

    const jobs = [];

    if (userId?.email) {
      jobs.push({
        label: `assignment-user-${issueId}`,
        promise: sendMailWithRetry(
          {
            to: userId.email,
            subject: `Issue #${issueId} assigned: ${category || "General"}`,
            html: assignmentTemplate({
              name: userId.name || "Citizen",
              issueId,
              category,
              location,
              description,
              priority,
              technicianName: technician?.name || "Assigned Technician",
              complaintUrl,
              recipient: "user",
            }),
            attachments: normalizeAttachments(attachment),
          },
          `assignment-user-${issueId}`,
        ),
      });
    }

    if (technician?.email) {
      jobs.push({
        label: `assignment-tech-${issueId}`,
        promise: sendMailWithRetry(
          {
            to: technician.email,
            subject: `New assignment #${issueId} (${priority || "Medium"})`,
            html: assignmentTemplate({
              name: technician.name || "Technician",
              issueId,
              category,
              location,
              description,
              priority,
              complaintUrl,
              recipient: "technician",
            }),
            attachments: normalizeAttachments(attachment),
          },
          `assignment-tech-${issueId}`,
        ),
      });
    }

    if (!jobs.length) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const settled = await Promise.allSettled(jobs.map((job) => job.promise));
    const normalized = settled.map((item, idx) => {
      if (item.status === "fulfilled") return item.value;
      return {
        success: false,
        label: jobs[idx].label,
        error: item.reason?.message || "unknown-error",
      };
    });

    return notifyResultSummary(normalized, "assignment");
  } catch (error) {
    console.error("[email] Assignment notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendIssueSubmittedNotification = async (
  complaint,
  reporter,
  attachment = null,
) => {
  try {
    const sourceUser = reporter || complaint?.userId || {};
    const recipientEmail = sourceUser?.email;

    if (!recipientEmail) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const issueId = toIssueId(complaint?._id);
    const complaintUrl = `${DEFAULT_FRONTEND_URL}/complaint/${complaint?._id}`;

    const mail = {
      to: recipientEmail,
      subject: `Issue #${issueId} submitted successfully`,
      html: submittedTemplate({
        name: sourceUser?.name || "Citizen",
        issueId,
        category: complaint?.category,
        location: complaint?.location,
        description: complaint?.description,
        priority: complaint?.priority,
        complaintUrl,
      }),
      attachments: normalizeAttachments(attachment),
    };

    const result = await sendMailWithRetry(mail, `submitted-user-${issueId}`);
    return notifyResultSummary([result], "submitted");
  } catch (error) {
    console.error(
      "[email] Issue submission notification failed:",
      error.message,
    );
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendStatusUpdateNotification = async (
  complaint,
  statusMessage,
  attachment = null,
) => {
  try {
    const { userId, status, _id, category, location } = complaint || {};

    if (!userId?.email) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const issueId = toIssueId(_id);
    const complaintUrl = `${DEFAULT_FRONTEND_URL}/complaint/${_id}`;

    const mail = {
      to: userId.email,
      subject: `Issue #${issueId} status: ${status}`,
      html: statusTemplate({
        name: userId.name || "Citizen",
        issueId,
        status,
        category,
        location,
        statusMessage,
        complaintUrl,
      }),
      attachments: normalizeAttachments(attachment),
    };

    const result = await sendMailWithRetry(mail, `status-user-${issueId}`);
    return notifyResultSummary([result], "status");
  } catch (error) {
    console.error("[email] Status notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendResolutionNotification = async (
  complaint,
  resolutionDetails,
  attachment = null,
) => {
  try {
    const { userId, technician, _id, category, location } = complaint || {};

    if (!userId?.email) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const issueId = toIssueId(_id);
    const complaintUrl = `${DEFAULT_FRONTEND_URL}/complaint/${_id}`;

    const mail = {
      to: userId.email,
      subject: `Issue #${issueId} resolved`,
      html: resolutionTemplate({
        name: userId.name || "Citizen",
        issueId,
        category,
        location,
        resolutionDetails,
        technicianName: technician?.name || "Support Team",
        complaintUrl,
      }),
      attachments: normalizeAttachments(attachment),
    };

    const result = await sendMailWithRetry(mail, `resolution-user-${issueId}`);
    return notifyResultSummary([result], "resolution");
  } catch (error) {
    console.error("[email] Resolution notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendRescheduleNotification = async (
  complaint,
  scheduledFor,
  note = "",
  attachment = null,
) => {
  try {
    const { userId, technician, _id, category, location } = complaint || {};

    const issueId = toIssueId(_id);
    const complaintUrl = `${DEFAULT_FRONTEND_URL}/complaint/${_id}`;
    const scheduledLabel = new Date(scheduledFor).toLocaleString();

    const jobs = [];

    if (userId?.email) {
      jobs.push({
        label: `reschedule-user-${issueId}`,
        promise: sendMailWithRetry(
          {
            to: userId.email,
            subject: `Issue #${issueId} visit rescheduled`,
            html: rescheduleTemplate({
              name: userId.name || "Citizen",
              recipient: "user",
              issueId,
              category,
              location,
              scheduledFor: scheduledLabel,
              note,
              complaintUrl,
              technicianName: technician?.name || "Technician",
            }),
            attachments: normalizeAttachments(attachment),
          },
          `reschedule-user-${issueId}`,
        ),
      });
    }

    if (technician?.email) {
      jobs.push({
        label: `reschedule-tech-${issueId}`,
        promise: sendMailWithRetry(
          {
            to: technician.email,
            subject: `Reschedule confirmed for issue #${issueId}`,
            html: rescheduleTemplate({
              name: technician.name || "Technician",
              recipient: "technician",
              issueId,
              category,
              location,
              scheduledFor: scheduledLabel,
              note,
              complaintUrl,
              technicianName: technician.name || "Technician",
            }),
            attachments: normalizeAttachments(attachment),
          },
          `reschedule-tech-${issueId}`,
        ),
      });
    }

    if (!jobs.length) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const settled = await Promise.allSettled(jobs.map((job) => job.promise));
    const normalized = settled.map((item, idx) => {
      if (item.status === "fulfilled") return item.value;
      return {
        success: false,
        label: jobs[idx].label,
        error: item.reason?.message || "unknown-error",
      };
    });

    return notifyResultSummary(normalized, "reschedule");
  } catch (error) {
    console.error("[email] Reschedule notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendEmailWithAttachment = async (
  to,
  subject,
  htmlContent,
  attachment,
) => {
  try {
    const result = await sendMailWithRetry(
      {
        to,
        subject,
        html: htmlContent,
        attachments: attachment
          ? [
              {
                filename: attachment.filename,
                content: attachment.content,
              },
            ]
          : [],
      },
      "attachment-mail",
    );

    return notifyResultSummary([result], "attachment");
  } catch (error) {
    console.error("[email] Attachment notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendTechnicianReminder = async (technician, pendingComplaints = []) => {
  try {
    if (!technician?.email) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const mail = {
      to: technician.email,
      subject: `Reminder: ${pendingComplaints.length} pending issue(s)`,
      html: reminderTemplate({
        name: technician.name || "Technician",
        pendingComplaints,
        dashboardUrl: `${DEFAULT_FRONTEND_URL}/dashboard`,
      }),
    };

    const result = await sendMailWithRetry(
      mail,
      `reminder-tech-${technician._id || "unknown"}`,
    );
    return notifyResultSummary([result], "reminder");
  } catch (error) {
    console.error("[email] Technician reminder failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendSignupNotification = async (user) => {
  try {
    if (!user?.email) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const mail = {
      to: user.email,
      subject: "Welcome to CiviQ - Signup Successful",
      html: signupTemplate({
        name: user.name || "User",
        email: user.email,
        loginUrl: DEFAULT_FRONTEND_URL,
      }),
    };

    const result = await sendMailWithRetry(
      mail,
      `signup-${user._id || user.email}`,
    );
    return notifyResultSummary([result], "signup");
  } catch (error) {
    console.error("[email] Signup notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.sendLoginNotification = async (user) => {
  try {
    if (!user?.email) {
      return {
        success: false,
        reason: "missing-recipient-email",
      };
    }

    const mail = {
      to: user.email,
      subject: "CiviQ Login Alert",
      html: loginTemplate({
        name: user.name || "User",
        email: user.email,
        loggedInAt: new Date().toISOString(),
      }),
    };

    const result = await sendMailWithRetry(
      mail,
      `login-alert-${user._id || user.email}`,
    );
    return notifyResultSummary([result], "login-alert");
  } catch (error) {
    console.error("[email] Login notification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

function baseCard(innerHtml) {
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111;line-height:1.5;">
      <div style="max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        ${innerHtml}
      </div>
    </div>
  `;
}

function assignmentTemplate(data) {
  const priority = data.priority || "Medium";
  const color = getStatusColor("In Progress");
  const intro =
    data.recipient === "technician"
      ? "A new issue is assigned to you."
      : `Your issue has been assigned to ${data.technicianName}.`;

  return baseCard(`
    <div style="background:#1d4ed8;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Issue Assignment</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>${intro}</p>
      <p><strong>Issue ID:</strong> #${data.issueId}</p>
      <p><strong>Category:</strong> ${data.category || "General"}</p>
      <p><strong>Location:</strong> ${data.location || "Not provided"}</p>
      <p><strong>Priority:</strong> <span style="color:${color};font-weight:600;">${priority}</span></p>
      <p><strong>Description:</strong><br/>${data.description || "No description provided"}</p>
      <p><a href="${data.complaintUrl}">Open complaint details</a></p>
    </div>
  `);
}

function submittedTemplate(data) {
  const priority = data.priority || "Medium";

  return baseCard(`
    <div style="background:#2563eb;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Issue Submitted</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>Your issue has been submitted successfully and is under review.</p>
      <p><strong>Issue ID:</strong> #${data.issueId}</p>
      <p><strong>Category:</strong> ${data.category || "General"}</p>
      <p><strong>Location:</strong> ${data.location || "Not provided"}</p>
      <p><strong>Priority:</strong> ${priority}</p>
      <p><strong>Description:</strong><br/>${data.description || "No description provided"}</p>
      <p><a href="${data.complaintUrl}">Open complaint details</a></p>
    </div>
  `);
}

function statusTemplate(data) {
  const color = getStatusColor(data.status);

  return baseCard(`
    <div style="background:${color};color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Issue Status Update</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>Your issue status has changed.</p>
      <p><strong>Issue ID:</strong> #${data.issueId}</p>
      <p><strong>Status:</strong> <span style="color:${color};font-weight:600;">${data.status}</span></p>
      <p><strong>Category:</strong> ${data.category || "General"}</p>
      <p><strong>Location:</strong> ${data.location || "Not provided"}</p>
      <p><strong>Update:</strong><br/>${data.statusMessage || "Please check your dashboard for details."}</p>
      <p><a href="${data.complaintUrl}">Open complaint details</a></p>
    </div>
  `);
}

function resolutionTemplate(data) {
  return baseCard(`
    <div style="background:#15803d;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Issue Resolved</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>Your issue has been marked as resolved.</p>
      <p><strong>Issue ID:</strong> #${data.issueId}</p>
      <p><strong>Category:</strong> ${data.category || "General"}</p>
      <p><strong>Location:</strong> ${data.location || "Not provided"}</p>
      <p><strong>Resolved by:</strong> ${data.technicianName}</p>
      <p><strong>Resolution details:</strong><br/>${data.resolutionDetails || "Resolution completed by field team."}</p>
      <p><a href="${data.complaintUrl}">Open complaint details</a></p>
    </div>
  `);
}

function rescheduleTemplate(data) {
  const intro =
    data.recipient === "technician"
      ? "You confirmed a reschedule for this issue."
      : `Your issue visit has been rescheduled by ${data.technicianName}.`;

  return baseCard(`
    <div style="background:#9333ea;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Issue Visit Rescheduled</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>${intro}</p>
      <p><strong>Issue ID:</strong> #${data.issueId}</p>
      <p><strong>Category:</strong> ${data.category || "General"}</p>
      <p><strong>Location:</strong> ${data.location || "Not provided"}</p>
      <p><strong>New Schedule:</strong> ${data.scheduledFor}</p>
      <p><strong>Note:</strong><br/>${data.note || "No additional note provided."}</p>
      <p><a href="${data.complaintUrl}">Open complaint details</a></p>
    </div>
  `);
}

function reminderTemplate(data) {
  const items = data.pendingComplaints
    .map((c) => {
      const id = toIssueId(c._id);
      return `<li>#${id} - ${c.category || "General"} - ${c.location || "No location"}</li>`;
    })
    .join("");

  return baseCard(`
    <div style="background:#b45309;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Pending Issue Reminder</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>You have ${data.pendingComplaints.length} pending issue(s).</p>
      <ul>${items || "<li>No pending issues</li>"}</ul>
      <p><a href="${data.dashboardUrl}">Open dashboard</a></p>
    </div>
  `);
}

function signupTemplate(data) {
  return baseCard(`
    <div style="background:#1d4ed8;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Welcome to CiviQ</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>Your account has been created successfully with this email:</p>
      <p><strong>${data.email}</strong></p>
      <p>For security, please login using your password to start using the platform.</p>
      <p><a href="${data.loginUrl}">Open CiviQ Login</a></p>
    </div>
  `);
}

function loginTemplate(data) {
  return baseCard(`
    <div style="background:#0f766e;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Login Alert</div>
    <div style="padding:20px;">
      <p>Hello ${data.name},</p>
      <p>Your account was used to login.</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Time (UTC):</strong> ${data.loggedInAt}</p>
      <p>If this was not you, please reset your password immediately.</p>
    </div>
  `);
}

// ===== ADD THIS FUNCTION at the bottom of emailService.js =====

exports.sendPasswordResetEmail = async (user, resetUrl) => {
  const label = `password-reset-${user._id}`;
  try {
    await ensureTransportReady();

    const html = baseCard(`
      <div style="background:#dc2626;color:#fff;padding:18px 20px;font-size:18px;font-weight:600;">Password Reset Request</div>
      <div style="padding:20px;">
        <p>Hello ${user.name},</p>
        <p>We received a request to reset your CiviQ account password.</p>
        <p>Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${resetUrl}" 
             style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
            Reset My Password
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link:<br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color:#6b7280;font-size:13px;">If you did not request a password reset, please ignore this email. Your password will not change.</p>
      </div>
    `);

    const mail = {
      from: getFromAddress(),
      to: user.email,
      subject: "CiviQ – Reset Your Password",
      html,
    };

    const result = await sendMailWithRetry(mail, label);
    return result;
  } catch (err) {
    console.error(`[emailService] ${label} failed:`, err.message);
    return { success: false, error: err.message };
  }
};
