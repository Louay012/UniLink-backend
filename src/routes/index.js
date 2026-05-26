const express = require("express");

const authRoutes = require("./auth.routes");
const courseRoutes = require("./course.routes");
const chatRoutes = require("./chat.routes");
const messageRoutes = require("./message.routes");
const adminRoutes   = require("./admin.routes");
const profileRoutes = require("./profile.routes");

const router = express.Router();

router.use(authRoutes);
router.use(courseRoutes);
router.use(chatRoutes);
router.use(messageRoutes);
router.use(adminRoutes);
router.use(profileRoutes);

module.exports = router;
