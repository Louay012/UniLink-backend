require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { users, courses, attachments, announcements } = require("./src/data");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function resolveUser(req) {
  const role = (req.query.role || req.header("x-role") || "STUDENT").toUpperCase();
  const userId = req.query.userId || req.header("x-user-id");

  const fallbackUser = users.find((u) => u.role === role) || users[0];
  const user = users.find((u) => u.id === userId) || fallbackUser;

  return {
    id: user.id,
    role,
    classGroupCode: user.classGroupCode
  };
}

function formatCourse(course) {
  const teacher = users.find((u) => u.id === course.teacherId);
  return {
    ...course,
    teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
    announcementCount: announcements.filter((n) => n.courseId === course.id).length,
    attachmentCount: attachments.filter((a) => a.courseId === course.id).length
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "unilink-backend" });
});

app.get("/api/courses", (req, res) => {
  const user = resolveUser(req);

  const visibleCourses = courses.filter((course) => {
    if (user.role === "TEACHER") {
      return course.teacherId === user.id;
    }
    return course.classGroupCode === user.classGroupCode;
  });

  res.json({
    user,
    items: visibleCourses.map(formatCourse)
  });
});

app.get("/api/courses/:courseId", (req, res) => {
  const course = courses.find((c) => c.id === req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.json(formatCourse(course));
});

app.get("/api/courses/:courseId/announcements", (req, res) => {
  const course = courses.find((c) => c.id === req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const items = announcements
    .filter((a) => a.courseId === course.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ items });
});

app.post("/api/courses/:courseId/announcements", (req, res) => {
  const user = resolveUser(req);

  if (user.role !== "TEACHER") {
    return res.status(403).json({ message: "Only teachers can publish course announcements." });
  }

  const course = courses.find((c) => c.id === req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  if (course.teacherId !== user.id) {
    return res.status(403).json({ message: "You can only publish in your own course." });
  }

  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }

  const newAnnouncement = {
    id: `n-${Date.now()}`,
    courseId: course.id,
    title,
    body,
    createdAt: new Date().toISOString(),
    createdBy: user.id
  };

  announcements.push(newAnnouncement);
  res.status(201).json(newAnnouncement);
});

app.get("/api/courses/:courseId/attachments", (req, res) => {
  const course = courses.find((c) => c.id === req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const items = attachments
    .filter((a) => a.courseId === course.id)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  res.json({ items });
});

app.listen(PORT, () => {
  console.log(`UniLink backend running at http://localhost:${PORT}`);
});
