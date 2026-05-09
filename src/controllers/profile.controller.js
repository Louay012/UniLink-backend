const profileService = require("../services/profile.service");

async function getProfile(req, res) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const result = await profileService.getProfile(req.user);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] getProfile error:", err);
    return res.status(500).json({ message: "Failed to load profile." });
  }
}

module.exports = { getProfile };
