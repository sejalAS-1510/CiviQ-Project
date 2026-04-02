/**
 * Technician Assignment AI Logic
 * Intelligently assigns complaints to the best available technician
 * based on specialization, workload, and priority
 */

const User = require("../models/User");
const Complaint = require("../models/Complaint");

/**
 * Assigns a complaint to the most suitable technician
 *
 * Algorithm:
 * 1. Filter technicians by matching specialization
 * 2. Calculate workload score (active complaints count)
 * 3. Consider complaint priority
 * 4. Score technicians using weighted algorithm
 * 5. Assign to highest-scoring technician
 *
 * @param {Object} complaint - Complaint object with category and priority
 * @returns {Promise<Object>} - Assigned technician object
 * @throws {Error} - If no suitable technician found
 */
exports.assignTechnician = async (complaint) => {
  try {
    const { category, priority, _id: complaintId } = complaint;

    // Step 1: Find all active technicians with matching specialization
    const matchingTechnicians = await User.find({
      role: "technician",
      specialization: category,
      isActive: true,
    });

    if (matchingTechnicians.length === 0) {
      // Fallback: Get technicians from "General" specialization
      const generalTechnicians = await User.find({
        role: "technician",
        specialization: "General",
        isActive: true,
      });

      if (generalTechnicians.length === 0) {
        throw new Error(`No available technicians for category: ${category}`);
      }

      return await selectBestTechnician(
        generalTechnicians,
        priority,
        "general",
      );
    }

    // Step 2: Select best technician from matches
    return await selectBestTechnician(
      matchingTechnicians,
      priority,
      "specialized",
    );
  } catch (error) {
    console.error("Technician assignment error:", error);
    throw error;
  }
};

/**
 * Selects the best technician from a list based on multiple factors
 *
 * Scoring factors (weighted):
 * - Active complaint count (40%) - fewer is better
 * - Average resolution time (30%) - faster is better
 * - Priority level (20%) - high priority gets experienced tech
 * - Response time history (10%) - faster responders preferred
 *
 * @private
 * @param {Array} technicians - Array of technician users
 * @param {String} priority - Complaint priority (Low/Medium/High)
 * @param {String} matchType - Type of match (specialized/general)
 * @returns {Promise<Object>} - Best technician object
 */
async function selectBestTechnician(technicians, priority, matchType) {
  // Step 1: Get active complaints count for each technician
  const technicianScores = await Promise.all(
    technicians.map(async (tech) => {
      // Count active complaints (Pending, In Progress)
      const activeComplaints = await Complaint.countDocuments({
        technician: tech._id,
        status: { $in: ["Pending", "In Progress"] },
      });

      // Count total resolved complaints for experience calculation
      const resolvedComplaints = await Complaint.countDocuments({
        technician: tech._id,
        status: "Resolved",
      });

      // Calculate average resolution time (in hours)
      const resolutionStats = await getResolutionStats(tech._id);

      return {
        technician: tech,
        activeComplaints,
        resolvedComplaints,
        avgResolutionTime: resolutionStats.avgTime,
        totalResolved: resolutionStats.totalResolved,
        experience: calculateExperienceScore(resolvedComplaints),
        matchBonus: matchType === "specialized" ? 10 : 0,
      };
    }),
  );

  // Step 2: Calculate composite score for each technician
  const scoredTechnicians = technicianScores.map((score) => {
    const workloadScore = normalizeWorkload(score.activeComplaints);
    const experienceScore = score.experience;
    const priorityBonus =
      priority === "High" ? experienceScore : score.activeComplaints;
    const resolutionBonus = 100 - Math.min(score.avgResolutionTime, 100);

    // Weighted scoring algorithm
    const totalScore =
      workloadScore * 0.4 + // 40% - fewer active complaints
      experienceScore * 0.3 + // 30% - more experience
      resolutionBonus * 0.2 + // 20% - faster resolution
      score.matchBonus * 0.1; // 10% - specialization match bonus

    return {
      ...score,
      totalScore,
      scoreBreakdown: {
        workload: workloadScore,
        experience: experienceScore,
        resolution: resolutionBonus,
        matchBonus: score.matchBonus,
      },
    };
  });

  // Step 3: Return technician with highest score
  const bestMatch = scoredTechnicians.reduce((prev, current) =>
    current.totalScore > prev.totalScore ? current : prev,
  );

  console.log(
    `[Assignment] Selected ${bestMatch.technician.name} (Score: ${bestMatch.totalScore.toFixed(2)})`,
    {
      activeComplaints: bestMatch.activeComplaints,
      experience: bestMatch.experience.toFixed(1),
      avgResolutionTime: bestMatch.avgResolutionTime.toFixed(1),
    },
  );

  return bestMatch.technician;
}

