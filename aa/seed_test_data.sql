BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Core lookup data
INSERT INTO roles (code, label) VALUES
('STUDENT', 'Student'),
('TEACHER', 'Teacher'),
('COORDINATOR', 'Coordinator'),
('ADMIN', 'Administrator')
ON CONFLICT (code) DO NOTHING;

INSERT INTO departments (code, name) VALUES
('GL', 'Genie Logiciel'),
('PHYS', 'Physics'),
('MATH', 'Mathematics')
ON CONFLICT (code) DO NOTHING;

INSERT INTO levels (code, name) VALUES
('L1', 'License 1'),
('L2', 'License 2'),
('L3', 'License 3'),
('M1', 'Master 1'),
('M2', 'Master 2')
ON CONFLICT (code) DO NOTHING;

-- 2) Staff users (password: test123)
INSERT INTO users (first_name, last_name, email, phone, status, password_hash) VALUES
('Nadia', 'Bensaid', 'coord.gl1@unilink.test', '0551000001', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Karim', 'Mebarki', 'coord.gl2@unilink.test', '0551000002', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Amine', 'Cherif', 'teacher.gl1@unilink.test', '0551000011', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Salma', 'Yahia', 'teacher.gl2@unilink.test', '0551000012', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Riad', 'Haddad', 'teacher.gl3@unilink.test', '0551000013', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Lina', 'Zerrouk', 'teacher.gl4@unilink.test', '0551000014', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Admin', 'Root', 'admin@unilink.test', '0551000099', 'ACTIVE', crypt('test123', gen_salt('bf')))
ON CONFLICT (email) DO UPDATE
SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();

-- 3) Staff role assignments
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = 'COORDINATOR'
WHERE u.email IN ('coord.gl1@unilink.test', 'coord.gl2@unilink.test')
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = 'TEACHER'
WHERE u.email IN ('teacher.gl1@unilink.test', 'teacher.gl2@unilink.test', 'teacher.gl3@unilink.test', 'teacher.gl4@unilink.test')
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = 'ADMIN'
WHERE u.email = 'admin@unilink.test'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 4) Teacher profiles
INSERT INTO teacher_profiles (
  user_id, employee_code, professional_grade, employment_status, academic_rank,
  hire_date, office_location, office_hours, bio, updated_at
)
SELECT
  u.id,
  t.employee_code,
  t.professional_grade,
  'ACTIVE',
  t.academic_rank,
  t.hire_date,
  t.office_location,
  t.office_hours,
  t.bio,
  NOW()
FROM (
  VALUES
    ('teacher.gl1@unilink.test', 'EMP-GL-001', 'Assistant', 'MSc', DATE '2019-09-01', 'B-201', 'Sun-Tue 10:00-12:00', 'Web and software engineering'),
    ('teacher.gl2@unilink.test', 'EMP-GL-002', 'Assistant', 'MSc', DATE '2020-09-01', 'B-202', 'Mon-Wed 09:00-11:00', 'Databases and data modeling'),
    ('teacher.gl3@unilink.test', 'EMP-GL-003', 'Lecturer', 'PhD', DATE '2018-09-01', 'B-203', 'Sun-Thu 13:00-15:00', 'Algorithms and architecture'),
    ('teacher.gl4@unilink.test', 'EMP-GL-004', 'Lecturer', 'PhD', DATE '2017-09-01', 'B-204', 'Tue-Thu 10:00-12:00', 'Networks and distributed systems')
) AS t(email, employee_code, professional_grade, academic_rank, hire_date, office_location, office_hours, bio)
JOIN users u ON u.email = t.email
ON CONFLICT (user_id) DO UPDATE
SET
  employee_code = EXCLUDED.employee_code,
  professional_grade = EXCLUDED.professional_grade,
  employment_status = EXCLUDED.employment_status,
  academic_rank = EXCLUDED.academic_rank,
  hire_date = EXCLUDED.hire_date,
  office_location = EXCLUDED.office_location,
  office_hours = EXCLUDED.office_hours,
  bio = EXCLUDED.bio,
  updated_at = NOW();

-- 5) Class groups
INSERT INTO class_groups (code, name, department_id, level_id, coordinator_user_id)
SELECT
  cg.code,
  cg.name,
  d.id,
  l.id,
  cu.id
