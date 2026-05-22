const express = require("express");
const multer = require("multer");
const courseController = require("../controllers/course.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024 // 10 MB per file
  }
});

// ── Announcement read tracking (static paths BEFORE :courseId) ──
router.get("/announcements/read-ids", courseController.getReadIds);
router.get("/announcements/unread-counts", courseController.getUnreadCounts);
router.post("/announcements/mark-read", courseController.markAnnouncementsRead);

// ── Download (static path before :courseId param) ──
router.get("/courses/announcements/attachments/:attachmentId/download", courseController.downloadAnnouncementAttachment);

// ── Course CRUD ──
router.get("/courses", courseController.getCourses);
router.get("/courses/:courseId", courseController.getCourse);
router.get("/courses/:courseId/announcements", courseController.getAnnouncements);
router.post("/courses/:courseId/announcements", courseController.postAnnouncement);
router.post("/courses/:courseId/announcements/upload", (req, res) => {
  upload.array("files", 5)(req, res, (err) => {
    if (err) {
      req.fileValidationError = err;
    }
    return courseController.postAnnouncementWithFiles(req, res);
  });
});
router.post("/courses/:courseId/announcements/read", courseController.markCourseRead);
router.get("/courses/:courseId/attachments", courseController.getAttachments);

module.exports = router;
