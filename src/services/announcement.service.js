const pool = require("../config/db");
const chatService = require("./chat.service");
const socketUtils = require("../socket");

async function resolveActor(user) {
  return chatService.resolveActor(user);
}

function mapAnnouncementRow(row) {
  const targets = Array.isArray(row.targets) ? row.targets.filter(Boolean) : [];
  const attachments = Array.isArray(row.attachments) ? row.attachments.filter(Boolean) : [];

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status || "PUBLISHED",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    createdBy: row.created_by_user_id,
    authorId: row.created_by_user_id,
    authorName: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unknown",
    targets,
    attachments,
    read: Boolean(row.read_at)
  };
}

function normalizeFiles(files = []) {
  return (Array.isArray(files) ? files : []).map((file) => ({
    fileName: file.fileName || file.originalname || "Attachment",
    mimeType: file.mimeType || file.mimetype || null,
    fileSize: Number.isFinite(Number(file.fileSize ?? file.size)) ? Number(file.fileSize ?? file.size) : null,
    content: file.content || file.buffer || null
  }));
}

let attachmentDataColumnReadyPromise = null;

async function ensureAttachmentDataColumn() {
  if (!attachmentDataColumnReadyPromise) {
    attachmentDataColumnReadyPromise = pool.query(
      `ALTER TABLE announcement_attachments
       ADD COLUMN IF NOT EXISTS file_data BYTEA`
    ).catch((error) => {
      attachmentDataColumnReadyPromise = null;
      throw error;
    });
  }

  return attachmentDataColumnReadyPromise;
}

async function insertAttachments(announcementId, files = []) {
  const created = [];
  const normalizedFiles = normalizeFiles(files);
  if (!normalizedFiles.length) return created;

  await ensureAttachmentDataColumn();
  for (const file of normalizedFiles) {
    if (!file.content) continue;
    const inserted = await pool.query(
      `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size, file_data)
       VALUES ($1::uuid, $2, '', $3, $4, $5)
       RETURNING id, file_name, mime_type, file_size`,
      [String(announcementId), file.fileName, file.mimeType, file.fileSize, file.content]
    );
    const row = inserted.rows[0];
    await pool.query(
      `UPDATE announcement_attachments SET file_url = $1 WHERE id = $2`,
      [`/api/courses/announcements/attachments/${row.id}/download`, row.id]
    );
    created.push({
      id: row.id,
      title: row.file_name,
      url: `/api/courses/announcements/attachments/${row.id}/download`,
      type: row.mime_type,
      size: row.file_size
    });
  }
  return created;
}

