const groupService = require("../services/group.service");

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
    const actor = await groupService.resolveActor(req.user);
    const items = await groupService.listAllowedContacts(req.user);
    res.json({ user: req.user, actorUserId: actor?.id || null, items });
  } catch (err) {
    console.error('[controller] getMessagingContacts failed', err);
    res.status(500).json({ message: 'Failed to load contacts.' });
  }
}

async function getGroups(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  try {
    const actor = await groupService.resolveActor(req.user);
    const items = await groupService.listUserChats(req.user, req.query.courseId);
    res.json({ user: req.user, actorUserId: actor?.id || null, items });
  } catch (err) {
    console.error('[controller] getGroups failed', err);
    res.status(500).json({ message: 'Failed to load groups.' });
  }
}

async function createDirectGroup(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const targetUserId = req.body.targetUserId;
  const initialMessage = (req.body.initialMessage || "").trim();

  try {
    const result = await groupService.createOrGetDirectChat(req.user, targetUserId, initialMessage);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] createDirectGroup failed', err);
    return res.status(500).json({ message: 'Failed to create direct chat.' });
  }
}

module.exports = {
  getMessagingContacts,
  getGroups,
  createDirectGroup
};
