const messageService = require("../services/message.service");

function normalizeUploadError(error) {
  if (!error) {
    return null;
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return { status: 413, body: { message: "Each file must be 10 MB or smaller." } };
  }

  if (error.code === "LIMIT_FILE_COUNT") {
    return { status: 400, body: { message: "You can upload up to 10 files per message." } };
  }

  return null;
}

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

async function getMessages(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const rawLimit = Number.parseInt(String(req.query.limit || ""), 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
    const before = typeof req.query.before === "string" ? req.query.before : undefined;

    const result = await messageService.listChatMessages(req.user, req.params.chatId, {
      limit,
      before
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] getMessages failed', err);
    return res.status(500).json({ message: 'Failed to get messages.' });
  }
}

async function postMessage(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const result = await messageService.createChatMessage(req.user, req.params.chatId, req.body.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] postMessage failed', err);
    return res.status(500).json({ message: 'Failed to post message.' });
  }
}

async function putMessage(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const result = await messageService.updateChatMessage(req.user, req.params.chatId, req.params.messageId, req.body.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] putMessage failed', err);
    return res.status(500).json({ message: 'Failed to update message.' });
  }
}

async function deleteMessage(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const result = await messageService.deleteChatMessage(req.user, req.params.chatId, req.params.messageId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] deleteMessage failed', err);
    return res.status(500).json({ message: 'Failed to delete message.' });
  }
}

async function postMessageWithFiles(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  // Handle multer upload errors passed via req.fileValidationError
  const uploadError = normalizeUploadError(req.fileValidationError);
  if (uploadError) {
    return res.status(uploadError.status).json(uploadError.body);
  }

  try {
    const body = typeof req.body.body === 'string' ? req.body.body : '';
    const files = Array.isArray(req.files) ? req.files : [];

    const attachments = files.map((file) => ({
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      content: file.buffer  // multer memoryStorage provides buffer
    }));

    const result = await messageService.createChatMessageWithAttachments(
      req.user,
      req.params.chatId,
      body,
      attachments
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] postMessageWithFiles failed', err);
    return res.status(500).json({ message: 'Failed to post message with files.' });
  }
}

module.exports = {
  getMessages,
  postMessage,
  putMessage,
  deleteMessage,
  postMessageWithFiles
};
