const multer = require('multer');
const path = require('path');

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some clients send CSV with this
];

const ALLOWED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

const storage = multer.memoryStorage(); // keep file in memory as Buffer

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Unsupported file type "${ext}". Allowed: .csv, .xls, .xlsx`),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
});

module.exports = upload;
