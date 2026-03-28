const pool = require("../config/db");
const bcrypt = require("bcryptjs");

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
async function getAllUsers() {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
            u.created_at, r.code AS role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r       ON r.id = ur.role_id
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

// ─── GET ONE USER ─────────────────────────────────────────────────────────────
async function getUserById(id) {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
            u.created_at, r.code AS role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r       ON r.id = ur.role_id
     WHERE u.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw new Error("User not found");
  return result.rows[0];
}

// ─── CREATE USER (by admin) ───────────────────────────────────────────────────
async function createUser({ firstName, lastName, email, password, role }) {
  // Check email not already taken
  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );
  if (existing.rows.length > 0) throw new Error("Email already in use");

  // Check role is valid
  const roleRow = await pool.query(
    "SELECT id FROM roles WHERE code = $1", [role || "STUDENT"]
  );
  if (roleRow.rows.length === 0) throw new Error("Invalid role");

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Insert user
  const newUser = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, first_name, last_name, email`,
    [firstName, lastName, email, password_hash]
  );
  const user = newUser.rows[0];

  // Assign role
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [user.id, roleRow.rows[0].id]
  );

  return user;
}

// ─── UPDATE USER ROLE ─────────────────────────────────────────────────────────
async function updateUserRole(id, newRole) {
  // Check role is valid
  const roleRow = await pool.query(
    "SELECT id FROM roles WHERE code = $1", [newRole]
  );
  if (roleRow.rows.length === 0) throw new Error("Invalid role");

  // Delete old role and assign new one
  await pool.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [id, roleRow.rows[0].id]
  );

  return getUserById(id);
}

// ─── DELETE USER ──────────────────────────────────────────────────────────────
async function deleteUser(id) {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 RETURNING id", [id]
  );
  if (result.rows.length === 0) throw new Error("User not found");
  return { message: "User deleted successfully" };
}

module.exports = { getAllUsers, getUserById, createUser, updateUserRole, deleteUser };