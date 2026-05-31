const pool = require("../config/db");
const chatService = require("./chat.service");
const socketUtils = require("../socket");
const adminService = require("./admin.service");

async function resolveActor(user) {
  return chatService.resolveActor(user);
}

function emitNotificationRead(userId, payload) {
  try {
    const io = socketUtils.getIo();
    if (io && userId && payload) {
      io.to(String(userId)).emit("notification.read", payload);
    }
  } catch (e) {
    console.warn("[course] notification.read emit failed", e.message);
  }
}

async function formatCourse(course) {
  if (!course) return null;
  const courseId = String(course.id);

  // resolve a teacher for the course (first active assignment)
  let teacher = null;
  try {
    const tRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM course_teachers ct
       JOIN users u ON u.id = ct.user_id
       WHERE ct.course_id::text = $1 AND (ct.unassigned_at IS NULL OR ct.unassigned_at >= NOW())
       ORDER BY ct.assigned_at LIMIT 1`,
      [courseId]
    );
    if (tRes.rows && tRes.rows.length) {
      const r = tRes.rows[0];
      teacher = { id: r.id, name: `${r.first_name || ""} ${r.last_name || ""}`.trim(), role: r.role };
    }
  } catch (e) {
    console.error('[course] formatCourse teacher lookup failed', e.message);
  }

  // announcement count
  let announcementCount = 0;
  try {
    const aRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM announcement_targets t JOIN announcements a ON a.id = t.announcement_id WHERE t.target_type = 'COURSE' AND t.target_value = $1`,
      [courseId]
    );
    announcementCount = Number(aRes.rows[0]?.cnt || 0);
  } catch (e) {
    console.error('[course] formatCourse announcement count failed', e.message);
  }

  // attachment count (announcement attachments targeting this course)
  let attachmentCount = 0;
  try {
    const atRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM announcement_attachments aa JOIN announcement_targets t ON t.announcement_id = aa.announcement_id WHERE t.target_type = 'COURSE' AND t.target_value = $1`,
      [courseId]
    );
    attachmentCount = Number(atRes.rows[0]?.cnt || 0);
  } catch (e) {
    console.error('[course] formatCourse attachment count failed', e.message);
  }

  // student count (students in this course's class_group)
  let studentCount = 0;
  if (course.class_group_id) {
    try {
      const sRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt
         FROM student_profiles sp
         WHERE sp.class_group_id::text = $1`,
        [course.class_group_id]
      );
      studentCount = Number(sRes.rows[0]?.cnt || 0);
    } catch (e) {
      console.error('[course] formatCourse student count failed', e.message);
    }
  }

  return {
    id: course.id,
    code: course.code,
    title: course.title,
    description: course.description,
    classGroupId: course.class_group_id || null,
    classGroupCode: course.class_group_code || null,
    isCourseChatEnabled: Boolean(course.is_course_chat_enabled),
    teacher,
    announcementCount,
    attachmentCount,
    studentCount,
    createdAt: course.created_at || null,
    updatedAt: course.updated_at || null
  };
}

