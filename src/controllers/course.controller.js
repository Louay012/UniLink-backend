const courseService = require("../services/course.service");

function getCourses(req, res) {
  res.json({
    user: req.user,
    items: courseService.listVisibleCourses(req.user)
  });
}

function getCourse(req, res) {
  const course = courseService.getCourseById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.json(courseService.formatCourse(course));
}

function getAnnouncements(req, res) {
  const course = courseService.getCourseById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.json({ items: courseService.listCourseAnnouncements(course.id) });
}

function postAnnouncement(req, res) {
  const result = courseService.createCourseAnnouncement(req.user, req.params.courseId, req.body);
  return res.status(result.status).json(result.body);
}

function getAttachments(req, res) {
  const course = courseService.getCourseById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  return res.json({ items: courseService.listCourseAttachments(course.id) });
}

module.exports = {
  getCourses,
  getCourse,
  getAnnouncements,
  postAnnouncement,
  getAttachments
};
