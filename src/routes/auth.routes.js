const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

function requireAuthenticated(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

router.get("/health",         authController.health);
router.post("/auth/register", authController.register);
router.post("/auth/login",    authController.login);
router.get("/auth/me",        requireAuthenticated, authController.me);
router.get("/users/search",   requireAuthenticated, authController.searchUsers);
router.get("/users/:id",      requireAuthenticated, authController.getUserById);

module.exports = router;
