const messageService = require("../services/message.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

function getMessages(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const result = messageService.listChatMessages(req.user, req.params.chatId);
  return res.status(result.status).json(result.body);
}

function postMessage(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const result = messageService.createChatMessage(req.user, req.params.chatId, req.body.body);
  return res.status(result.status).json(result.body);
}

module.exports = {
  getMessages,
  postMessage
};
