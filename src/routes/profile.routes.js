const express = require("express");
const profileController = require("../controllers/profile.controller");

const router = express.Router();

router.get("/profile", profileController.getProfile);

module.exports = router;
