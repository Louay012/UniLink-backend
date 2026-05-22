const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const hasValue = (value) => typeof value === "string" && value.trim() !== "";

function loadEnvironment() {
  const projectRoot = path.resolve(__dirname, "..");
  const envCandidates = [".env", ".env.local", ".env copy.example", ".env.example"];
  const envPath = envCandidates
    .map((name) => path.resolve(projectRoot, name))
    .find((candidate) => fs.existsSync(candidate));

  if (!envPath) {
    console.warn("No .env file found in backend/. Using process environment only.");
    return;
  }

  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${path.basename(envPath)}`);
}

const ROLES = [
  ["STUDENT", "Student"],
  ["TEACHER", "Teacher"],
  ["COORDINATOR", "Coordinator"],
  ["ADMIN", "Administrator"],
];

const DEPARTMENTS = [
  ["GL", "Genie Logiciel"],
  ["RT", "Reseaux & Telecom"],
  ["IIA", "Informatique Industrielle"],
];

const LEVELS = [
  ["L1", "License 1"],
  ["L2", "License 2"],
  ["L3", "License 3"],
  ["M1", "Master 1"],
  ["M2", "Master 2"],
];

const USERS = [
  { key: "admin", firstName: "Admin", lastName: "User", email: "admin@unilink.test", role: "ADMIN" },
  { key: "fatima", firstName: "Fatima", lastName: "Hassan", email: "fatima.hassan@unilink.test", role: "TEACHER" },
  { key: "mohammed", firstName: "Mohammed", lastName: "Karim", email: "mohammed.karim@unilink.test", role: "TEACHER" },
  { key: "leila", firstName: "Leila", lastName: "Mansouri", email: "leila.mansouri@unilink.test", role: "TEACHER" },
  { key: "ahmed", firstName: "Ahmed", lastName: "Ben Ali", email: "ahmed@unilink.test", role: "STUDENT" },
  { key: "sara", firstName: "Sara", lastName: "Trabelsi", email: "sara@unilink.test", role: "STUDENT" },
  { key: "mohamed", firstName: "Mohamed", lastName: "Jaziri", email: "mohamed@unilink.test", role: "STUDENT" },
  { key: "ines", firstName: "Ines", lastName: "Kefi", email: "ines@unilink.test", role: "STUDENT" },
  { key: "youssef", firstName: "Youssef", lastName: "Chakroun", email: "youssef@unilink.test", role: "STUDENT" },
  { key: "amal", firstName: "Amal", lastName: "Gharbi", email: "amal@unilink.test", role: "STUDENT" },
];

const CLASS_GROUP = {
  code: "GL4A",
  name: "Genie Logiciel 4A",
  departmentCode: "GL",
  levelCode: "M1",
};

const COURSES = [
  {
    code: "GL4A-ALGO",
    title: "Algorithms & Data Structures",
    description: "Advanced algorithms and data structure design patterns.",
    teacherKey: "fatima",
  },
  {
    code: "GL4A-DB",
    title: "Database Systems",
    description: "Relational and NoSQL database design and optimization.",
    teacherKey: "mohammed",
  },
  {
    code: "GL4A-AI",
    title: "Artificial Intelligence",
    description: "Machine learning, neural networks, and AI applications.",
    teacherKey: "leila",
  },
  {
    code: "GL4A-WEB",
    title: "Web Development",
    description: "Full-stack web development with modern frameworks.",
    teacherKey: "fatima",
  },
  {
    code: "GL4A-MOBILE",
    title: "Mobile Development",
    description: "iOS and Android native application development.",
    teacherKey: "leila",
  },
  {
    code: "GL4A-CLOUD",
    title: "Cloud Computing",
    description: "AWS, Azure, and cloud infrastructure design.",
    teacherKey: "mohammed",
  },
];

const ANNOUNCEMENTS_BY_COURSE = {
  "GL4A-ALGO": [
    {
      title: "Assignment 3 Released",
      body: "The third assignment on graph algorithms has been released. Deadline: April 10, 2026. Submit via the course portal with proper documentation.",
      priority: "NORMAL",
      publishedAt: "2026-03-24T16:30:00Z",
      attachments: [
        {
          fileName: "Assignment_3.pdf",
          fileUrl: "https://files.unilink.test/GL4A-ALGO/Assignment_3.pdf",
          mimeType: "application/pdf",
          fileSize: 2621440,
        },
      ],
    },
    {
      title: "Midterm Exam Scheduled",
      body: "Midterm exam will be held on April 15, 2026, in Hall A. Syllabus covers all topics up to Chapter 8.",
      priority: "URGENT",
      publishedAt: "2026-03-22T09:00:00Z",
      attachments: [],
    },
  ],
  "GL4A-DB": [
    {
      title: "Database Design Project",
      body: "Project requirements and guidelines are now available. Teams of 3-4 students. Due date: May 1, 2026.",
      priority: "NORMAL",
      publishedAt: "2026-03-20T14:00:00Z",
      attachments: [
        {
          fileName: "Project_Guidelines.docx",
          fileUrl: "https://files.unilink.test/GL4A-DB/Project_Guidelines.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileSize: 1258291,
        },
      ],
    },
  ],
  "GL4A-AI": [
    {
      title: "Lab Session Canceled",
      body: "Lab session on March 26 is canceled due to equipment maintenance. It will be rescheduled to March 28.",
      priority: "NORMAL",
      publishedAt: "2026-03-25T11:00:00Z",
      attachments: [],
    },
    {
      title: "Neural Networks Tutorial",
      body: "New tutorial on implementing neural networks with TensorFlow is available.",
      priority: "NORMAL",
      publishedAt: "2026-03-23T13:00:00Z",
      attachments: [
        {
          fileName: "NN_Tutorial.ipynb",
          fileUrl: "https://files.unilink.test/GL4A-AI/NN_Tutorial.ipynb",
          mimeType: "application/x-ipynb+json",
          fileSize: 6081740,
        },
      ],
    },
    {
      title: "Research Papers Recommended",
      body: "Check out the recommended research papers on the course page for deeper understanding.",
      priority: "NORMAL",
      publishedAt: "2026-03-21T10:00:00Z",
      attachments: [],
    },
  ],
  "GL4A-WEB": [
    {
      title: "Framework Choice for Project",
      body: "You can choose between React, Vue, or Angular for your frontend project. React is recommended.",
      priority: "NORMAL",
      publishedAt: "2026-03-23T15:00:00Z",
      attachments: [],
    },
  ],
  "GL4A-MOBILE": [],
  "GL4A-CLOUD": [
    {
      title: "AWS Certification Discount",
      body: "Special discount code for AWS certification exam available. Contact teacher for code.",
      priority: "NORMAL",
      publishedAt: "2026-03-25T09:00:00Z",
      attachments: [],
    },
    {
      title: "Cloud Project Deadline Extended",
      body: "New deadline for cloud project is April 20, 2026 (extended by 1 week).",
      priority: "NORMAL",
      publishedAt: "2026-03-20T12:00:00Z",
      attachments: [],
    },
  ],
};

const COURSE_CHAT_MESSAGES = {
  "GL4A-ALGO": [
    {
      senderKey: "fatima",
      body: "Hello everyone, welcome to the course!",
      createdAt: "2026-03-21T10:00:00Z",
    },
    {
      senderKey: "ahmed",
      body: "Hi! Looking forward to this course.",
      createdAt: "2026-03-21T10:15:00Z",
    },
    {
      senderKey: "fatima",
      body: "Great! Make sure to complete the prerequisites before week 2.",
      createdAt: "2026-03-21T10:20:00Z",
    },
  ],
  "GL4A-DB": [
    {
      senderKey: "mohammed",
      body: "Any questions about the database design project?",
      createdAt: "2026-03-25T14:00:00Z",
    },
  ],
};

async function upsertReferenceData(client) {
  for (const [code, label] of ROLES) {
    await client.query(
      `INSERT INTO roles (code, label)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`,
      [code, label]
    );
  }

  for (const [code, name] of DEPARTMENTS) {
    await client.query(
      `INSERT INTO departments (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [code, name]
    );
  }

  for (const [code, name] of LEVELS) {
    await client.query(
      `INSERT INTO levels (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [code, name]
    );
  }
}

async function ensureUser(client, user, passwordHash) {
  const insert = await client.query(
    `INSERT INTO users (first_name, last_name, email, status, password_hash)
     VALUES ($1, $2, $3, 'ACTIVE', $4)
     ON CONFLICT (email)
     DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       status = 'ACTIVE',
       password_hash = EXCLUDED.password_hash,
       updated_at = NOW()
     RETURNING id`,
    [user.firstName, user.lastName, user.email, passwordHash]
  );

  const userId = insert.rows[0].id;

  await client.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1::uuid, r.id
     FROM roles r
     WHERE r.code = $2
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, user.role]
  );

  return userId;
}

async function ensureClassGroup(client, code, name, departmentCode, levelCode) {
  const res = await client.query(
    `INSERT INTO class_groups (code, name, department_id, level_id)
     SELECT $1, $2, d.id, l.id
     FROM departments d
     JOIN levels l ON l.code = $4
     WHERE d.code = $3
     ON CONFLICT (code)
     DO UPDATE SET
       name = EXCLUDED.name,
       department_id = EXCLUDED.department_id,
       level_id = EXCLUDED.level_id
     RETURNING id`,
    [code, name, departmentCode, levelCode]
  );

  if (!res.rows.length) {
    throw new Error(`Unable to create class group ${code}. Check department/level codes.`);
  }

  return res.rows[0].id;
}

async function ensureCourse(client, course, classGroupId) {
  const res = await client.query(
    `INSERT INTO courses (code, title, description, class_group_id, is_course_chat_enabled)
     VALUES ($1, $2, $3, $4::uuid, TRUE)
     ON CONFLICT (code)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       class_group_id = EXCLUDED.class_group_id,
       is_course_chat_enabled = TRUE,
       updated_at = NOW()
     RETURNING id`,
    [course.code, course.title, course.description, classGroupId]
  );

  return res.rows[0].id;
}

async function ensureCourseTeacher(client, courseId, teacherUserId) {
  await client.query(
    `INSERT INTO course_teachers (course_id, user_id, teaching_role)
     VALUES ($1::uuid, $2::uuid, 'COURS_TEACHER')
     ON CONFLICT (course_id, user_id) DO NOTHING`,
    [courseId, teacherUserId]
  );
}

async function ensureStudentProfile(client, studentUserId, classGroupId, studentNumber) {
  await client.query(
    `INSERT INTO student_profiles (user_id, student_number, class_group_id, enrollment_status, enrollment_year, program_name)
     VALUES ($1::uuid, $2, $3::uuid, 'ACTIVE', 2026, 'Software Engineering')
     ON CONFLICT (user_id)
     DO UPDATE SET
       class_group_id = EXCLUDED.class_group_id,
       enrollment_status = 'ACTIVE',
       updated_at = NOW()`,
    [studentUserId, studentNumber, classGroupId]
  );
}

async function ensureAnnouncement(client, courseId, createdByUserId, item) {
  const existing = await client.query(
    `SELECT a.id
     FROM announcements a
     JOIN announcement_targets t ON t.announcement_id = a.id
     WHERE t.target_type = 'COURSE'
       AND t.target_value = $1
       AND a.title = $2
     LIMIT 1`,
    [String(courseId), item.title]
  );

  if (existing.rows.length) {
    const announcementId = existing.rows[0].id;
    await client.query(
      `UPDATE announcements
       SET body = $2,
           priority = $3::announcement_priority_enum,
           status = 'PUBLISHED',
           created_by_user_id = $4::uuid,
           published_at = $5::timestamptz,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [announcementId, item.body, item.priority, createdByUserId, item.publishedAt]
    );
    return announcementId;
  }

  const inserted = await client.query(
    `INSERT INTO announcements (scope, title, body, priority, status, created_by_user_id, published_at, created_at, updated_at)
     VALUES ('COURSE', $1, $2, $3::announcement_priority_enum, 'PUBLISHED', $4::uuid, $5::timestamptz, $5::timestamptz, NOW())
     RETURNING id`,
    [item.title, item.body, item.priority, createdByUserId, item.publishedAt]
  );

  const announcementId = inserted.rows[0].id;

  await client.query(
    `INSERT INTO announcement_targets (announcement_id, target_type, target_value)
     VALUES ($1::uuid, 'COURSE', $2)
     ON CONFLICT DO NOTHING`,
    [announcementId, String(courseId)]
  );

  return announcementId;
}

