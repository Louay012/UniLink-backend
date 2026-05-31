const { bulkInsertUsers } = require('../services/bulkUser.service');
const { recordAdminAuditLog } = require('../services/admin.service');


async function bulkCreateUsers(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const result = await bulkInsertUsers(req.file.buffer, req.file.originalname);

    const hasProblems = result.failed > 0 || result.duplicates.length > 0;
    const status      = result.inserted === 0 ? 400 : hasProblems ? 207 : 201;
    // 201 = all good, 207 = partial success, 400 = nothing inserted

    await recordAdminAuditLog(req.user, 'ADMIN_BULK_USERS_IMPORTED', 'user_batch', null, {
      fileName: req.file.originalname,
      total: result.total ?? result.inserted + result.failed + result.duplicates.length,
      inserted: result.inserted,
      failed: result.failed,
      duplicates: result.duplicates.length,
    });

    return res.status(status).json({
      success: result.inserted > 0,
      message: buildMessage(result),
      data: {
        total:      result.total      ?? result.inserted + result.failed + result.duplicates.length,
        inserted:   result.inserted,
        failed:     result.failed,
        duplicates: result.duplicates.length,
      },
      errors:     result.errors,
      duplicates: result.duplicates,
    });
  } catch (err) {
    console.error('[bulkCreateUsers]', err);

    // Multer file-type / size errors
    if (err.message?.startsWith('Unsupported file type') || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during bulk import.',
    });
  }
}

function buildMessage({ inserted, failed, duplicates }) {
  const parts = [];
  if (inserted)            parts.push(`${inserted} user(s) created`);
  if (duplicates?.length)  parts.push(`${duplicates.length} skipped (duplicate)`);
  if (failed)              parts.push(`${failed} failed validation`);
  return parts.join(', ') + '.';
}

module.exports = { bulkCreateUsers };
