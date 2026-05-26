const xlsx = require('xlsx');
const { parse: parseCSV } = require('csv-parse/sync');
const bcrypt = require('bcrypt');
const path = require('path');

const pool = require('../config/db'); // adjust to your db pool path

const SALT_ROUNDS = 10;

const HEADER_ALIASES = {
  firstname:   'firstName',
  first_name:  'firstName',
  lastname:    'lastName',
  last_name:   'lastName',
  email:       'email',
  password:    'password',
  pass:        'password',
  role:        'role',
  class_group: 'classGroup',
  classgroup:  'classGroup',
  class:       'classGroup',
};

const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'password'];
const VALID_ROLES     = ['STUDENT', 'TEACHER', 'COORDINATOR', 'ADMIN'];

// ─── Parse file buffer ────────────────────────────────────────────────────────
function parseFile(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.csv') {
    const text = buffer.toString('utf-8');
    const firstLine = text.split('\n')[0];
    const hasHeader = firstLine.toLowerCase().includes('firstname') ||
                      firstLine.toLowerCase().includes('first_name') ||
                      firstLine.toLowerCase().includes('email');

    if (hasHeader) {
      // Normal CSV with headers
      return parseCSV(text, { columns: true, skip_empty_lines: true, trim: true });
    } else {
      // No header row — map columns by position
      return parseCSV(text, {
        skip_empty_lines: true,
        trim: true,
        columns: ['firstName', 'lastName', 'email', 'password', 'role', 'classGroup'],
      });
    }
  }

  // .xls / .xlsx
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

// ─── Normalise headers ────────────────────────────────────────────────────────
function normaliseRow(raw) {
  const normalised = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = HEADER_ALIASES[key.trim().toLowerCase()] || key.trim();
    // also accept already-canonical keys like 'firstName' directly
    if (Object.values(HEADER_ALIASES).includes(canonical)) {
      normalised[canonical] = String(value).trim();
    }
  }
  return normalised;
}

