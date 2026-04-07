const data = require("../data");
const { canAccessChat, formatChatForUser, getChatById, getUserById, resolveActor } = require("./group.service");

function listChatMessages(user, chatId) {
  const actor = resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!canAccessChat(actor.id, chat.id)) {
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
      actorUserId: actor.id,
      chat: formatChatForUser(chat, actor.id),
      items
    }
  };
}

function createChatMessage(user, chatId, body) {
  const actor = resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!canAccessChat(actor.id, chat.id)) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) {
    return { status: 400, body: { message: "Message body is required." } };
  }

  const newMessage = {
    id: `m-${Date.now()}`,
    chatId: chat.id,
    senderUserId: actor.id,
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
