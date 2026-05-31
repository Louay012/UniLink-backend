const express = require("express");
const multer = require("multer");
const announcementController = require("../controllers/announcement.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024
  }
});

function handleUpload(req, res, next) {
  upload.array("files", 5)(req, res, (err) => {
    if (err) req.fileValidationError = err;
    next();
  });
}

router.get("/announcements/audience-options", announcementController.listAudienceOptions);
router.get("/announcements", announcementController.listAnnouncements);
router.post("/announcements", handleUpload, announcementController.createAnnouncement);
router.get("/announcements/:announcementId", announcementController.getAnnouncement);
router.put("/announcements/:announcementId", handleUpload, announcementController.updateAnnouncement);
router.delete("/announcements/:announcementId", announcementController.deleteAnnouncement);
router.post("/announcements/:announcementId/read", announcementController.markRead);

module.exports = router;
