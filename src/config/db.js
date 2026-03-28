const { Pool } = require("pg");
require("dotenv").config();

// Pool = a set of database connections kept ready to use
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test the connection when the server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to PostgreSQL database");
    release();
  }
});

module.exports = pool;