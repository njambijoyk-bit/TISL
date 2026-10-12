-- =====================================================================
-- 158_courses_quizzes.sql
-- Courses module, step 7 (docs/COURSES_PLAN.md): assessments.
--   course_quizzes     a quiz is a lesson of kind "quiz": the pass mark, how many attempts, a time limit, whether questions are shuffled and when the answers are shown
--   course_questions   single choice, multiple choice, true / false, and short text (marked by the teacher, or automatically against a list of accepted answers)
--   course_attempts    one go at a quiz: the answers, the marks, the score, and whether it passed
-- Passing a quiz marks its lesson as done for the student.
-- Run 132 to 157 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_quizzes', 'course_questions', 'course_attempts');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_quizzes (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id        BIGINT UNSIGNED NOT NULL,
    lesson_id          BIGINT UNSIGNED NOT NULL,
    pass_pct           TINYINT UNSIGNED NOT NULL DEFAULT 70,
    max_attempts       TINYINT UNSIGNED NULL,                         -- empty = as many as the student likes
    time_limit_minutes SMALLINT UNSIGNED NULL,
    shuffle            TINYINT(1) NOT NULL DEFAULT 0,
    show_answers       VARCHAR(10) NOT NULL DEFAULT 'after_pass',     -- never | after_pass | after_each
    instructions       VARCHAR(1000) NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_course_quizzes_lesson (lesson_id),
    KEY idx_course_quizzes_offering (offering_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_questions (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id       BIGINT UNSIGNED NOT NULL,
    kind          VARCHAR(10) NOT NULL,                               -- single | multiple | truefalse | short
    body          TEXT NOT NULL,
    options       JSON NULL,                                          -- [{id, text}] for single and multiple
    correct       JSON NULL,                                          -- option ids; ["true"] or ["false"]; for short text, the accepted answers (empty = the teacher marks it)
    points        TINYINT UNSIGNED NOT NULL DEFAULT 1,
    explanation   VARCHAR(1000) NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_course_questions_quiz (quiz_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_attempts (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    quiz_id        BIGINT UNSIGNED NOT NULL,
    offering_id    BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    attempt_no     TINYINT UNSIGNED NOT NULL DEFAULT 1,
    status         VARCHAR(10) NOT NULL DEFAULT 'open',               -- open | submitted (waiting for the teacher) | marked
    answers        JSON NULL,                                         -- {question_id: answer}
    marks          JSON NULL,                                         -- {question_id: {points, comment, auto}}
    max_score      DECIMAL(7,2) NOT NULL DEFAULT 0,
    score          DECIMAL(7,2) NOT NULL DEFAULT 0,
    score_pct      DECIMAL(5,2) NULL,
    passed         TINYINT(1) NULL,
    started_at     DATETIME NOT NULL,
    expires_at     DATETIME NULL,
    submitted_at   DATETIME NULL,
    marked_by      BIGINT UNSIGNED NULL,
    marked_at      DATETIME NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_course_attempts_user (user_id, quiz_id),
    KEY idx_course_attempts_offering (offering_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK. Expect three tables.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_quizzes', 'course_questions', 'course_attempts');
