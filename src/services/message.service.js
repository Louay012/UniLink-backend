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
      `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at,
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
        body: r.body,
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

    // broadcast
    try {
      const io = socketUtils.getIo();
      if (io) io.emit("message.created", newMessage);
    } catch (e) {
      console.warn("[messages] socket emit failed", e.message);
    }

    return { status: 201, body: newMessage };
  } catch (err) {
    console.error("[messages] createChatMessage failed", err);
    return { status: 500, body: { message: "Failed to create message." } };
  }
}

module.exports = {
  listChatMessages,
  createChatMessage
};
