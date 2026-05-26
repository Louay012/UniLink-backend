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

module.exports = {
  createReport,
  listReports
};
