const courseService = require("../services/course.service");
const announcementService = require("../services/announcement.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

function normalizeAnnouncementPayload(body = {}) {
  const departmentIds = body.departmentIds || body['departmentIds[]'] || [];
  const classGroupIds = body.classGroupIds || body['classGroupIds[]'] || [];

  return {
    title: body.title,
    body: body.body,
    departmentIds: Array.isArray(departmentIds) ? departmentIds : departmentIds ? [departmentIds] : [],
    classGroupIds: Array.isArray(classGroupIds) ? classGroupIds : classGroupIds ? [classGroupIds] : []
  };
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

async function getGlobalAnnouncements(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const result = await announcementService.listVisibleAnnouncements(req.user);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] getGlobalAnnouncements failed', err);
    return res.status(500).json({ message: 'Failed to load announcements.' });
  }
}

async function getAnnouncementAudienceOptions(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const options = await courseService.getAnnouncementAudienceOptions(req.user);
    return res.json(options);
  } catch (err) {
    console.error('[controller] getAnnouncementAudienceOptions failed', err);
    return res.status(500).json({ message: 'Failed to load audience options.' });
  }
}

async function createGlobalAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  const files = Array.isArray(req.files) ? req.files.map((f) => ({
    fileName: f.originalname,
    mimeType: f.mimetype,
    fileSize: f.size,
    content: f.buffer,
    buffer: f.buffer
  })) : [];

  try {
    const result = await courseService.createGlobalAnnouncement(req.user, normalizeAnnouncementPayload(req.body || {}), files);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] createGlobalAnnouncement failed', err);
    return res.status(500).json({ message: 'Failed to create announcement.' });
  }
}

async function updateGlobalAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  const files = Array.isArray(req.files) ? req.files.map((f) => ({
    fileName: f.originalname,
    mimeType: f.mimetype,
    fileSize: f.size,
    content: f.buffer,
    buffer: f.buffer
  })) : [];

  try {
    const result = await courseService.updateGlobalAnnouncement(req.user, req.params.announcementId, normalizeAnnouncementPayload(req.body || {}), files);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] updateGlobalAnnouncement failed', err);
    return res.status(500).json({ message: 'Failed to update announcement.' });
  }
}

async function deleteGlobalAnnouncement(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    const result = await courseService.deleteGlobalAnnouncement(req.user, req.params.announcementId);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] deleteGlobalAnnouncement failed', err);
    return res.status(500).json({ message: 'Failed to delete announcement.' });
  }
}

async function markGlobalAnnouncementRead(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  try {
    await courseService.markGlobalAnnouncementRead(req.user.id, req.params.announcementId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[controller] markGlobalAnnouncementRead failed', err);
    return res.status(500).json({ message: 'Failed to mark announcement as read.' });
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

async function postAnnouncementWithFiles(req, res) {
  if (!ensureAuthenticated(req, res)) return;

  // Handle multer errors
  if (req.fileValidationError) {
    const code = req.fileValidationError.code;
    if (code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Each file must be 10 MB or smaller.' });
    if (code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'You can upload up to 5 files.' });
  }

  try {
    const payload = {
      title: req.body.title,
      body: req.body.body,
      priority: req.body.priority
    };

    const files = Array.isArray(req.files) ? req.files.map((f) => ({
      fileName: f.originalname,
      mimeType: f.mimetype,
      fileSize: f.size,
      content: f.buffer
    })) : [];

    const result = await courseService.createCourseAnnouncementWithFiles(req.user, req.params.courseId, payload, files);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[controller] postAnnouncementWithFiles failed', err);
    return res.status(500).json({ message: 'Failed to create announcement.' });
  }
}

async function downloadAnnouncementAttachment(req, res) {
  // No auth required — attachment IDs are UUIDs (unguessable).
  // This allows direct links to work in new browser tabs.
  try {
    const attachment = await courseService.getAnnouncementAttachment(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ message: 'Attachment not found' });

    if (attachment.fileData) {
      const isDownload = req.query.action === 'download';
      const disposition = isDownload ? 'attachment' : 'inline';
      
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.fileName.replace(/"/g, '\\"')}"`);
      res.setHeader('Content-Length', attachment.fileData.length);
      return res.send(attachment.fileData);
    }

    // Fallback: redirect to external URL if it exists and looks valid
    if (attachment.fileUrl && attachment.fileUrl.startsWith('http')) {
      return res.redirect(attachment.fileUrl);
    }

    return res.status(404).json({ message: 'No file data available for this attachment.' });
  } catch (err) {
    console.error('[controller] downloadAnnouncementAttachment failed', err);
    return res.status(500).json({ message: 'Failed to download attachment.' });
  }
}

async function markCourseRead(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  try {
    await courseService.markCourseAnnouncementsRead(req.user.id, req.params.courseId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[controller] markCourseRead failed', err);
    return res.status(500).json({ message: 'Failed to mark announcements as read.' });
  }
}

async function markAnnouncementsRead(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  const ids = req.body.announcementIds;
  if (!Array.isArray(ids)) return res.status(400).json({ message: 'announcementIds array required.' });
  try {
    await courseService.markAnnouncementsRead(req.user.id, ids);
    return res.json({ success: true });
  } catch (err) {
    console.error('[controller] markAnnouncementsRead failed', err);
    return res.status(500).json({ message: 'Failed to mark announcements as read.' });
  }
}

async function getReadIds(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  try {
    const readSet = await courseService.getReadAnnouncementIds(req.user.id);
    return res.json({ ids: [...readSet] });
  } catch (err) {
    console.error('[controller] getReadIds failed', err);
    return res.status(500).json({ message: 'Failed to get read state.' });
  }
}

async function getUnreadCounts(req, res) {
  if (!ensureAuthenticated(req, res)) return;
  try {
    const counts = await courseService.getUnreadCountByCourse(req.user.id);
    return res.json({ counts });
  } catch (err) {
    console.error('[controller] getUnreadCounts failed', err);
    return res.status(500).json({ message: 'Failed to get unread counts.' });
  }
}

module.exports = {
  getCourses,
  getCourse,
  getGlobalAnnouncements,
  getAnnouncementAudienceOptions,
  createGlobalAnnouncement,
  updateGlobalAnnouncement,
  deleteGlobalAnnouncement,
  markGlobalAnnouncementRead,
  getAnnouncements,
  postAnnouncement,
  postAnnouncementWithFiles,
  getAttachments,
  downloadAnnouncementAttachment,
  markCourseRead,
  markAnnouncementsRead,
  getReadIds,
  getUnreadCounts
};

