-- =====================================================================
-- 104_exchange.sql
-- Step 8: books exchanged as .wnkjap files (docs/WNKJAP_FORMAT.md).
--
-- NOTHING of another company is ever stored here. Their books are opened in the browser from a file or a fetch and are gone when the page closes.
-- These two tables are only this system's own settings:
--   exchange_keys         keys another company's viewer uses to FETCH an export from this system. The secret is kept only as a hash; the
--                         file password is kept encrypted (it is needed to seal each export) and is never shown again after it is made.
--   exchange_connections  other companies' sites this system may FETCH from: a name, an address and the key (kept encrypted).
-- Safe to run twice.
-- =====================================================================

-- PART A — LOOK FIRST (changes nothing)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('exchange_keys', 'exchange_connections');

-- PART B — CHANGE
CREATE TABLE IF NOT EXISTS exchange_keys (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(120) NOT NULL,                       -- who it is for ("Nairobi shop viewer")
    key_id VARCHAR(24) NOT NULL,                       -- the public half of the key (goes before the dot)
    secret_hash CHAR(64) NOT NULL,                     -- sha-256 of the secret half; the secret itself is never stored
    file_password_enc TEXT NOT NULL,                   -- the file password, encrypted with the application key
    max_level TINYINT UNSIGNED NOT NULL DEFAULT 2,     -- the deepest export this key may ask for (1 summary ... 4 full)
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_used_at DATETIME NULL,
    last_used_ip VARCHAR(45) NULL,
    uses INT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_exchange_key_id (key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_connections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,                        -- the other company, as you call it
    base_url VARCHAR(255) NOT NULL,                    -- its site, for example https://books.example.co.ke
    key_enc TEXT NOT NULL,                             -- the key it gave us, encrypted with the application key
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C — CHECK (expect 2)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('exchange_keys', 'exchange_connections');
