const pool = require("../config/db");
const bcrypt = require("bcryptjs");

let profilePhotoColumnsReadyPromise = null;

async function ensureProfilePhotoColumns() {
  if (!profilePhotoColumnsReadyPromise) {
    profilePhotoColumnsReadyPromise = (async () => {
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo BYTEA");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_mime VARCHAR(120)");
    })().catch((error) => {
      profilePhotoColumnsReadyPromise = null;
      throw error;
    });
  }

  return profilePhotoColumnsReadyPromise;
}

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

async function changePassword(user, currentPassword, newPassword) {
  if (!user?.id) return { status: 401, body: { message: "Authentication required." } };
  if (!currentPassword || !newPassword) {
    return { status: 400, body: { message: "Both current and new password are required." } };
  }
  if (newPassword.length < 8) {
    return { status: 400, body: { message: "New password must be at least 8 characters." } };
  }

  try {
    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id]
    );
    if (!result.rows.length) return { status: 404, body: { message: "User not found." } };

    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) return { status: 400, body: { message: "Current password is incorrect." } };

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, hash]);

    return { status: 200, body: { message: "Password updated successfully." } };
  } catch (err) {
    console.error("[profile.service] changePassword error:", err);
    return { status: 500, body: { message: "Failed to update password." } };
  }
}

async function updatePhone(user, phone) {
  if (!user?.id) return { status: 401, body: { message: "Authentication required." } };

  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
  if (normalizedPhone.length > 50) {
    return { status: 400, body: { message: "Phone number must be 50 characters or fewer." } };
  }
  if (normalizedPhone && !/^[0-9+\-().\s]+$/.test(normalizedPhone)) {
    return { status: 400, body: { message: "Phone number can only include digits, spaces, +, -, parentheses, or periods." } };
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET phone = $2
       WHERE id = $1
       RETURNING phone`,
      [user.id, normalizedPhone || null]
    );

    if (!result.rows.length) return { status: 404, body: { message: "User not found." } };
    return { status: 200, body: { message: "Phone updated.", phone: result.rows[0].phone } };
  } catch (err) {
    console.error("[profile.service] updatePhone error:", err);
    return { status: 500, body: { message: "Failed to update phone." } };
  }
}

async function saveProfilePhoto(user, buffer, mimeType) {
  if (!user?.id) return { status: 401, body: { message: "Authentication required." } };
  try {
    await ensureProfilePhotoColumns();
    await pool.query(
      "UPDATE users SET profile_photo = $2, profile_photo_mime = $3 WHERE id = $1",
      [user.id, buffer, mimeType]
    );
    return { status: 200, body: { message: "Photo updated." } };
  } catch (err) {
    console.error("[profile.service] saveProfilePhoto error:", err);
    return { status: 500, body: { message: "Failed to save photo." } };
  }
}

async function getProfilePhoto(userId) {
  try {
    await ensureProfilePhotoColumns();
    const result = await pool.query(
      "SELECT profile_photo, profile_photo_mime FROM users WHERE id = $1",
      [userId]
    );
    if (!result.rows.length || !result.rows[0].profile_photo) {
      return { status: 404, body: null };
    }
    return {
      status: 200,
      buffer: result.rows[0].profile_photo,
      mimeType: result.rows[0].profile_photo_mime || "image/jpeg"
    };
  } catch (err) {
    console.error("[profile.service] getProfilePhoto error:", err);
    return { status: 500, body: null };
  }
}

async function deleteProfilePhoto(user) {
  if (!user?.id) return { status: 401, body: { message: "Authentication required." } };
  try {
    await ensureProfilePhotoColumns();
    await pool.query(
      "UPDATE users SET profile_photo = NULL, profile_photo_mime = NULL WHERE id = $1",
      [user.id]
    );
    return { status: 200, body: { message: "Photo removed." } };
  } catch (err) {
    console.error("[profile.service] deleteProfilePhoto error:", err);
    return { status: 500, body: { message: "Failed to remove photo." } };
  }
}

module.exports = { getProfile, changePassword, updatePhone, saveProfilePhoto, getProfilePhoto, deleteProfilePhoto };
