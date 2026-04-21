const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please add a name"],
    trim: true,
    maxlength: [50, "Name cannot be more than 50 characters"],
  },

  email: {
    type: String,
    required: [true, "Please add an email"],
    unique: true,
    lowercase: true,
    match: [
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
      "Please add a valid email",
    ],
  },

  password: {
    type: String,
    required: [true, "Please add a password"],
    minlength: [6, "Password must be at least 6 characters"],
    select: false, // Don't include password in queries by default
  },

  role: {
    type: String,
    enum: ["user", "technician", "admin"],
    default: "user",
  },

  phone: {
    type: String,
    match: [/^\d{10}$/, "Please add a valid 10-digit phone number"],
  },

  address: {
    type: String,
    trim: true,
  },

  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization", // or "Owner", or just leave as ObjectId if you don't have a separate collection yet
    required: true,
  },

  avatar: {
    type: String, // URL or filename for profile picture
    default: "",
  },
  specialization: {
    type: String,
    enum: [
      "Plumbing",
      "Electrical",
      "Cleaning",
      "Security",
      "Infrastructure",
      "Noise",
      "General",
      // Legacy values kept for backwards compatibility with existing data
      "Sanitation",
      "Utilities",
      "Public Safety",
      "Environment",
    ],
    default: "General",
  },

  specializations: [
    {
      type: String,
      enum: [
        "Plumbing",
        "Electrical",
        "Cleaning",
        "Security",
        "Infrastructure",
        "Noise",
        "General",
        // Legacy values retained for compatibility
        "Sanitation",
        "Utilities",
        "Public Safety",
        "Environment",
      ],
    },
  ],

  isAvailable: {
    type: Boolean,
    default: true,
  },

  activeJobsCount: {
    type: Number,
    default: 0,
    min: 0,
  },

  serviceZones: [
    {
      type: String,
      trim: true,
    },
  ],

  skillMatrix: {
    Plumbing: { type: Number, min: 1, max: 5, default: 3 },
    Electrical: { type: Number, min: 1, max: 5, default: 3 },
    Cleaning: { type: Number, min: 1, max: 5, default: 3 },
    Security: { type: Number, min: 1, max: 5, default: 3 },
    Infrastructure: { type: Number, min: 1, max: 5, default: 3 },
    Noise: { type: Number, min: 1, max: 5, default: 3 },
    General: { type: Number, min: 1, max: 5, default: 3 },
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  lastLogin: {
    type: Date,
  },
  resetPasswordToken: {
    type: String,
  },

  resetPasswordExpire: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("validate", function () {
  if (this.role === "technician") {
    if (
      !Array.isArray(this.specializations) ||
      this.specializations.length === 0
    ) {
      this.specializations = [this.specialization || "General"];
    }

    if (!this.specialization && this.specializations[0]) {
      this.specialization = this.specializations[0];
    }
  } else if (!this.specialization) {
    this.specialization = "General";
  }
});

// Encrypt password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Remove password from JSON output
UserSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model("User", UserSchema);
