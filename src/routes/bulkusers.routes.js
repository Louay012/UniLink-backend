
const express = require("express");
const multer = require("multer");
const { extractUsers } = require("../../scripts/extractUsersFromFile");
const { bulkInsertUsers } = require("../../scripts/bulkInsertUsers");
const { requireAdmin } = require("../../middleware/auth"); // your existing auth middleware

const router = express.Router();

// ── Multer: store in memory (no disk writes) ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const okExt = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    if (allowed.includes(file.mimetype) || okExt) return cb(null, true);
    cb(new Error("Only CSV and Excel files are accepted."));
  },
});

// ── Route ─────────────────────────────────────────────────────────────────────
router.post(
  "/",
  requireAdmin,                       // must be authenticated admin
  upload.single("file"),              // field name must be "file"
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    // 1. Parse file → array of user objects
    let users;
    try {
      users = await extractUsers(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(422).json({ message: `File parsing failed: ${err.message}` });
    }

    if (users.length === 0) {
      return res.status(422).json({ message: "The file contained no valid data rows." });
    }

    // 2. Insert into PostgreSQL
    const result = await bulkInsertUsers(users);
    // result: { created: number, skipped: number, errors: [{row, reason}] }

    return res.status(200).json(result);
  }
);

// ── Multer error handler ──────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Internal server error." });
});

module.exports = router;
