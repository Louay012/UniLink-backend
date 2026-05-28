const { Client } = require("pg");
const path = require("path");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });

const dbUrl = process.env.DATABASE_URL;
let config;
if (dbUrl) {
  config = { connectionString: dbUrl };
} else {
  config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

async function runMigration() {
  const client = new Client(config);
  await client.connect();
  try {
    await client.query("ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;");
    console.log("Migration successful: added is_archived to chat_members.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

runMigration();
