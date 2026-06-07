const Organization = require("../models/Organization");

// @desc    Create a new organization
// @route   POST /api/organizations
// @access  Public (can restrict to admin/user if needed)
exports.createOrganization = async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Organization name is required" });
    }
    const existing = await Organization.findOne({ name: name.trim() });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Organization already exists" });
    }
    const org = await Organization.create({ name: name.trim(), address });
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    console.error("Create organization error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// @desc    Get all organizations
// @route   GET /api/organizations
// @access  Public
exports.getOrganizations = async (req, res) => {
  try {
    // Also return address field for each organization
    const orgs = await Organization.find({}, "_id name address").sort({
      name: 1,
    });
    res.json({ success: true, data: orgs });
  } catch (error) {
    console.error("Get organizations error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
