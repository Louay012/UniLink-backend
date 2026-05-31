const feedbackService = require("../services/feedback.service");

function ensureAuthenticated(req, res) {
  if (req.user) {
    return true;
  }

  res.status(401).json({ message: "Authentication required" });
  return false;
}

async function createReport(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const result = await feedbackService.createReport(req.user, req.body || {});
  return res.status(result.status).json(result.body);
}

async function listReports(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const result = await feedbackService.listReports(req.user);
  return res.status(result.status).json(result.body);
}

async function getReadIds(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const readIds = await feedbackService.getReadReportIds(req.user?.id);
  return res.json({ ids: [...readIds] });
}

async function markRead(req, res) {
  if (!ensureAuthenticated(req, res)) {
    return;
  }

  const reportIds = req.body?.reportIds;
  if (!Array.isArray(reportIds)) {
    return res.status(400).json({ message: "reportIds array required." });
  }

  await feedbackService.markReportsRead(req.user?.id, reportIds);
  return res.json({ success: true });
}

module.exports = {
  createReport,
  listReports,
  getReadIds,
  markRead
};
