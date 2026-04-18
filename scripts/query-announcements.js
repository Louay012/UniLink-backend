const pool = require('../src/config/db');

(async () => {
  try {
    const res = await pool.query(
      `SELECT a.id, a.title, a.body, a.created_at, t.target_value
       FROM announcements a
       JOIN announcement_targets t ON t.announcement_id = a.id
       WHERE t.target_type = $1 AND t.target_value = $2`,
      ['COURSE', '4b153a47-55ed-4378-a58d-2f05adcaa8da']
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
