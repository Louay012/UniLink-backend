const jwt = require("jsonwebtoken");

function attachResolvedUser(req, _res, next) {
  // Look for the token in the Authorization header
  // It comes in like: "Bearer eyJhbGci..."
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No token — that's fine for public routes like /login and /register
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the user info to the request so any route can use it
    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };
  } catch (err) {
    // Token is invalid or expired
    req.user = null;
  }

  next();
}

module.exports = { attachResolvedUser };