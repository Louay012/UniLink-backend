const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.get("/health",         authController.health);
router.post("/auth/register", authController.register);
router.post("/auth/login",    authController.login);
router.get("/auth/me",        authController.me);

module.exports = router;