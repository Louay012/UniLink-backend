const express = require("express");
const multer = require("multer");
const messageController = require("../controllers/message.controller");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024
  }
});

router.get("/messages/:chatId", messageController.getMessages);
router.post("/messages/:chatId", messageController.postMessage);
router.get("/chats/:chatId/messages", messageController.getMessages);
router.post("/chats/:chatId/messages", messageController.postMessage);
router.post("/chats/:chatId/messages/upload", (req, res) => {
  upload.array("files", 10)(req, res, (error) => {
    if (error) {
      req.fileValidationError = error;
    }
    return messageController.postMessageWithFiles(req, res);
  });
});
router.get("/chats/:chatId/attachments/:attachmentId/download", messageController.downloadAttachment);
router.patch("/chats/:chatId/messages/:messageId", messageController.patchMessage);
router.delete("/chats/:chatId/messages/:messageId", messageController.removeMessage);
router.post("/chats/:chatId/read", messageController.markRead);

module.exports = router;
