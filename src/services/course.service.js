const pool = require("../config/db");
const groupService = require("./group.service");

async function resolveActor(user) {
  return groupService.resolveActor(user);
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

  return {
    id: course.id,
    code: course.code,
    title: course.title,
    description: course.description,
    classGroupId: course.class_group_id || null,
    classGroupCode: course.class_group_code || null,
    teacher,
    announcementCount,
    attachmentCount,
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
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.created_at, c.updated_at
         FROM courses c
         JOIN class_groups cg ON cg.id = c.class_group_id
         JOIN course_teachers ct ON ct.course_id = c.id
         WHERE ct.user_id::text = $1 AND (ct.unassigned_at IS NULL OR ct.unassigned_at >= NOW())`,
        [String(actor.id)]
      );
      rows = res.rows || [];
    } else if (actor.role === 'ADMIN') {
      const res = await pool.query(
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.created_at, c.updated_at
         FROM courses c JOIN class_groups cg ON cg.id = c.class_group_id ORDER BY c.title`);
      rows = res.rows || [];
    } else {
      // STUDENT / COORDINATOR default to class group membership
      if (!actor.classGroupId) return [];
      const res = await pool.query(
        `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.created_at, c.updated_at
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
      `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.created_at, c.updated_at
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
      `SELECT c.id, c.code, c.title, c.description, c.class_group_id, cg.code AS class_group_code, c.created_at, c.updated_at
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
      `SELECT a.id, a.title, a.body, a.created_at, a.created_by_user_id FROM announcements a JOIN announcement_targets t ON t.announcement_id = a.id WHERE t.target_type = 'COURSE' AND t.target_value = $1 ORDER BY a.created_at DESC`,
      [String(courseId)]
    );
    return (res.rows || []).map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at, createdBy: r.created_by_user_id }));
  } catch (e) {
    console.error('[course] listCourseAnnouncements failed', e.message);
    return [];
  }
}

async function createCourseAnnouncement(user, courseId, payload) {
  const actor = await groupService.resolveActor(user);
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
  if (!title || !body) return { status: 400, body: { message: 'title and body are required' } };

  try {
    const insert = await pool.query(`INSERT INTO announcements (scope, title, body, created_by_user_id) VALUES ('COURSE', $1, $2, $3) RETURNING id, created_at`, [title, body, String(actor.id)]);
    const announcementId = insert.rows[0]?.id;
    await pool.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_value) VALUES ($1::uuid, 'COURSE', $2)`, [announcementId, String(courseId)]);
    const createdAt = insert.rows[0]?.created_at ? new Date(insert.rows[0].created_at).toISOString() : new Date().toISOString();
    return { status: 201, body: { id: announcementId, courseId, title, body, createdAt, createdBy: actor.id } };
  } catch (e) {
    console.error('[course] createCourseAnnouncement failed', e.message);
    return { status: 500, body: { message: 'Failed to create announcement.' } };
  }
}

async function listCourseAttachments(courseId) {
  try {
    const res = await pool.query(
      `SELECT aa.id, aa.file_name AS title, aa.file_url AS url, aa.mime_type AS type, aa.file_size AS size, a.created_at AS uploaded_at
       FROM announcement_attachments aa
       JOIN announcement_targets t ON t.announcement_id = aa.announcement_id
       JOIN announcements a ON a.id = aa.announcement_id
       WHERE t.target_type = 'COURSE' AND t.target_value = $1
       ORDER BY a.created_at DESC`,
      [String(courseId)]
    );
    return (res.rows || []).map((r) => ({ id: r.id, title: r.title, url: r.url, type: r.type, size: r.size, uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null }));
  } catch (e) {
    console.error('[course] listCourseAttachments failed', e.message);
    return [];
  }
}

module.exports = {
  formatCourse,
  listVisibleCourses,
  listAllCourses,
  getCourseById,
  listCourseAnnouncements,
  createCourseAnnouncement,
  listCourseAttachments,
  resolveActor
};
