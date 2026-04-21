const User = require("../models/User");
const jwt = require("jsonwebtoken");
const emailService = require("../services/emailService");

const TECH_SPECIALIZATIONS = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  cleaning: "Cleaning",
  security: "Security",
  infrastructure: "Infrastructure",
  noise: "Noise",
  "noise control": "Noise",
  general: "General",
};

function normalizeTechnicianSpecialization(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return TECH_SPECIALIZATIONS[normalized] || null;
}

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      phone,
      address,
      specialization,
      ownerId,
    } = req.body;
    const normalizedRole = role || "user";

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "Organization (ownerId) is required",
      });
    }

    if (normalizedRole === "technician" && !specialization) {
      return res.status(400).json({
        success: false,
        message:
          "Technician specialization is required (Electrical, Plumbing, Cleaning, Security, Infrastructure, Noise)",
      });
    }

    const normalizedSpecialization =
      normalizedRole === "technician"
        ? normalizeTechnicianSpecialization(specialization)
        : "General";

    if (normalizedRole === "technician" && !normalizedSpecialization) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid technician specialization. Use one of: Electrical, Plumbing, Cleaning, Security, Infrastructure, Noise",
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: normalizedRole, // Default to user if not specified
      phone,
      address,
      ownerId,
      specialization: normalizedSpecialization || "General",
      specializations:
        normalizedRole === "technician"
          ? [normalizedSpecialization || "General"]
          : ["General"],
      isAvailable: normalizedRole === "technician" ? true : undefined,
    });

    if (user) {
      // Notify user after successful signup (non-blocking).
      emailService
        .sendSignupNotification(user)
        .catch((err) =>
          console.error("Failed to send signup notification:", err.message),
        );

      res.status(201).json({
        success: true,
        message: "Signup successful. Please login to continue.",
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          specialization: user.specialization,
          specializations: user.specializations,
          ownerId: user.ownerId,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid user data",
      });
    }
  } catch (error) {
    console.error("Registration error:", error);

    if (error?.name === "ValidationError") {
      const firstValidationMessage =
        Object.values(error.errors || {})[0]?.message ||
        "Invalid registration data";

      return res.status(400).json({
        success: false,
        message: firstValidationMessage,
      });
    }

    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/users/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Check for user email
    const user = await User.findOne({ email }).select("+password");

    if (user && (await user.matchPassword(password))) {
      await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

      // Login alert email (non-blocking)
      emailService
        .sendLoginNotification(user)
        .catch((err) =>
          console.error("Failed to send login notification:", err.message),
        );

      res.json({
        success: true,
        message: "Login successful",
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          specialization: user.specialization,
          specializations: user.specializations,
          ownerId: user.ownerId,
          avatar: user.avatar,
          token: generateToken(user._id),
        },
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          address: user.address,
          specialization: user.specialization,
          specializations: user.specializations,
          ownerId: user.ownerId,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      if (typeof req.body.name === "string" && req.body.name.trim()) {
        user.name = req.body.name.trim();
      }

      if (typeof req.body.email === "string" && req.body.email.trim()) {
        user.email = req.body.email.trim().toLowerCase();
      }

      if (typeof req.body.phone === "string") {
        const trimmedPhone = req.body.phone.trim();
        if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
          return res.status(400).json({
            success: false,
            message: "Please add a valid 10-digit phone number",
          });
        }
        user.phone = trimmedPhone || undefined;
      }

      if (typeof req.body.address === "string") {
        const trimmedAddress = req.body.address.trim();
        user.address = trimmedAddress || undefined;
      }

      // Only allow role update for admins or if user is updating themselves to a lower role
      if (req.user.role === "admin") {
        const requestedRole = req.body.role || user.role;
        user.role = requestedRole;

        if (requestedRole === "technician") {
          const normalizedSpecialization = normalizeTechnicianSpecialization(
            req.body.specialization || user.specialization,
          );
          if (!normalizedSpecialization) {
            return res.status(400).json({
              success: false,
              message: "Invalid technician specialization",
            });
          }
          user.specialization = normalizedSpecialization;
          user.specializations = [normalizedSpecialization];
        } else {
          user.specialization = "General";
          user.specializations = ["General"];
        }
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          phone: updatedUser.phone,
          address: updatedUser.address,
          specialization: updatedUser.specialization,
          specializations: updatedUser.specializations,
          ownerId: updatedUser.ownerId,
          token: generateToken(updatedUser._id),
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Update profile error:", error);

    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(400).json({
        success: false,
        message: "Email already exists. Please use a different email.",
      });
    }

    if (error?.name === "ValidationError") {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: first?.message || "Validation failed",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (user) {
      res.json({
        success: true,
        data: user,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      const requestedRole = req.body.role || user.role;
      user.role = requestedRole;
      user.phone = req.body.phone || user.phone;
      user.address = req.body.address || user.address;
      if (requestedRole === "technician") {
        const normalizedSpecialization = normalizeTechnicianSpecialization(
          req.body.specialization || user.specialization,
        );
        if (!normalizedSpecialization) {
          return res.status(400).json({
            success: false,
            message: "Invalid technician specialization",
          });
        }
        user.specialization = normalizedSpecialization;
        user.specializations = [normalizedSpecialization];
      } else {
        user.specialization = "General";
        user.specializations = ["General"];
      }
      user.isActive =
        req.body.isActive !== undefined ? req.body.isActive : user.isActive;

      const updatedUser = await user.save();

      res.json({
        success: true,
        message: "User updated successfully",
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          phone: updatedUser.phone,
          address: updatedUser.address,
          specialization: updatedUser.specialization,
          specializations: updatedUser.specializations,
          isActive: updatedUser.isActive,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Restrict deletion to same organization
    if (user.ownerId.toString() !== req.user.ownerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only delete users in your own organization.",
      });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Delete current logged-in user account
// @route   DELETE /api/users/profile
// @access  Private
exports.deleteMyAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await User.findByIdAndDelete(req.user._id);

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete my account error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
