const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const PORT = Number(process.env.PORT || 5000);

const connectDB = require("./config/db");

const complaintRoutes = require("./routes/complaintRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const userRoutes = require("./routes/userRoutes");
const organizationRoutes = require("./routes/organizationRoutes");

const app = express();

const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

// ====================== ✅ FIXED CORS ======================

// Add your Vercel domains here OR use env variable
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  "https://civiq-omega.vercel.app,https://civiq-git-main-sejalas-1510s-projects.vercel.app"
)
  .split(",")
  .map((o) => o.trim());

// Allow localhost for development
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman / mobile

      if (allowedOrigins.includes(origin) || localhostRegex.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed: " + origin));
    },
    credentials: true,
  }),
);

// ==========================================================

app.use(express.json());

// ====================== FILE UPLOAD ======================
const multer = require("multer");

const uploadsDir = path.join(__dirname, "uploads", "issue-images");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "complaint-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Static folders
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/uploads/avatars",
  express.static(path.join(__dirname, "uploads", "avatars")),
);

// ==========================================================

// Serve frontend (optional, not needed if using Vercel)
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

// ====================== DATABASE ======================
connectDB();

// ====================== EMAIL DIAGNOSTICS ======================
const readEnv = (name) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return "";
  const value = String(raw).trim();
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  if ((hasDoubleQuotes || hasSingleQuotes) && value.length >= 2) {
    return value.slice(1, -1).trim();
  }
  return value;
};
const hasGmailCredentials =
  readEnv("GMAIL_USER") &&
  (readEnv("GMAIL_APP_PASSWORD") || readEnv("GMAIL_PASS") || readEnv("EMAIL_PASS"));
const emailProvider =
  readEnv("EMAIL_PROVIDER") ||
  (hasGmailCredentials
    ? "gmail"
    : readEnv("SENDGRID_API_KEY")
      ? "sendgrid"
      : readEnv("EMAIL_USER") && readEnv("EMAIL_PASS")
        ? "brevo"
        : "gmail");
const gmailUser = readEnv("GMAIL_USER") || readEnv("EMAIL_USER");
const gmailPassword =
  readEnv("GMAIL_APP_PASSWORD") ||
  readEnv("GMAIL_PASS") ||
  readEnv("EMAIL_PASS");
console.log(
  `[startup] Email configured: provider=${emailProvider}, user=${gmailUser || "(not set)"}`,
);
if (!gmailPassword) {
  console.warn(
    "[startup] WARNING: Email password not configured (GMAIL_APP_PASSWORD, GMAIL_PASS, or EMAIL_PASS)",
  );
}

// ====================== ROUTES ======================

// Test routes
app.get("/", (req, res) => {
  res.send("CiviQ backend running successfully");
});

app.post("/test", (req, res) => {
  console.log("Test request body:", req.body);
  res.json({ success: true, received: req.body });
});

// Test email endpoint - helps diagnose email configuration issues
app.post("/test-email", async (req, res) => {
  try {
    const { to = "test@example.com" } = req.body;
    const emailService = require("./services/emailService");

    console.log(`[test-email] Testing email send to ${to}`);

    const result = await emailService.sendMailWithRetry(
      {
        to,
        subject: "CiviQ - Email Configuration Test",
        html: `<p>If you received this email, your Gmail configuration is working correctly!</p><p>To: ${to}</p>`,
      },
      "test-email",
    );

    res.json({
      success: result.success,
      message: result.success
        ? "Email sent successfully! Check your inbox."
        : "Email send failed. Check server logs for details.",
      details: result,
    });
  } catch (error) {
    console.error("[test-email] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Test email failed. Check server logs.",
      error: error.message,
    });
  }
});

// API routes
app.use("/api/users", userRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/organizations", organizationRoutes);

// ====================== SPA FALLBACK ======================
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (fs.existsSync(frontendIndexPath)) {
    return res.sendFile(frontendIndexPath);
  }
  return next();
});

// ====================== SERVER ======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
