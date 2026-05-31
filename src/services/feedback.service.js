const pool = require("../config/db");
const socketUtils = require("../socket");
const { resolveActor } = require("./chat.service");

let feedbackTablesReadyPromise = null;

function normalizeCategory(value) {
  const clean = String(value || "BUG").trim().toUpperCase();
  return ["BUG", "PLATFORM", "COURSE", "OTHER"].includes(clean) ? clean : "BUG";
}

async function ensureFeedbackTables() {
  if (!feedbackTablesReadyPromise) {
    feedbackTablesReadyPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS feedback_reports (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
           category VARCHAR(40) NOT NULL DEFAULT 'BUG',
           subject VARCHAR(180) NOT NULL,
           details TEXT NOT NULL,
           status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS feedback_report_reads (
           report_id UUID NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
           admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           PRIMARY KEY (report_id, admin_user_id)
         )`
      );
    })().catch((error) => {
      feedbackTablesReadyPromise = null;
      throw error;
    });
  }

  return feedbackTablesReadyPromise;
}

function mapReport(row) {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    details: row.details,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    reporter: {
      id: row.reporter_user_id || null,
      name: row.reporter_name || "Unknown",
      email: row.reporter_email || null,
      role: row.reporter_role || null
    },
    read: Boolean(row.read_at)
  };
}

function emitAdminNotification(notification) {
  try {
    const io = socketUtils.getIo();
    if (!io || !notification?.adminUserId || !notification?.payload) return;
    io.to(String(notification.adminUserId)).emit("notification", notification.payload);
  } catch (error) {
    console.warn("[feedback] notification emit failed", error.message);
  }
}

async function getAdminUserIds() {
  const result = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE EXISTS (
       SELECT 1
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = u.id AND r.code = 'ADMIN'
     )`
  );

  return (result.rows || []).map((row) => row.id).filter(Boolean);
}

async function getReadReportIds(adminUserId) {
  if (!adminUserId) return new Set();
  await ensureFeedbackTables();
  try {
    const result = await pool.query(
      `SELECT report_id
       FROM feedback_report_reads
       WHERE admin_user_id::text = $1`,
      [String(adminUserId)]
    );
    return new Set((result.rows || []).map((row) => row.report_id));
  } catch (error) {
    console.error("[feedback] getReadReportIds failed", error);
    return new Set();
  }
}

async function markReportsRead(adminUserId, reportIds) {
  if (!adminUserId || !Array.isArray(reportIds) || !reportIds.length) return;
  await ensureFeedbackTables();
  try {
    const values = reportIds.map((reportId, index) => `($1::uuid, $${index + 2}::uuid)`).join(", ");
    await pool.query(
      `INSERT INTO feedback_report_reads (admin_user_id, report_id)
       VALUES ${values}
       ON CONFLICT (report_id, admin_user_id) DO UPDATE SET read_at = NOW()`,
      [String(adminUserId), ...reportIds.map(String)]
    );

    const io = socketUtils.getIo();
    if (io) {
      io.to(String(adminUserId)).emit("notification.read", {
        reportIds: reportIds.map(String)
      });
    }
  } catch (error) {
    console.error("[feedback] markReportsRead failed", error);
  }
}

async function createReport(user, payload = {}) {
  await ensureFeedbackTables();

  const actor = await resolveActor(user);
  if (!actor) {
    return { status: 403, body: { message: "Unable to resolve user context." } };
  }

  const subject = String(payload.subject || "").trim();
  const details = String(payload.details || "").trim();
  const category = normalizeCategory(payload.category);

  if (!subject || !details) {
    return { status: 400, body: { message: "Subject and details are required." } };
  }

  try {
    const res = await pool.query(
      `INSERT INTO feedback_reports (reporter_user_id, category, subject, details)
       VALUES ($1::uuid, $2, $3, $4)
       RETURNING id, reporter_user_id, category, subject, details, status, created_at, updated_at`,
      [actor.id, category, subject.slice(0, 180), details]
    );

    const report = mapReport({ ...res.rows[0], reporter_name: actor.name, reporter_role: actor.role });
    const adminUserIds = await getAdminUserIds();
    const notification = {
      id: `bug-${report.id}`,
      type: "bug-report",
      title: report.subject,
      subtitle: `${report.category} report${report.reporter?.name ? ` · ${report.reporter.name}` : ""}`,
      timestamp: report.createdAt,
      link: "/feedback",
      reportId: report.id,
      read: false
    };

    for (const adminUserId of adminUserIds) {
      emitAdminNotification({ adminUserId, payload: notification });
    }

    return { status: 201, body: { report } };
  } catch (error) {
    console.error("[feedback] createReport failed", error);
    return { status: 500, body: { message: "Failed to submit report." } };
  }
}

async function listReports(user) {
  await ensureFeedbackTables();

  const actor = await resolveActor(user);
  if (!actor || String(actor.role || "").toUpperCase() !== "ADMIN") {
    return { status: 403, body: { message: "Admin access required." } };
  }

  try {
    const res = await pool.query(
      `SELECT fr.id, fr.reporter_user_id, fr.category, fr.subject, fr.details, fr.status, fr.created_at, fr.updated_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS reporter_name,
              u.email AS reporter_email,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS reporter_role,
              read_state.read_at
       FROM feedback_reports fr
       LEFT JOIN users u ON u.id = fr.reporter_user_id
       LEFT JOIN feedback_report_reads read_state
         ON read_state.report_id = fr.id AND read_state.admin_user_id::text = $1
       ORDER BY fr.created_at DESC`,
      [String(actor.id)]
    );

    return { status: 200, body: { items: (res.rows || []).map(mapReport) } };
  } catch (error) {
    console.error("[feedback] listReports failed", error);
    return { status: 500, body: { message: "Failed to load reports." } };
  }
}

module.exports = {
  createReport,
  listReports,
  getReadReportIds,
  markReportsRead
};
