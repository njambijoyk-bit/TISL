-- =====================================================================
-- 156_courses_books.sql
-- Courses module, step 5 (docs/COURSES_PLAN.md): the books library. Books are Courses' own table (not E-commerce products); they are sold by Sales Order and invoice in the books.
--   course_books           a book: title, authors, ISBN, printed / digital / both, price, the sales account it is booked under, an optional stock item (so a printed copy leaves stock when delivered), the digital file and a free sample
--   course_book_orders     one sale of a book: who bought it, how it reaches them, the Sales Order and invoice, what has been paid
--   course_offering_books  the books a course asks for (required) or suggests (recommended)
-- Run 132 to 155 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_books', 'course_book_orders', 'course_offering_books');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_books (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(190) NOT NULL,
    slug             VARCHAR(220) NOT NULL,
    authors          VARCHAR(200) NULL,
    isbn             VARCHAR(20) NULL,
    description      TEXT NULL,
    cover            VARCHAR(255) NULL,
    format           VARCHAR(8) NOT NULL DEFAULT 'printed',       -- printed | digital | both
    price            DECIMAL(12,2) NOT NULL DEFAULT 0,            -- before tax
    ledger_id        BIGINT UNSIGNED NOT NULL,                    -- the sales account it is booked under (it decides the tax)
    stock_variant_id BIGINT UNSIGNED NULL,                        -- the stock item a printed copy leaves when it is delivered
    file_id          BIGINT UNSIGNED NULL,                        -- the digital file (a private course file)
    sample_file_id   BIGINT UNSIGNED NULL,                        -- a free sample anyone may download
    download_limit   TINYINT UNSIGNED NOT NULL DEFAULT 5,         -- how many times a buyer may download the digital file (0 = no limit)
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    sort_order       INT NOT NULL DEFAULT 0,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_course_books_slug (slug),
    KEY idx_course_books_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_book_orders (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NOT NULL,                        -- BK-000123
    book_id          BIGINT UNSIGNED NOT NULL,
    buyer_user_id    BIGINT UNSIGNED NOT NULL,
    customer_id      BIGINT UNSIGNED NULL,
    quantity         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    unit_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
    fulfil           VARCHAR(8) NOT NULL DEFAULT 'digital',       -- digital | delivery | pickup
    address          VARCHAR(500) NULL,
    phone            VARCHAR(40) NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending | paid | fulfilled | cancelled | refunded
    channel          VARCHAR(8) NOT NULL DEFAULT 'online',        -- counter | online
    voucher_id       BIGINT UNSIGNED NULL,
    invoice_id       BIGINT UNSIGNED NULL,
    credit_note_id   BIGINT UNSIGNED NULL,
    total            DECIMAL(14,2) NOT NULL DEFAULT 0,            -- the invoice total, tax included
    paid_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
    downloads        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    stock_note       VARCHAR(300) NULL,
    expires_at       DATETIME NULL,
    delivered_at     DATETIME NULL,
    cancelled_at     DATETIME NULL,
    cancel_reason    VARCHAR(300) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_course_book_orders_number (number),
    KEY idx_course_book_orders_buyer (buyer_user_id),
    KEY idx_course_book_orders_book (book_id, status),
    KEY idx_course_book_orders_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_offering_books (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id  BIGINT UNSIGNED NOT NULL,
    book_id      BIGINT UNSIGNED NOT NULL,
    relation     VARCHAR(12) NOT NULL DEFAULT 'recommended',      -- required | recommended
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_course_offering_books (offering_id, book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK. Expect three tables.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_books', 'course_book_orders', 'course_offering_books');
