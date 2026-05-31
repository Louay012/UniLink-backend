const express = require("express");
const feedbackController = require("../controllers/feedback.controller");

const router = express.Router();

router.post("/feedback", feedbackController.createReport);
router.get("/feedback/reports", feedbackController.listReports);
router.get("/feedback/read-ids", feedbackController.getReadIds);
router.post("/feedback/mark-read", feedbackController.markRead);

module.exports = router;
