const jwt = require("jsonwebtoken");

function attachResolvedUser(req, _res, next) {
  // Look for the token in the Authorization header
  // It comes in like: "Bearer eyJhbGci..."
  const authHeader = req.headers["authorization"];
  // Support a simple dev-mode shim: frontend may send x-unilink-role
  // and x-unilink-user-id to simulate an authenticated user without JWT.
  const devRole = req.headers["x-unilink-role"];
  const devUserId = req.headers["x-unilink-user-id"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (devRole) {
      req.user = { id: devUserId || null, role: String(devRole).toUpperCase() };
      console.debug("[auth] Dev role header present. Using role:", req.user.role, "userId:", req.user.id);
      return next();
    }

    // No token — that's fine for public routes like /login and /register
    req.user = null;
    console.debug("[auth] No Authorization header or missing Bearer token");
    return next();
  }

  const token = authHeader.split(" ")[1];
  // Log a truncated token for debugging (safe-ish for local development)
  try {
    console.debug("[auth] Bearer token present (truncated):", token ? `${token.slice(0,8)}...` : "(empty)");
  } catch (_) {
    // ignore slicing errors
  }

  try {
    // Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the user info to the request so any route can use it
    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };
    console.debug("[auth] Token verified. userId:", decoded.userId, "role:", decoded.role);
  } catch (err) {
    // Token is invalid or expired
    req.user = null;
    console.warn("[auth] Token verification failed:", err.message);
  }

  next();
}

module.exports = { attachResolvedUser };