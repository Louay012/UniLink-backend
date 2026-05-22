const pool = require("../config/db");

async function getProfile(user) {
  if (!user || !user.id) {
    return { status: 401, body: { message: "Authentication required." } };
  }

  try {
    // Get the user's base info
    const userResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.status, u.created_at
       FROM users u
       WHERE u.id = $1`,
      [user.id]
    );

    if (!userResult.rows.length) {
      return { status: 404, body: { message: "User not found." } };
    }

    const row = userResult.rows[0];

    // Get user roles
    const rolesResult = await pool.query(
      `SELECT r.code, r.label
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const roles = rolesResult.rows.map((r) => ({ code: r.code, label: r.label }));

    // Try to get student profile with class group info
    let studentProfile = null;
    const studentResult = await pool.query(
      `SELECT sp.student_number, sp.enrollment_status, sp.enrollment_year, sp.program_name,
              cg.id AS class_group_id, cg.code AS class_group_code, cg.name AS class_group_name,
              d.code AS department_code, d.name AS department_name,
              l.code AS level_code, l.name AS level_name
       FROM student_profiles sp
       JOIN class_groups cg ON cg.id = sp.class_group_id
       JOIN departments d ON d.id = cg.department_id
       JOIN levels l ON l.id = cg.level_id
       WHERE sp.user_id = $1`,
      [user.id]
    );

    if (studentResult.rows.length) {
      const sp = studentResult.rows[0];
      studentProfile = {
        studentNumber: sp.student_number,
        enrollmentStatus: sp.enrollment_status,
        enrollmentYear: sp.enrollment_year,
        programName: sp.program_name,
        classGroup: {
          id: sp.class_group_id,
          code: sp.class_group_code,
          name: sp.class_group_name
        },
        department: {
          code: sp.department_code,
          name: sp.department_name
        },
        level: {
          code: sp.level_code,
          name: sp.level_name
        }
      };
    }

    // Try to get teacher profile
    let teacherProfile = null;
    const teacherResult = await pool.query(
      `SELECT employee_code, professional_grade, employment_status,
              academic_rank, hire_date, office_location, office_hours, bio
       FROM teacher_profiles
       WHERE user_id = $1`,
      [user.id]
    );

    if (teacherResult.rows.length) {
      const tp = teacherResult.rows[0];
      teacherProfile = {
        employeeCode: tp.employee_code,
        professionalGrade: tp.professional_grade,
        employmentStatus: tp.employment_status,
        academicRank: tp.academic_rank,
        hireDate: tp.hire_date,
        officeLocation: tp.office_location,
        officeHours: tp.office_hours,
        bio: tp.bio
      };
    }

    // Get enrolled courses count
    let courseCount = 0;
    if (studentProfile) {
      const coursesResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM courses
         WHERE class_group_id = $1`,
        [studentProfile.classGroup.id]
      );
      courseCount = coursesResult.rows[0]?.count || 0;
    }

    return {
      status: 200,
      body: {
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
        courseCount
      }
    };
  } catch (error) {
    console.error("[profile.service] getProfile error:", error);
    return { status: 500, body: { message: "Failed to load profile." } };
  }
}

module.exports = { getProfile };
