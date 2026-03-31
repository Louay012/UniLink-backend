const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

const hasValue = (value) => typeof value === "string" && value.trim() !== "";

const loadEnvironment = () => {
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
};

const getSqlFilePath = () => {
  const customPath = process.argv[2];
  if (hasValue(customPath)) {
    return path.resolve(process.cwd(), customPath);
  }
  return path.resolve(__dirname, "..", "aa", "Faculty_App_MVP_PostgreSQL.sql");
};

const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;

const getConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (hasValue(databaseUrl)) {
    const url = new URL(databaseUrl.trim());
    const dbNameFromUrl = url.pathname.replace(/^\//, "");
    const targetDbName = dbNameFromUrl || process.env.DB_NAME;

    if (!hasValue(targetDbName)) {
      throw new Error("DATABASE_URL is set but database name is missing.");
    }

    const adminUrl = new URL(url.toString());
    adminUrl.pathname = "/postgres";

    return {
      targetDbName,
      appConfig: { connectionString: url.toString() },
      adminConfig: { connectionString: adminUrl.toString() },
    };
  }

  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((key) => !hasValue(process.env[key]));

  if (missing.length > 0) {
    throw new Error(
      `Missing database configuration: ${missing.join(", ")}. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.`
    );
  }

  const baseConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  return {
    targetDbName: process.env.DB_NAME,
    appConfig: { ...baseConfig, database: process.env.DB_NAME },
    adminConfig: { ...baseConfig, database: "postgres" },
  };
};

const ensureDatabaseExists = async (adminConfig, dbName) => {
  const client = new Client(adminConfig);
  await client.connect();

  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);

    if (exists.rowCount > 0) {
      console.log(`Database ${dbName} already exists.`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    console.log(`Created database ${dbName}.`);
  } finally {
    await client.end();
  }
};

const applySchema = async (appConfig, sqlFilePath) => {
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`Schema file not found: ${sqlFilePath}`);
  }

  const sql = fs.readFileSync(sqlFilePath, "utf8").trim();
  if (!sql) {
    throw new Error(`Schema file is empty: ${sqlFilePath}`);
  }

  const client = new Client(appConfig);
  await client.connect();

  try {
    await client.query(sql);
    console.log(`Schema applied from ${sqlFilePath}.`);
  } finally {
    await client.end();
  }
};

const main = async () => {
  loadEnvironment();

  const sqlFilePath = getSqlFilePath();
  const { targetDbName, adminConfig, appConfig } = getConfig();

  console.log(`Preparing database ${targetDbName}...`);
  await ensureDatabaseExists(adminConfig, targetDbName);

  console.log("Applying schema...");
  await applySchema(appConfig, sqlFilePath);

  console.log("Database initialization completed.");
};

main().catch((error) => {
  console.error(`DB init failed: ${error.message}`);
  process.exit(1);
});
