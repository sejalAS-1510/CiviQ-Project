const EMAIL_HARD_FAIL = false; // IMPORTANT: submission mode

const nodemailer = require("nodemailer");
const sendgridMail = require("@sendgrid/mail");

let transporter = null;
let transporterVerified = false;
let emailServiceDisabledReason = null;
let emailConfigWarned = false;

function readEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return "";

  const value = String(raw).trim();
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");

  if ((hasDoubleQuotes || hasSingleQuotes) && value.length >= 2) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function readEnvNumber(name, fallback) {
  const parsed = Number(readEnv(name) || fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_FRONTEND_URL = readEnv("FRONTEND_URL") || "http://localhost:8080";
const EMAIL_RETRY_ATTEMPTS = readEnvNumber("EMAIL_RETRY_ATTEMPTS", 3);
const EMAIL_RETRY_DELAY_MS = readEnvNumber("EMAIL_RETRY_DELAY_MS", 1500);
const EMAIL_SEND_TIMEOUT_MS = readEnvNumber("EMAIL_SEND_TIMEOUT_MS", 30000);

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
    "ENETUNREACH",
  ]);

  const responseCode = Number(error?.responseCode || 0);
  const smtpRetryable = [421, 429, 450, 451, 452].includes(responseCode);

  return retryableCodes.has(error?.code) || smtpRetryable;
}

function resolveEmailProvider() {
  const configuredProvider = readEnv("EMAIL_PROVIDER").toLowerCase();

  if (configuredProvider === "sendgrid") return "sendgrid";
  if (configuredProvider === "brevo") return "brevo";
  if (configuredProvider === "gmail") return "gmail";

  if (
    readEnv("GMAIL_USER") &&
    (readEnv("GMAIL_APP_PASSWORD") || readEnv("GMAIL_PASS") || readEnv("EMAIL_PASS"))
  ) {
    return "gmail";
  }

  if (readEnv("SENDGRID_API_KEY")) return "sendgrid";

  if (readEnv("EMAIL_USER") && readEnv("EMAIL_PASS")) return "brevo";

  return "gmail";
}

function getFromAddress() {
  const provider = resolveEmailProvider();
  const sendgridFromEmail = readEnv("SENDGRID_FROM_EMAIL");
  const gmailUser = readEnv("GMAIL_USER");
  const emailUser = readEnv("EMAIL_USER");
  const sendgridFromName = readEnv("SENDGRID_FROM_NAME");
  const emailFrom = readEnv("EMAIL_FROM");
  const fromEmail =
    sendgridFromEmail || gmailUser || emailUser || "no-reply@localhost";

  if (
    provider === "sendgrid" &&
    sendgridFromName &&
    fromEmail &&
    !/[<>]/.test(fromEmail)
  ) {
    return {
      email: fromEmail,
      name: sendgridFromName,
    };
  }

  return emailFrom || fromEmail;
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
  const apiKey = readEnv("SENDGRID_API_KEY");

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

  if (emailServiceDisabledReason) {
    console.debug(
      `[email] Transporter already disabled: ${emailServiceDisabledReason}`,
    );
    return null;
  }

  const emailProvider = resolveEmailProvider();
  console.log(`[email] initializeTransporter: provider=${emailProvider}`);

  // ----------------------------
  // SENDGRID (optional)
  // ----------------------------
  if (emailProvider === "sendgrid") {
    transporter = createSendGridClient();
    console.log(`[email] initializeTransporter: sendgrid client created`);
    return transporter;
  }

  // ----------------------------
  // GMAIL SMTP MODE
  // ----------------------------
  if (emailProvider === "gmail") {
    const gmailUser = readEnv("GMAIL_USER") || readEnv("EMAIL_USER");
    const rawGmailPass =
      readEnv("GMAIL_APP_PASSWORD") || readEnv("GMAIL_PASS") || readEnv("EMAIL_PASS");
    // Sanitize by removing spaces from Gmail App Password if they exist
    const gmailPass = rawGmailPass ? rawGmailPass.replace(/\s+/g, "") : "";

    console.log(
      `[email] Gmail config: user=${gmailUser || "(missing)"}, pass=${gmailPass ? "set" : "missing"}`,
    );

    if (!gmailUser || !gmailPass) {
      if (!emailConfigWarned) {
        console.warn(
          "[email] Gmail SMTP not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (or GMAIL_PASS) in env",
        );
        emailConfigWarned = true;
      }
      emailServiceDisabledReason = "gmail-not-configured";
      return null;
    }

    console.log(`[email] Creating Gmail SMTP transport`);

    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
      requireTLS: true,
      tls: {
        rejectUnauthorized: false,
      },
      logger: false,
      debug: false,
    });

    console.log(`[email] Gmail transport created successfully`);
    return transporter;
  }

  // ----------------------------
  // BREVO SMTP MODE (FIXED & STABLE)
  // ----------------------------
  if (emailProvider === "brevo") {
    const emailUser = readEnv("EMAIL_USER");
    const emailPass = readEnv("EMAIL_PASS");

    console.log(
      `[email] SMTP config: user=${emailUser || "(missing)"}, pass=${emailPass ? "set" : "missing"}`,
    );

    if (!emailUser || !emailPass) {
      if (!emailConfigWarned) {
        console.warn(
          "[email] Brevo SMTP not configured. Set EMAIL_USER and EMAIL_PASS in env",
        );
        emailConfigWarned = true;
      }
      emailServiceDisabledReason = "brevo-not-configured";
      return null;
    }

    console.log(`[email] Creating SMTP (Brevo) transport`);

    transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false, // STARTTLS

      auth: {
        user: emailUser,
        pass: emailPass,
      },

      // ----------------------------
      // STABILITY FIX (IMPORTANT)
      // ----------------------------
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,

      requireTLS: true,

      tls: {
        rejectUnauthorized: false,
      },

      // helps Render debugging (safe to remove later)
      logger: false,
      debug: false,
    });

    console.log(`[email] SMTP transport created successfully`);
    return transporter;
  }

  // ----------------------------
  // fallback
  // ----------------------------
  console.warn(`[email] No valid email provider configured`);
  return null;
}

