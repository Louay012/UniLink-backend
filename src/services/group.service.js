const pool = require("../config/db");

async function resolveActor(user) {
  if (!user) return null;

  // If we have an id, prefer that
  if (user.id) {
    const u = await getUserById(user.id);
    if (u) return u;
  }

  // If a role hint is provided, try to find any user with that role
  if (user.role) {
    try {
      const res = await pool.query(
        `SELECT u.id, u.first_name, u.last_name,
                (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role,
                sp.class_group_id, cg.code AS class_group_code
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN class_groups cg ON cg.id = sp.class_group_id
         WHERE EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = $1)
         LIMIT 1`,
        [String(user.role).toUpperCase()]
      );
      if (res.rows && res.rows.length) {
        const row = res.rows[0];
        return {
          id: row.id,
          name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
          role: row.role || String(user.role).toUpperCase(),
          classGroupId: row.class_group_id || null,
          classGroupCode: row.class_group_code || null
        };
      }
    } catch (e) {
      console.error('[group] resolveActor by role failed', e.message);
    }
  }

  return null;
}

async function getUserById(userId) {
  if (!userId) return null;
  try {
    const res = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role,
              sp.class_group_id, cg.code AS class_group_code
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN class_groups cg ON cg.id = sp.class_group_id
       WHERE u.id::text = $1 LIMIT 1`,
      [String(userId)]
    );
    if (!res.rows || !res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
      role: row.role || null,
      classGroupId: row.class_group_id || null,
      classGroupCode: row.class_group_code || null
    };
  } catch (e) {
    console.error('[group] getUserById failed', e.message);
    return null;
  }
}

function sameClassGroup(left, right) {
  return left && right && left.classGroupCode && left.classGroupCode === right.classGroupCode;
}

async function studentCanMessageTeacher(student, teacher) {
  if (!student || !teacher) return false;
  if (!student.classGroupId) return false;
  try {
    const res = await pool.query(
      `SELECT 1 FROM courses c JOIN course_teachers ct ON ct.course_id = c.id WHERE ct.user_id = $1 AND c.class_group_id::text = $2 LIMIT 1`,
      [teacher.id, String(student.classGroupId)]
    );
    return res.rows && res.rows.length > 0;
  } catch (e) {
    console.error('[group] studentCanMessageTeacher failed', e.message);
    return false;
  }
}

async function canDirectMessage(sender, target) {
  if (!sender || !target || sender.id === target.id) return false;
  return true;
}

async function canAccessChat(userId, chatId) {
  if (!userId || !chatId) return false;
  try {
    const res = await pool.query(`SELECT 1 FROM chat_members WHERE chat_id::text = $1 AND user_id::text = $2 LIMIT 1`, [String(chatId), String(userId)]);
    return res.rows && res.rows.length > 0;
  } catch (e) {
    console.error('[group] canAccessChat failed', e.message);
    return false;
  }
}

async function formatChatForUser(chat, userId) {
  if (!chat) return null;
  try {
    const memberRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id::text = $1`,
      [String(chat.id)]
    );

    const members = (memberRes.rows || [])
      .map((m) => ({ id: m.id, name: `${m.first_name || ''} ${m.last_name || ''}`.trim(), role: m.role || null }))
      .filter(Boolean);

    // last message
    let lastMessage = null;
    try {
      const lm = await pool.query(`SELECT id, sender_user_id, body, created_at FROM messages WHERE chat_id::text = $1 ORDER BY created_at DESC LIMIT 1`, [String(chat.id)]);
      if (lm.rows && lm.rows.length) {
        const row = lm.rows[0];
        lastMessage = { id: row.id, senderUserId: row.sender_user_id, body: row.body, createdAt: row.created_at ? new Date(row.created_at).toISOString() : null };
      }
    } catch (e) {
      lastMessage = null;
    }

    let title = chat.name;
    if (chat.chat_type === 'DIRECT') {
      const counterpart = members.find((m) => m.id !== userId);
      title = counterpart ? counterpart.name : 'Direct Chat';
    }

    let persistedCount = 0;
    try {
      const pc = await pool.query(`SELECT COUNT(*)::int AS cnt FROM messages WHERE chat_id::text = $1`, [String(chat.id)]);
      persistedCount = Number(pc.rows[0]?.cnt || 0);
    } catch (e) {
      persistedCount = 0;
    }

    let unreadCount = 0;
    try {
      const unreadRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM messages m
         WHERE m.chat_id::text = $1 AND m.sender_user_id::text != $2 AND m.created_at > COALESCE(
           (SELECT mr.read_at FROM message_reads mr WHERE mr.user_id::text = $2 AND mr.chat_id::text = $1),
           '1970-01-01'::timestamp
         )`,
        [String(chat.id), String(userId)]
      );
      unreadCount = Number(unreadRes.rows[0]?.cnt || 0);
    } catch (e) {
      unreadCount = 0;
    }

    return {
      ...chat,
      title,
      members,
      messageCount: persistedCount,
      unreadCount,
      lastMessage: lastMessage ? { id: lastMessage.id, senderUserId: lastMessage.senderUserId, body: lastMessage.body, createdAt: lastMessage.createdAt } : null
    };
  } catch (e) {
    console.error('[group] formatChatForUser failed', e.message);
    return { ...chat, members: [], messageCount: 0, lastMessage: null };
  }
}

async function listAllowedContacts(user) {
  const actor = await resolveActor(user);
  if (!actor) return [];

  try {
    const res = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role,
              sp.class_group_id, cg.code AS class_group_code
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN class_groups cg ON cg.id = sp.class_group_id
       WHERE u.id::text != $1`,
      [String(actor.id || '')]
    );

    const candidates = (res.rows || []).map((r) => ({ id: r.id, name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), role: r.role, classGroupId: r.class_group_id, classGroupCode: r.class_group_code }));

    const allowed = [];
    for (const c of candidates) {
      if (await canDirectMessage(actor, c)) allowed.push(c);
    }

    return allowed;
  } catch (e) {
    console.error('[group] listAllowedContacts failed', e.message);
    return [];
  }
}

