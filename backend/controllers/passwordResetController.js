// backend/controllers/passwordResetController.js

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const emailService = require("../services/emailService");

function sanitizeEnvString(value) {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  const hasDoubleQuotes =
    normalized.startsWith('"') && normalized.endsWith('"');
  const hasSingleQuotes =
    normalized.startsWith("'") && normalized.endsWith("'");

  if ((hasDoubleQuotes || hasSingleQuotes) && normalized.length >= 2) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

// @desc    Request password reset email
// @route   POST /api/users/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration attacks
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      });
    }

    // Generate a raw token (sent in email link)
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Hash the token before storing (security: even if DB is breached, token is useless)
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Store hashed token + expiry (30 minutes)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 min

    // Use { validateModifiedOnly: true } to skip re-triggering password hash pre-save
    await user.save({ validateModifiedOnly: true });

    // Build reset URL with the RAW token (not hashed)
    const frontendUrl =
      sanitizeEnvString(req.headers.origin) ||
      sanitizeEnvString(process.env.FRONTEND_URL) ||
      "http://localhost:8080";
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    // Send email using your existing emailService and log the result for deployment diagnostics
    const emailResult = await emailService.sendPasswordResetEmail(
      user,
      resetUrl,
    );
    console.log("[passwordReset] sendPasswordResetEmail result:", emailResult);

    return res.status(200).json({
      success: true,
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error. Please try again." });
  }
};

// @desc    Reset password using token
// @route   POST /api/users/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token, email and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with matching hashed token, correct email, and non-expired token
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }, // token must still be valid
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link. Please request a new one.",
      });
    }

    // Set new password (pre-save hook in User.js will hash it)
    user.password = newPassword;

    // Invalidate the token so it can't be reused
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error. Please try again." });
  }
};
