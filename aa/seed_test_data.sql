BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================
-- 1. ROLES
-- ========================
INSERT INTO roles (code, label) VALUES
('STUDENT', 'Student'),
('TEACHER', 'Teacher'),
('COORDINATOR', 'Coordinator'),
('ADMIN', 'Administrator')
ON CONFLICT (code) DO NOTHING;

-- ========================
-- 2. DEPARTMENTS
-- ========================
INSERT INTO departments (code, name) VALUES
('GL', 'Genie Logiciel'),
('RT', 'Reseaux & Telecom'),
('IIA', 'Informatique Industrielle')
ON CONFLICT (code) DO NOTHING;

-- ========================
-- 3. LEVELS
-- ========================
INSERT INTO levels (code, label) VALUES
('L1', '1st Year'),
('L2', '2nd Year'),
('L3', '3rd Year')
ON CONFLICT (code) DO NOTHING;

-- ========================
-- 4. USERS
-- ========================
INSERT INTO users (email, password, status)
VALUES
('admin@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE'),
('teacher.gl@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE'),
('teacher.rt@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE'),
('student1@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE'),
('student2@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE'),
('student3@unilink.test', crypt('test123', gen_salt('bf')), 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- ========================
-- 5. USER ROLES
-- ========================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON (
    (u.email = 'admin@unilink.test' AND r.code = 'ADMIN') OR
    (u.email LIKE 'teacher.%' AND r.code = 'TEACHER') OR
    (u.email LIKE 'student%' AND r.code = 'STUDENT')
)
ON CONFLICT DO NOTHING;

-- ========================
-- 6. PROFILES
-- ========================
INSERT INTO profiles (user_id, full_name)
SELECT id,
CASE
    WHEN email = 'admin@unilink.test' THEN 'Admin User'
    WHEN email = 'teacher.gl@unilink.test' THEN 'Dr. GL Teacher'
    WHEN email = 'teacher.rt@unilink.test' THEN 'Dr. RT Teacher'
    WHEN email = 'student1@unilink.test' THEN 'Ali Ben Salah'
    WHEN email = 'student2@unilink.test' THEN 'Sara Trabelsi'
    WHEN email = 'student3@unilink.test' THEN 'Mohamed Jaziri'
END
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ========================
-- 7. CLASS GROUPS
-- ========================
INSERT INTO class_groups (code, department_id, level_id)
SELECT 'GL1', d.id, l.id
FROM departments d, levels l
WHERE d.code = 'GL' AND l.code = 'L1'
ON CONFLICT (code) DO NOTHING;

INSERT INTO class_groups (code, department_id, level_id)
SELECT 'RT1', d.id, l.id
FROM departments d, levels l
WHERE d.code = 'RT' AND l.code = 'L1'
ON CONFLICT (code) DO NOTHING;

-- ========================
-- 8. STUDENTS
-- ========================
INSERT INTO students (user_id, class_group_id)
SELECT u.id, cg.id
FROM users u
JOIN class_groups cg ON cg.code = 'GL1'
WHERE u.email IN ('student1@unilink.test', 'student2@unilink.test')
ON CONFLICT DO NOTHING;

INSERT INTO students (user_id, class_group_id)
SELECT u.id, cg.id
FROM users u
JOIN class_groups cg ON cg.code = 'RT1'
WHERE u.email = 'student3@unilink.test'
ON CONFLICT DO NOTHING;

-- ========================
-- 9. TEACHERS
-- ========================
INSERT INTO teachers (user_id, department_id)
SELECT u.id, d.id
FROM users u
JOIN departments d ON d.code = 'GL'
WHERE u.email = 'teacher.gl@unilink.test'
ON CONFLICT DO NOTHING;

INSERT INTO teachers (user_id, department_id)
SELECT u.id, d.id
FROM users u
JOIN departments d ON d.code = 'RT'
WHERE u.email = 'teacher.rt@unilink.test'
ON CONFLICT DO NOTHING;

-- ========================
-- 10. COURSES
-- ========================
INSERT INTO courses (code, title, department_id)
SELECT 'ALG101', 'Algorithms', d.id
FROM departments d WHERE d.code = 'GL'
ON CONFLICT (code) DO NOTHING;

INSERT INTO courses (code, title, department_id)
SELECT 'NET101', 'Networking Basics', d.id
FROM departments d WHERE d.code = 'RT'
ON CONFLICT (code) DO NOTHING;

-- ========================
-- 11. COURSE ASSIGNMENTS
-- ========================
INSERT INTO course_teachers (course_id, teacher_id)
SELECT c.id, t.id
FROM courses c
JOIN teachers t ON TRUE
JOIN users u ON t.user_id = u.id
WHERE c.code = 'ALG101' AND u.email = 'teacher.gl@unilink.test'
ON CONFLICT DO NOTHING;

INSERT INTO course_teachers (course_id, teacher_id)
SELECT c.id, t.id
FROM courses c
JOIN teachers t ON TRUE
JOIN users u ON t.user_id = u.id
WHERE c.code = 'NET101' AND u.email = 'teacher.rt@unilink.test'
ON CONFLICT DO NOTHING;

-- ========================
-- 12. ENROLLMENTS
-- ========================
INSERT INTO enrollments (student_id, course_id)
SELECT s.id, c.id
FROM students s
JOIN users u ON s.user_id = u.id
JOIN courses c ON c.code = 'ALG101'
WHERE u.email IN ('student1@unilink.test', 'student2@unilink.test')
ON CONFLICT DO NOTHING;

INSERT INTO enrollments (student_id, course_id)
SELECT s.id, c.id
FROM students s
JOIN users u ON s.user_id = u.id
JOIN courses c ON c.code = 'NET101'
WHERE u.email = 'student3@unilink.test'
ON CONFLICT DO NOTHING;

-- ========================
-- 13. GRADES
-- ========================
INSERT INTO grades (student_id, course_id, grade)
SELECT s.id, c.id,
CASE
    WHEN u.email = 'student1@unilink.test' THEN 15
    WHEN u.email = 'student2@unilink.test' THEN 12
END
FROM students s
JOIN users u ON s.user_id = u.id
JOIN courses c ON c.code = 'ALG101'
WHERE u.email IN ('student1@unilink.test', 'student2@unilink.test')
ON CONFLICT DO NOTHING;

INSERT INTO grades (student_id, course_id, grade)
SELECT s.id, c.id, 14
FROM students s
JOIN users u ON s.user_id = u.id
JOIN courses c ON c.code = 'NET101'
WHERE u.email = 'student3@unilink.test'
ON CONFLICT DO NOTHING;

-- ========================
-- END
-- ========================
COMMIT;