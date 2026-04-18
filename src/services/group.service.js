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

  const pair = [sender.role || '', target.role || ''].sort().join('-');

  if (pair === 'STUDENT-STUDENT') return false;
  if (pair === 'STUDENT-TEACHER') {
    const student = sender.role === 'STUDENT' ? sender : target;
    const teacher = sender.role === 'TEACHER' ? sender : target;
    return await studentCanMessageTeacher(student, teacher);
  }
  if (pair === 'COORDINATOR-STUDENT') return sameClassGroup(sender, target);
  if (pair === 'TEACHER-TEACHER') return true;
  if (pair === 'COORDINATOR-TEACHER') return true;
  if (pair === 'COORDINATOR-COORDINATOR') return true;

  return false;
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

    return {
      ...chat,
      title,
      members,
      messageCount: persistedCount,
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
          // emit socket event so clients see the initial message in real-time
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
              io.emit('message.created', newMessage);
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

module.exports = {
  getUserById,
  canAccessChat,
  formatChatForUser,
  resolveActor,
  listAllowedContacts,
  listUserChats,
  createOrGetDirectChat,
  getChatById,
  canDirectMessage
};
