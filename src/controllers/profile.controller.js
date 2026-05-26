const multer = require("multer");
const profileService = require("../services/profile.service");

// multer — memory storage, max 5 MB, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

async function getProfile(req, res) {
  if (!req.user) return res.status(401).json({ message: "Authentication required." });
  try {
    const result = await profileService.getProfile(req.user);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] getProfile error:", err);
    return res.status(500).json({ message: "Failed to load profile." });
  }
}

async function changePassword(req, res) {
  if (!req.user) return res.status(401).json({ message: "Authentication required." });
  const { currentPassword, newPassword } = req.body || {};
  try {
    const result = await profileService.changePassword(req.user, currentPassword, newPassword);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] changePassword error:", err);
    return res.status(500).json({ message: "Failed to update password." });
  }
}

async function updatePhone(req, res) {
  if (!req.user) return res.status(401).json({ message: "Authentication required." });
  const { phone } = req.body || {};
  try {
    const result = await profileService.updatePhone(req.user, phone);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] updatePhone error:", err);
    return res.status(500).json({ message: "Failed to update phone." });
  }
}

// uploadPhoto uses multer middleware — exported as array for use in routes
const uploadPhotoMiddleware = upload.single("photo");

async function uploadPhoto(req, res) {
  if (!req.user) return res.status(401).json({ message: "Authentication required." });
  if (!req.file) return res.status(400).json({ message: "No image file provided." });
  try {
    const result = await profileService.saveProfilePhoto(
      req.user,
      req.file.buffer,
      req.file.mimetype
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] uploadPhoto error:", err);
    return res.status(500).json({ message: "Failed to upload photo." });
  }
}

async function getPhoto(req, res) {
  const { userId } = req.params;
  try {
    const result = await profileService.getProfilePhoto(userId);
    if (result.status !== 200 || !result.buffer) {
      return res.status(404).json({ message: "No photo found." });
    }
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(result.buffer);
  } catch (err) {
    console.error("[profile.controller] getPhoto error:", err);
    return res.status(500).json({ message: "Failed to retrieve photo." });
  }
}

async function deletePhoto(req, res) {
  if (!req.user) return res.status(401).json({ message: "Authentication required." });
  try {
    const result = await profileService.deleteProfilePhoto(req.user);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[profile.controller] deletePhoto error:", err);
    return res.status(500).json({ message: "Failed to remove photo." });
  }
}

module.exports = { getProfile, changePassword, updatePhone, uploadPhoto, uploadPhotoMiddleware, getPhoto, deletePhoto };
