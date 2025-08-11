-- Add sequence number column to migration_logs for proper ordering
-- This is a safe, non-breaking change

USE medpro_admin;

-- Add sequence_num column if it doesn't exist
SET @column_exists = 0;
SELECT COUNT(*) INTO @column_exists
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'migration_logs'
  AND column_name = 'sequence_num';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE migration_logs ADD COLUMN sequence_num INT DEFAULT 0 AFTER message',
    'SELECT "Column sequence_num already exists" AS status');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for efficient ordering
SET @index_exists = 0;
SELECT COUNT(*) INTO @index_exists
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'migration_logs'
  AND index_name = 'idx_execution_sequence';

SET @sql = IF(@index_exists = 0,
    'ALTER TABLE migration_logs ADD INDEX idx_execution_sequence (execution_id, sequence_num)',
    'SELECT "Index idx_execution_sequence already exists" AS status');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add metrics column to migration_executions if it doesn't exist
SET @column_exists = 0;
SELECT COUNT(*) INTO @column_exists
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'migration_executions'
  AND column_name = 'metrics';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE migration_executions ADD COLUMN metrics JSON COMMENT "Parsed migration metrics" AFTER result_summary',
    'SELECT "Column metrics already exists" AS status');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration tracking columns added successfully' AS status;