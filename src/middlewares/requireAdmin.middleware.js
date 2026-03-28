function requireAdmin(req, res, next) {
  // req.user is set by the JWT middleware we already built
  if (!req.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

module.exports = requireAdmin;