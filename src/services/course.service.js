const data = require("../data");

function resolveActor(user) {
  if (!user) {
    return null;
  }

  const byId = data.users.find((candidate) => candidate.id === user.id);
  if (byId) {
    return byId;
  }

  if (user.role === "TEACHER") {
    return data.users.find((candidate) => candidate.role === "TEACHER") || null;
  }
  if (user.role === "COORDINATOR" || user.role === "ADMIN") {
    return data.users.find((candidate) => candidate.role === "COORDINATOR") || null;
  }

  return data.users.find((candidate) => candidate.role === "STUDENT") || null;
}

function formatCourse(course) {
  const teacher = data.users.find((u) => u.id === course.teacherId);
  return {
    ...course,
    teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
    announcementCount: data.announcements.filter((n) => n.courseId === course.id).length,
    attachmentCount: data.attachments.filter((a) => a.courseId === course.id).length
  };
}

function listVisibleCourses(user) {
  const actor = resolveActor(user);
  if (!actor) {
    return [];
  }

  const visibleCourses = data.courses.filter((course) => {
    if (actor.role === "TEACHER") {
      return course.teacherId === actor.id;
    }
    return course.classGroupCode === actor.classGroupCode;
  });

  return visibleCourses.map(formatCourse);
}

function getCourseById(courseId) {
  return data.courses.find((course) => course.id === courseId) || null;
}

function listCourseAnnouncements(courseId) {
  return data.announcements
    .filter((item) => item.courseId === courseId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createCourseAnnouncement(user, courseId, payload) {
  const actor = resolveActor(user);
  if (!actor || actor.role !== "TEACHER") {
    return { status: 403, body: { message: "Only teachers can publish course announcements." } };
  }

  const course = getCourseById(courseId);
  if (!course) {
    return { status: 404, body: { message: "Course not found" } };
  }

  if (course.teacherId !== actor.id) {
    return { status: 403, body: { message: "You can only publish in your own course." } };
  }

  const title = payload.title;
  const body = payload.body;
  if (!title || !body) {
    return { status: 400, body: { message: "title and body are required" } };
  }

  const newAnnouncement = {
    id: `n-${Date.now()}`,
    courseId: course.id,
    title,
    body,
    createdAt: new Date().toISOString(),
    createdBy: actor.id
  };

  data.announcements.push(newAnnouncement);
  return { status: 201, body: newAnnouncement };
}

function listCourseAttachments(courseId) {
  return data.attachments
    .filter((item) => item.courseId === courseId)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

module.exports = {
  formatCourse,
  listVisibleCourses,
  getCourseById,
  listCourseAnnouncements,
  createCourseAnnouncement,
  listCourseAttachments
};