FROM (
  VALUES
    ('GL-L2-A', 'Genie Logiciel L2 - Group A', 'GL', 'L2', 'coord.gl1@unilink.test'),
    ('GL-L2-B', 'Genie Logiciel L2 - Group B', 'GL', 'L2', 'coord.gl1@unilink.test'),
    ('GL-L3-A', 'Genie Logiciel L3 - Group A', 'GL', 'L3', 'coord.gl2@unilink.test'),
    ('GL-M1-A', 'Genie Logiciel M1 - Group A', 'GL', 'M1', 'coord.gl2@unilink.test')
) AS cg(code, name, dept_code, level_code, coordinator_email)
JOIN departments d ON d.code = cg.dept_code
JOIN levels l ON l.code = cg.level_code
JOIN users cu ON cu.email = cg.coordinator_email
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  department_id = EXCLUDED.department_id,
  level_id = EXCLUDED.level_id,
  coordinator_user_id = EXCLUDED.coordinator_user_id;

-- 6) Student users (24 students, password: test123)
INSERT INTO users (first_name, last_name, email, phone, status, password_hash) VALUES
('Yassine', 'Ait', 's01@unilink.test', '0552000001', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Sara', 'Benali', 's02@unilink.test', '0552000002', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Lina', 'Hamel', 's03@unilink.test', '0552000003', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Rami', 'Kaci', 's04@unilink.test', '0552000004', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Ines', 'Bouzid', 's05@unilink.test', '0552000005', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Nour', 'Dib', 's06@unilink.test', '0552000006', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Aya', 'Mansouri', 's07@unilink.test', '0552000007', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Samir', 'Ferhat', 's08@unilink.test', '0552000008', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Zina', 'Rahal', 's09@unilink.test', '0552000009', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Bilal', 'Lounis', 's10@unilink.test', '0552000010', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Hiba', 'Saidi', 's11@unilink.test', '0552000011', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Nassim', 'Touati', 's12@unilink.test', '0552000012', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Kenza', 'Meriem', 's13@unilink.test', '0552000013', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Ilyes', 'Riahi', 's14@unilink.test', '0552000014', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Yara', 'Brahimi', 's15@unilink.test', '0552000015', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Walid', 'Chergui', 's16@unilink.test', '0552000016', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Meriem', 'Belkacem', 's17@unilink.test', '0552000017', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Omar', 'Kadri', 's18@unilink.test', '0552000018', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Rania', 'Djelloul', 's19@unilink.test', '0552000019', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Sofiane', 'Meziane', 's20@unilink.test', '0552000020', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Dina', 'Hamidi', 's21@unilink.test', '0552000021', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Anis', 'Boudiaf', 's22@unilink.test', '0552000022', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Lamis', 'Messaoud', 's23@unilink.test', '0552000023', 'ACTIVE', crypt('test123', gen_salt('bf'))),
('Farid', 'Aouad', 's24@unilink.test', '0552000024', 'ACTIVE', crypt('test123', gen_salt('bf')))
ON CONFLICT (email) DO UPDATE
SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();

-- 7) Student role assignments
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code = 'STUDENT'
WHERE u.email SIMILAR TO 's(0[1-9]|1[0-9]|2[0-4])@unilink.test'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 8) Student profiles with class links
INSERT INTO student_profiles (
  user_id, student_number, class_group_id, enrollment_status, enrollment_year, program_name, updated_at
)
SELECT
  u.id,
  x.student_number,
  g.id,
  'ACTIVE',
  2026,
  'Genie Logiciel',
  NOW()
FROM (
  VALUES
    ('s01@unilink.test', 'STU-2026-001', 'GL-L2-A'),
    ('s02@unilink.test', 'STU-2026-002', 'GL-L2-A'),
    ('s03@unilink.test', 'STU-2026-003', 'GL-L2-A'),
    ('s04@unilink.test', 'STU-2026-004', 'GL-L2-A'),
    ('s05@unilink.test', 'STU-2026-005', 'GL-L2-A'),
    ('s06@unilink.test', 'STU-2026-006', 'GL-L2-A'),
    ('s07@unilink.test', 'STU-2026-007', 'GL-L2-B'),
    ('s08@unilink.test', 'STU-2026-008', 'GL-L2-B'),
    ('s09@unilink.test', 'STU-2026-009', 'GL-L2-B'),
    ('s10@unilink.test', 'STU-2026-010', 'GL-L2-B'),
    ('s11@unilink.test', 'STU-2026-011', 'GL-L2-B'),
    ('s12@unilink.test', 'STU-2026-012', 'GL-L2-B'),
    ('s13@unilink.test', 'STU-2026-013', 'GL-L3-A'),
    ('s14@unilink.test', 'STU-2026-014', 'GL-L3-A'),
    ('s15@unilink.test', 'STU-2026-015', 'GL-L3-A'),
    ('s16@unilink.test', 'STU-2026-016', 'GL-L3-A'),
    ('s17@unilink.test', 'STU-2026-017', 'GL-L3-A'),
    ('s18@unilink.test', 'STU-2026-018', 'GL-L3-A'),
    ('s19@unilink.test', 'STU-2026-019', 'GL-M1-A'),
    ('s20@unilink.test', 'STU-2026-020', 'GL-M1-A'),
    ('s21@unilink.test', 'STU-2026-021', 'GL-M1-A'),
    ('s22@unilink.test', 'STU-2026-022', 'GL-M1-A'),
    ('s23@unilink.test', 'STU-2026-023', 'GL-M1-A'),
    ('s24@unilink.test', 'STU-2026-024', 'GL-M1-A')
) AS x(email, student_number, class_code)
JOIN users u ON u.email = x.email
JOIN class_groups g ON g.code = x.class_code
ON CONFLICT (user_id) DO UPDATE
SET
  student_number = EXCLUDED.student_number,
  class_group_id = EXCLUDED.class_group_id,
  enrollment_status = EXCLUDED.enrollment_status,
  enrollment_year = EXCLUDED.enrollment_year,
  program_name = EXCLUDED.program_name,
  updated_at = NOW();

