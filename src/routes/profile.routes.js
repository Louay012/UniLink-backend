const express = require("express");
const profileController = require("../controllers/profile.controller");

const router = express.Router();

router.get("/profile", profileController.getProfile);
router.patch("/profile/phone", profileController.updatePhone);
router.patch("/profile/password", profileController.changePassword);
router.post("/profile/photo", profileController.uploadPhotoMiddleware, profileController.uploadPhoto);
router.get("/profile/photo/:userId", profileController.getPhoto); // public — no auth needed to display avatars
router.delete("/profile/photo", profileController.deletePhoto);

module.exports = router;
