const { data } = require("../config/db");
const { canAccessChat, formatChatForUser, getChatById, getUserById } = require("./group.service");

function listChatMessages(user, chatId) {
  const chat = getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!canAccessChat(user.id, chat.id)) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  const items = data.messages
    .filter((message) => message.chatId === chat.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => {
      const sender = getUserById(message.senderUserId);
      return {
        ...message,
        sender: sender
          ? {
              id: sender.id,
              name: sender.name,
              role: sender.role
            }
          : null
      };
    });

  return {
    status: 200,
    body: {
      chat: formatChatForUser(chat, user.id),
      items
    }
  };
}

function createChatMessage(user, chatId, body) {
  const chat = getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!canAccessChat(user.id, chat.id)) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) {
    return { status: 400, body: { message: "Message body is required." } };
  }

  const newMessage = {
    id: `m-${Date.now()}`,
    chatId: chat.id,
    senderUserId: user.id,
    body: cleanBody,
    createdAt: new Date().toISOString()
  };

  data.messages.push(newMessage);
  return { status: 201, body: newMessage };
}

module.exports = {
  listChatMessages,
  createChatMessage
};