async function listVisibleCourses(user) {
  const actor = await resolveActor(user);
  if (!actor) return [];

  try {
    let rows = [];

    if (actor.role === 'TEACHER') {
      const res = await pool.query(
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.is_course_chat_enabled, c.created_at, c.updated_at
         FROM courses c
         JOIN class_groups cg ON cg.id = c.class_group_id
         JOIN course_teachers ct ON ct.course_id = c.id
         WHERE ct.user_id::text = $1 AND (ct.unassigned_at IS NULL OR ct.unassigned_at >= NOW())`,
        [String(actor.id)]
      );
      rows = res.rows || [];
    } else if (actor.role === 'ADMIN') {
      const res = await pool.query(
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.is_course_chat_enabled, c.created_at, c.updated_at
         FROM courses c JOIN class_groups cg ON cg.id = c.class_group_id ORDER BY c.title`);
      rows = res.rows || [];
    } else {
      // STUDENT / COORDINATOR default to class group membership
      if (!actor.classGroupId) return [];
      const res = await pool.query(
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.is_course_chat_enabled, c.created_at, c.updated_at
         FROM courses c JOIN class_groups cg ON cg.id = c.class_group_id
         WHERE c.class_group_id::text = $1 ORDER BY c.title`,
        [String(actor.classGroupId)]
      );
      rows = res.rows || [];
    }

    const formatted = await Promise.all(rows.map(formatCourse));
    return formatted;
  } catch (e) {
    console.error('[course] listVisibleCourses failed', e.message);
    return [];
  }
}

async function getCourseById(courseId) {
  try {
    const res = await pool.query(
      `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.is_course_chat_enabled, c.created_at, c.updated_at
       FROM courses c JOIN class_groups cg ON cg.id = c.class_group_id
       WHERE c.id::text = $1 LIMIT 1`,
      [String(courseId)]
    );
    return res.rows && res.rows[0] ? res.rows[0] : null;
  } catch (e) {
    console.error('[course] getCourseById failed', e.message);
    return null;
  }
}

async function listAllCourses() {
  try {
    const res = await pool.query(
      `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.is_course_chat_enabled, c.created_at, c.updated_at
       FROM courses c JOIN class_groups cg ON cg.id = c.class_group_id ORDER BY c.title`
    );
    const rows = res.rows || [];
    return await Promise.all(rows.map(formatCourse));
  } catch (e) {
    console.error('[course] listAllCourses failed', e.message);
    return [];
  }
}

async function listCourseAnnouncements(courseId) {
  try {
    const res = await pool.query(
      `SELECT a.id, a.title, a.body, a.created_at, a.created_by_user_id,
              u.first_name, u.last_name
       FROM announcements a
       JOIN announcement_targets t ON t.announcement_id = a.id
       LEFT JOIN users u ON u.id = a.created_by_user_id
       WHERE t.target_type = 'COURSE' AND t.target_value = $1
       ORDER BY a.created_at DESC`,
      [String(courseId)]
    );

    const announcements = [];
    for (const r of (res.rows || [])) {
      // Fetch attachments for this announcement
      let attachments = [];
      try {
        const attRes = await pool.query(
          `SELECT id, file_name, file_url, mime_type, file_size FROM announcement_attachments WHERE announcement_id = $1`,
          [r.id]
        );
        attachments = (attRes.rows || []).map((a) => ({
          id: a.id,
          title: a.file_name,
          url: a.file_url,
          type: a.mime_type,
          size: a.file_size
        }));
      } catch { /* ignore */ }

      announcements.push({
        id: r.id,
        title: r.title,
        body: r.body,
        priority: 'NORMAL',
        createdAt: r.created_at,
        createdBy: r.created_by_user_id,
        authorName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
        authorId: r.created_by_user_id,
        attachments
      });
    }
    return announcements;
  } catch (e) {
    console.error('[course] listCourseAnnouncements failed', e.message);
    return [];
  }
}

function normalizeAnnouncementTargets(payload = {}) {
  const departmentIds = Array.isArray(payload.departmentIds) ? payload.departmentIds : [];
  const classGroupIds = Array.isArray(payload.classGroupIds) ? payload.classGroupIds : [];
  return [
    ...departmentIds.map((value) => ({ targetType: 'DEPARTMENT', targetValue: String(value) })),
    ...classGroupIds.map((value) => ({ targetType: 'CLASS_GROUP', targetValue: String(value) }))
  ];
}

async function listVisibleAnnouncements(user) {
  const actor = await chatService.resolveActor(user);
  if (!actor) return [];

  try {
    const res = await pool.query(
      `SELECT a.id, a.title, a.body, a.priority, a.created_by_user_id, a.created_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS author_name,
              u.email AS author_email,
              ar.read_at
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by_user_id
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id::text = $1
       WHERE a.scope = 'GLOBAL'
       ORDER BY a.created_at DESC`,
      [String(actor.id)]
    );

    const items = [];
    for (const row of (res.rows || [])) {
      const targetsRes = await pool.query(
        `SELECT target_type, target_value
         FROM announcement_targets
         WHERE announcement_id = $1
         ORDER BY target_type, target_value`,
        [row.id]
      );

      const attachmentsRes = await pool.query(
        `SELECT id, file_name, file_url, mime_type, file_size
         FROM announcement_attachments
         WHERE announcement_id = $1
         ORDER BY file_name`,
        [row.id]
      );

      const targets = [];
      for (const target of (targetsRes.rows || [])) {
        let label = target.target_value;
        if (target.target_type === 'DEPARTMENT') {
          const dept = await pool.query(`SELECT name, code FROM departments WHERE id::text = $1 LIMIT 1`, [String(target.target_value)]);
          label = dept.rows[0] ? dept.rows[0].name || dept.rows[0].code || target.target_value : target.target_value;
        } else if (target.target_type === 'CLASS_GROUP') {
          const group = await pool.query(`SELECT name, code FROM class_groups WHERE id::text = $1 LIMIT 1`, [String(target.target_value)]);
          label = group.rows[0] ? `${group.rows[0].code}${group.rows[0].name ? ` - ${group.rows[0].name}` : ''}` : target.target_value;
        }

        targets.push({
          type: target.target_type,
          value: target.target_value,
          label
        });
      }

      items.push({
        id: row.id,
        title: row.title,
        body: row.body,
        priority: row.priority || 'NORMAL',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        createdBy: row.created_by_user_id,
        authorId: row.created_by_user_id,
        authorName: row.author_name || 'Unknown',
        authorEmail: row.author_email || null,
        read: Boolean(row.read_at),
        targets,
        attachments: (attachmentsRes.rows || []).map((attachment) => ({
          id: attachment.id,
          title: attachment.file_name,
          url: attachment.file_url,
          type: attachment.mime_type,
          size: attachment.file_size
        }))
      });
    }

    return items;
  } catch (error) {
    console.error('[course] listVisibleAnnouncements failed', error.message);
    return [];
  }
}

async function getAnnouncementAudienceOptions(user) {
  const actor = await chatService.resolveActor(user);
  if (!actor) {
    return { canCreate: false, departments: [], classGroups: [] };
  }

  const canCreate = ['ADMIN', 'COORDINATOR'].includes(String(actor.role || '').toUpperCase());
  if (!canCreate) {
    return { canCreate: false, departments: [], classGroups: [] };
  }

  const [departments, classGroups] = await Promise.all([
    actor.role === 'ADMIN' ? adminService.getAllDepartments() : Promise.resolve([]),
    actor.role === 'ADMIN'
      ? adminService.getAllClassGroups()
      : pool.query(
          `SELECT id, code, name FROM class_groups WHERE coordinator_user_id::text = $1 ORDER BY code`,
          [String(actor.id)]
        ).then((result) => result.rows || [])
  ]);

  return {
    canCreate: true,
    departments: (departments || []).map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name
    })),
    classGroups: (classGroups || []).map((group) => ({
      id: group.id,
      code: group.code,
      name: group.name
    }))
  };
}

async function createGlobalAnnouncement(user, payload = {}, files = []) {
  const actor = await chatService.resolveActor(user);
  if (!actor || !['ADMIN', 'COORDINATOR'].includes(String(actor.role || '').toUpperCase())) {
    return { status: 403, body: { message: 'Announcement publishing requires admin or coordinator access.' } };
  }

  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  if (!title || !body) {
    return { status: 400, body: { message: 'title and body are required' } };
  }

  const targets = normalizeAnnouncementTargets(payload);
  if (!targets.length) {
    return { status: 400, body: { message: 'At least one audience target is required.' } };
  }

  try {
    const insert = await pool.query(
      `INSERT INTO announcements (scope, title, body, priority, status, created_by_user_id, published_at)
       VALUES ('GLOBAL', $1, $2, 'NORMAL', 'PUBLISHED', $3::uuid, NOW())
       RETURNING id, created_at`,
      [title, body, String(actor.id)]
    );

    const announcementId = insert.rows[0]?.id;
    for (const target of targets) {
      await pool.query(
        `INSERT INTO announcement_targets (announcement_id, target_type, target_value)
         VALUES ($1::uuid, $2, $3)`,
        [announcementId, target.targetType, target.targetValue]
      );
    }

    const createdAttachments = [];
    for (const file of (files || [])) {
      const attachmentInsert = await pool.query(
        `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size, file_data)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id, file_name, mime_type, file_size`,
        [
          announcementId,
          file.fileName || file.originalname || 'Attachment',
          file.fileUrl || `/api/announcements/attachments/${announcementId}/${encodeURIComponent(file.fileName || file.originalname || 'attachment')}`,
          file.mimeType || file.mimetype || null,
          Number.isFinite(Number(file.fileSize || file.size)) ? Number(file.fileSize || file.size) : null,
          file.content || file.buffer || null
        ]
      );
      const row = attachmentInsert.rows[0];
      createdAttachments.push({
        id: row.id,
        title: row.file_name,
        type: row.mime_type,
        size: row.file_size
      });
    }

    return {
      status: 201,
      body: {
        id: announcementId,
        title,
        body,
        priority: 'NORMAL',
        createdAt: insert.rows[0]?.created_at ? new Date(insert.rows[0].created_at).toISOString() : new Date().toISOString(),
        createdBy: actor.id,
        authorId: actor.id,
        authorName: actor.name || 'Unknown',
        attachments: createdAttachments,
        targets: targets.map((target) => ({ type: target.targetType, value: target.targetValue }))
      }
    };
  } catch (error) {
    console.error('[course] createGlobalAnnouncement failed', error.message);
    return { status: 500, body: { message: 'Failed to create announcement.' } };
  }
}

async function updateGlobalAnnouncement(user, announcementId, payload = {}, files = []) {
  const actor = await chatService.resolveActor(user);
  if (!actor || !['ADMIN', 'COORDINATOR'].includes(String(actor.role || '').toUpperCase())) {
    return { status: 403, body: { message: 'Announcement editing requires admin or coordinator access.' } };
  }

  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  if (!title || !body) {
    return { status: 400, body: { message: 'title and body are required' } };
  }

  try {
    const existing = await pool.query(`SELECT id, created_by_user_id FROM announcements WHERE id::text = $1 AND scope = 'GLOBAL' LIMIT 1`, [String(announcementId)]);
    if (!existing.rows.length) return { status: 404, body: { message: 'Announcement not found.' } };
    if (String(actor.role || '').toUpperCase() !== 'ADMIN' && String(existing.rows[0].created_by_user_id) !== String(actor.id)) {
      return { status: 403, body: { message: 'You can only edit your own announcement.' } };
    }

    await pool.query(
      `UPDATE announcements
       SET title = $2, body = $3, updated_at = NOW()
       WHERE id::text = $1`,
      [String(announcementId), title, body]
    );

    const targets = normalizeAnnouncementTargets(payload);
    await pool.query(`DELETE FROM announcement_targets WHERE announcement_id::text = $1`, [String(announcementId)]);
    for (const target of targets) {
      await pool.query(
        `INSERT INTO announcement_targets (announcement_id, target_type, target_value)
         VALUES ($1::uuid, $2, $3)`,
        [String(announcementId), target.targetType, target.targetValue]
      );
    }

    const createdAttachments = [];
    for (const file of (files || [])) {
      const attachmentInsert = await pool.query(
        `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size, file_data)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id, file_name, mime_type, file_size`,
        [
          String(announcementId),
          file.fileName || file.originalname || 'Attachment',
          file.fileUrl || `/api/announcements/attachments/${announcementId}/${encodeURIComponent(file.fileName || file.originalname || 'attachment')}`,
          file.mimeType || file.mimetype || null,
          Number.isFinite(Number(file.fileSize || file.size)) ? Number(file.fileSize || file.size) : null,
          file.content || file.buffer || null
        ]
      );
      const row = attachmentInsert.rows[0];
      createdAttachments.push({
        id: row.id,
        title: row.file_name,
        type: row.mime_type,
        size: row.file_size
      });
    }

    return {
      status: 200,
      body: { success: true, attachments: createdAttachments }
    };
  } catch (error) {
    console.error('[course] updateGlobalAnnouncement failed', error.message);
    return { status: 500, body: { message: 'Failed to update announcement.' } };
  }
}

async function deleteGlobalAnnouncement(user, announcementId) {
  const actor = await chatService.resolveActor(user);
  if (!actor || !['ADMIN', 'COORDINATOR'].includes(String(actor.role || '').toUpperCase())) {
    return { status: 403, body: { message: 'Announcement deletion requires admin or coordinator access.' } };
  }

  try {
    const existing = await pool.query(`SELECT id, created_by_user_id FROM announcements WHERE id::text = $1 AND scope = 'GLOBAL' LIMIT 1`, [String(announcementId)]);
    if (!existing.rows.length) return { status: 404, body: { message: 'Announcement not found.' } };
    if (String(actor.role || '').toUpperCase() !== 'ADMIN' && String(existing.rows[0].created_by_user_id) !== String(actor.id)) {
      return { status: 403, body: { message: 'You can only delete your own announcement.' } };
    }

    await pool.query(`DELETE FROM announcements WHERE id::text = $1`, [String(announcementId)]);
    return { status: 200, body: { success: true } };
  } catch (error) {
    console.error('[course] deleteGlobalAnnouncement failed', error.message);
    return { status: 500, body: { message: 'Failed to delete announcement.' } };
  }
}

async function markGlobalAnnouncementRead(userId, announcementId) {
  if (!userId || !announcementId) return;
  try {
    await pool.query(
      `INSERT INTO announcement_reads (user_id, announcement_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [String(userId), String(announcementId)]
    );
    emitNotificationRead(userId, { announcementIds: [String(announcementId)] });
  } catch (error) {
    console.error('[course] markGlobalAnnouncementRead failed', error.message);
  }
}

