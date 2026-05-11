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
  upload.array("files", 10)(req, res, (err) => {
    if (err) {
      req.fileValidationError = err;
    }
    return messageController.postMessageWithFiles(req, res);
  });
});
router.patch("/chats/:chatId/messages/:messageId", messageController.putMessage);
router.delete("/chats/:chatId/messages/:messageId", messageController.deleteMessage);
router.get("/chats/:chatId/attachments/:attachmentId/download", messageController.downloadAttachment);

module.exports = router;
