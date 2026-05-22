const express = require("express");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./routes");
const { attachResolvedUser } = require("./middlewares/auth.middleware");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
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
