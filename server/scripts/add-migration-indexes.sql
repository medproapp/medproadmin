-- Add indexes to improve migration system performance
-- These are non-breaking changes that will speed up queries

USE medpro_admin;

-- Check if indexes exist before creating them
DELIMITER $$

CREATE PROCEDURE add_index_if_not_exists(
    IN table_name VARCHAR(64),
    IN index_name VARCHAR(64),
    IN index_columns VARCHAR(256)
)
BEGIN
    DECLARE index_exists INT DEFAULT 0;
    
    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
        AND table_name = table_name
        AND index_name = index_name;
    
    IF index_exists = 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', table_name, ' ADD INDEX ', index_name, ' (', index_columns, ')');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Index ', index_name, ' created on ', table_name) AS result;
    ELSE
        SELECT CONCAT('Index ', index_name, ' already exists on ', table_name) AS result;
    END IF;
END$$

DELIMITER ;

-- Add indexes for migration_logs table
CALL add_index_if_not_exists('migration_logs', 'idx_execution_id', 'execution_id');
CALL add_index_if_not_exists('migration_logs', 'idx_logged_at', 'logged_at');
CALL add_index_if_not_exists('migration_logs', 'idx_log_level', 'log_level');

-- Add indexes for migration_executions table
CALL add_index_if_not_exists('migration_executions', 'idx_status', 'status');
CALL add_index_if_not_exists('migration_executions', 'idx_environment_id', 'environment_id');
CALL add_index_if_not_exists('migration_executions', 'idx_started_at', 'started_at');
CALL add_index_if_not_exists('migration_executions', 'idx_job_id', 'job_id');

-- Add indexes for migration_jobs table
CALL add_index_if_not_exists('migration_jobs', 'idx_source_id', 'source_id');
CALL add_index_if_not_exists('migration_jobs', 'idx_is_active', 'is_active');
CALL add_index_if_not_exists('migration_jobs', 'idx_created_at', 'created_at');

-- Add indexes for migration_sources table
CALL add_index_if_not_exists('migration_sources', 'idx_is_active', 'is_active');
CALL add_index_if_not_exists('migration_sources', 'idx_name', 'name');

-- Drop the temporary procedure
DROP PROCEDURE IF EXISTS add_index_if_not_exists;

-- Add a cleanup procedure for old logs (won't affect current operations)
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS cleanup_old_migration_logs(
    IN days_to_keep INT
)
BEGIN
    DECLARE deleted_count INT;
    
    -- Default to 30 days if not specified
    IF days_to_keep IS NULL THEN
        SET days_to_keep = 30;
    END IF;
    
    -- Delete old logs from completed/failed executions
    DELETE FROM migration_logs 
    WHERE logged_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY)
    AND execution_id IN (
        SELECT id FROM migration_executions 
        WHERE status IN ('completed', 'failed')
        AND completed_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY)
    );
    
    SET deleted_count = ROW_COUNT();
    
    SELECT CONCAT('Deleted ', deleted_count, ' old log entries') AS result;
END$$

DELIMITER ;

-- Create an event to run cleanup weekly (disabled by default)
CREATE EVENT IF NOT EXISTS migration_log_cleanup
ON SCHEDULE EVERY 1 WEEK
STARTS CURRENT_TIMESTAMP
DISABLE
COMMENT 'Weekly cleanup of old migration logs'
DO CALL cleanup_old_migration_logs(30);

SELECT 'Migration performance indexes added successfully' AS status;