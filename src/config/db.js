const { Pool } = require("pg");

const hasValue = (value) => typeof value === "string" && value.trim() !== "";
const hasDatabaseUrl = hasValue(process.env.DATABASE_URL);
const hasDiscreteConfig = [
  process.env.DB_HOST,
  process.env.DB_PORT,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  process.env.DB_NAME,
].every(hasValue);

if (!hasDatabaseUrl && !hasDiscreteConfig) {
  console.error(
    "❌ Database config missing. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in backend/.env"
  );
}

const dbConfig = hasDatabaseUrl
  ? { connectionString: process.env.DATABASE_URL.trim() }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

// Pool = a set of database connections kept ready to use
const pool = new Pool(dbConfig);

// Test the connection when the server starts
pool.connect((err, client, release) => {
  if (err) {
    const details = err.message || err.code || JSON.stringify(err);
    console.error(
      "❌ Database connection failed:",
      details,
      "| Check DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in backend/.env"
    );
  } else {
    console.log("✅ Connected to PostgreSQL database");
    release();
  }
});

module.exports = pool;