async function listUserChats(user, courseId) {
  const actor = await resolveActor(user);
  if (!actor) return [];

  try {
    const params = [String(actor.id)];
    let courseFilter = '';
    if (courseId) {
      courseFilter = 'AND c.course_id::text = $2';
      params.push(String(courseId));
    }

    const q = `SELECT c.id, c.chat_type, c.name, c.class_group_id, c.course_id, c.created_by_user_id
               FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
               WHERE cm.user_id::text = $1 ${courseFilter}`;

    const res = await pool.query(q, params);
    const rows = res.rows || [];

    const formatted = [];
    for (const row of rows) {
      const f = await formatChatForUser(row, actor.id);
      formatted.push(f);
    }

    formatted.sort((left, right) => {
      const leftTime = left.lastMessage ? new Date(left.lastMessage.createdAt).getTime() : 0;
      const rightTime = right.lastMessage ? new Date(right.lastMessage.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });

    return formatted;
  } catch (e) {
    console.error('[group] listUserChats failed', e.message);
    return [];
  }
}

async function createOrGetDirectChat(user, targetUserId, initialMessage) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: 'Unable to resolve user context.' } };

  const target = await getUserById(targetUserId);
  if (!target) return { status: 404, body: { message: 'Target user not found.' } };

  if (!(await canDirectMessage(actor, target))) {
    return { status: 403, body: { message: 'Direct chat not allowed by messaging policy.' } };
  }

  try {
    // Look for existing DIRECT chat with both members
    const exists = await pool.query(
      `SELECT c.id, c.chat_type, c.name, c.class_group_id, c.course_id, c.created_by_user_id
       FROM chats c
       WHERE c.chat_type = 'DIRECT' AND
             EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = c.id AND cm.user_id::text = $1) AND
             EXISTS (SELECT 1 FROM chat_members cm2 WHERE cm2.chat_id = c.id AND cm2.user_id::text = $2)
       LIMIT 1`,
      [String(actor.id), String(target.id)]
    );

    let chatRow = exists.rows && exists.rows[0] ? exists.rows[0] : null;
    let wasCreated = false;
    if (!chatRow) {
      const created = await pool.query(
        `INSERT INTO chats (chat_type, name, class_group_id, course_id, created_by_user_id) VALUES ('DIRECT', NULL, NULL, NULL, $1) RETURNING id, chat_type, name, class_group_id, course_id, created_by_user_id`,
        [String(actor.id)]
      );
      chatRow = created.rows[0];
      wasCreated = true;

      // add members
      await pool.query(`INSERT INTO chat_members (chat_id, user_id, added_by_user_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, [chatRow.id, actor.id, actor.id]);
      await pool.query(`INSERT INTO chat_members (chat_id, user_id, added_by_user_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, [chatRow.id, target.id, actor.id]);
    }

    if (initialMessage) {
      try {
        const ins = await pool.query(`INSERT INTO messages (chat_id, sender_user_id, body) VALUES ($1::uuid, $2::uuid, $3) RETURNING id, created_at`, [chatRow.id, actor.id, initialMessage]);
        const createdAt = ins.rows[0]?.created_at ? new Date(ins.rows[0].created_at).toISOString() : new Date().toISOString();
        // emit socket event to the specific chat room
        try {
          const socketUtils = require('../socket');
          const io = socketUtils.getIo();
          if (io) {
            const newMessage = {
              id: ins.rows[0]?.id,
              chatId: chatRow.id,
              senderUserId: actor.id,
              body: initialMessage,
              createdAt,
              sender: { id: actor.id, name: actor.name || 'Unknown', role: actor.role || null }
            };
            io.to(chatRow.id).emit('message.created', newMessage);
          }
        } catch (e) {
          console.warn('[group] emit initial message failed', e.message);
        }
      } catch (e) {
        console.error('[group] insert initialMessage failed', e.message);
      }
    }

    return { status: wasCreated ? 201 : 200, body: { chat: await formatChatForUser(chatRow, actor.id) } };
  } catch (e) {
    console.error('[group] createOrGetDirectChat failed', e.message);
    return { status: 500, body: { message: 'Failed to create direct chat.' } };
  }
}