async function createCourseAnnouncement(user, courseId, payload) {
  const actor = await chatService.resolveActor(user);
  if (!actor || actor.role !== 'TEACHER') {
    return { status: 403, body: { message: 'Only teachers can publish course announcements.' } };
  }

  const course = await getCourseById(courseId);
  if (!course) return { status: 404, body: { message: 'Course not found' } };

  try {
    const rel = await pool.query(`SELECT 1 FROM course_teachers WHERE course_id::text = $1 AND user_id::text = $2 LIMIT 1`, [String(courseId), String(actor.id)]);
    if (!rel.rows || rel.rows.length === 0) {
      return { status: 403, body: { message: 'You can only publish in your own course.' } };
    }
  } catch (e) {
    console.error('[course] verify teacher failed', e.message);
    return { status: 500, body: { message: 'Failed to verify course ownership.' } };
  }

  const title = payload.title;
  const body = payload.body;
  const priority = 'NORMAL';
  if (!title || !body) return { status: 400, body: { message: 'title and body are required' } };

  // Allow a single attachment payload or an attachments array.
  const attachmentInputs = Array.isArray(payload.attachments)
    ? payload.attachments
    : (payload.attachmentUrl || payload.attachmentName)
      ? [{
          fileUrl: payload.attachmentUrl,
          fileName: payload.attachmentName,
          mimeType: payload.attachmentType,
          fileSize: payload.attachmentSize
        }]
      : [];

  try {
    const insert = await pool.query(
      `INSERT INTO announcements (scope, title, body, priority, status, created_by_user_id, published_at)
       VALUES ('COURSE', $1, $2, $3::announcement_priority_enum, 'PUBLISHED', $4, NOW())
       RETURNING id, created_at`,
      [title, body, priority, String(actor.id)]
    );
    const announcementId = insert.rows[0]?.id;
    await pool.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_value) VALUES ($1::uuid, 'COURSE', $2)`, [announcementId, String(courseId)]);

    const createdAttachments = [];
    for (const rawAttachment of attachmentInputs) {
      const fileUrl = String(rawAttachment?.fileUrl || '').trim();
      const fileName = String(rawAttachment?.fileName || '').trim() || 'Attachment';
      if (!fileUrl) continue;

      const attachmentInsert = await pool.query(
        `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING id, file_name, file_url, mime_type, file_size`,
        [
          announcementId,
          fileName,
          fileUrl,
          rawAttachment?.mimeType ? String(rawAttachment.mimeType) : null,
          Number.isFinite(Number(rawAttachment?.fileSize)) ? Number(rawAttachment.fileSize) : null
        ]
      );

      const row = attachmentInsert.rows[0];
      createdAttachments.push({
        id: row.id,
        title: row.file_name,
        url: row.file_url,
        type: row.mime_type,
        size: row.file_size
      });
    }

    const createdAt = insert.rows[0]?.created_at ? new Date(insert.rows[0].created_at).toISOString() : new Date().toISOString();
    return {
      status: 201,
      body: {
        id: announcementId,
        courseId,
        title,
        body,
        priority,
        createdAt,
        createdBy: actor.id,
        attachments: createdAttachments
      }
    };
  } catch (e) {
    console.error('[course] createCourseAnnouncement failed', e.message);
    return { status: 500, body: { message: 'Failed to create announcement.' } };
  }
}

async function createCourseAnnouncementWithFiles(user, courseId, payload, files) {
  const actor = await chatService.resolveActor(user);
  if (!actor || actor.role !== 'TEACHER') {
    return { status: 403, body: { message: 'Only teachers can publish course announcements.' } };
  }

  const course = await getCourseById(courseId);
  if (!course) return { status: 404, body: { message: 'Course not found' } };

  try {
    const rel = await pool.query(`SELECT 1 FROM course_teachers WHERE course_id::text = $1 AND user_id::text = $2 LIMIT 1`, [String(courseId), String(actor.id)]);
    if (!rel.rows || rel.rows.length === 0) {
      return { status: 403, body: { message: 'You can only publish in your own course.' } };
    }
  } catch (e) {
    console.error('[course] verify teacher failed', e.message);
    return { status: 500, body: { message: 'Failed to verify course ownership.' } };
  }

  const title = payload.title;
  const body = payload.body;
  const priority = 'NORMAL';
  if (!title || !body) return { status: 400, body: { message: 'title and body are required' } };

  try {
    const insert = await pool.query(
      `INSERT INTO announcements (scope, title, body, priority, status, created_by_user_id, published_at)
       VALUES ('COURSE', $1, $2, $3::announcement_priority_enum, 'PUBLISHED', $4, NOW())
       RETURNING id, created_at`,
      [title, body, priority, String(actor.id)]
    );
    const announcementId = insert.rows[0]?.id;
    await pool.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_value) VALUES ($1::uuid, 'COURSE', $2)`, [announcementId, String(courseId)]);

    const createdAttachments = [];
    for (const file of (files || [])) {
      const attachmentInsert = await pool.query(
        `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size, file_data)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id, file_name, mime_type, file_size`,
        [
          announcementId,
          file.fileName,
          `/api/courses/${courseId}/announcements/attachments/${announcementId}/${file.fileName}`,
          file.mimeType || null,
          Number.isFinite(file.fileSize) ? file.fileSize : null,
          file.content
        ]
      );
      const row = attachmentInsert.rows[0];
      createdAttachments.push({
        id: row.id,
        title: row.file_name,
        type: row.mime_type,
        size: row.file_size
      });
    }

    const createdAt = insert.rows[0]?.created_at ? new Date(insert.rows[0].created_at).toISOString() : new Date().toISOString();
    return {
      status: 201,
      body: {
        id: announcementId,
        courseId,
        title,
        body,
        priority,
        createdAt,
        createdBy: actor.id,
        attachments: createdAttachments
      }
    };
  } catch (e) {
    console.error('[course] createCourseAnnouncementWithFiles failed', e.message);
    return { status: 500, body: { message: 'Failed to create announcement.' } };
  }
}