/**
 * Normalizes workload to a 0-100 score
 * More active complaints = lower score (less preferred)
 * Max 10 active complaints considered
 *
 * @private
 * @returns {Number} Score from 0-100
 */
function normalizeWorkload(activeComplaints) {
  const maxLoad = 10; // Assume max 10 active complaints
  const score = Math.max(0, 100 - (activeComplaints / maxLoad) * 100);
  return score;
}

/**
 * Calculates experience score based on resolved complaint count
 * More resolved = higher score
 * Max 100 resolved considered for full score
 *
 * @private
 * @returns {Number} Experience score from 0-100
 */
function calculateExperienceScore(resolvedCount) {
  const maxExperience = 100; // complaints for full score
  const score = Math.min((resolvedCount / maxExperience) * 100, 100);
  return score;
}

/**
 * Gets resolution statistics for a technician
 * Calculates average resolution time
 *
 * @private
 * @param {String} technicianId - Technician user ID
 * @returns {Promise<Object>} - avg resolution time and count
 */
async function getResolutionStats(technicianId) {
  const resolvedComplaints = await Complaint.find({
    technician: technicianId,
    status: "Resolved",
    assignedAt: { $exists: true },
    resolvedAt: { $exists: true },
  });

  if (resolvedComplaints.length === 0) {
    return { avgTime: 48, totalResolved: 0 }; // Default 48 hours if no history
  }

  const totalTime = resolvedComplaints.reduce((sum, complaint) => {
    const resolutionTime =
      (complaint.resolvedAt - complaint.assignedAt) / (1000 * 60 * 60); // Convert to hours
    return sum + resolutionTime;
  }, 0);

  const avgTime = totalTime / resolvedComplaints.length;

  return {
    avgTime,
    totalResolved: resolvedComplaints.length,
  };
}

/**
 * Gets available technicians with statistics
 * Useful for admin dashboard to monitor technician status
 *
 * @returns {Promise<Array>} - Array of technicians with workload info
 */
exports.getTechnicianStats = async () => {
  try {
    const technicians = await User.find({
      role: "technician",
      isActive: true,
    }).select("name email specialization");

    const stats = await Promise.all(
      technicians.map(async (tech) => {
        const activeCount = await Complaint.countDocuments({
          technician: tech._id,
          status: { $in: ["Pending", "In Progress"] },
        });

        const resolvedCount = await Complaint.countDocuments({
          technician: tech._id,
          status: "Resolved",
        });

        const resolutionStats = await getResolutionStats(tech._id);

        return {
          id: tech._id,
          name: tech.name,
          email: tech.email,
          specialization: tech.specialization,
          activeComplaints: activeCount,
          resolvedComplaints: resolvedCount,
          avgResolutionHours: resolutionStats.avgTime.toFixed(1),
          availability: activeCount < 10 ? "Available" : "Busy",
        };
      }),
    );

    return stats;
  } catch (error) {
    console.error("Error fetching technician stats:", error);
    throw error;
  }
};

/**
 * Manually assigns a complaint to a specific technician
 * Used by admin override
 *
 * @param {String} complaintId - Complaint ID
 * @param {String} technicianId - Technician ID
 * @returns {Promise<Object>} - Updated complaint
 */
exports.manualAssign = async (complaintId, technicianId) => {
  try {
    // Verify technician exists
    const technician = await User.findById(technicianId);
    if (!technician || technician.role !== "technician") {
      throw new Error("Invalid technician selected");
    }

    // Update complaint with technician
    const complaint = await Complaint.findByIdAndUpdate(
      complaintId,
      { technician: technicianId },
      { new: true },
    ).populate("technician", "name email specialization");

    if (!complaint) {
      throw new Error("Complaint not found");
    }

    console.log(
      `[Manual Assignment] Assigned ${complaint._id} to ${technician.name}`,
    );

    return complaint;
  } catch (error) {
    console.error("Manual assignment error:", error);
    throw error;
  }
};