-- 9) Courses
INSERT INTO courses (
  code, title, description, class_group_id, is_course_chat_enabled, created_at, updated_at
)
SELECT
  c.code,
  c.title,
  c.description,
  g.id,
  TRUE,
  NOW(),
  NOW()
FROM (
  VALUES
    ('GL-L2A-WEB', 'Web Development', 'Frontend and backend fundamentals', 'GL-L2-A'),
    ('GL-L2A-DB', 'Database Systems', 'Relational models, SQL, transactions', 'GL-L2-A'),
    ('GL-L2A-ALGO', 'Algorithms I', 'Complexity and data structures', 'GL-L2-A'),
    ('GL-L2B-POO', 'Object Oriented Design', 'Classes, patterns, SOLID basics', 'GL-L2-B'),
    ('GL-L2B-NET', 'Computer Networks', 'OSI, TCP/IP, routing basics', 'GL-L2-B'),
    ('GL-L2B-UX', 'UI UX Basics', 'Human centered design principles', 'GL-L2-B'),
    ('GL-L3A-ARCH', 'Software Architecture', 'Architecture styles and tradeoffs', 'GL-L3-A'),
    ('GL-L3A-SEC', 'Application Security', 'Secure coding and OWASP basics', 'GL-L3-A'),
    ('GL-L3A-DEVOPS', 'DevOps Foundations', 'CI/CD and deployment pipelines', 'GL-L3-A'),
    ('GL-M1A-DATA', 'Data Engineering', 'Pipelines, ETL, warehousing', 'GL-M1-A'),
    ('GL-M1A-ML', 'Machine Learning Intro', 'Supervised and unsupervised methods', 'GL-M1-A'),
    ('GL-M1A-CLOUD', 'Cloud Architecture', 'Cloud services and distributed apps', 'GL-M1-A')
) AS c(code, title, description, class_code)
JOIN class_groups g ON g.code = c.class_code
ON CONFLICT (code) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  class_group_id = EXCLUDED.class_group_id,
  is_course_chat_enabled = EXCLUDED.is_course_chat_enabled,
  updated_at = NOW();

-- 10) Course-teacher links
INSERT INTO course_teachers (course_id, user_id, teaching_role, assigned_at, unassigned_at)
SELECT
  c.id,
  t.id,
  'COURS_TEACHER',
  NOW(),
  NULL
FROM (
  VALUES
    ('GL-L2A-WEB', 'teacher.gl1@unilink.test'),
    ('GL-L2A-DB', 'teacher.gl2@unilink.test'),
    ('GL-L2A-ALGO', 'teacher.gl3@unilink.test'),
    ('GL-L2B-POO', 'teacher.gl1@unilink.test'),
    ('GL-L2B-NET', 'teacher.gl4@unilink.test'),
    ('GL-L2B-UX', 'teacher.gl2@unilink.test'),
    ('GL-L3A-ARCH', 'teacher.gl3@unilink.test'),
    ('GL-L3A-SEC', 'teacher.gl4@unilink.test'),
    ('GL-L3A-DEVOPS', 'teacher.gl1@unilink.test'),
    ('GL-M1A-DATA', 'teacher.gl2@unilink.test'),
    ('GL-M1A-ML', 'teacher.gl3@unilink.test'),
    ('GL-M1A-CLOUD', 'teacher.gl4@unilink.test')
) AS ct(course_code, teacher_email)
JOIN courses c ON c.code = ct.course_code
JOIN users t ON t.email = ct.teacher_email
ON CONFLICT (course_id, user_id) DO UPDATE
SET
  teaching_role = EXCLUDED.teaching_role,
  assigned_at = EXCLUDED.assigned_at,
  unassigned_at = NULL;

COMMIT;
