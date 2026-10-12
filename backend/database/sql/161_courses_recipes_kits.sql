-- =====================================================================
-- 161_courses_recipes_kits.sql
-- Courses module, step 10 (docs/COURSES_PLAN.md): recipes from Menus, and cooking kits.
--   course_recipe_sources   a lesson that was copied from a Menus recipe: which recipe, and a fingerprint of the text copied (so a refresh never overwrites a teacher's edits)
--   course_kit_items        the stock items in an offering's cooking kit (what each student is handed)
--   course_kit_handouts     the kit given to a student: when, by whom, and the delivery note that took it out of stock
-- Run 132 to 160 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_recipe_sources', 'course_kit_items', 'course_kit_handouts');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_recipe_sources (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id   BIGINT UNSIGNED NOT NULL,
    lesson_id     BIGINT UNSIGNED NOT NULL,
    recipe_id     BIGINT UNSIGNED NOT NULL,
    body_hash     CHAR(40) NOT NULL,                              -- sha1 of the text as copied
    published_by  BIGINT UNSIGNED NULL,
    published_at  DATETIME NOT NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_course_recipe_sources_lesson (lesson_id),
    KEY idx_course_recipe_sources_recipe (recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_kit_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id   BIGINT UNSIGNED NOT NULL,
    variant_id    BIGINT UNSIGNED NOT NULL,
    quantity      DECIMAL(12,3) NOT NULL DEFAULT 1,
    note          VARCHAR(160) NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_course_kit_items (offering_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_kit_handouts (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id    BIGINT UNSIGNED NOT NULL,
    enrolment_id   BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    order_id       BIGINT UNSIGNED NULL,                          -- the zero-value sales order the delivery note follows
    delivery_id    BIGINT UNSIGNED NULL,
    stock_note     VARCHAR(300) NULL,                             -- set when stock could not be taken
    handed_at      DATETIME NOT NULL,
    handed_by      BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_course_kit_handouts (enrolment_id),
    KEY idx_course_kit_handouts_offering (offering_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - VERIFY
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_recipe_sources', 'course_kit_items', 'course_kit_handouts');
