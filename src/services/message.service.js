const pool = require("../config/db");
const socketUtils = require("../socket");
const { getChatById, formatChatForUser, canAccessChat, resolveActor } = require("./group.service");

let messagingTablesReadyPromise = null;

function getChatRoom(chatId) {
  return `chat:${chatId}`;
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function ensureMessagingTables() {
  if (!messagingTablesReadyPromise) {
    messagingTablesReadyPromise = (async () => {
      // message_reads already exists with schema (user_id, chat_id, last_read_message_id, read_at)
      // Only create if it doesn't exist at all
      await pool.query(
        `CREATE TABLE IF NOT EXISTS message_reads (
           user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
           last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
           read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           PRIMARY KEY (user_id, chat_id)
         )`
      );

      await pool.query(
        `ALTER TABLE messages
         ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL`
      );

      await pool.query(
        `ALTER TABLE messages
         ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES messages(id) ON DELETE SET NULL`
      );

      const hasLegacyUrlColumn = await pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'message_attachments'
             AND column_name = 'file_url'
         ) AS exists`
      );

      if (hasLegacyUrlColumn.rows?.[0]?.exists) {
        await pool.query("DROP TABLE IF EXISTS message_attachments CASCADE");
      }

      await pool.query(
        `CREATE TABLE IF NOT EXISTS message_attachments (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
           file_name VARCHAR(255) NOT NULL,
           mime_type VARCHAR(120),
           file_size BIGINT,
           file_data BYTEA NOT NULL,
           uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           CHECK (file_size IS NULL OR file_size >= 0)
         )`
      );
    })().catch((error) => {
      messagingTablesReadyPromise = null;
      throw error;
    });
  }

  return messagingTablesReadyPromise;
}

function mapAttachmentRow(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    fileUrl: `/api/chats/${row.chat_id}/attachments/${row.id}/download`,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null
  };
}

function mapMessagePreview(row) {
  if (!row) {
    return null;
  }

  const senderName = `${row.first_name || ""} ${row.last_name || ""}`.trim();

  return {
    id: row.id,
    chatId: row.chat_id,
    senderUserId: row.sender_user_id,
    body: row.is_deleted ? "" : row.body,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    sender: {
      id: row.sender_user_id,
      name: senderName || "Unknown",
      role: row.role || null
    }
  };
}

async function hydrateMessagePreviews(messageIds) {
  const uniqueIds = [...new Set((messageIds || []).filter(Boolean).map((value) => String(value)))].filter(Boolean);
  if (!uniqueIds.length) {
    return new Map();
  }

  try {
    const res = await pool.query(
      `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.is_deleted,
              u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.id = ANY($1::uuid[])`,
      [uniqueIds]
    );

    const byId = new Map();
    for (const row of res.rows || []) {
      byId.set(String(row.id), mapMessagePreview(row));
    }

    return byId;
  } catch (error) {
    console.error("[messages] hydrateMessagePreviews failed", error.message);
    return new Map();
  }
}

async function hydrateMessageAttachments(messageIds) {
  if (!Array.isArray(messageIds) || !messageIds.length) {
    return new Map();
  }

  try {
    const res = await pool.query(
      `SELECT ma.id, ma.message_id, ma.file_name, ma.mime_type, ma.file_size, ma.uploaded_at, m.chat_id
       FROM message_attachments ma
       JOIN messages m ON m.id = ma.message_id
       WHERE ma.message_id = ANY($1::uuid[])
       ORDER BY ma.uploaded_at ASC, ma.id ASC`,
      [messageIds]
    );

    const byMessage = new Map();
    for (const row of res.rows || []) {
      const key = String(row.message_id);
      if (!byMessage.has(key)) {
        byMessage.set(key, []);
      }
      byMessage.get(key).push(mapAttachmentRow(row));
    }

    return byMessage;
  } catch (error) {
    console.error("[messages] hydrateMessageAttachments failed", error.message);
    return new Map();
  }
}

async function buildMessagePayload(messageRow, actorId, options = {}) {
  const attachmentMap = options.attachmentMap || (await hydrateMessageAttachments([messageRow.id]));
  const relatedMap = options.relatedMap || new Map();
  const attachments = attachmentMap.get(String(messageRow.id)) || [];
  const replyToMessageId = messageRow.reply_to_message_id || null;
  const forwardedFromMessageId = messageRow.forwarded_from_message_id || null;

  return {
    id: messageRow.id,
    chatId: messageRow.chat_id,
    senderUserId: messageRow.sender_user_id,
    body: messageRow.is_deleted ? "" : messageRow.body,
    isDeleted: Boolean(messageRow.is_deleted),
    isEdited: Boolean(
      messageRow.updated_at &&
      messageRow.created_at &&
      new Date(messageRow.updated_at).getTime() > new Date(messageRow.created_at).getTime()
    ),
    createdAt: messageRow.created_at ? new Date(messageRow.created_at).toISOString() : new Date().toISOString(),
    updatedAt: messageRow.updated_at ? new Date(messageRow.updated_at).toISOString() : null,
    isRead: actorId ? Boolean(messageRow.read_at) : false,
    sender: {
      id: messageRow.sender_user_id,
      name: messageRow.sender_name || `${messageRow.first_name || ""} ${messageRow.last_name || ""}`.trim() || "Unknown",
      role: messageRow.sender_role || messageRow.role || null
    },
    attachments,
    replyToMessageId,
    forwardedFromMessageId,
    replyToMessage: replyToMessageId ? relatedMap.get(String(replyToMessageId)) || null : null,
    forwardedFromMessage: forwardedFromMessageId ? relatedMap.get(String(forwardedFromMessageId)) || null : null
  };
}

async function createAttachmentRows(messageId, chatId, attachments) {
  const cleanAttachments = (attachments || []).filter(
    (item) => item && item.content && item.fileName
  );

  if (!cleanAttachments.length) {
    return [];
  }

  const created = [];
  for (const attachment of cleanAttachments) {
    const contentBuffer = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(attachment.content);

    const insert = await pool.query(
      `INSERT INTO message_attachments (message_id, file_name, mime_type, file_size, file_data)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id, file_name, mime_type, file_size, uploaded_at`,
      [
        messageId,
        String(attachment.fileName || "Attachment"),
        attachment.mimeType ? String(attachment.mimeType) : null,
        Number.isFinite(Number(attachment.fileSize)) ? Number(attachment.fileSize) : contentBuffer.length,
        contentBuffer
      ]
    );

    created.push(
      mapAttachmentRow({
        ...insert.rows[0],
        chat_id: chatId
      })
    );
  }

  return created;
}

function sanitizeMessagePageLimit(limit) {
  const parsed = Number.parseInt(String(limit || ""), 10);
  if (!Number.isFinite(parsed)) {
    return 40;
  }
  return Math.min(100, Math.max(10, parsed));
}

function normalizeMessageInput(bodyOrPayload, fallbackAttachments = []) {
  if (bodyOrPayload && typeof bodyOrPayload === "object" && !Array.isArray(bodyOrPayload)) {
    return {
      body: typeof bodyOrPayload.body === "string" ? bodyOrPayload.body : "",
      replyToMessageId: typeof bodyOrPayload.replyToMessageId === "string" ? bodyOrPayload.replyToMessageId : null,
      forwardedFromMessageId: typeof bodyOrPayload.forwardedFromMessageId === "string" ? bodyOrPayload.forwardedFromMessageId : null,
      attachments: Array.isArray(bodyOrPayload.attachments) ? bodyOrPayload.attachments : fallbackAttachments
    };
  }

  return {
    body: typeof bodyOrPayload === "string" ? bodyOrPayload : String(bodyOrPayload || ""),
    replyToMessageId: null,
    forwardedFromMessageId: null,
    attachments: fallbackAttachments
  };
}

async function fetchMessagesAroundAnchor(chatId, anchorMessageId, pageLimit) {
  const halfLimit = Math.max(5, Math.floor(pageLimit / 2));
  const anchorRes = await pool.query(
    `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.updated_at, m.is_deleted,
            m.reply_to_message_id, m.forwarded_from_message_id,
            u.first_name, u.last_name,
            (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
     FROM messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.id = $1::uuid AND m.chat_id = $2::uuid
     LIMIT 1`,
    [anchorMessageId, chatId]
  );

  if (!anchorRes.rows?.length) {
    return null;
  }

  const anchorRow = anchorRes.rows[0];
  const anchorDate = anchorRow.created_at ? new Date(anchorRow.created_at).toISOString() : null;

  const olderRes = await pool.query(
    `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.updated_at, m.is_deleted,
            m.reply_to_message_id, m.forwarded_from_message_id,
            u.first_name, u.last_name,
            (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
     FROM messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.chat_id = $1::uuid
       AND m.created_at < $2::timestamptz
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3`,
    [chatId, anchorDate, halfLimit + 1]
  );

  const newerRes = await pool.query(
    `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.updated_at, m.is_deleted,
            m.reply_to_message_id, m.forwarded_from_message_id,
            u.first_name, u.last_name,
            (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
     FROM messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.chat_id = $1::uuid
       AND m.created_at > $2::timestamptz
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT $3`,
    [chatId, anchorDate, halfLimit + 1]
  );

  const olderRows = olderRes.rows || [];
  const newerRows = newerRes.rows || [];
  const hasOlder = olderRows.length > halfLimit;
  const hasNewer = newerRows.length > halfLimit;
  const trimmedOlder = hasOlder ? olderRows.slice(0, halfLimit) : olderRows;
  const trimmedNewer = hasNewer ? newerRows.slice(0, halfLimit) : newerRows;
  const rows = [...trimmedOlder.reverse(), anchorRow, ...trimmedNewer];

  return {
    rows,
    hasOlder,
    hasNewer,
    oldestCreatedAt: rows.length ? new Date(rows[0].created_at).toISOString() : null,
    newestCreatedAt: rows.length ? new Date(rows[rows.length - 1].created_at).toISOString() : null
  };
}

async function listChatMessages(user, chatId, options = {}) {
  await ensureMessagingTables();

  if (!isValidUuid(chatId)) {
    return { status: 400, body: { message: "Invalid chat ID." } };
  }

  const actor = await resolveActor(user);
  if (!actor || !isValidUuid(actor.id)) {
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
    const pageLimit = sanitizeMessagePageLimit(options.limit);
    const rawBefore = typeof options.before === "string" ? options.before.trim() : "";
    const beforeDate = rawBefore ? new Date(rawBefore) : null;
    const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate.toISOString() : null;
    const q = typeof options.q === "string" ? options.q.trim() : "";
    const anchor = typeof options.anchor === "string" ? options.anchor.trim() : "";

    if (anchor) {
      const anchoredPage = await fetchMessagesAroundAnchor(chat.id, anchor, pageLimit);
      if (!anchoredPage) {
        return { status: 404, body: { message: "Message not found." } };
      }

      const attachmentMap = await hydrateMessageAttachments(anchoredPage.rows.map((row) => row.id));
      const relatedIds = anchoredPage.rows.flatMap((row) => [row.reply_to_message_id, row.forwarded_from_message_id]).filter(Boolean);
      const relatedMap = await hydrateMessagePreviews(relatedIds);

      const items = [];
      for (const row of anchoredPage.rows) {
        items.push(await buildMessagePayload(row, actor.id, { attachmentMap, relatedMap }));
      }

      return {
        status: 200,
        body: {
          actorUserId: actor.id,
          chat: await formatChatForUser(chat, actor.id),
          items,
          paging: {
            limit: pageLimit,
            hasOlder: anchoredPage.hasOlder,
            hasNewer: anchoredPage.hasNewer,
            oldestCreatedAt: anchoredPage.oldestCreatedAt,
            newestCreatedAt: anchoredPage.newestCreatedAt,
            nextBefore: anchoredPage.oldestCreatedAt,
            nextAfter: anchoredPage.newestCreatedAt,
            anchor
          }
        }
      };
    }

    let queryStr = `SELECT m.id, m.chat_id, m.sender_user_id, m.body, m.created_at, m.updated_at, m.is_deleted,
              m.reply_to_message_id, m.forwarded_from_message_id,
              u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.chat_id = $1::uuid
         AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz)`;
    
    const params = [chat.id, before];

    if (q) {
      params.push(`%${q}%`);
      queryStr += ` AND m.body ILIKE $${params.length}`;
    }

    queryStr += ` ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length + 1}`;
    params.push(pageLimit + 1);

    const res = await pool.query(queryStr, params);

    const allRows = res.rows || [];
    const hasOlder = allRows.length > pageLimit;
    const pageRows = hasOlder ? allRows.slice(0, pageLimit) : allRows;

    // Hydrate attachments for all messages on this page
    const messageIds = pageRows.map((r) => r.id);
    const attachmentMap = await hydrateMessageAttachments(messageIds);
    const relatedIds = pageRows.flatMap((row) => [row.reply_to_message_id, row.forwarded_from_message_id]).filter(Boolean);
    const relatedMap = await hydrateMessagePreviews(relatedIds);

    const items = [];
    for (const row of pageRows) {
      items.push(await buildMessagePayload(row, actor.id, { attachmentMap, relatedMap }));
    }

    const oldestCreatedAt = items.length
      ? items[items.length - 1].createdAt
      : null;

    return {
      status: 200,
      body: {
        actorUserId: actor.id,
        chat: await formatChatForUser(chat, actor.id),
        items,
        paging: {
          limit: pageLimit,
          hasOlder,
          oldestCreatedAt,
          nextBefore: hasOlder ? oldestCreatedAt : null
        }
      }
    };
  } catch (err) {
    console.error("[messages] listChatMessages failed", err);
    return { status: 500, body: { message: "Failed to load messages." } };
  }
}

async function createChatMessage(user, chatId, body) {
  return createChatMessageWithAttachments(user, chatId, body, []);
}

async function createChatMessageWithAttachments(user, chatId, bodyOrPayload, attachments = []) {
  await ensureMessagingTables();

  if (!isValidUuid(chatId)) {
    return { status: 400, body: { message: "Invalid chat ID." } };
  }

  const actor = await resolveActor(user);
  if (!actor || !isValidUuid(actor.id)) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  const normalized = normalizeMessageInput(bodyOrPayload, attachments);
  const cleanBody = (normalized.body || "").trim();
  const cleanAttachments = (normalized.attachments || []).filter((item) => item && item.content && item.fileName);
  const replyToMessageId = isValidUuid(normalized.replyToMessageId) ? normalized.replyToMessageId : null;
  const forwardedFromMessageId = isValidUuid(normalized.forwardedFromMessageId) ? normalized.forwardedFromMessageId : null;

  if (!cleanBody && !cleanAttachments.length && !replyToMessageId && !forwardedFromMessageId) {
    return { status: 400, body: { message: "Message body or attachment is required." } };
  }

  try {
    if (!(await canAccessChat(actor.id, chat.id))) {
      return { status: 403, body: { message: "You are not a member of this chat." } };
    }

    if (replyToMessageId) {
      const replyRes = await pool.query(
        "SELECT 1 FROM messages WHERE id::text = $1 AND chat_id::text = $2 LIMIT 1",
        [replyToMessageId, chat.id]
      );
      if (!replyRes.rows?.length) {
        return { status: 404, body: { message: "Reply target message not found." } };
      }
    }

    if (forwardedFromMessageId) {
      const forwardRes = await pool.query(
        "SELECT 1 FROM messages WHERE id::text = $1 LIMIT 1",
        [forwardedFromMessageId]
      );
      if (!forwardRes.rows?.length) {
        return { status: 404, body: { message: "Forward source message not found." } };
      }
    }

    const insert = await pool.query(
      `INSERT INTO messages (chat_id, sender_user_id, body, reply_to_message_id, forwarded_from_message_id)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid)
       RETURNING id, created_at, reply_to_message_id, forwarded_from_message_id`,
      [chat.id, actor.id, cleanBody || "(Attachment)", replyToMessageId, forwardedFromMessageId]
    );

    const createdAt = insert.rows[0]?.created_at
      ? new Date(insert.rows[0].created_at).toISOString()
      : new Date().toISOString();

    let sender = { id: actor.id, name: actor.name || null, role: actor.role || null };
    try {
      const userRes = await pool.query(
        `SELECT u.id, u.first_name, u.last_name,
                (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
         FROM users u WHERE u.id = $1::uuid LIMIT 1`,
        [String(actor.id)]
      );
      if (userRes.rows && userRes.rows[0]) {
        const row = userRes.rows[0];
        sender = {
          id: row.id,
          name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unknown",
          role: row.role || null
        };
      }
    } catch (_error) {
      // Keep actor fallback.
    }

    const createdAttachments = await createAttachmentRows(insert.rows[0]?.id, chat.id, cleanAttachments);
    const attachmentMap = new Map([[String(insert.rows[0]?.id), createdAttachments]]);
    const relatedMap = await hydrateMessagePreviews([replyToMessageId, forwardedFromMessageId]);

    const newMessage = await buildMessagePayload(
      {
        id: insert.rows[0]?.id,
        chat_id: chat.id,
        sender_user_id: actor.id,
        body: cleanBody,
        is_deleted: false,
        created_at: createdAt,
        updated_at: createdAt,
        reply_to_message_id: insert.rows[0]?.reply_to_message_id || replyToMessageId,
        forwarded_from_message_id: insert.rows[0]?.forwarded_from_message_id || forwardedFromMessageId,
        sender_name: sender?.name || "Unknown",
        sender_role: sender?.role || null
      },
      actor.id,
      { attachmentMap, relatedMap }
    );

    newMessage.isRead = true;
    newMessage.updatedAt = createdAt;

    // broadcast to room
    try {
      const io = socketUtils.getIo();
      if (io) io.to(chat.id).emit("message.created", newMessage);
    } catch (e) {
      console.warn("[messages] socket emit failed", e.message);
    }

    // Send notification to chat members who aren't in the room (they'll get real-time notif)
    try {
      const io = socketUtils.getIo();
      if (io) {
        const membersRes = await pool.query(
          "SELECT user_id FROM chat_members WHERE chat_id = $1",
          [chat.id]
        );
        const memberIds = (membersRes.rows || []).map(r => r.user_id);
        
        // Get sender name for notification
        const senderName = sender?.name || "Someone";
        const isGroupChat = chat.chat_type !== "DIRECT";
        
        let chatName = chat.name || "Chat";
        // For direct chats, get the other participant's name
        if (!isGroupChat) {
          const otherMemberId = memberIds.find(id => String(id) !== String(actor.id));
          if (otherMemberId) {
            const userRes = await pool.query(
              "SELECT first_name, last_name FROM users WHERE id = $1",
              [otherMemberId]
            );
            if (userRes.rows?.[0]) {
              chatName = `${userRes.rows[0].first_name || ""} ${userRes.rows[0].last_name || ""}`.trim() || "Chat";
            }
          }
        }
        
        const notifTitle = isGroupChat 
          ? `${senderName} in ${chatName}` 
          : chatName;
        const notifBody = cleanBody || (createdAttachments.length ? `Sent ${createdAttachments.length} file(s)` : "Sent a message");
        
        for (const memberId of memberIds) {
          if (String(memberId) === String(actor.id)) continue; // Skip sender
          // Emit to user's personal room (they join with their userId)
          io.to(String(memberId)).emit("notification", {
            id: `msg-${newMessage.id}`,
            type: "message",
            title: notifTitle,
            subtitle: notifBody,
            timestamp: createdAt,
            link: "/chat"
          });
        }
      }
    } catch (e) {
      console.warn("[messages] notification emit failed", e.message);
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

async function getAttachment(user, chatId, attachmentId) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  if (!isValidUuid(chatId) || !isValidUuid(attachmentId)) {
    return { status: 400, body: { message: "Invalid ID." } };
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
      `SELECT ma.id, ma.file_name, ma.mime_type, ma.file_data
       FROM message_attachments ma
       JOIN messages m ON m.id = ma.message_id
       WHERE ma.id = $1::uuid AND m.chat_id = $2::uuid`,
      [attachmentId, chat.id]
    );

    if (!res.rows || !res.rows[0]) {
      return { status: 404, body: { message: "Attachment not found." } };
    }

    const row = res.rows[0];
    return {
      status: 200,
      body: {
        attachment: {
          fileName: row.file_name,
          mimeType: row.mime_type,
          fileData: row.file_data
        }
      }
    };
  } catch (err) {
    console.error("[messages] getAttachment failed", err);
    return { status: 500, body: { message: "Failed to get attachment." } };
  }
}

module.exports = {
  listChatMessages,
  createChatMessage,
  createChatMessageWithAttachments,
  updateChatMessage,
  deleteChatMessage,
  getAttachment
};
