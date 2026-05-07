const messageService = require("../services/message.service");

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
    const result = await messageService.listChatMessages(req.user, req.params.chatId);
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

module.exports = {
  getMessages,
  postMessage,
  putMessage,
  deleteMessage
};
