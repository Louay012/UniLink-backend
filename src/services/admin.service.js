const pool = require("../config/db");
const bcrypt = require("bcryptjs");

let auditTableReadyPromise = null;

function getActorUserId(actor) {
  return actor?.id || actor?.userId || null;
}

async function ensureAuditLogTable() {
  if (!auditTableReadyPromise) {
    auditTableReadyPromise = pool.query(
      `CREATE TABLE IF NOT EXISTS audit_logs (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
         action VARCHAR(80) NOT NULL,
         target_type VARCHAR(80) NOT NULL,
         target_id UUID,
         metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    ).catch((error) => {
      auditTableReadyPromise = null;
      throw error;
    });
  }

  return auditTableReadyPromise;
}

async function recordAdminAuditLog(actor, action, targetType, targetId, metadata = {}) {
  try {
    await ensureAuditLogTable();
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
      [
        getActorUserId(actor),
        action,
        targetType,
        targetId || null,
        JSON.stringify(metadata || {})
      ]
    );
  } catch (err) {
    console.warn("[audit] Failed to write admin audit log:", err.message);
  }
}

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
async function getAllUsers() {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status,
            u.created_at,
            (ARRAY_AGG(r.code ORDER BY CASE r.code
              WHEN 'ADMIN' THEN 1
              WHEN 'COORDINATOR' THEN 2
              WHEN 'TEACHER' THEN 3
              WHEN 'STUDENT' THEN 4
              ELSE 5
            END))[1] AS role,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.code), NULL) AS roles,
            cg.code
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r       ON r.id = ur.role_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
	   LEFT JOIN class_groups cg on sp.class_group_id = cg.id
     GROUP BY u.id, u.first_name, u.last_name, u.email, u.status, u.created_at, cg.code
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

async function getAuditLogs({ limit = 100 } = {}) {
  await ensureAuditLogTable();
  const parsedLimit = Number.parseInt(String(limit), 10);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

  const result = await pool.query(
    `SELECT al.id, al.actor_user_id, al.action, al.target_type, al.target_id,
            al.metadata, al.created_at,
            actor.first_name AS actor_first_name,
            actor.last_name AS actor_last_name,
            actor.email AS actor_email
     FROM audit_logs al
     LEFT JOIN users actor ON actor.id = al.actor_user_id
     ORDER BY al.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return (result.rows || []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_first_name || row.actor_last_name
      ? `${row.actor_first_name || ""} ${row.actor_last_name || ""}`.trim()
      : null,
    actorEmail: row.actor_email || null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  }));
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
async function createUser({ firstName, lastName, email, password, role }, actor = null) {
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

  await recordAdminAuditLog(actor, "ADMIN_USER_CREATED", "user", user.id, {
    email: user.email,
    role: role || "STUDENT"
  });

  return user;
}

// ─── UPDATE USER ROLE ─────────────────────────────────────────────────────────
async function updateUserRole(id, newRole, actor = null) {
  const previousUser = await getUserById(id);
  const roleRow = await pool.query("SELECT id FROM roles WHERE code = $1", [newRole]);
  if (roleRow.rows.length === 0) throw new Error("Invalid role");

  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`, [
    id,
    roleRow.rows[0].id
  ]);

  const updatedUser = await getUserById(id);
  await recordAdminAuditLog(actor, "ADMIN_USER_ROLE_UPDATED", "user", id, {
    email: updatedUser.email,
    previousRole: previousUser.role,
    newRole
  });

  return updatedUser;
}

// ─── UPDATE USER INFO (by admin) ─────────────────────────────────────────
async function updateUser(id, updates = {}, actor = null) {
  const previousUser = await getUserById(id);

  // Allowed updatable fields
  const allowed = ['firstName', 'lastName', 'email', 'phone', 'status'];
  const setClauses = [];
  const params = [];
  let idx = 1;

  // Map incoming camelCase to DB columns
  const mapping = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
    status: 'status'
  };

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const col = mapping[key];
      setClauses.push(`${col} = $${idx}`);
      params.push(updates[key] === '' ? null : updates[key]);
      idx += 1;
    }
  }

  if (!setClauses.length) {
    // Nothing to update — return existing
    return previousUser;
  }

  // If email is being changed, check uniqueness
  if (Object.prototype.hasOwnProperty.call(updates, 'email') && updates.email) {
    const exists = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1) AND id::text <> $2 LIMIT 1`, [String(updates.email), String(id)]);
    if (exists.rows.length) throw new Error('Email already in use by another account');
  }

  const query = `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, first_name, last_name, email, phone, status, created_at`;
  params.push(String(id));

  const result = await pool.query(query, params);
  if (!result.rows.length) throw new Error('User not found');
  const row = result.rows[0];

  await recordAdminAuditLog(actor, 'ADMIN_USER_UPDATED', 'user', id, {
    previous: previousUser,
    updates: updates
  });

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    created_at: row.created_at
  };
}

