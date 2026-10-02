-- =====================================================================
-- 55_drop_booking_copies.sql
-- Removes the zz_bk_ copies of the old booking tables that script 53 made. They were test data; nothing in the app reads them.
-- DROP cannot be undone. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK. The copies that exist now (expect 8 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'zz\_bk\_%' ORDER BY table_name;

-- PART B — DROP (DDL, commits on its own)
DROP TABLE IF EXISTS zz_bk_worksheet_items;
DROP TABLE IF EXISTS zz_bk_booking_worksheets;
DROP TABLE IF EXISTS zz_bk_booking_activity_logs;
DROP TABLE IF EXISTS zz_bk_booking_disqualifications;
DROP TABLE IF EXISTS zz_bk_booking_orders;
DROP TABLE IF EXISTS zz_bk_booking_staff;
DROP TABLE IF EXISTS zz_bk_booking_settings;
DROP TABLE IF EXISTS zz_bk_bookings;

-- PART C — RESULT CHECK (expect 0 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'zz\_bk\_%';
