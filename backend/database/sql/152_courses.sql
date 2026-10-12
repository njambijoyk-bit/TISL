-- =====================================================================
-- 152_courses.sql
-- Courses module, step 1 (docs/COURSES_PLAN.md): offerings (a course, a recipe, notes and files, or a live class), their sections and lessons, private files,
-- live sessions (a Zoom / Meet / Teams link), who may open what (access), the download log and the Courses settings.
--   course_offerings   what is taught or sold: kind, title, description, level, instructor, draft / published
--   course_sections    groups of lessons inside an offering
--   course_lessons     one step: text, video link, file, recipe or a live session
--   course_files       private files (notes, PDFs, images): never public, served by short-lived signed links
--   course_live        a dated session with a join link, meeting id and passcode, and a replay link
--   course_access      who may open an offering, from when until when, and why (an invoice, a membership, or a person at the desk)
--   course_downloads   the log of every file download
--   course_settings    one row of settings
-- Courses holds no prices: fees and invoices come in the next step and live in the books (vouchers and ledgers).
-- Run 132 to 151 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_offerings', 'course_sections', 'course_lessons', 'course_files', 'course_live', 'course_access', 'course_downloads', 'course_settings');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_offerings (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind                VARCHAR(10) NOT NULL DEFAULT 'course',       -- course | recipe | notes | live
    title               VARCHAR(160) NOT NULL,
    slug                VARCHAR(190) NOT NULL,
    summary             VARCHAR(400) NULL,
    body                MEDIUMTEXT NULL,                             -- the long description (and, for a recipe, the ingredients and method)
    cover               VARCHAR(255) NULL,
    category            VARCHAR(80) NULL,
    skill_level         VARCHAR(12) NOT NULL DEFAULT 'all',          -- all | beginner | intermediate | advanced
    tags                JSON NULL,
    instructor_user_id  BIGINT UNSIGNED NULL,
    delivery            VARCHAR(10) NOT NULL DEFAULT 'online',       -- online | in_person | hybrid
    location_id         BIGINT UNSIGNED NULL,                        -- the branch of an in-person offering
    status              VARCHAR(10) NOT NULL DEFAULT 'draft',        -- draft | published | archived
    free_preview        TINYINT(1) NOT NULL DEFAULT 0,               -- anyone may open the lessons marked as previews
    access_days         SMALLINT UNSIGNED NULL,                      -- access ends this many days after it begins (empty = for ever)
    min_attendance_pct  TINYINT UNSIGNED NULL,                       -- the share of sessions that must be attended (used by the attendance step)
    certificate         TINYINT(1) NOT NULL DEFAULT 0,               -- a certificate is issued on completion (used by the certificates step)
    created_by          BIGINT UNSIGNED NULL,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    UNIQUE KEY uq_course_offerings_slug (slug),
    KEY idx_course_offerings_status (status, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_sections (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id   BIGINT UNSIGNED NOT NULL,
    title         VARCHAR(160) NOT NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_course_sections_offering (offering_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_files (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id   BIGINT UNSIGNED NULL,
    name          VARCHAR(190) NOT NULL,                             -- the name shown (and given on download)
    path          VARCHAR(255) NOT NULL,                             -- where it is kept on the private disk
    mime          VARCHAR(120) NULL,
    size_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    sha256        CHAR(64) NULL,
    downloads     INT UNSIGNED NOT NULL DEFAULT 0,
    uploaded_by   BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_course_files_offering (offering_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_lessons (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id       BIGINT UNSIGNED NOT NULL,
    section_id        BIGINT UNSIGNED NULL,
    kind              VARCHAR(8) NOT NULL DEFAULT 'text',            -- text | video | file | recipe | live
    title             VARCHAR(160) NOT NULL,
    body              MEDIUMTEXT NULL,
    video_url         VARCHAR(500) NULL,
    file_id           BIGINT UNSIGNED NULL,
    duration_minutes  SMALLINT UNSIGNED NULL,
    drip_days         SMALLINT UNSIGNED NULL,                        -- opens this many days after access begins (empty = at once)
    is_preview        TINYINT(1) NOT NULL DEFAULT 0,                 -- anyone may open it when the offering allows free previews
    is_required       TINYINT(1) NOT NULL DEFAULT 1,                 -- counts towards completion
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_course_lessons_offering (offering_id, section_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_live (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id    BIGINT UNSIGNED NOT NULL,
    lesson_id      BIGINT UNSIGNED NULL,
    starts_at      DATETIME NOT NULL,
    ends_at        DATETIME NOT NULL,
    timezone       VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
    provider       VARCHAR(8) NOT NULL DEFAULT 'zoom',               -- zoom | meet | teams | other
    join_url       VARCHAR(500) NULL,
    meeting_id     VARCHAR(60) NULL,
    passcode       VARCHAR(60) NULL,
    replay_url     VARCHAR(500) NULL,
    capacity       SMALLINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_course_live_offering (offering_id, starts_at),
    KEY idx_course_live_lesson (lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_access (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    offering_id   BIGINT UNSIGNED NOT NULL,
    source        VARCHAR(12) NOT NULL,                              -- invoice | membership | staff
    source_ref    VARCHAR(60) NOT NULL DEFAULT '',                   -- the invoice, the membership or the person who gave it
    starts_at     DATETIME NOT NULL,
    ends_at       DATETIME NULL,
    revoked_at    DATETIME NULL,
    note          VARCHAR(300) NULL,
    granted_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_course_access (user_id, offering_id, source, source_ref),
    KEY idx_course_access_offering (offering_id),
    KEY idx_course_access_source (source, source_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_downloads (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    file_id       BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    offering_id   BIGINT UNSIGNED NULL,
    ip            VARCHAR(45) NULL,
    created_at    TIMESTAMP NULL,
    KEY idx_course_downloads_file (file_id),
    KEY idx_course_downloads_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_settings (
    id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings    JSON NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_offerings', 'course_sections', 'course_lessons', 'course_files', 'course_live', 'course_access', 'course_downloads', 'course_settings');