async function getTargetUserIds(targets, authorId) {
  const departmentIds = targets.departmentIds || [];
  const classGroupIds = targets.classGroupIds || [];
  const res = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     WHERE u.id::text != $1
       AND (
         EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.code = 'ADMIN'
         )
         OR EXISTS (
           SELECT 1
           FROM student_profiles sp
           JOIN class_groups cg ON cg.id = sp.class_group_id
           WHERE sp.user_id = u.id
             AND (
               sp.class_group_id::text = ANY($2::text[])
               OR cg.department_id::text = ANY($3::text[])
             )
         )
         OR EXISTS (
           SELECT 1
           FROM course_teachers ct
           JOIN courses c ON c.id = ct.course_id
           JOIN class_groups cg ON cg.id = c.class_group_id
           WHERE ct.user_id = u.id
             AND (ct.unassigned_at IS NULL OR ct.unassigned_at >= NOW())
             AND (
               c.class_group_id::text = ANY($2::text[])
               OR cg.department_id::text = ANY($3::text[])
             )
         )
         OR EXISTS (
           SELECT 1
           FROM class_groups cg
           WHERE cg.coordinator_user_id = u.id
             AND (
               cg.id::text = ANY($2::text[])
               OR cg.department_id::text = ANY($3::text[])
             )
         )
       )`,
    [String(authorId), classGroupIds, departmentIds]
  );
  return (res.rows || []).map((row) => String(row.id));
}

async function emitAnnouncementNotifications(announcement, targets) {
  try {
    const io = socketUtils.getIo();
    if (!io || !announcement?.id) return;
    const userIds = await getTargetUserIds(targets, announcement.createdBy);
    for (const userId of userIds) {
      io.to(userId).emit("notification", {
        id: `global-ann-${announcement.id}`,
        announcementId: announcement.id,
        type: "announcement",
        title: announcement.title,
        subtitle: "Global announcement",
        timestamp: announcement.createdAt,
        link: "/announcements",
        read: false
      });
    }
  } catch (err) {
    console.warn("[announcements] notification emit failed", err.message);
  }
}

async function getAudienceForUser(actor, user = null) {
  const audience = { departmentIds: new Set(), classGroupIds: new Set() };
  if (!actor?.id) return audience;
  const roles = new Set([
    String(actor.role || "").toUpperCase(),
    ...((Array.isArray(user?.roles) ? user.roles : []).map((role) => String(role).toUpperCase()))
  ].filter(Boolean));

  if (actor.role === "ADMIN") {
    return audience;
  }

  if (actor.classGroupId) {
    audience.classGroupIds.add(String(actor.classGroupId));
    const dept = await pool.query(
      `SELECT department_id FROM class_groups WHERE id::text = $1 LIMIT 1`,
      [String(actor.classGroupId)]
    );
    if (dept.rows[0]?.department_id) audience.departmentIds.add(String(dept.rows[0].department_id));
  }

  if (roles.has("COORDINATOR")) {
    const res = await pool.query(
      `SELECT id, department_id FROM class_groups WHERE coordinator_user_id::text = $1`,
      [String(actor.id)]
    );
    for (const row of res.rows || []) {
      audience.classGroupIds.add(String(row.id));
      if (row.department_id) audience.departmentIds.add(String(row.department_id));
    }
  }

  const taught = await pool.query(
    `SELECT DISTINCT c.class_group_id, cg.department_id
     FROM course_teachers ct
     JOIN courses c ON c.id = ct.course_id
     JOIN class_groups cg ON cg.id = c.class_group_id
     WHERE ct.user_id::text = $1
       AND (ct.unassigned_at IS NULL OR ct.unassigned_at >= NOW())`,
    [String(actor.id)]
  );
  for (const row of taught.rows || []) {
    if (row.class_group_id) audience.classGroupIds.add(String(row.class_group_id));
    if (row.department_id) audience.departmentIds.add(String(row.department_id));
  }

  return audience;
}

async function listAudienceOptions(user) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };

  if (actor.role === "ADMIN") {
    const [departments, classGroups] = await Promise.all([
      pool.query(`SELECT id, code, name FROM departments ORDER BY code`),
      pool.query(
        `SELECT cg.id, cg.code, cg.name, cg.department_id,
                d.code AS department_code, d.name AS department_name
         FROM class_groups cg
         JOIN departments d ON d.id = cg.department_id
         ORDER BY d.code, cg.code`
      )
    ]);
    return {
      status: 200,
      body: {
        canCreate: true,
        role: actor.role,
        departments: departments.rows || [],
        classGroups: (classGroups.rows || []).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          departmentId: row.department_id,
          departmentCode: row.department_code,
          departmentName: row.department_name
        }))
      }
    };
  }

  if (actor.role === "COORDINATOR") {
    const classGroups = await pool.query(
      `SELECT cg.id, cg.code, cg.name, cg.department_id,
              d.code AS department_code, d.name AS department_name
       FROM class_groups cg
       JOIN departments d ON d.id = cg.department_id
       WHERE cg.coordinator_user_id::text = $1
       ORDER BY d.code, cg.code`,
      [String(actor.id)]
    );
    return {
      status: 200,
      body: {
        canCreate: true,
        role: actor.role,
        departments: [],
        classGroups: (classGroups.rows || []).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          departmentId: row.department_id,
          departmentCode: row.department_code,
          departmentName: row.department_name
        }))
      }
    };
  }

  return {
    status: 200,
    body: { canCreate: false, role: actor.role, departments: [], classGroups: [] }
  };
}

async function validateTargets(actor, payload) {
  const rawDepartmentIds = payload.departmentIds || payload["departmentIds[]"] || [];
  const rawClassGroupIds = payload.classGroupIds || payload["classGroupIds[]"] || [];
  const departmentIds = (Array.isArray(rawDepartmentIds) ? rawDepartmentIds : [rawDepartmentIds]).map(String).filter(Boolean);
  const classGroupIds = (Array.isArray(rawClassGroupIds) ? rawClassGroupIds : [rawClassGroupIds]).map(String).filter(Boolean);

  if (!departmentIds.length && !classGroupIds.length) {
    return { ok: false, status: 400, message: "Select at least one department or section." };
  }

  if (actor.role === "ADMIN") {
    return { ok: true, departmentIds, classGroupIds };
  }

  if (actor.role === "COORDINATOR") {
    const allowed = await pool.query(
      `SELECT id FROM class_groups WHERE coordinator_user_id::text = $1`,
      [String(actor.id)]
    );
    const allowedIds = new Set((allowed.rows || []).map((row) => String(row.id)));
    const resolvedClassGroupIds = classGroupIds.length
      ? classGroupIds
      : allowedIds.size === 1
        ? [...allowedIds]
        : [];
    if (departmentIds.length) {
      return { ok: false, status: 403, message: "Coordinators can only target supervised sections." };
    }
    if (!resolvedClassGroupIds.length) {
      return { ok: false, status: 400, message: "Choose at least one supervised section." };
    }
    const outside = resolvedClassGroupIds.some((id) => !allowedIds.has(id));
    if (outside) {
      return { ok: false, status: 403, message: "You can only target sections you supervise." };
    }
    return { ok: true, departmentIds: [], classGroupIds: resolvedClassGroupIds };
  }

  return { ok: false, status: 403, message: "Only admins and coordinators can publish global announcements." };
}

async function listVisibleAnnouncements(user) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };

  const baseSelect = `
    SELECT a.id, a.title, a.body, a.priority, a.status, a.created_at, a.updated_at,
           a.published_at, a.created_by_user_id, u.first_name, u.last_name,
           ar.read_at,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object(
               'type', at.target_type,
               'value', at.target_value,
               'label', COALESCE(d.code || ' - ' || d.name, cg.code || ' - ' || cg.name, at.target_value)
             )) FILTER (WHERE at.announcement_id IS NOT NULL),
             '[]'
           ) AS targets,
           COALESCE(
             json_agg(DISTINCT jsonb_build_object(
               'id', aa.id,
               'title', aa.file_name,
               'url', aa.file_url,
               'type', aa.mime_type,
               'size', aa.file_size
             )) FILTER (WHERE aa.id IS NOT NULL),
             '[]'
           ) AS attachments
    FROM announcements a
    LEFT JOIN users u ON u.id = a.created_by_user_id
    LEFT JOIN announcement_targets at ON at.announcement_id = a.id
    LEFT JOIN departments d ON at.target_type = 'DEPARTMENT' AND d.id::text = at.target_value
    LEFT JOIN class_groups cg ON at.target_type = 'CLASS_GROUP' AND cg.id::text = at.target_value
    LEFT JOIN announcement_attachments aa ON aa.announcement_id = a.id
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id::text = $1
  `;

  const params = [String(actor.id)];
  let where = `WHERE a.scope = 'GLOBAL' AND a.status = 'PUBLISHED'`;

  if (actor.role !== "ADMIN") {
    const audience = await getAudienceForUser(actor, user);
    const departmentIds = [...audience.departmentIds];
    const classGroupIds = [...audience.classGroupIds];
    params.push(departmentIds, classGroupIds);
    where += `
      AND EXISTS (
        SELECT 1 FROM announcement_targets vt
        WHERE vt.announcement_id = a.id
          AND (
            (vt.target_type = 'DEPARTMENT' AND vt.target_value = ANY($2::text[]))
            OR (vt.target_type = 'CLASS_GROUP' AND vt.target_value = ANY($3::text[]))
          )
      )`;
  }

  const res = await pool.query(
    `${baseSelect}
     ${where}
     GROUP BY a.id, u.first_name, u.last_name, ar.read_at
     ORDER BY a.created_at DESC`,
    params
  );

  return { status: 200, body: { items: (res.rows || []).map(mapAnnouncementRow) } };
}

async function getAnnouncement(user, announcementId) {
  const list = await listVisibleAnnouncements(user);
  if (list.status !== 200) return list;
  const item = list.body.items.find((announcement) => String(announcement.id) === String(announcementId));
  if (!item) return { status: 404, body: { message: "Announcement not found." } };
  return { status: 200, body: item };
}

async function createAnnouncement(user, payload, files = []) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };

  const targets = await validateTargets(actor, payload);
  if (!targets.ok) return { status: targets.status, body: { message: targets.message } };

  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  if (!title || !body) return { status: 400, body: { message: "title and body are required." } };

  try {
    await pool.query("BEGIN");
    const created = await pool.query(
      `INSERT INTO announcements (scope, title, body, priority, status, created_by_user_id, published_at)
       VALUES ('GLOBAL', $1, $2, $3::announcement_priority_enum, 'PUBLISHED', $4::uuid, NOW())
       RETURNING id`,
      [title, body, "NORMAL", String(actor.id)]
    );
    const announcementId = created.rows[0].id;

    for (const departmentId of targets.departmentIds) {
      await pool.query(
        `INSERT INTO announcement_targets (announcement_id, target_type, target_value)
         VALUES ($1::uuid, 'DEPARTMENT', $2)`,
        [announcementId, departmentId]
      );
    }
    for (const classGroupId of targets.classGroupIds) {
      await pool.query(
        `INSERT INTO announcement_targets (announcement_id, target_type, target_value)
         VALUES ($1::uuid, 'CLASS_GROUP', $2)`,
        [announcementId, classGroupId]
      );
    }
    await insertAttachments(announcementId, files);

    await pool.query("COMMIT");
    const result = await getAnnouncement(user, announcementId);
    if (result.status === 200) await emitAnnouncementNotifications(result.body, targets);
    return result;
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("[announcements] create failed", err.message);
    return { status: 500, body: { message: "Failed to create announcement." } };
  }
}

async function canManageAnnouncement(actor, announcementId) {
  if (actor.role === "ADMIN") return true;
  const res = await pool.query(
    `SELECT created_by_user_id FROM announcements WHERE id::text = $1 AND scope = 'GLOBAL' LIMIT 1`,
    [String(announcementId)]
  );
  return String(res.rows[0]?.created_by_user_id || "") === String(actor.id);
}

async function updateAnnouncement(user, announcementId, payload, files = []) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };
  if (!(await canManageAnnouncement(actor, announcementId))) {
    return { status: 403, body: { message: "You cannot edit this announcement." } };
  }

  const targets = await validateTargets(actor, payload);
  if (!targets.ok) return { status: targets.status, body: { message: targets.message } };

  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  if (!title || !body) return { status: 400, body: { message: "title and body are required." } };

  try {
    await pool.query("BEGIN");
    const updated = await pool.query(
      `UPDATE announcements
       SET title = $1, body = $2, updated_at = NOW()
       WHERE id::text = $3 AND scope = 'GLOBAL'
       RETURNING id`,
      [title, body, String(announcementId)]
    );
    if (!updated.rows.length) {
      await pool.query("ROLLBACK");
      return { status: 404, body: { message: "Announcement not found." } };
    }
    await pool.query(`DELETE FROM announcement_targets WHERE announcement_id::text = $1`, [String(announcementId)]);
    for (const departmentId of targets.departmentIds) {
      await pool.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_value) VALUES ($1::uuid, 'DEPARTMENT', $2)`, [String(announcementId), departmentId]);
    }
    for (const classGroupId of targets.classGroupIds) {
      await pool.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_value) VALUES ($1::uuid, 'CLASS_GROUP', $2)`, [String(announcementId), classGroupId]);
    }
    await insertAttachments(announcementId, files);
    await pool.query("COMMIT");
    return getAnnouncement(user, announcementId);
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("[announcements] update failed", err.message);
    return { status: 500, body: { message: "Failed to update announcement." } };
  }
}

async function deleteAnnouncement(user, announcementId) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };
  if (!(await canManageAnnouncement(actor, announcementId))) {
    return { status: 403, body: { message: "You cannot delete this announcement." } };
  }

  const deleted = await pool.query(
    `DELETE FROM announcements WHERE id::text = $1 AND scope = 'GLOBAL' RETURNING id`,
    [String(announcementId)]
  );
  if (!deleted.rows.length) return { status: 404, body: { message: "Announcement not found." } };
  return { status: 200, body: { success: true } };
}

async function markRead(user, announcementId) {
  const actor = await resolveActor(user);
  if (!actor) return { status: 403, body: { message: "Unable to resolve user context." } };
  const visible = await getAnnouncement(user, announcementId);
  if (visible.status !== 200) return visible;
  await pool.query(
    `INSERT INTO announcement_reads (announcement_id, user_id)
     VALUES ($1::uuid, $2::uuid)
     ON CONFLICT (announcement_id, user_id) DO NOTHING`,
    [String(announcementId), String(actor.id)]
  );
  return { status: 200, body: { success: true } };
}

module.exports = {
  listAudienceOptions,
  listVisibleAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markRead
};
