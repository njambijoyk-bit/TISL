-- TISL Content Studio — Database Schema

-- 1. Publications Table
-- Stores the high-level metadata for brochures, news, and blog posts.
CREATE TABLE publications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('brochure', 'news', 'blog') NOT NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    cover_image VARCHAR(500) NULL,
    template VARCHAR(50) NULL COMMENT 'brochure only: minimal|bold|corporate',
    style_config JSON NULL COMMENT 'brochure only: accent color, fonts, background',
    tags JSON NULL COMMENT 'news and blog: array of tag strings',
    published_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Publication Blocks Table
-- Stores the actual content of each publication in a block-by-block format.
CREATE TABLE publication_blocks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    publication_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    block_order INT UNSIGNED NOT NULL DEFAULT 0,
    content JSON NOT NULL,
    style JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
    INDEX idx_publication_order (publication_id, block_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Publication Authors Table
-- Support for multiple contributors per publication.
CREATE TABLE publication_authors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    publication_id BIGINT UNSIGNED NOT NULL,
    admin_id BIGINT UNSIGNED NOT NULL,
    role ENUM('primary', 'contributor') NOT NULL DEFAULT 'contributor',
    UNIQUE KEY unique_pub_author (publication_id, admin_id),
    FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Publication Comments Table
-- Feedback loop for News and Blog posts.
CREATE TABLE publication_comments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    publication_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL COMMENT 'null if guest comment',
    parent_id BIGINT UNSIGNED NULL COMMENT 'for threaded replies',
    author_name VARCHAR(100) NULL COMMENT 'for guest comments',
    author_email VARCHAR(255) NULL COMMENT 'for guest comments',
    body TEXT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES publication_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
