const messageService = require("../services/message.service");

function getMessages(req, res) {
  const result = messageService.listChatMessages(req.user, req.params.chatId);
  return res.status(result.status).json(result.body);
}

function postMessage(req, res) {
  const result = messageService.createChatMessage(req.user, req.params.chatId, req.body.body);
  return res.status(result.status).json(result.body);
}

module.exports = {
  getMessages,
  postMessage
};
