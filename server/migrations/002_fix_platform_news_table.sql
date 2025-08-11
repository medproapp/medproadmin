-- Migration: Fix platform news table name inconsistency
-- Date: 2025-08-11
-- Description: Standardize platform news table name and ensure compatibility
-- Author: Claude Code

-- This migration addresses the table name inconsistency in the existing platform news system
-- The frontend API expects 'platformnews' but some code references 'platform_news'

-- Step 1: Check if the old 'platformnews' table exists
-- If it exists, we'll create a view to maintain compatibility
-- If not, we'll create the table with the expected name

SET @table_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
  AND table_name = 'platformnews'
);

SET @platform_news_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
  AND table_name = 'platform_news'
);

-- Create the platformnews table if it doesn't exist
-- This ensures compatibility with the existing frontend API
CREATE TABLE IF NOT EXISTS platformnews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  content LONGTEXT,
  category VARCHAR(100),
  type ENUM('feature', 'update', 'fix', 'security', 'maintenance') DEFAULT 'update',
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  target_audience ENUM('all', 'practitioners', 'patients') DEFAULT 'all',
  link_url VARCHAR(500),
  link_text VARCHAR(100),
  image_url VARCHAR(500),
  publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP NULL,
  author_user_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for the frontend API queries
  INDEX idx_active_published (is_active, publish_date),
  INDEX idx_target_audience (target_audience),
  INDEX idx_featured (is_featured),
  INDEX idx_publish_date (publish_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create a view from news_articles to platformnews for data synchronization
-- This allows the admin system to manage news that appear in the frontend
DROP VIEW IF EXISTS v_platform_news_sync;

CREATE VIEW v_platform_news_sync AS
SELECT 
    n.id,
    n.title,
    n.summary,
    n.content,
    n.category,
    n.type,
    n.featured as is_featured,
    n.active as is_active,
    n.target_audience,
    n.link_url,
    n.link_text,
    n.image_url,
    n.publish_date,
    n.expiry_date,
    n.author_email as author_user_id,
    n.created_at,
    n.updated_at
FROM news_articles n
WHERE n.active = 1 
  AND (n.expiry_date IS NULL OR n.expiry_date > NOW())
  AND n.publish_date <= NOW();

-- Insert sample data into platformnews table for immediate frontend compatibility
INSERT IGNORE INTO platformnews (
  id, title, summary, category, type, is_featured, target_audience, author_user_id
) VALUES
(1, 
  'Platform News System Active', 
  'The MedPro platform news system is now operational and ready to deliver updates.',
  'System',
  'feature',
  TRUE,
  'all',
  'admin@medpro.com'
),
(2,
  'Dashboard Improvements',
  'Recent enhancements to the practitioner dashboard improve workflow efficiency.',
  'Features',
  'update',
  FALSE,
  'practitioners',
  'admin@medpro.com'
);

-- Create stored procedure to sync news from admin system to platform news
-- This will be called whenever news_articles are updated
DELIMITER //

DROP PROCEDURE IF EXISTS sync_news_to_platform //

CREATE PROCEDURE sync_news_to_platform()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE article_id INT;
    DECLARE article_title VARCHAR(255);
    DECLARE article_summary TEXT;
    DECLARE article_content LONGTEXT;
    DECLARE article_category VARCHAR(100);
    DECLARE article_type VARCHAR(20);
    DECLARE article_featured BOOLEAN;
    DECLARE article_active BOOLEAN;
    DECLARE article_target_audience VARCHAR(20);
    DECLARE article_link_url VARCHAR(500);
    DECLARE article_link_text VARCHAR(100);
    DECLARE article_image_url VARCHAR(500);
    DECLARE article_publish_date TIMESTAMP;
    DECLARE article_expiry_date TIMESTAMP;
    DECLARE article_author VARCHAR(255);
    DECLARE article_created_at TIMESTAMP;
    DECLARE article_updated_at TIMESTAMP;
    
    -- Cursor to iterate through news_articles that should be synced
    DECLARE news_cursor CURSOR FOR
        SELECT id, title, summary, content, category, type, featured, active, 
               target_audience, link_url, link_text, image_url, publish_date, 
               expiry_date, author_email, created_at, updated_at
        FROM news_articles
        WHERE active = 1 
          AND (expiry_date IS NULL OR expiry_date > NOW())
          AND publish_date <= NOW();
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Clear existing platform news
    DELETE FROM platformnews WHERE id > 0;
    
    -- Reset auto increment
    ALTER TABLE platformnews AUTO_INCREMENT = 1;
    
    -- Open cursor and sync data
    OPEN news_cursor;
    
    read_loop: LOOP
        FETCH news_cursor INTO article_id, article_title, article_summary, article_content, 
              article_category, article_type, article_featured, article_active, article_target_audience, 
              article_link_url, article_link_text, article_image_url, article_publish_date, 
              article_expiry_date, article_author, article_created_at, article_updated_at;
        
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Insert into platformnews table
        INSERT INTO platformnews (
            title, summary, content, category, type, is_featured, is_active, 
            target_audience, link_url, link_text, image_url, publish_date, 
            expiry_date, author_user_id, created_at, updated_at
        ) VALUES (
            article_title, article_summary, article_content, article_category, article_type, 
            article_featured, article_active, article_target_audience, article_link_url, 
            article_link_text, article_image_url, article_publish_date, article_expiry_date, 
            article_author, article_created_at, article_updated_at
        );
        
    END LOOP;
    
    CLOSE news_cursor;
END //

DELIMITER ;

-- Call the sync procedure to initialize platform news with data from news_articles
CALL sync_news_to_platform();

-- Create triggers to keep platformnews in sync with news_articles
-- Trigger for INSERT
DROP TRIGGER IF EXISTS tr_news_articles_insert;

DELIMITER //
CREATE TRIGGER tr_news_articles_insert
    AFTER INSERT ON news_articles
    FOR EACH ROW
BEGIN
    IF NEW.active = 1 AND (NEW.expiry_date IS NULL OR NEW.expiry_date > NOW()) AND NEW.publish_date <= NOW() THEN
        INSERT INTO platformnews (
            title, summary, content, category, type, is_featured, is_active, 
            target_audience, link_url, link_text, image_url, publish_date, 
            expiry_date, author_user_id, created_at, updated_at
        ) VALUES (
            NEW.title, NEW.summary, NEW.content, NEW.category, NEW.type, 
            NEW.featured, NEW.active, NEW.target_audience, NEW.link_url, 
            NEW.link_text, NEW.image_url, NEW.publish_date, NEW.expiry_date, 
            NEW.author_email, NEW.created_at, NEW.updated_at
        );
    END IF;
END //
DELIMITER ;

-- Trigger for UPDATE
DROP TRIGGER IF EXISTS tr_news_articles_update;

DELIMITER //
CREATE TRIGGER tr_news_articles_update
    AFTER UPDATE ON news_articles
    FOR EACH ROW
BEGIN
    -- Remove from platformnews if it exists
    DELETE FROM platformnews WHERE title = OLD.title AND author_user_id = OLD.author_email;
    
    -- Add to platformnews if conditions are met
    IF NEW.active = 1 AND (NEW.expiry_date IS NULL OR NEW.expiry_date > NOW()) AND NEW.publish_date <= NOW() THEN
        INSERT INTO platformnews (
            title, summary, content, category, type, is_featured, is_active, 
            target_audience, link_url, link_text, image_url, publish_date, 
            expiry_date, author_user_id, created_at, updated_at
        ) VALUES (
            NEW.title, NEW.summary, NEW.content, NEW.category, NEW.type, 
            NEW.featured, NEW.active, NEW.target_audience, NEW.link_url, 
            NEW.link_text, NEW.image_url, NEW.publish_date, NEW.expiry_date, 
            NEW.author_email, NEW.created_at, NEW.updated_at
        );
    END IF;
END //
DELIMITER ;

-- Trigger for DELETE
DROP TRIGGER IF EXISTS tr_news_articles_delete;

DELIMITER //
CREATE TRIGGER tr_news_articles_delete
    AFTER DELETE ON news_articles
    FOR EACH ROW
BEGIN
    DELETE FROM platformnews WHERE title = OLD.title AND author_user_id = OLD.author_email;
END //
DELIMITER ;

-- Update table statistics
ANALYZE TABLE platformnews;