async function listCourseAttachments(courseId) {
  try {
    const res = await pool.query(
      `SELECT aa.id, aa.announcement_id, aa.file_name AS title, aa.file_url AS url, aa.mime_type AS type, aa.file_size AS size, a.created_at AS uploaded_at
       FROM announcement_attachments aa
       JOIN announcement_targets t ON t.announcement_id = aa.announcement_id
       JOIN announcements a ON a.id = aa.announcement_id
       WHERE t.target_type = 'COURSE' AND t.target_value = $1
       ORDER BY a.created_at DESC`,
      [String(courseId)]
    );
    return (res.rows || []).map((r) => ({
      id: r.id,
      announcementId: r.announcement_id,
      title: r.title,
      url: r.url,
      type: r.type,
      size: r.size,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null
    }));
  } catch (e) {
    console.error('[course] listCourseAttachments failed', e.message);
    return [];
  }
}

async function getAnnouncementAttachment(attachmentId) {
  try {
    const res = await pool.query(
      `SELECT id, file_name, mime_type, file_size, file_data, file_url FROM announcement_attachments WHERE id::text = $1 LIMIT 1`,
      [String(attachmentId)]
    );
    if (!res.rows || !res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      fileData: row.file_data,
      fileUrl: row.file_url
    };
  } catch (e) {
    console.error('[course] getAnnouncementAttachment failed', e.message);
    return null;
  }
}

