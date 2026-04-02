const express = require("express");
const router = express.Router();

const {
  createComplaint,
  getComplaints,
  getComplaint,
  updateComplaint,
  deleteComplaint,
  assignTechnician,
  getTechnicianStats,
} = require("../controllers/complaintController");

const { protect, admin } = require("../middleware/authMiddleware");

// Configure multer for file uploads
const multer = require("multer");
const path = require("path");

// Create uploads directory if it doesn't exist
const fs = require("fs");
const uploadsDir = path.join(__dirname, "..", "uploads", "issue-images");
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

// All complaint routes require authentication
router.use(protect);

// Routes
router
  .route("/")
  .get(getComplaints)
  .post(upload.single("image"), createComplaint);

router
  .route("/:id")
  .get(getComplaint)
  .put(updateComplaint)
  .delete(admin, deleteComplaint);

router.put("/:id/assign", admin, assignTechnician);

// Technician stats endpoint
router.get("/technicians/stats", admin, getTechnicianStats);

module.exports = router;
