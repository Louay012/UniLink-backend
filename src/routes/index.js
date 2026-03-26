const express = require("express");

const authRoutes = require("./auth.routes");
const courseRoutes = require("./course.routes");
const groupRoutes = require("./group.routes");
const messageRoutes = require("./message.routes");

const router = express.Router();

router.use(authRoutes);
router.use(courseRoutes);
router.use(groupRoutes);
router.use(messageRoutes);

module.exports = router;
