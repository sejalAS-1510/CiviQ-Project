const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const PORT = Number(process.env.PORT || 5000);

const connectDB = require("./config/db");

const complaintRoutes = require("./routes/complaintRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

// CORS configuration for development
// Allow any localhost/127.0.0.1 origin on any port and allow file:// (no origin)
const localhostOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., local files, mobile apps)
      if (!origin) return callback(null, true);
      if (localhostOriginRegex.test(origin)) return callback(null, true);
      callback(new Error("CORS policy: Origin not allowed"));
    },
    credentials: true,
  }),
);

app.use(express.json());

// Configure multer for file uploads
const multer = require("multer");

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads", "issue-images");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "complaint-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Make uploads directory static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve the built frontend from the same origin when available
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
} else {
  console.warn(
    "[server] frontend/dist not found. Run the frontend build before using single-port mode.",
  );
}

// connect database
connectDB();

// test route
app.get("/", (req, res) => {
  res.send("CiviQ backend running successfully");
});

// test route for debugging
app.post("/test", (req, res) => {
  console.log("Test request body:", req.body);
  res.json({ success: true, received: req.body });
});

// API routes
app.use("/api/users", userRoutes);
app.use("/api/complaints", complaintRoutes);

// Single-URL fallback for the frontend SPA
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (fs.existsSync(frontendIndexPath)) {
    return res.sendFile(frontendIndexPath);
  }
  return next();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
