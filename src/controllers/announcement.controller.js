const announcementService = require("../services/announcement.service");

function ensureAuthenticated(req, res) {
  if (req.user) return true;
  res.status(401).json({ message: "Authentication required" });
  return false;
}

async function listAudienceOptions(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const result = await announcementService.listAudienceOptions(req.user);
  return res.status(result.status).json(result.body);
}

async function listAnnouncements(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const result = await announcementService.listVisibleAnnouncements(req.user);
  return res.status(result.status).json(result.body);
}

async function getAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const result = await announcementService.getAnnouncement(req.user, req.params.announcementId);
  return res.status(result.status).json(result.body);
}

async function createAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  if (req.fileValidationError) {
    const code = req.fileValidationError.code;
    if (code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Each file must be 10 MB or smaller." });
    if (code === "LIMIT_FILE_COUNT") return res.status(400).json({ message: "You can upload up to 5 files." });
  }

  const files = Array.isArray(req.files) ? req.files.map((file) => ({
    fileName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    content: file.buffer
  })) : [];
  const result = await announcementService.createAnnouncement(req.user, req.body || {}, files);
  return res.status(result.status).json(result.body);
}

async function updateAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  if (req.fileValidationError) {
    const code = req.fileValidationError.code;
    if (code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Each file must be 10 MB or smaller." });
    if (code === "LIMIT_FILE_COUNT") return res.status(400).json({ message: "You can upload up to 5 files." });
  }

  const files = Array.isArray(req.files) ? req.files.map((file) => ({
    fileName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    content: file.buffer
  })) : [];
  const result = await announcementService.updateAnnouncement(req.user, req.params.announcementId, req.body || {}, files);
  return res.status(result.status).json(result.body);
}

async function deleteAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const result = await announcementService.deleteAnnouncement(req.user, req.params.announcementId);
  return res.status(result.status).json(result.body);
}

async function markRead(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const result = await announcementService.markRead(req.user, req.params.announcementId);
  return res.status(result.status).json(result.body);
}

module.exports = {
  listAudienceOptions,
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markRead
};
