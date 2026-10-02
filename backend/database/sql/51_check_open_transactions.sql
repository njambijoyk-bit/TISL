-- =====================================================================
-- 51_check_open_transactions.sql
-- "Lock wait timeout exceeded" in the app means a transaction in another connection (usually a Workbench tab where a script
-- ended without COMMIT or ROLLBACK) is holding locks. This finds it. READ-ONLY until the last step. Safe to re-run.
-- =====================================================================

-- A1. Transactions open right now. Anything with trx_started long ago (minutes+) and few/no recent queries is the culprit.
SELECT trx_id, trx_mysql_thread_id AS connection_id, trx_state, trx_started,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS open_seconds, trx_rows_locked, trx_rows_modified, LEFT(trx_query, 120) AS running_query
FROM information_schema.innodb_trx
ORDER BY trx_started;

-- A2. Who is holding what (the connection ids to look at)
SELECT id AS connection_id, user, host, db, command, time AS seconds, state, LEFT(info, 120) AS query
FROM information_schema.processlist
ORDER BY time DESC;

-- A3. Which connection is blocking which (MySQL 8)
SELECT waiting_pid, blocking_pid, wait_age_secs, locked_table, waiting_query
FROM sys.innodb_lock_waits;

-- FIX 1 (best): go to the Workbench tab that ran the script and run  COMMIT;  (or  ROLLBACK;  to throw it away).
-- FIX 2: if that tab is gone, take the connection_id of the long-open transaction from A1 and run:
--        KILL <connection_id>;       (this rolls its open transaction back)
