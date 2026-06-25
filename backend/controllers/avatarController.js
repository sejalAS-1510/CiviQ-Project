const path = require("path");
const fs = require("fs");
const User = require("../models/User");

// @desc    Upload user avatar
// @route   POST /api/users/avatar
// @access  Private
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }
    // Remove old avatar if exists and is not default
    const user = await User.findById(req.user._id);
    if (
      user.avatar &&
      user.avatar.startsWith("/uploads/avatars/") &&
      fs.existsSync(path.join(__dirname, "..", user.avatar))
    ) {
      fs.unlinkSync(path.join(__dirname, "..", user.avatar));
    }
    
    // Convert new file to base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;
    const base64Image = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

    // Save base64 avatar
    user.avatar = base64Image;
    await user.save();

    // Clean up uploaded file from local disk path
    fs.unlinkSync(req.file.path);

    res.json({ success: true, avatar: user.avatar });
  } catch (error) {
    console.error("Avatar upload error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};
