const adminService = require("../services/admin.service");
const courseService = require("../services/course.service");

async function getAllUsers(req, res) {
  try {
    const users = await adminService.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUserById(req, res) {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.json(user);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function createUser(req, res) {
  try {
    const user = await adminService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function updateUserRole(req, res) {
  try {
    const user = await adminService.updateUserRole(req.params.id, req.body.role);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const result = await adminService.deleteUser(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function assignCourse(req, res) {
  const userId = req.params.id;
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId is required' });

  try {
    const result = await adminService.assignCourseToUser(userId, courseId);
    res.json(result);
  } catch (err) {
    console.error('[admin] assignCourse failed', err.message);
    if (String(err.message).toLowerCase().includes('not found')) return res.status(404).json({ error: err.message });
    return res.status(400).json({ error: err.message });
  }
}

const pool = require("../config/db");

async function getAllCourses(req, res) {
  try {
    const result = await pool.query(`SELECT id, code, title, description, class_group_id FROM courses ORDER BY title`);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin] getAllCourses failed', err.message);
    res.status(500).json({ error: err.message });
  }
}

// keep exports explicit and stable
module.exports = { getAllUsers, getUserById, createUser, updateUserRole, deleteUser, getAllCourses, assignCourse };