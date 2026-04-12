const TYPE_TO_BACKEND_CATEGORY = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  cleaning: "Cleaning",
  security: "Security",
  infrastructure: "Infrastructure",
  noise: "Noise",
  other: "General",
};

const TYPE_TO_TECH_SPECIALIZATION = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  cleaning: "Cleaning",
  security: "Security",
  infrastructure: "Infrastructure",
  noise: "Noise",
  other: "General",
};

const INPUT_CATEGORY_HINTS = {
  plumbing: "plumbing",
  plumber: "plumbing",
  leakage: "plumbing",
  water: "plumbing",
  electrical: "electrical",
  electric: "electrical",
  electricity: "electrical",
  utilities: "electrical",
  cleaning: "cleaning",
  sanitation: "cleaning",
  garbage: "cleaning",
  security: "security",
  safety: "security",
  "public safety": "security",
  infrastructure: "infrastructure",
  civil: "infrastructure",
  road: "infrastructure",
  noise: "noise",
  environment: "noise",
  other: "other",
  general: "other",
};

const TYPE_KEYWORDS = {
  plumbing: [
    "plumber",
    "plumbing",
    "pipe",
    "pipeline",
    "burst pipe",
    "leak",
    "leaking",
    "water leak",
    "seepage",
    "drain",
    "drainage",
    "drain blocked",
    "sewer",
    "sewage",
    "manhole",
    "toilet",
    "flush",
    "washroom",
    "bathroom",
    "tap",
    "faucet",
    "sink",
    "basin",
    "geyser",
    "water tank",
    "overflow",
    "water supply",
    "low pressure",
    "blockage",
  ],
  electrical: [
    "electrical",
    "electric",
    "electricity",
    "power",
    "power cut",
    "outage",
    "blackout",
    "short",
    "short circuit",
    "trip",
    "tripping",
    "mcb",
    "fuse",
    "wiring",
    "wire",
    "cable",
    "socket",
    "switch",
    "switchboard",
    "meter",
    "transformer",
    "voltage",
    "sparks",
    "burn smell",
    "light",
    "street light",
    "lamp",
    "fan",
    "generator",
    "ups",
  ],
  cleaning: [
    "clean",
    "cleaning",
    "dirty",
    "filthy",
    "garbage",
    "trash",
    "waste",
    "rubbish",
    "litter",
    "dump",
    "dumping",
    "sanitation",
    "hygiene",
    "smell",
    "odor",
    "stink",
    "sweep",
    "sweeping",
    "mop",
    "drain cleaning",
    "clogged drain",
    "mosquito",
    "pest",
    "dead animal",
    "unclean",
    "public toilet",
    "overflowing bin",
  ],
  security: [
    "security",
    "unsafe",
    "threat",
    "threatening",
    "fight",
    "assault",
    "harassment",
    "abuse",
    "theft",
    "stolen",
    "steal",
    "robbery",
    "intruder",
    "trespass",
    "vandalism",
    "suspicious",
    "crime",
    "police",
    "patrol",
    "cctv",
    "camera",
    "broken lock",
    "gate broken",
    "unauthorized",
    "emergency",
    "violent",
  ],
  infrastructure: [
    "infrastructure",
    "road",
    "pothole",
    "footpath",
    "sidewalk",
    "bridge",
    "culvert",
    "drain wall",
    "building",
    "wall",
    "crack",
    "collapse",
    "damaged",
    "broken",
    "repair",
    "construction",
    "maintenance",
    "pavement",
    "cement",
    "asphalt",
    "street",
    "public property",
    "street sign",
    "barricade",
    "park bench",
    "playground",
    "streetlight pole",
  ],
  noise: [
    "noise",
    "noisy",
    "loud",
    "disturbance",
    "sound pollution",
    "music",
    "dj",
    "speaker",
    "horn",
    "honking",
    "shouting",
    "yelling",
    "party",
    "late night",
    "drilling",
    "construction noise",
    "generator noise",
    "banging",
    "vibration",
  ],
};

const TECH_SPECIALIZATION_TO_COMPLAINT_CATEGORIES = {
  Plumbing: ["Plumbing"],
  Electrical: ["Electrical"],
  Cleaning: ["Cleaning"],
  Security: ["Security"],
  Infrastructure: ["Infrastructure"],
  Noise: ["Noise"],
  General: ["General"],
  // Legacy specialization values for older technician records
  Utilities: ["Plumbing", "Electrical"],
  Sanitation: ["Cleaning"],
  "Public Safety": ["Security"],
  Environment: ["Noise"],
};

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHintedType(category) {
  const normalized = normalizeText(category);
  return INPUT_CATEGORY_HINTS[normalized] || null;
}

function countKeywordMatches(text, keywords) {
  let score = 0;
  const matched = [];

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += keyword.includes(" ") ? 2 : 1;
      matched.push(keyword);
    }
  }

  return { score, matched };
}

function classifyComplaint({ description, category }) {
  const normalizedText = normalizeText(
    `${description || ""} ${category || ""}`,
  );
  const hintedType = resolveHintedType(category);

  const scores = Object.keys(TYPE_KEYWORDS).reduce((acc, type) => {
    const result = countKeywordMatches(normalizedText, TYPE_KEYWORDS[type]);
    acc[type] = result;
    return acc;
  }, {});

  if (hintedType && scores[hintedType]) {
    scores[hintedType].score += 3;
  }

  const rankedTypes = Object.entries(scores)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([type, data]) => ({ type, score: data.score }));

  const best = rankedTypes[0] || { type: "other", score: 0 };
  const second = rankedTypes[1] || { type: "other", score: 0 };
  const bestType = best.type;
  const bestScore = best.score;

  const confidence =
    bestScore >= 6 ? "high" : bestScore >= 3 ? "medium" : "low";

  const primaryCategory = TYPE_TO_BACKEND_CATEGORY[bestType] || "General";
  const secondaryCategory =
    second.score > 0
      ? TYPE_TO_BACKEND_CATEGORY[second.type] || "General"
      : null;

  return {
    detectedType: bestType,
    backendCategory: primaryCategory,
    primaryCategory,
    secondaryCategory,
    technicianSpecialization:
      TYPE_TO_TECH_SPECIALIZATION[bestType] || "General",
    confidence,
    score: bestScore,
    matchedKeywords: scores[bestType]?.matched || [],
    hintedType,
  };
}

function mapComplaintCategoryToSpecialization(category) {
  const normalized = normalizeText(category);
  const hintedType = resolveHintedType(normalized);

  if (hintedType) {
    return TYPE_TO_TECH_SPECIALIZATION[hintedType] || "General";
  }

  if (normalized === "plumbing") return "Plumbing";
  if (normalized === "electrical") return "Electrical";
  if (normalized === "cleaning") return "Cleaning";
  if (normalized === "security") return "Security";
  if (normalized === "noise") return "Noise";
  if (normalized === "safety") return "Security";
  if (normalized === "utilities") return "Electrical";
  if (normalized === "sanitation") return "Cleaning";
  if (normalized === "infrastructure") return "Infrastructure";
  if (normalized === "environment") return "Noise";
  if (normalized === "general") return "General";

  return "General";
}

function mapTechnicianSpecializationToComplaintCategories(specialization) {
  const normalized = String(specialization || "").trim();
  return TECH_SPECIALIZATION_TO_COMPLAINT_CATEGORIES[normalized] || ["General"];
}

module.exports = {
  classifyComplaint,
  mapComplaintCategoryToSpecialization,
  mapTechnicianSpecializationToComplaintCategories,
};
