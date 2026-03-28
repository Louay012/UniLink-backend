const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ─── REGISTER ────────────────────────────────────────────────────────────────
async function register({ firstName, lastName, email, password, role }) {

  // 1) Check if email is already taken
  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  if (existing.rows.length > 0) {
    throw new Error("Email already in use");
  }

  // 2) Check the role exists in the roles table
  const roleRow = await pool.query(
    "SELECT id FROM roles WHERE code = $1",
    [role || "STUDENT"]
  );
  if (roleRow.rows.length === 0) {
    throw new Error("Invalid role");
  }

  // 3) Scramble the password before saving
  //    The number 10 means "scramble it 10 times" — harder to crack
  const password_hash = await bcrypt.hash(password, 10);

  // 4) Insert the new user into the users table
  const newUser = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, first_name, last_name, email`,
    [firstName, lastName, email, password_hash]
  );
  const user = newUser.rows[0];

  // 5) Assign the role to the user in user_roles table
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)`,
    [user.id, roleRow.rows[0].id]
  );

  // 6) Create and return a JWT token
  const token = jwt.sign(
    { userId: user.id, role: role || "STUDENT" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  return { user, token };
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function login({ email, password }) {

  // 1) Find the user by email
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.password_hash,
            r.code AS role
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE u.email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid email or password");
  }

  const user = result.rows[0];

  // 2) Compare the password the user typed with the scrambled one in the DB
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  // 3) Create and return a JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  return {
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
    },
    token,
  };
}

module.exports = { register, login };