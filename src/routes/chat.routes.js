const express = require("express");
const chatController = require("../controllers/chat.controller");

const router = express.Router();

router.get("/messaging/contacts", chatController.getMessagingContacts);
router.get("/chats", chatController.getChats);
router.post("/chats/direct", chatController.createDirectGroup);
router.post("/chats/:chatId/read", chatController.markChatRead);
router.delete("/chats/:chatId", chatController.deleteChat);

module.exports = router;
