const groupService = require("../services/group.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

function getMessagingContacts(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const actor = groupService.resolveActor(req.user);

  res.json({
    user: req.user,
    actorUserId: actor?.id || null,
    items: groupService.listAllowedContacts(req.user)
  });
}

function getGroups(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const actor = groupService.resolveActor(req.user);

  res.json({
    user: req.user,
    actorUserId: actor?.id || null,
    items: groupService.listUserChats(req.user, req.query.courseId)
  });
}

function createDirectGroup(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const targetUserId = req.body.targetUserId;
  const initialMessage = (req.body.initialMessage || "").trim();

  const result = groupService.createOrGetDirectChat(req.user, targetUserId, initialMessage);
  return res.status(result.status).json(result.body);
}

module.exports = {
  getMessagingContacts,
  getGroups,
  createDirectGroup
};
