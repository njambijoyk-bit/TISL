-- =====================================================================
-- 76_more_fonts.sql
-- Four more fonts for the appearance picker (table appearance_fonts):
--   Pacifico            a handwritten script           - very easy to spot, for testing
--   Press Start 2P      a chunky pixel / arcade font   - very easy to spot, for testing
--   Lexend              built to make reading easier   - a good choice for dyslexia
--   Atkinson Hyperlegible  made by the Braille Institute for low vision, with letters that cannot be confused
-- All four are on Google Fonts, like the others. (OpenDyslexic is not on Google Fonts, so it is not here.)
-- Run in Workbench. Safe to re-run: a font that is already in the table is skipped.
-- None of them is made a default, so nothing changes for anyone until they pick one.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- The fonts you have now, and which of the four are already there.
SELECT id, family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order FROM appearance_fonts ORDER BY sort_order;
SELECT family FROM appearance_fonts WHERE family IN ('Pacifico', 'Press Start 2P', 'Lexend', 'Atkinson Hyperlegible');

-- PART B - CHANGE (adds up to four rows; undo with the delete at the very bottom)
START TRANSACTION;

SET @next := (SELECT COALESCE(MAX(sort_order), 0) FROM appearance_fonts);

INSERT INTO appearance_fonts (family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order, created_at, updated_at)
SELECT 'Pacifico', 'Pacifico', 'display', 1, 0, 0, @next + 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM appearance_fonts WHERE family = 'Pacifico');

INSERT INTO appearance_fonts (family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order, created_at, updated_at)
SELECT 'Press Start 2P', 'Press+Start+2P', 'display', 1, 0, 0, @next + 2, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM appearance_fonts WHERE family = 'Press Start 2P');

INSERT INTO appearance_fonts (family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order, created_at, updated_at)
SELECT 'Lexend', 'Lexend', 'sans-serif', 1, 0, 0, @next + 3, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM appearance_fonts WHERE family = 'Lexend');

INSERT INTO appearance_fonts (family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order, created_at, updated_at)
SELECT 'Atkinson Hyperlegible', 'Atkinson+Hyperlegible', 'sans-serif', 1, 0, 0, @next + 4, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM appearance_fonts WHERE family = 'Atkinson Hyperlegible');

COMMIT;

-- PART C - RESULT CHECK. Expect the four new rows at the bottom (is_active 1, both default flags 0), and the original 17 untouched.
SELECT id, family, google_slug, category, is_active, is_default_heading, is_default_body, sort_order FROM appearance_fonts ORDER BY sort_order;

-- TO UNDO (only if you want them gone again): run this on its own.
-- DELETE FROM appearance_fonts WHERE family IN ('Pacifico', 'Press Start 2P', 'Lexend', 'Atkinson Hyperlegible');
