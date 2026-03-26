const express = require("express");
const courseController = require("../controllers/course.controller");

const router = express.Router();

router.get("/courses", courseController.getCourses);
router.get("/courses/:courseId", courseController.getCourse);
router.get("/courses/:courseId/announcements", courseController.getAnnouncements);
router.post("/courses/:courseId/announcements", courseController.postAnnouncement);
router.get("/courses/:courseId/attachments", courseController.getAttachments);

module.exports = router;
