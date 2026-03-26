const groupService = require("../services/group.service");

function getMessagingContacts(req, res) {
  res.json({
    user: req.user,
    items: groupService.listAllowedContacts(req.user)
  });
}

function getGroups(req, res) {
  res.json({
    user: req.user,
    items: groupService.listUserChats(req.user.id, req.query.courseId)
  });
}

function createDirectGroup(req, res) {
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