async function getChatById(chatId) {
  if (!chatId) return null;
  try {
    const res = await pool.query(`SELECT id, chat_type, name, class_group_id, course_id, created_by_user_id FROM chats WHERE id::text = $1 LIMIT 1`, [String(chatId)]);
    return res.rows && res.rows[0] ? res.rows[0] : null;
  } catch (e) {
    console.error('[group] getChatById failed', e.message);
    return null;
  }

}

async function markChatRead(user, chatId) {
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
    const latestMsg = await pool.query(
      "SELECT id FROM messages WHERE chat_id::text = $1 ORDER BY created_at DESC LIMIT 1",
      [chat.id]
    );

    const lastReadMessageId = latestMsg.rows[0]?.id || null;

    await pool.query(
      `INSERT INTO message_reads (user_id, chat_id, last_read_message_id, read_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, chat_id) 
       DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, read_at = EXCLUDED.read_at`,
      [actor.id, chat.id, lastReadMessageId]
    );

    try {
      const socketUtils = require('../socket');
      const io = socketUtils.getIo();
      if (io) io.to(chat.id).emit('chat.read', { chatId: chat.id, userId: actor.id });
    } catch (e) {
      console.warn('[group] emit chat.read failed', e.message);
    }

    return { status: 200, body: { message: "Chat marked as read." } };
  } catch (err) {
    console.error('[group] markChatRead failed', err);
    return { status: 500, body: { message: "Failed to mark chat as read." } };
  }
}

async function deleteChat(user, chatId) {
  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return { status: 404, body: { message: "Chat not found." } };
  }

  const roles = Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean);
  const isAdmin = roles.includes("ADMIN") || actor.role === "ADMIN";
  
  const hasAccess = isAdmin || (await canAccessChat(actor.id, chat.id));
  
  if (!hasAccess) {
    return { status: 403, body: { message: "You don't have permission to delete this chat." } };
  }

  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM message_reads WHERE chat_id::text = $1', [String(chat.id)]);
    await pool.query('DELETE FROM messages WHERE chat_id::text = $1', [String(chat.id)]);
    await pool.query('DELETE FROM chat_members WHERE chat_id::text = $1', [String(chat.id)]);
    await pool.query('DELETE FROM chats WHERE id::text = $1', [String(chat.id)]);
    await pool.query('COMMIT');

    try {
      const socketUtils = require('../socket');
      const io = socketUtils.getIo();
      if (io) {
        io.to(chat.id).emit('chat.deleted', { chatId: chat.id });
      }
    } catch (e) {
      console.warn('[group] emit chat.deleted failed', e.message);
    }

    return { status: 200, body: { message: "Chat deleted successfully." } };
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[group] deleteChat failed', err);
    return { status: 500, body: { message: "Failed to delete chat." } };
  }
}

module.exports = {
  getUserById,
  canAccessChat,
  formatChatForUser,
  resolveActor,
  listAllowedContacts,
  listUserChats,
  createOrGetDirectChat,
  getChatById,
  canDirectMessage,
  markChatRead,
  deleteChat
};
