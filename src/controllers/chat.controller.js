const chatService = require("../services/chat.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

async function getMessagingContacts(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const actor = await chatService.resolveActor(req.user);
    const items = await chatService.listAllowedContacts(req.user);
    res.json({ user: req.user, actorUserId: actor?.id || null, items });
  } catch (err) {
    console.error('[controller] getMessagingContacts failed', err);
    res.status(500).json({ message: 'Failed to load contacts.' });
  }
}

async function getChats(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const actor = await chatService.resolveActor(req.user);
    const items = await chatService.listUserChats(req.user, req.query.courseId);
    res.json({ user: req.user, actorUserId: actor?.id || null, items });
  } catch (err) {
    console.error('[controller] getChats failed', err);
    res.status(500).json({ message: 'Failed to load chats.' });
  }
}

async function createDirectGroup(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const targetUserId = req.body.targetUserId;
  const initialMessage = (req.body.initialMessage || "").trim();

  try {
    const result = await chatService.createOrGetDirectChat(req.user, targetUserId, initialMessage);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] createDirectGroup failed', err);
    return res.status(500).json({ message: 'Failed to create direct chat.' });
  }
}

async function markChatRead(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const result = await chatService.markChatRead(req.user, req.params.chatId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] markChatRead failed', err);
    return res.status(500).json({ message: 'Failed to mark chat as read.' });
  }
}

async function deleteChat(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const result = await chatService.deleteChat(req.user, req.params.chatId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] deleteChat failed', err);
    return res.status(500).json({ message: 'Failed to delete chat.' });
  }
}

module.exports = {
  getMessagingContacts,
  getChats,
  createDirectGroup,
  markChatRead,
  deleteChat
};
