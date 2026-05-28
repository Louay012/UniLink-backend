const authService = require("../services/auth.service");
const groupService = require("../services/chat.service");

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

// GET /users/search
async function searchUsers(req, res) {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const actor = await groupService.resolveActor(req.user);
    const items = await authService.searchUsers(q);
    res.json({ user: req.user, actorUserId: actor?.id || null, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, health, me, searchUsers };

async function getUserById(req, res) {
  try {
    const id = req.params.id;
    const user = await groupService.getUserById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error('[controller] getUserById failed', err);
    return res.status(500).json({ message: 'Failed to load user.' });
  }
}

module.exports.getUserById = getUserById;
