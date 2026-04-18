const courseService = require("../services/course.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

async function getCourses(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const items = await courseService.listVisibleCourses(req.user);
    return res.json({ user: req.user, items });
  } catch (err) {
    console.error('[controller] getCourses failed', err.message || err);
    return res.status(500).json({ message: 'Failed to load courses.' });
  }
}

async function getCourse(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const course = await courseService.getCourseById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const formatted = await courseService.formatCourse(course);
    return res.json(formatted);
  } catch (err) {
    console.error('[controller] getCourse failed', err.message || err);
    return res.status(500).json({ message: 'Failed to load course.' });
  }
}

async function getAnnouncements(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const course = await courseService.getCourseById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const items = await courseService.listCourseAnnouncements(course.id);
    return res.json({ items });
  } catch (err) {
    console.error('[controller] getAnnouncements failed', err.message || err);
    return res.status(500).json({ message: 'Failed to load announcements.' });
  }
}

async function postAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const result = await courseService.createCourseAnnouncement(req.user, req.params.courseId, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] postAnnouncement failed', err);
    return res.status(500).json({ message: 'Failed to create announcement.' });
  }
}

async function getAttachments(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const course = await courseService.getCourseById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const items = await courseService.listCourseAttachments(course.id);
    return res.json({ items });
  } catch (err) {
    console.error('[controller] getAttachments failed', err.message || err);
    return res.status(500).json({ message: 'Failed to load attachments.' });
  }
}

module.exports = {
  getCourses,
  getCourse,
  getAnnouncements,
  postAnnouncement,
  getAttachments
};
