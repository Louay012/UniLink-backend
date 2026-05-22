const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");

const VALID_ROLES = new Set(["STUDENT", "TEACHER", "COORDINATOR", "ADMIN"]);
const REQUIRED_COLUMNS = ["firstName", "lastName", "email", "password", "role"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseHeaders(raw) {
  // Trim whitespace, lowercase for comparison
  return raw.map((h) => (h || "").toString().trim());
}

function buildColumnMap(headers) {
  // Map expected column name → index in the header row (case-insensitive)
  const lower = headers.map((h) => h.toLowerCase());
  const map = {};
  for (const col of REQUIRED_COLUMNS) {
    const idx = lower.indexOf(col.toLowerCase());
    if (idx !== -1) map[col] = idx;
  }
  return map;
}

function validateRow(rowObj, rowNumber) {
  const errors = [];

  if (!rowObj.firstName?.trim()) errors.push("firstName is required");
  if (!rowObj.lastName?.trim())  errors.push("lastName is required");
  if (!rowObj.email?.trim())     errors.push("email is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowObj.email || ""))
    errors.push("email is invalid");
  if (!rowObj.password?.trim() || rowObj.password.trim().length < 6)
    errors.push("password must be at least 6 characters");
  const role = (rowObj.role || "").trim().toUpperCase();
  if (!VALID_ROLES.has(role))
    errors.push(`role must be one of ${[...VALID_ROLES].join(", ")}`);

  return errors;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function parseCSV(buffer) {
  const text = buffer.toString("utf8");
  const records = parse(text, {
    columns: true,       // use first row as headers
    skip_empty_lines: true,
    trim: true,
  });
  return records; // array of plain objects keyed by header name
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file contains no sheets.");
  const sheet = workbook.Sheets[sheetName];
  // header: 1 → returns array-of-arrays; we handle mapping ourselves
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("Excel sheet has no data rows.");

  const headers = normaliseHeaders(rows[0]);
  const colMap = buildColumnMap(headers);

  const missing = REQUIRED_COLUMNS.filter((c) => !(c in colMap));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);

  return rows.slice(1).map((row) => {
    const obj = {};
    for (const col of REQUIRED_COLUMNS) {
      obj[col] = (row[colMap[col]] || "").toString().trim();
    }
    return obj;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {Buffer} buffer       Raw file buffer from multer memoryStorage
 * @param {string} filename     Original filename (used to detect format)
 * @returns {{ valid: object[], parseErrors: {row: number, reason: string}[] }}
 */
function extractUsers(buffer, filename) {
  let rawRows;

  if (/\.csv$/i.test(filename)) {
    rawRows = parseCSV(buffer);
  } else if (/\.xlsx?$/i.test(filename)) {
    rawRows = parseExcel(buffer);
  } else {
    throw new Error("Unsupported file type. Use .csv, .xlsx, or .xls");
  }

  const valid = [];
  const parseErrors = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // +2: header row is row 1, data starts at row 2
    const errors = validateRow(raw, rowNumber);

    if (errors.length) {
      parseErrors.push({ row: rowNumber, reason: errors.join("; ") });
    } else {
      valid.push({
        firstName: raw.firstName.trim(),
        lastName:  raw.lastName.trim(),
        email:     raw.email.trim().toLowerCase(),
        password:  raw.password.trim(),
        role:      raw.role.trim().toUpperCase(),
        _row:      rowNumber,
      });
    }
  });

  return { valid, parseErrors };
}

module.exports = { extractUsers };