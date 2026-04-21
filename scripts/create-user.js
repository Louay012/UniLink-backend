const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

function loadEnvironment() {
  const projectRoot = path.resolve(__dirname, "..");
  const envCandidates = [".env", ".env.local", ".env copy.example", ".env.example"];
  const envPath = envCandidates
    .map((name) => path.resolve(projectRoot, name))
    .find((candidate) => fs.existsSync(candidate));

  if (!envPath) {
    console.warn("No .env file found in backend/. Using process environment only.");
    return;
  }

  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${path.basename(envPath)}`);
}

loadEnvironment();

const pool = require("../src/config/db");

function parseArgs(argv) {
  const map = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      map[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      map[key] = next;
      i += 1;
    } else {
      map[key] = "true";
    }
  }
  return map;
}

async function ensureRole(roleCode) {
  const existing = await pool.query(
    "SELECT id FROM roles WHERE code = $1",
    [roleCode]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    "INSERT INTO roles(code, label) VALUES ($1, $2) RETURNING id",
    [roleCode, roleCode.charAt(0) + roleCode.slice(1).toLowerCase()]
  );
  return inserted.rows[0].id;
}

async function createOrUpdateUser({ firstName, lastName, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const userResult = await pool.query(
    `INSERT INTO users(first_name, last_name, email, password_hash, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     ON CONFLICT (email) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           updated_at = NOW()
     RETURNING id, first_name, last_name, email`,
    [firstName, lastName, email.toLowerCase(), passwordHash]
  );

  return userResult.rows[0];
}

async function assignRole(userId, roleId) {
  await pool.query(
    `INSERT INTO user_roles(user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );
}

async function main() {
  const args = parseArgs(process.argv);

  const role = (args.role || "ADMIN").toUpperCase();
  const email = args.email || "admin@unilink.local";
  const password = args.password || "admin123";
  const firstName = args.firstName || "System";
  const lastName = args.lastName || "Admin";

  console.log(`Creating/updating user ${email} with role ${role} ...`);

  const roleId = await ensureRole(role);
  const user = await createOrUpdateUser({ firstName, lastName, email, password });
  await assignRole(user.id, roleId);

  console.log("User ready:");
  console.log(`- id: ${user.id}`);
  console.log(`- email: ${user.email}`);
  console.log(`- role: ${role}`);
  console.log("Login password is the one you provided with --password (default: admin123).");
}

main()
  .catch((error) => {
    console.error(`create-user failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