// ─── GET USER DETAILS (admin) ─────────────────────────────────────────────
async function getUserDetails(id) {
  // basic user
  const userRes = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.status, u.created_at
     FROM users u WHERE u.id::text = $1 LIMIT 1`,
    [String(id)]
  );
  if (!userRes.rows.length) throw new Error('User not found');
  const row = userRes.rows[0];

  // roles
  const rolesRes = await pool.query(
    `SELECT r.code, r.label
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id::text = $1`,
    [String(id)]
  );
  const roles = (rolesRes.rows || []).map(r => r.code);

  // student profile
  const spRes = await pool.query(
    `SELECT sp.student_number, sp.enrollment_status, sp.enrollment_year, sp.program_name,
            cg.id AS class_group_id, cg.code AS class_group_code, cg.name AS class_group_name,
            d.code AS department_code, d.name AS department_name,
            l.code AS level_code, l.name AS level_name
     FROM student_profiles sp
     LEFT JOIN class_groups cg ON cg.id = sp.class_group_id
     LEFT JOIN departments d ON d.id = cg.department_id
     LEFT JOIN levels l ON l.id = cg.level_id
     WHERE sp.user_id::text = $1 LIMIT 1`,
    [String(id)]
  );
  const studentProfile = spRes.rows[0] ? {
    studentNumber: spRes.rows[0].student_number,
    enrollmentStatus: spRes.rows[0].enrollment_status,
    enrollmentYear: spRes.rows[0].enrollment_year,
    programName: spRes.rows[0].program_name,
    classGroup: spRes.rows[0].class_group_id ? { id: spRes.rows[0].class_group_id, code: spRes.rows[0].class_group_code, name: spRes.rows[0].class_group_name } : null,
    department: spRes.rows[0].department_code ? { code: spRes.rows[0].department_code, name: spRes.rows[0].department_name } : null,
    level: spRes.rows[0].level_code ? { code: spRes.rows[0].level_code, name: spRes.rows[0].level_name } : null
  } : null;

  // teacher profile
  const tpRes = await pool.query(
    `SELECT employee_code, professional_grade, employment_status, academic_rank, hire_date, office_location, office_hours, bio
     FROM teacher_profiles WHERE user_id::text = $1 LIMIT 1`,
    [String(id)]
  );
  const teacherProfile = tpRes.rows[0] ? {
    employeeCode: tpRes.rows[0].employee_code,
    professionalGrade: tpRes.rows[0].professional_grade,
    employmentStatus: tpRes.rows[0].employment_status,
    academicRank: tpRes.rows[0].academic_rank,
    hireDate: tpRes.rows[0].hire_date,
    officeLocation: tpRes.rows[0].office_location,
    officeHours: tpRes.rows[0].office_hours,
    bio: tpRes.rows[0].bio
  } : null;

  // coordinator: supervised groups
  const coordRes = await pool.query(
    `SELECT cg.id, cg.code, cg.name, d.code AS department_code, d.name AS department_name
     FROM class_groups cg
     LEFT JOIN departments d ON d.id = cg.department_id
     WHERE cg.coordinator_user_id::text = $1`,
    [String(id)]
  );
  const coordinatorProfile = coordRes.rows.length ? { supervisedGroups: coordRes.rows.map(r => ({ id: r.id, code: r.code, name: r.name, department: { code: r.department_code, name: r.department_name } })) } : null;

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
    roles,
    studentProfile,
    teacherProfile,
    coordinatorProfile
  };
}

// ─── UPDATE TEACHER PROFILE (admin) ───────────────────────────────────────
async function updateTeacherProfile(id, payload = {}, actor = null) {
  // ensure user exists
  await getUserById(id);

  const fields = ['employeeCode','professionalGrade','employmentStatus','academicRank','hireDate','officeLocation','officeHours','bio'];
  const mapping = {
    employeeCode: 'employee_code',
    professionalGrade: 'professional_grade',
    employmentStatus: 'employment_status',
    academicRank: 'academic_rank',
    hireDate: 'hire_date',
    officeLocation: 'office_location',
    officeHours: 'office_hours',
    bio: 'bio'
  };

  // Check if teacher profile exists
  const exists = await pool.query(`SELECT user_id FROM teacher_profiles WHERE user_id::text = $1 LIMIT 1`, [String(id)]);
  if (exists.rows.length) {
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const k of fields) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        // Treat empty-string as "not provided" so DB defaults (NOT NULL defaults) apply
        if (payload[k] === '') continue;
        setClauses.push(`${mapping[k]} = $${idx}`);
        params.push(payload[k]);
        idx += 1;
      }
    }
    if (!setClauses.length) return { message: 'No changes' };
    const query = `UPDATE teacher_profiles SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id::text = $${idx} RETURNING *`;
    params.push(String(id));
    const res = await pool.query(query, params);
    await recordAdminAuditLog(actor, 'ADMIN_TEACHER_PROFILE_UPDATED', 'user', id, { updates: payload });
    return res.rows[0];
  }

  // insert new
  const cols = [];
  const vals = [];
  const params = [];
  let i = 1;
  cols.push('user_id'); vals.push(`$${i}`); params.push(String(id)); i += 1;
  for (const k of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      // Skip empty strings so database defaults (NOT NULL DEFAULT ...) are used
      if (payload[k] === '') continue;
      cols.push(mapping[k]); vals.push(`$${i}`); params.push(payload[k]); i += 1;
    }
  }
  const q = `INSERT INTO teacher_profiles (${cols.join(',')}) VALUES (${vals.join(',')}) RETURNING *`;
  const r = await pool.query(q, params);
  await recordAdminAuditLog(actor, 'ADMIN_TEACHER_PROFILE_CREATED', 'user', id, { created: true });
  return r.rows[0];
}

// ─── DELETE USER ──────────────────────────────────────────────────────────────
async function deleteUser(id, actor = null) {
  const user = await getUserById(id);
  const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
  if (result.rows.length === 0) throw new Error("User not found");
  await recordAdminAuditLog(actor, "ADMIN_USER_DELETED", "user", id, {
    email: user.email,
    role: user.role
  });
  return { message: "User deleted successfully" };
}

// Assign a course to a user (teacher -> course_teachers, student -> student_profiles.class_group_id)
async function assignCourseToUser(userId, courseId, actor = null) {
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
      await recordAdminAuditLog(actor, "ADMIN_COURSE_ASSIGNED", "course", course.id, {
        userId,
        courseId,
        userRole: role,
        result: "already_assigned"
      });
      return { message: "Teacher already assigned to course" };
    }
    await pool.query(`INSERT INTO course_teachers (course_id, user_id) VALUES ($1::uuid, $2::uuid)`, [
      String(courseId),
      String(userId)
    ]);
    await recordAdminAuditLog(actor, "ADMIN_COURSE_ASSIGNED", "course", course.id, {
      userId,
      courseId,
      userRole: role,
      result: "teacher_assigned"
    });
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
      await recordAdminAuditLog(actor, "ADMIN_COURSE_ASSIGNED", "course", course.id, {
        userId,
        courseId,
        userRole: role,
        classGroupId,
        result: "student_class_group_updated"
      });
      return { message: "Student profile updated with new class group" };
    }

    await pool.query(
      `INSERT INTO student_profiles (user_id, class_group_id) VALUES ($1::uuid, $2::uuid)`,
      [String(userId), String(classGroupId)]
    );
    await recordAdminAuditLog(actor, "ADMIN_COURSE_ASSIGNED", "course", course.id, {
      userId,
      courseId,
      userRole: role,
      classGroupId,
      result: "student_profile_created"
    });
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
            u.first_name AS coordinator_first_name, u.last_name AS coordinator_last_name
     FROM class_groups cg
     JOIN departments d ON d.id = cg.department_id
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

async function createClassGroup({ code, name, departmentId, coordinatorUserId }, actor = null) {
  if (!code || !name || !departmentId ) {
    throw new Error("code, name, departmentId and coordinatorUserId are required");
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const normalizedName = String(name).trim();

  const dept = await pool.query(`SELECT id FROM departments WHERE id::text = $1 LIMIT 1`, [String(departmentId)]);
  if (!dept.rows.length) throw new Error("Invalid departmentId");




  const exists = await pool.query(`SELECT id FROM class_groups WHERE code = $1 LIMIT 1`, [normalizedCode]);
  if (exists.rows.length) throw new Error("Class group code already exists");

  const insert = await pool.query(
    `INSERT INTO class_groups (code, name, department_id, coordinator_user_id)
     VALUES ($1, $2, $3::uuid, $4::uuid)
     RETURNING id, code, name, department_id, coordinator_user_id`,
    [normalizedCode, normalizedName, String(departmentId), coordinatorUserId ? String(coordinatorUserId) : null]
  );

  const row = insert.rows[0];
  await recordAdminAuditLog(actor, "ADMIN_CLASS_GROUP_CREATED", "class_group", row.id, {
    code: row.code,
    name: row.name,
    departmentId: row.department_id,  
    coordinatorUserId: row.coordinator_user_id
  });
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    departmentId: row.department_id,
    coordinatorUserId: row.coordinator_user_id
  };
}

async function createCourse({ code, title, description = '', classGroupId, isCourseChatEnabled = true, teacherUserId = null }, actor = null) {
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

  await recordAdminAuditLog(actor, "ADMIN_COURSE_CREATED", "course", row.id, {
    code: row.code,
    title: row.title,
    classGroupId: row.class_group_id,
    isCourseChatEnabled: row.is_course_chat_enabled,
    teacherUserId: teacherUserId ? String(teacherUserId) : null
  });

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    classGroupId: row.class_group_id,
    isCourseChatEnabled: row.is_course_chat_enabled
  };
}

async function assignUserToClassGroup(userId, classGroupId, actor = null) {
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
    await recordAdminAuditLog(actor, "ADMIN_CLASS_GROUP_ASSIGNED", "class_group", classGroupId, {
      userId: String(userId),
      result: "student_class_group_updated"
    });
    return { message: 'Student class group updated' };
  }

  await pool.query(`INSERT INTO student_profiles (user_id, class_group_id) VALUES ($1::uuid, $2::uuid)`, [String(userId), String(classGroupId)]);
  await recordAdminAuditLog(actor, "ADMIN_CLASS_GROUP_ASSIGNED", "class_group", classGroupId, {
    userId: String(userId),
    result: "student_profile_created"
  });
  return { message: 'Student profile created and class group assigned' };
}

async function assignCourseToClassGroup(courseId, classGroupId, actor = null) {
  if (!courseId || !classGroupId) {
    throw new Error('courseId and classGroupId are required');
  }

  const classGroup = await pool.query(`SELECT id FROM class_groups WHERE id::text = $1 LIMIT 1`, [String(classGroupId)]);
  if (!classGroup.rows.length) throw new Error('Class group not found');

  const course = await pool.query(`SELECT id FROM courses WHERE id::text = $1 LIMIT 1`, [String(courseId)]);
  if (!course.rows.length) throw new Error('Course not found');

  await pool.query(`UPDATE courses SET class_group_id = $1::uuid, updated_at = NOW() WHERE id::text = $2`, [String(classGroupId), String(courseId)]);
  await recordAdminAuditLog(actor, "ADMIN_COURSE_CLASS_GROUP_ASSIGNED", "course", courseId, {
    classGroupId: String(classGroupId)
  });
  return { message: 'Course class group updated' };
}

async function getDashboardStats() {
  console.log('getDashboardStats called'); 
  const [
    userRoles,
    courseCount,
    classGroupCount,
    coursesWithChat,
    unassignedStudents,
    totalMessages,
  ] = await Promise.all([

    // Count users per role via user_roles + roles join
    pool.query(`
      SELECT r.code AS role, COUNT(ur.user_id)::int AS count
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      GROUP BY r.code
    `),

    // Total courses
    pool.query(`
      SELECT COUNT(*)::int AS count FROM courses
    `),

    // Total class groups
    pool.query(`
      SELECT COUNT(*)::int AS count FROM class_groups
    `),

    // Courses with chat enabled
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM courses
      WHERE is_course_chat_enabled = true
    `),

    // Students with no class group assignment
    // student_profiles.class_group_id is NOT NULL by schema,
    // but we can catch students who have no student_profile at all
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id AND r.code = 'STUDENT'
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE sp.user_id IS NULL
    `),

    // Total non-deleted messages
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM messages
      WHERE is_deleted = false
    `),
  ]);

  const byRole = {};
  for (const row of userRoles.rows) {
    byRole[row.role] = row.count;
  }

  // Uptime
  const uptimeSeconds = process.uptime();
  const days    = Math.floor(uptimeSeconds / 86400);
  const hours   = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptime  = days > 0 ? `${days}d ${hours}h`
                : hours > 0 ? `${hours}h ${minutes}m`
                : `${minutes}m`;

  // DB heartbeat
  const dbStart = Date.now();
  await pool.query('SELECT 1');
  const dbMs = Date.now() - dbStart;
  const lastDbSync = dbMs < 1000 ? `${dbMs}ms` : `${(dbMs / 1000).toFixed(1)}s`;

  return {
    users: {
      students:     byRole['STUDENT']     ?? 0,
      teachers:     byRole['TEACHER']     ?? 0,
      coordinators: byRole['COORDINATOR'] ?? 0,
      admins:       byRole['ADMIN']       ?? 0,
    },
    academic: {
      courses:            courseCount.rows[0].count,
      classGroups:        classGroupCount.rows[0].count,
      coursesWithChat:    coursesWithChat.rows[0].count,
      unassignedStudents: unassignedStudents.rows[0].count,
    },
    activity: {
      totalMessages: totalMessages.rows[0].count,
    },
    system: {
      uptime,
      lastDbSync,
    },
  };
}


module.exports = {
  getAllUsers,
  getAuditLogs,
  recordAdminAuditLog,
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
  assignCourseToClassGroup,
  getDashboardStats
  ,updateUser,
  getUserDetails,
  updateTeacherProfile
};
