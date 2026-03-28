-- =============================================================================
-- FACULTY CONTACT & COMMUNICATION PLATFORM
-- MVP PostgreSQL Schema + Seed Data
-- Generated: 2026-03-24
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE teacher_employment_status_enum AS ENUM ('ACTIVE', 'ON_LEAVE', 'RETIRED', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE student_enrollment_status_enum AS ENUM ('ACTIVE', 'ON_BREAK', 'GRADUATED', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE teaching_role_enum AS ENUM ('TP_TEACHER', 'TD_TEACHER', 'COURS_TEACHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE announcement_scope_enum AS ENUM ('COURSE', 'GLOBAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE announcement_priority_enum AS ENUM ('NORMAL', 'URGENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE announcement_status_enum AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE announcement_target_type_enum AS ENUM ('COURSE', 'ROLE', 'DEPARTMENT', 'LEVEL', 'CLASS_GROUP', 'ALL_STUDENTS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE chat_type_enum AS ENUM ('GENERAL_CLASS', 'COURSE', 'STAFF', 'DIRECT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE chat_member_role_enum AS ENUM ('MEMBER', 'MODERATOR', 'OWNER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Identity & Access
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    status user_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_code VARCHAR(80) UNIQUE,
    professional_grade VARCHAR(120),
    employment_status teacher_employment_status_enum NOT NULL DEFAULT 'ACTIVE',
    academic_rank VARCHAR(120),
    hire_date DATE,
    office_location VARCHAR(255),
    office_hours TEXT,
    bio TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student_number VARCHAR(80) UNIQUE,
    class_group_id UUID NOT NULL,
    enrollment_status student_enrollment_status_enum NOT NULL DEFAULT 'ACTIVE',
    enrollment_year INT,
    program_name VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (enrollment_year IS NULL OR enrollment_year BETWEEN 1990 AND 2100)
);

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS class_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id),
    level_id UUID NOT NULL REFERENCES levels(id),
    coordinator_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_student_profiles_class_group'
    ) THEN
        ALTER TABLE student_profiles
        ADD CONSTRAINT fk_student_profiles_class_group
        FOREIGN KEY (class_group_id) REFERENCES class_groups(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Courses & Membership Rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    class_group_id UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
    is_course_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_teachers (
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teaching_role teaching_role_enum NOT NULL DEFAULT 'COURS_TEACHER',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    PRIMARY KEY (course_id, user_id),
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- Note: course students are derived from student_profiles.class_group_id through courses.class_group_id

-- ----------------------------------------------------------------------------
-- 4) Announcements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope announcement_scope_enum NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    priority announcement_priority_enum NOT NULL DEFAULT 'NORMAL',
    status announcement_status_enum NOT NULL DEFAULT 'DRAFT',
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    target_type announcement_target_type_enum NOT NULL,
    target_value VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(120),
    file_size BIGINT,
    CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (announcement_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 5) Messaging
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_type chat_type_enum NOT NULL,
    name VARCHAR(255),
    class_group_id UUID REFERENCES class_groups(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (chat_type = 'GENERAL_CLASS' AND class_group_id IS NOT NULL AND course_id IS NULL)
        OR (chat_type = 'COURSE' AND course_id IS NOT NULL)
        OR (chat_type = 'STAFF')
        OR (chat_type = 'DIRECT')
    )
);

CREATE TABLE IF NOT EXISTS chat_members (
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_chat chat_member_role_enum NOT NULL DEFAULT 'MEMBER',
    added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(120),
    file_size BIGINT,
    CHECK (file_size IS NULL OR file_size >= 0)
);

-- ----------------------------------------------------------------------------
-- 6) Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_class_group_id ON student_profiles(class_group_id);
CREATE INDEX IF NOT EXISTS idx_courses_class_group_id ON courses(class_group_id);
CREATE INDEX IF NOT EXISTS idx_course_teachers_user_id ON course_teachers(user_id);

CREATE INDEX IF NOT EXISTS idx_announcements_scope_status ON announcements(scope, status);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_announcement ON announcement_targets(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_type_value ON announcement_targets(target_type, target_value);

CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(chat_type);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_user_id);

-- Unique: one general class chat per class group
CREATE UNIQUE INDEX IF NOT EXISTS uq_general_class_chat_per_group
    ON chats(class_group_id)
    WHERE chat_type = 'GENERAL_CLASS';

-- Unique: one course chat per course
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_chat_per_course
    ON chats(course_id)
    WHERE chat_type = 'COURSE';

-- ----------------------------------------------------------------------------
-- 7) Seed Data (MVP baseline)
-- ----------------------------------------------------------------------------
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

COMMIT;

-- =============================================================================
-- CONSTRAINT CHECKLIST (APP + DB)
-- =============================================================================
-- 1) Announcement scope targeting integrity:
--    if scope=COURSE => must have at least one announcement_targets row where target_type='COURSE'.
--    if scope=GLOBAL => must not use target_type='COURSE' and must have at least one non-COURSE target.
--    enforce at publish time in service layer (or with trigger in V2).
-- 2) Chat membership policy:
--    GENERAL_CLASS auto members = students where student_profiles.class_group_id = chat.class_group_id + coordinator.
--    COURSE auto members = students where student_profiles.class_group_id = course.class_group_id + course teachers.
--    enforce through application service + background sync jobs.
-- 3) DIRECT chat exactly 2 users:
--    enforce in service layer or add trigger in V2.
-- 4) Student-to-student DM disabled by default:
--    enforce in authorization layer.
-- =============================================================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);