// ─── Validate one row ─────────────────────────────────────────────────────────
function validateRow(row) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!row[field]) errors.push(`Missing required field: ${field}`);
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push(`Invalid email format: "${row.email}"`);
  }
  if (row.password && row.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (row.role && !VALID_ROLES.includes(row.role.toUpperCase())) {
    errors.push(`Invalid role "${row.role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  }
  return errors;
}

// ─── Main service function ────────────────────────────────────────────────────
async function bulkInsertUsers(fileBuffer, originalName) {
  // 1. Parse
  let rawRows;
  try {
    rawRows = parseFile(fileBuffer, originalName);
  } catch (err) {
    throw new Error(`Could not parse file: ${err.message}`);
  }
  if (!rawRows.length) throw new Error('The uploaded file contains no data rows.');

  // 2. Validate all rows
  const validRows  = [];
  const failedRows = [];
  rawRows.forEach((raw, idx) => {
    const row    = normaliseRow(raw);
    const errors = validateRow(row);
    if (errors.length) {
      failedRows.push({ row: idx + 2, data: raw, errors });
    } else {
      validRows.push({ rowNumber: idx + 2, data: row });
    }
  });

  if (!validRows.length) {
    return { total: rawRows.length, inserted: 0, failed: failedRows.length, errors: failedRows, duplicates: [] };
  }

  // 3. Deduplicate emails within the file
  const emailsSeen  = new Set();
  const dedupedRows = [];
  const duplicates  = [];
  for (const item of validRows) {
    const email = item.data.email.toLowerCase();
    if (emailsSeen.has(email)) {
      duplicates.push({ row: item.rowNumber, email, reason: 'Duplicate email within the uploaded file' });
    } else {
      emailsSeen.add(email);
      dedupedRows.push(item);
    }
  }

  // 4. Check existing emails in DB
  const emailList = dedupedRows.map((r) => r.data.email.toLowerCase());
  const { rows: existingRows } = await pool.query(
    `SELECT email FROM users WHERE email = ANY($1::text[])`,
    [emailList]
  );
  const existingEmails = new Set(existingRows.map((r) => r.email.toLowerCase()));

  const toInsert = [];
  for (const item of dedupedRows) {
    if (existingEmails.has(item.data.email.toLowerCase())) {
      duplicates.push({ row: item.rowNumber, email: item.data.email, reason: 'Email already exists in the database' });
    } else {
      toInsert.push(item);
    }
  }

  if (!toInsert.length) {
    return { total: rawRows.length, inserted: 0, failed: failedRows.length, errors: failedRows, duplicates };
  }

  // 5. Load all needed role IDs in one query
  const roleCodesNeeded = [...new Set(toInsert.map((i) => (i.data.role || 'STUDENT').toUpperCase()))];
  const { rows: roleRows } = await pool.query(
    `SELECT id, code FROM roles WHERE code = ANY($1::text[])`,
    [roleCodesNeeded]
  );
  const roleMap = {}; // { STUDENT: 1, ADMIN: 2, ... }
  for (const r of roleRows) roleMap[r.code] = r.id;

  // Check if any role codes weren't found
  for (const item of toInsert) {
    const code = (item.data.role || 'STUDENT').toUpperCase();
    if (!roleMap[code]) {
      failedRows.push({ row: item.rowNumber, data: item.data, errors: [`Role "${code}" not found in database`] });
    }
  }
  const insertable = toInsert.filter((item) => {
    const code = (item.data.role || 'STUDENT').toUpperCase();
    return !!roleMap[code];
  });

  if (!insertable.length) {
    return { total: rawRows.length, inserted: 0, failed: failedRows.length, errors: failedRows, duplicates };
  }

  // 5.5. Load all needed class groups
  const classGroupCodesNeeded = [...new Set(insertable.filter(i => i.data.classGroup).map(i => i.data.classGroup))];
  const classGroupMap = {}; // { 'GL1': uuid, ... }
  if (classGroupCodesNeeded.length > 0) {
    const { rows: cgRows } = await pool.query(
      `SELECT id, code FROM class_groups WHERE code = ANY($1::text[])`,
      [classGroupCodesNeeded]
    );
    for (const row of cgRows) classGroupMap[row.code] = row.id;
  }

  // Check if any specified class groups weren't found
  const fullyInsertable = [];
  for (const item of insertable) {
    if (item.data.classGroup && !classGroupMap[item.data.classGroup]) {
      failedRows.push({ row: item.rowNumber, data: item.data, errors: [`Class group "${item.data.classGroup}" not found in database`] });
    } else {
      fullyInsertable.push(item);
    }
  }

  if (!fullyInsertable.length) {
    return { total: rawRows.length, inserted: 0, failed: failedRows.length, errors: failedRows, duplicates };
  }

  // 6. Hash all passwords in parallel
  const prepared = await Promise.all(
    fullyInsertable.map(async (item) => ({
      rowNumber:     item.rowNumber,
      first_name:    item.data.firstName,
      last_name:     item.data.lastName,
      email:         item.data.email.toLowerCase(),
      password_hash: await bcrypt.hash(item.data.password, SALT_ROUNDS),
      role:          (item.data.role || 'STUDENT').toUpperCase(),
      classGroup:    item.data.classGroup || null,
    }))
  );

  // 7. Insert all users in one query, get back their IDs
  const values      = [];
  const placeholders = prepared.map((u, i) => {
    const b = i * 4;
    values.push(u.first_name, u.last_name, u.email, u.password_hash);
    return `($${b+1}, $${b+2}, $${b+3}, $${b+4})`;
  });

  const { rows: insertedUsers } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    values
  );

  // 8. Insert user_roles for each inserted user in one query
  if (insertedUsers.length > 0) {
    const emailToId = {};
    for (const u of insertedUsers) emailToId[u.email] = u.id;

    const roleValues      = [];
    const rolePlaceholders = [];
    let   ri = 1;
    for (const u of prepared) {
      const userId = emailToId[u.email];
      if (!userId) continue; // was a conflict/duplicate
      const roleId = roleMap[u.role];
      roleValues.push(userId, roleId);
      rolePlaceholders.push(`($${ri}, $${ri+1})`);
      ri += 2;
    }

    if (rolePlaceholders.length > 0) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ${rolePlaceholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        roleValues
      );
    }

    // 9. Insert student profiles if classGroup is set
    const profileValues = [];
    const profilePlaceholders = [];
    let pi = 1;
    for (const u of prepared) {
      const userId = emailToId[u.email];
      if (!userId || !u.classGroup) continue;
      
      // we know u.classGroup is valid because of steps above
      const cgId = classGroupMap[u.classGroup];
      if (cgId && u.role === 'STUDENT') {
        profileValues.push(userId, cgId);
        profilePlaceholders.push(`($${pi}, $${pi+1})`);
        pi += 2;
      }
    }

    if (profilePlaceholders.length > 0) {
      await pool.query(
        `INSERT INTO student_profiles (user_id, class_group_id)
         VALUES ${profilePlaceholders.join(', ')}
         ON CONFLICT (user_id) DO UPDATE SET class_group_id = EXCLUDED.class_group_id`,
        profileValues
      );
    }
  }

  return {
    total:      rawRows.length,
    inserted:   insertedUsers.length,
    failed:     failedRows.length,
    errors:     failedRows,
    duplicates,
  };
}

module.exports = { bulkInsertUsers };