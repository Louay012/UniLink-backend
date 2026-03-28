const authService = require("../services/auth.service");

// POST /api/auth/register
async function register(req, res) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

// GET /api/health
function health(_req, res) {
  res.json({ status: "ok", service: "unilink-backend" });
}

// GET /api/auth/me
function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, health, me };