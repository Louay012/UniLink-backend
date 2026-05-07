const express = require("express");
const groupController = require("../controllers/group.controller");

const router = express.Router();

router.get("/messaging/contacts", groupController.getMessagingContacts);
router.get("/groups", groupController.getGroups);
router.post("/groups/direct", groupController.createDirectGroup);
router.get("/chats", groupController.getGroups);
router.post("/chats/direct", groupController.createDirectGroup);
router.post("/chats/:chatId/read", groupController.markChatRead);

module.exports = router;
