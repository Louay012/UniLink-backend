const express = require("express");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./routes");
const { attachResolvedUser } = require("./middlewares/auth.middleware");

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];
const configuredAllowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(attachResolvedUser);
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

app.use("/api", apiRoutes);

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error("[Global Error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

module.exports = app;
