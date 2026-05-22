const pool = require("../config/db");
const bcrypt = require("bcryptjs");

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
async function getAllUsers() {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
            u.created_at, r.code AS role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r       ON r.id = ur.role_id
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

// ─── GET ONE USER ─────────────────────────────────────────────────────────────
async function getUserById(id) {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
            u.created_at, r.code AS role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r       ON r.id = ur.role_id
     WHERE u.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw new Error("User not found");
  return result.rows[0];
}

// ─── CREATE USER (by admin) ───────────────────────────────────────────────────
async function createUser({ firstName, lastName, email, password, role }) {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) throw new Error("Email already in use");

  const roleRow = await pool.query("SELECT id FROM roles WHERE code = $1", [role || "STUDENT"]);
  if (roleRow.rows.length === 0) throw new Error("Invalid role");

  const password_hash = await bcrypt.hash(password, 10);

  const newUser = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, first_name, last_name, email`,
    [firstName, lastName, email, password_hash]
  );
  const user = newUser.rows[0];

  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
    user.id,
    roleRow.rows[0].id
  ]);

  return user;
}

// ─── UPDATE USER ROLE ─────────────────────────────────────────────────────────
async function updateUserRole(id, newRole) {
  const roleRow = await pool.query("SELECT id FROM roles WHERE code = $1", [newRole]);
  if (roleRow.rows.length === 0) throw new Error("Invalid role");

  await pool.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
    id,
    roleRow.rows[0].id
  ]);

  return getUserById(id);
}

// ─── DELETE USER ──────────────────────────────────────────────────────────────
async function deleteUser(id) {
  const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
  if (result.rows.length === 0) throw new Error("User not found");
  return { message: "User deleted successfully" };
}

// Assign a course to a user (teacher -> course_teachers, student -> student_profiles.class_group_id)
async function assignCourseToUser(userId, courseId) {
  const courseRes = await pool.query(
    `SELECT id, class_group_id FROM courses WHERE id::text = $1 LIMIT 1`,
    [String(courseId)]
  );
  if (!courseRes.rows || courseRes.rows.length === 0) throw new Error("Course not found");
  const course = courseRes.rows[0];

  const user = await getUserById(userId);
  const role = user.role;

  if (role === "TEACHER") {
    const exists = await pool.query(
      `SELECT 1 FROM course_teachers WHERE course_id::text = $1 AND user_id::text = $2 LIMIT 1`,
      [String(courseId), String(userId)]
    );
    if (exists.rows && exists.rows.length) {
      return { message: "Teacher already assigned to course" };
    }
    await pool.query(`INSERT INTO course_teachers (course_id, user_id) VALUES ($1::uuid, $2::uuid)`, [
      String(courseId),
      String(userId)
    ]);
    return { message: "Teacher assigned to course" };
  }

  if (role === "STUDENT") {
    const classGroupId = course.class_group_id;
    if (!classGroupId) throw new Error("Course has no class group");

    const sp = await pool.query(
      `SELECT user_id FROM student_profiles WHERE user_id::text = $1 LIMIT 1`,
      [String(userId)]
    );
    if (sp.rows && sp.rows.length) {
      await pool.query(
        `UPDATE student_profiles SET class_group_id = $1 WHERE user_id::text = $2`,
        [String(classGroupId), String(userId)]
      );
      return { message: "Student profile updated with new class group" };
    }

    await pool.query(
      `INSERT INTO student_profiles (user_id, class_group_id) VALUES ($1::uuid, $2::uuid)`,
      [String(userId), String(classGroupId)]
    );
    return { message: "Student profile created and assigned to class group" };
  }

  throw new Error("User role not supported for course assignment");
}

async function getAllDepartments() {
  const res = await pool.query(`SELECT id, code, name FROM departments ORDER BY code`);
  return res.rows || [];
}

async function getAllLevels() {
  const res = await pool.query(`SELECT id, code, name FROM levels ORDER BY code`);
  return res.rows || [];
}

async function getAllClassGroups() {
  const res = await pool.query(
    `SELECT cg.id, cg.code, cg.name, cg.department_id, cg.level_id, cg.coordinator_user_id,
            d.code AS department_code, d.name AS department_name,
            l.code AS level_code, l.name AS level_name,
            u.first_name AS coordinator_first_name, u.last_name AS coordinator_last_name
     FROM class_groups cg
     JOIN departments d ON d.id = cg.department_id
     JOIN levels l ON l.id = cg.level_id
     LEFT JOIN users u ON u.id = cg.coordinator_user_id
     ORDER BY cg.code`
  );

  return (res.rows || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    departmentId: row.department_id,
    levelId: row.level_id,
    coordinatorUserId: row.coordinator_user_id,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    levelCode: row.level_code,
    levelName: row.level_name,
    coordinatorName: row.coordinator_first_name || row.coordinator_last_name
      ? `${row.coordinator_first_name || ""} ${row.coordinator_last_name || ""}`.trim()
      : null
  }));
}

async function createClassGroup({ code, name, departmentId, levelId, coordinatorUserId = null }) {
  if (!code || !name || !departmentId || !levelId) {
    throw new Error("code, name, departmentId and levelId are required");
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const normalizedName = String(name).trim();

  const dept = await pool.query(`SELECT id FROM departments WHERE id::text = $1 LIMIT 1`, [String(departmentId)]);
  if (!dept.rows.length) throw new Error("Invalid departmentId");

  const lvl = await pool.query(`SELECT id FROM levels WHERE id::text = $1 LIMIT 1`, [String(levelId)]);
  if (!lvl.rows.length) throw new Error("Invalid levelId");

  if (coordinatorUserId) {
    const coordRole = await pool.query(
      `SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id::text = $1 AND r.code = 'COORDINATOR'
       LIMIT 1`,
      [String(coordinatorUserId)]
    );
    if (!coordRole.rows.length) {
      throw new Error("coordinatorUserId must reference a COORDINATOR user");
    }
  }

  const exists = await pool.query(`SELECT id FROM class_groups WHERE code = $1 LIMIT 1`, [normalizedCode]);
  if (exists.rows.length) throw new Error("Class group code already exists");

  const insert = await pool.query(
    `INSERT INTO class_groups (code, name, department_id, level_id, coordinator_user_id)
     VALUES ($1, $2, $3::uuid, $4::uuid, $5::uuid)
     RETURNING id, code, name, department_id, level_id, coordinator_user_id`,
    [normalizedCode, normalizedName, String(departmentId), String(levelId), coordinatorUserId ? String(coordinatorUserId) : null]
  );

  const row = insert.rows[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    departmentId: row.department_id,
    levelId: row.level_id,
    coordinatorUserId: row.coordinator_user_id
  };
}

async function createCourse({ code, title, description = '', classGroupId, isCourseChatEnabled = true, teacherUserId = null }) {
  if (!code || !title || !classGroupId) {
    throw new Error('code, title and classGroupId are required');
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const normalizedTitle = String(title).trim();
  const normalizedDescription = String(description || '').trim();

  const classGroup = await pool.query(`SELECT id FROM class_groups WHERE id::text = $1 LIMIT 1`, [String(classGroupId)]);
  if (!classGroup.rows.length) throw new Error('Invalid classGroupId');

  const exists = await pool.query(`SELECT id FROM courses WHERE code = $1 LIMIT 1`, [normalizedCode]);
  if (exists.rows.length) throw new Error('Course code already exists');

  const created = await pool.query(
    `INSERT INTO courses (code, title, description, class_group_id, is_course_chat_enabled)
     VALUES ($1, $2, $3, $4::uuid, $5)
     RETURNING id, code, title, description, class_group_id, is_course_chat_enabled`,
    [normalizedCode, normalizedTitle, normalizedDescription, String(classGroupId), Boolean(isCourseChatEnabled)]
  );

  const row = created.rows[0];

  if (teacherUserId) {
    const teacherRole = await pool.query(
      `SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id::text = $1 AND r.code = 'TEACHER'
       LIMIT 1`,
      [String(teacherUserId)]
    );
    if (!teacherRole.rows.length) {
      throw new Error('teacherUserId must reference a TEACHER user');
    }

    await pool.query(
      `INSERT INTO course_teachers (course_id, user_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (course_id, user_id) DO NOTHING`,
      [String(row.id), String(teacherUserId)]
    );
  }

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    classGroupId: row.class_group_id,
    isCourseChatEnabled: row.is_course_chat_enabled
  };
}

async function assignUserToClassGroup(userId, classGroupId) {
  if (!userId || !classGroupId) {
    throw new Error('userId and classGroupId are required');
  }

  const classGroup = await pool.query(`SELECT id FROM class_groups WHERE id::text = $1 LIMIT 1`, [String(classGroupId)]);
  if (!classGroup.rows.length) throw new Error('Class group not found');

  const user = await getUserById(userId);
  if (user.role !== 'STUDENT') {
    throw new Error('Only STUDENT users can be assigned to class groups');
  }

  const profile = await pool.query(`SELECT user_id FROM student_profiles WHERE user_id::text = $1 LIMIT 1`, [String(userId)]);
  if (profile.rows.length) {
    await pool.query(`UPDATE student_profiles SET class_group_id = $1::uuid WHERE user_id::text = $2`, [String(classGroupId), String(userId)]);
    return { message: 'Student class group updated' };
  }

  await pool.query(`INSERT INTO student_profiles (user_id, class_group_id) VALUES ($1::uuid, $2::uuid)`, [String(userId), String(classGroupId)]);
  return { message: 'Student profile created and class group assigned' };
}

async function assignCourseToClassGroup(courseId, classGroupId) {
  if (!courseId || !classGroupId) {
    throw new Error('courseId and classGroupId are required');
  }

  const classGroup = await pool.query(`SELECT id FROM class_groups WHERE id::text = $1 LIMIT 1`, [String(classGroupId)]);
  if (!classGroup.rows.length) throw new Error('Class group not found');

  const course = await pool.query(`SELECT id FROM courses WHERE id::text = $1 LIMIT 1`, [String(courseId)]);
  if (!course.rows.length) throw new Error('Course not found');

  await pool.query(`UPDATE courses SET class_group_id = $1::uuid, updated_at = NOW() WHERE id::text = $2`, [String(classGroupId), String(courseId)]);
  return { message: 'Course class group updated' };
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUserRole,
  deleteUser,
  assignCourseToUser,
  getAllDepartments,
  getAllLevels,
  getAllClassGroups,
  createClassGroup,
  createCourse,
  assignUserToClassGroup,
  assignCourseToClassGroup
};