// ─── Announcement Read Tracking ────────────────────────────

async function markAnnouncementsRead(userId, announcementIds) {
  if (!userId || !Array.isArray(announcementIds) || !announcementIds.length) return;
  try {
    const values = announcementIds.map((aid, i) =>
      `($1, $${i + 2})`
    ).join(', ');
    const params = [String(userId), ...announcementIds.map(String)];
    await pool.query(
      `INSERT INTO announcement_reads (user_id, announcement_id) VALUES ${values} ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      params
    );
    emitNotificationRead(userId, { announcementIds: announcementIds.map(String) });
  } catch (e) {
    console.error('[course] markAnnouncementsRead failed', e.message);
  }
}

async function markCourseAnnouncementsRead(userId, courseId) {
  if (!userId || !courseId) return;
  try {
    const result = await pool.query(
      `INSERT INTO announcement_reads (user_id, announcement_id)
       SELECT $1::uuid, a.id FROM announcements a
       JOIN announcement_targets t ON t.announcement_id = a.id
       WHERE t.target_type = 'COURSE' AND t.target_value = $2
       ON CONFLICT (user_id, announcement_id) DO NOTHING
       RETURNING announcement_id`,
      [String(userId), String(courseId)]
    );
    const announcementIds = (result.rows || []).map((row) => row.announcement_id).filter(Boolean);
    if (announcementIds.length) {
      emitNotificationRead(userId, { announcementIds: announcementIds.map(String) });
    }
  } catch (e) {
    console.error('[course] markCourseAnnouncementsRead failed', e.message);
  }
}

async function getReadAnnouncementIds(userId) {
  try {
    const res = await pool.query(
      `SELECT announcement_id FROM announcement_reads WHERE user_id::text = $1`,
      [String(userId)]
    );
    return new Set((res.rows || []).map(r => r.announcement_id));
  } catch (e) {
    console.error('[course] getReadAnnouncementIds failed', e.message);
    return new Set();
  }
}

async function getUnreadCountByCourse(userId) {
  try {
    const res = await pool.query(
      `SELECT t.target_value AS course_id, COUNT(a.id)::int AS unread_count
       FROM announcements a
       JOIN announcement_targets t ON t.announcement_id = a.id
       LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id::text = $1
       WHERE t.target_type = 'COURSE' AND r.id IS NULL
       GROUP BY t.target_value`,
      [String(userId)]
    );
    const map = {};
    for (const row of (res.rows || [])) {
      map[row.course_id] = row.unread_count;
    }
    return map;
  } catch (e) {
    console.error('[course] getUnreadCountByCourse failed', e.message);
    return {};
  }
}

module.exports = {
  formatCourse,
  listVisibleCourses,
  listAllCourses,
  getCourseById,
  listCourseAnnouncements,
  createCourseAnnouncement,
  createCourseAnnouncementWithFiles,
  listVisibleAnnouncements,
  getAnnouncementAudienceOptions,
  listCourseAttachments,
  getAnnouncementAttachment,
  resolveActor,
  createGlobalAnnouncement,
  updateGlobalAnnouncement,
  deleteGlobalAnnouncement,
  markGlobalAnnouncementRead,
  markAnnouncementsRead,
  markCourseAnnouncementsRead,
  getReadAnnouncementIds,
  getUnreadCountByCourse
};

