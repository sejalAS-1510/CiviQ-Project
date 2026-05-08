require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const User = require("../models/User");

async function seed() {
  const mongo = process.env.MONGODB_URI || "mongodb://localhost:27017/civiq";
  if (!mongo) {
    console.error("MONGODB_URI not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(mongo, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("Connected to MongoDB");

  try {
    // Create or find demo organization
    let org = await Organization.findOne({ name: "CiviQ Demo Org" });
    if (!org) {
      org = await Organization.create({
        name: "CiviQ Demo Org",
        address: "Seeded organization",
      });
      console.log("Created organization:", org._id.toString());
    } else {
      console.log("Found existing organization:", org._id.toString());
    }

    // Create test user if not exists
    const email = "test@example.com";
    const existing = await User.findOne({ email }).select("+password");
    if (existing) {
      console.log("Test user already exists with id:", existing._id.toString());
    } else {
      const user = new User({
        name: "Test User",
        email,
        password: "password123",
        role: "admin",
        ownerId: org._id,
      });

      await user.save();
      console.log("Created test user:", user._id.toString());
    }
  } catch (err) {
    console.error("Seed error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