async function ensureAnnouncementAttachment(client, announcementId, attachment) {
  const existing = await client.query(
    `SELECT id
     FROM announcement_attachments
     WHERE announcement_id = $1::uuid AND file_url = $2
     LIMIT 1`,
    [announcementId, attachment.fileUrl]
  );

  if (existing.rows.length) {
    await client.query(
      `UPDATE announcement_attachments
       SET file_name = $2,
           mime_type = $3,
           file_size = $4
       WHERE id = $1::uuid`,
      [existing.rows[0].id, attachment.fileName, attachment.mimeType, attachment.fileSize]
    );
    return;
  }

  await client.query(
    `INSERT INTO announcement_attachments (announcement_id, file_name, file_url, mime_type, file_size)
     VALUES ($1::uuid, $2, $3, $4, $5)`,
    [announcementId, attachment.fileName, attachment.fileUrl, attachment.mimeType, attachment.fileSize]
  );
}

async function ensureCourseChat(client, courseId, createdByUserId, title) {
  const existing = await client.query(
    `SELECT id
     FROM chats
     WHERE chat_type = 'COURSE' AND course_id = $1::uuid
     LIMIT 1`,
    [courseId]
  );

  if (existing.rows.length) {
    await client.query(
      `UPDATE chats
       SET name = $2,
           created_by_user_id = $3::uuid,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [existing.rows[0].id, title, createdByUserId]
    );
    return existing.rows[0].id;
  }

  const created = await client.query(
    `INSERT INTO chats (chat_type, name, course_id, created_by_user_id)
     VALUES ('COURSE', $1, $2::uuid, $3::uuid)
     RETURNING id`,
    [title, courseId, createdByUserId]
  );

  return created.rows[0].id;
}

async function ensureChatMember(client, chatId, userId, addedByUserId, roleInChat = "MEMBER") {
  await client.query(
    `INSERT INTO chat_members (chat_id, user_id, role_in_chat, added_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::chat_member_role_enum, $4::uuid)
     ON CONFLICT (chat_id, user_id) DO NOTHING`,
    [chatId, userId, roleInChat, addedByUserId]
  );
}

async function ensureChatMessage(client, chatId, senderUserId, body, createdAt) {
  const existing = await client.query(
    `SELECT id
     FROM messages
     WHERE chat_id = $1::uuid
       AND sender_user_id = $2::uuid
       AND body = $3
       AND created_at = $4::timestamptz
     LIMIT 1`,
    [chatId, senderUserId, body, createdAt]
  );

  if (existing.rows.length) {
    return;
  }

  await client.query(
    `INSERT INTO messages (chat_id, sender_user_id, body, is_deleted, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, FALSE, $4::timestamptz, $4::timestamptz)`,
    [chatId, senderUserId, body, createdAt]
  );
}

async function countRows(client, table) {
  const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(res.rows[0]?.count || 0);
}

async function main() {
  loadEnvironment();

  const pool = require("../src/config/db");

  const password = hasValue(process.env.SEED_TEST_PASSWORD) ? process.env.SEED_TEST_PASSWORD : "test123";
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await upsertReferenceData(client);

    const userIdsByKey = {};
    for (const user of USERS) {
      userIdsByKey[user.key] = await ensureUser(client, user, passwordHash);
    }

    const classGroupId = await ensureClassGroup(
      client,
      CLASS_GROUP.code,
      CLASS_GROUP.name,
      CLASS_GROUP.departmentCode,
      CLASS_GROUP.levelCode
    );

    const studentKeys = USERS.filter((u) => u.role === "STUDENT").map((u) => u.key);
    for (let i = 0; i < studentKeys.length; i += 1) {
      const key = studentKeys[i];
      const padded = String(i + 1).padStart(3, "0");
      await ensureStudentProfile(client, userIdsByKey[key], classGroupId, `GL4A2026${padded}`);
    }

    const courseIdsByCode = {};
    for (const course of COURSES) {
      const courseId = await ensureCourse(client, course, classGroupId);
      courseIdsByCode[course.code] = courseId;
      await ensureCourseTeacher(client, courseId, userIdsByKey[course.teacherKey]);
    }

    for (const [courseCode, announcements] of Object.entries(ANNOUNCEMENTS_BY_COURSE)) {
      const courseId = courseIdsByCode[courseCode];
      const courseDef = COURSES.find((c) => c.code === courseCode);
      const createdByUserId = userIdsByKey[courseDef.teacherKey];

      for (const item of announcements) {
        const announcementId = await ensureAnnouncement(client, courseId, createdByUserId, item);
        for (const attachment of item.attachments) {
          await ensureAnnouncementAttachment(client, announcementId, attachment);
        }
      }
    }

    const allStudentUserIds = studentKeys.map((key) => userIdsByKey[key]);
    for (const course of COURSES) {
      const courseId = courseIdsByCode[course.code];
      const teacherId = userIdsByKey[course.teacherKey];
      const chatId = await ensureCourseChat(client, courseId, teacherId, `${course.title} - Course Chat`);

      await ensureChatMember(client, chatId, teacherId, teacherId, "OWNER");
      for (const studentUserId of allStudentUserIds) {
        await ensureChatMember(client, chatId, studentUserId, teacherId, "MEMBER");
      }

      const seedMessages = COURSE_CHAT_MESSAGES[course.code] || [];
      for (const message of seedMessages) {
        await ensureChatMessage(
          client,
          chatId,
          userIdsByKey[message.senderKey],
          message.body,
          message.createdAt
        );
      }
    }

    await client.query("COMMIT");

    const summary = {
      users: await countRows(client, "users"),
      studentProfiles: await countRows(client, "student_profiles"),
      courses: await countRows(client, "courses"),
      announcements: await countRows(client, "announcements"),
      announcementAttachments: await countRows(client, "announcement_attachments"),
      chats: await countRows(client, "chats"),
      chatMembers: await countRows(client, "chat_members"),
      messages: await countRows(client, "messages"),
    };

    const credentialsPath = path.resolve(__dirname, "..", "aa", "seeded_users_credentials.txt");
    const credentialsLines = [
      "UniLink Seeded Users Credentials",
      "Generated by scripts/seed-test-data.js",
      "",
      `Password for all listed users: ${password}`,
      "",
      "Users:",
      ...USERS.map((user) => `- ${user.firstName} ${user.lastName} <${user.email}> (${user.role})`)
    ];
    fs.writeFileSync(credentialsPath, `${credentialsLines.join("\n")}\n`, "utf8");

    console.log("Test data seed completed.");
    console.table(summary);
    console.log(`Seed login password for inserted users: ${password}`);
    console.log(`Credentials file written: ${credentialsPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
});
