const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.get("/health", authController.health);
router.get("/auth/me", authController.me);

module.exports = router;
