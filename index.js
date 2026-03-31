const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envCandidates = [".env", ".env.local", ".env copy.example", ".env.example"];
const envPath = envCandidates
  .map((name) => path.resolve(__dirname, name))
  .find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${path.basename(envPath)}`);
} else {
  console.warn(
    "No environment file found. Create backend/.env from backend/.env.example"
  );
}

const app = require("./src/app");
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`UniLink backend running at http://localhost:${PORT}`);
});