async function ensureTransportReady() {
  const transport = initializeTransporter();
  if (!transport) return null;

  if (!transporterVerified) {
    try {
      await transport.verify();
      transporterVerified = true;
    } catch (error) {
      console.warn(
        `[email] transport verification failed for ${resolveEmailProvider()}: ${error.message}`,
      );
      if (resolveEmailProvider() === "gmail" && isRetryableError(error)) {
        return transport;
      }
      throw error;
    }

    const provider = resolveEmailProvider();
    const verifiedUser =
      provider === "sendgrid"
        ? readEnv("SENDGRID_FROM_EMAIL") || readEnv("EMAIL_FROM")
        : readEnv("GMAIL_USER") || readEnv("EMAIL_USER");

    console.log(`[email] ${provider} service ready for ${verifiedUser}`);
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
  console.log(`[email] sendMailWithRetry starting for ${label}`);
  const transport = await ensureTransportReady();
  if (!transport) {
    const reason = emailServiceDisabledReason || "email-unavailable";
    console.error(
      `[email] sendMailWithRetry ${label}: transport unavailable (reason: ${reason})`,
    );
    return {
      success: false,
      reason,
      label,
    };
  }

  if (!mailOptions?.to || !mailOptions?.subject || !mailOptions?.html) {
    console.error(`[email] sendMailWithRetry ${label}: invalid mail options`, {
      to: mailOptions?.to ? "set" : "missing",
      subject: mailOptions?.subject ? "set" : "missing",
      html: mailOptions?.html ? "set" : "missing",
    });
    return {
      success: false,
      reason: "invalid-mail-options",
      label,
    };
  }

  console.log(
    `[email] sendMailWithRetry ${label}: sending to ${mailOptions.to}`,
  );
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

  console.log(`[email] sendMailWithRetry ${label}: sent successfully`, {
    to: info.accepted,
    messageId: info.messageId,
  });
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
  console.log(
    `[email] sendPasswordResetEmail called for ${user.email} (${label})`,
  );
  try {
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

    console.log(
      `[email] sendPasswordResetEmail: calling sendMailWithRetry for ${user.email}`,
    );
    const result = await sendMailWithRetry(mail, label);
    console.log(`[email] sendPasswordResetEmail result:`, result);
    return result;
  } catch (err) {
    console.error(
      `[email] sendPasswordResetEmail ${label} crashed:`,
      err.message,
    );
    return { success: false, error: err.message };
  }
};
