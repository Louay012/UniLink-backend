const express = require("express");
const messageController = require("../controllers/message.controller");

const router = express.Router();

router.get("/messages/:chatId", messageController.getMessages);
router.post("/messages/:chatId", messageController.postMessage);
router.get("/chats/:chatId/messages", messageController.getMessages);
router.post("/chats/:chatId/messages", messageController.postMessage);

module.exports = router;
