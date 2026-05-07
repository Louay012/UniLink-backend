const pool = require("../config/db");
const socketUtils = require("../socket");
const { getUserById, getChatById, formatChatForUser, canAccessChat, resolveActor } = require("./group.service");

async function listChatMessages(user, chatId) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }
  if (!(await canAccessChat(actor.id, chat.id))) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  try {
    const res = await pool.query(
      `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.is_deleted,
              u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.chat_id::text = $1
       ORDER BY m.created_at ASC`,
      [chat.id]
    );

    const items = (res.rows || []).map((r) => {
      const senderName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      const message = {
        id: r.id,
        chatId: r.chat_id,
        senderUserId: r.sender_user_id,
        body: r.is_deleted ? '' : r.body,
        isDeleted: r.is_deleted || false,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        sender: {
          id: r.sender_user_id,
          name: senderName || 'Unknown',
          role: r.role || null
        }
      };
      return message;
    });

    return {
      status: 200,
      body: {
        actorUserId: actor.id,
        chat: await formatChatForUser(chat, actor.id),
        items
      }
    };
  } catch (err) {
    console.error("[messages] listChatMessages failed", err);
    return { status: 500, body: { message: "Failed to load messages." } };
  }
}

async function createChatMessage(user, chatId, body) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) {
    return { status: 400, body: { message: "Message body is required." } };
  }

  try {
    // Ensure chat.id is a valid UUID before inserting into UUID column
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chat.id);
    if (!isUuid) {
      return { status: 400, body: { message: "Chat ID is not a valid UUID. Create the chat in the DB before posting messages." } };
    }

    if (!(await canAccessChat(actor.id, chat.id))) {
      return { status: 403, body: { message: "You are not a member of this chat." } };
    }

    const insert = await pool.query(
      `INSERT INTO messages (chat_id, sender_user_id, body)
       VALUES ($1::uuid, $2, $3) RETURNING id, created_at`,
      [chat.id, actor.id, cleanBody]
    );

    const createdAt = insert.rows[0]?.created_at ? new Date(insert.rows[0].created_at).toISOString() : new Date().toISOString();

    // fetch sender info
    let sender = { id: actor.id, name: actor.name || null, role: actor.role || null };
    try {
      const u = await pool.query(
        `SELECT u.id, u.first_name, u.last_name,
                (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
         FROM users u WHERE u.id::text = $1 LIMIT 1`,
        [String(actor.id)]
      );
      if (u.rows && u.rows[0]) {
        const row = u.rows[0];
        sender = { id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown', role: row.role || null };
      }
    } catch (e) {
      // ignore, keep actor info
    }

    const newMessage = {
      id: insert.rows[0]?.id,
      chatId: chat.id,
      senderUserId: actor.id,
      body: cleanBody,
      createdAt,
      sender
    };

    // broadcast to room
    try {
      const io = socketUtils.getIo();
      if (io) io.to(chat.id).emit("message.created", newMessage);
    } catch (e) {
      console.warn("[messages] socket emit failed", e.message);
    }

    return { status: 201, body: newMessage };
  } catch (err) {
    console.error("[messages] createChatMessage failed", err);
    return { status: 500, body: { message: "Failed to create message." } };
  }
}

async function updateChatMessage(user, chatId, messageId, body) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!(await canAccessChat(actor.id, chat.id))) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) {
    return { status: 400, body: { message: "Message body is required." } };
  }

  try {
    const msgRes = await pool.query(
      "SELECT id, sender_user_id, body FROM messages WHERE id::text = $1 AND chat_id::text = $2 LIMIT 1",
      [messageId, chat.id]
    );
    if (!msgRes.rows || !msgRes.rows[0]) {
      return { status: 404, body: { message: "Message not found." } };
    }

    const msg = msgRes.rows[0];
    if (String(msg.sender_user_id) !== String(actor.id)) {
      return { status: 403, body: { message: "You can only edit your own messages." } };
    }

    const updRes = await pool.query(
      "UPDATE messages SET body = $1, updated_at = NOW() WHERE id::text = $2 RETURNING id, body, created_at, updated_at",
      [cleanBody, messageId]
    );

    const updated = updRes.rows[0];
    const updatedMessage = {
      id: updated.id,
      chatId: chat.id,
      senderUserId: actor.id,
      body: updated.body,
      createdAt: updated.created_at ? new Date(updated.created_at).toISOString() : new Date().toISOString(),
      updatedAt: updated.updated_at ? new Date(updated.updated_at).toISOString() : new Date().toISOString()
    };

    try {
      const io = socketUtils.getIo();
      if (io) io.to(chat.id).emit("message.updated", updatedMessage);
    } catch (e) {
      console.warn("[messages] socket emit update failed", e.message);
    }

    return { status: 200, body: updatedMessage };
  } catch (err) {
    console.error("[messages] updateChatMessage failed", err);
    return { status: 500, body: { message: "Failed to update message." } };
  }
}

async function deleteChatMessage(user, chatId, messageId) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  if (!(await canAccessChat(actor.id, chat.id))) {
    return { status: 403, body: { message: "You are not a member of this chat." } };
  }

  try {
    const msgRes = await pool.query(
      "SELECT id, sender_user_id FROM messages WHERE id::text = $1 AND chat_id::text = $2 LIMIT 1",
      [messageId, chat.id]
    );
    if (!msgRes.rows || !msgRes.rows[0]) {
      return { status: 404, body: { message: "Message not found." } };
    }

    const msg = msgRes.rows[0];
    if (String(msg.sender_user_id) !== String(actor.id)) {
      return { status: 403, body: { message: "You can only delete your own messages." } };
    }

    const updRes = await pool.query(
      "UPDATE messages SET is_deleted = TRUE, body = '', updated_at = NOW() WHERE id::text = $1 RETURNING id, updated_at",
      [messageId]
    );

    const deletedMessage = {
      id: messageId,
      chatId: chat.id,
      isDeleted: true,
      body: '',
      senderUserId: msg.sender_user_id,
      sender: { id: actor.id, name: actor.name || 'Unknown', role: actor.role || null }
    };

    try {
      const io = socketUtils.getIo();
      if (io) io.to(chat.id).emit("message.deleted", deletedMessage);
    } catch (e) {
      console.warn("[messages] socket emit delete failed", e.message);
    }

    return { status: 200, body: { message: "Message deleted." } };
  } catch (err) {
    console.error("[messages] deleteChatMessage failed", err);
    return { status: 500, body: { message: "Failed to delete message." } };
  }
}

module.exports = {
  listChatMessages,
  createChatMessage,
  updateChatMessage,
  deleteChatMessage
};
