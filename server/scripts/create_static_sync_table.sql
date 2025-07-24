-- Create table for static sync history tracking
CREATE TABLE IF NOT EXISTS static_sync_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL DEFAULT 'sync',
    configuration_id VARCHAR(255),
    applied_by VARCHAR(255) NOT NULL,
    applied_at DATETIME NOT NULL,
    selected_products TEXT,
    backup_path VARCHAR(500),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_operation_type (operation_type),
    INDEX idx_applied_by (applied_by),
    INDEX idx_applied_at (applied_at),
    INDEX idx_created_at (created_at)
);

-- Add some helpful comments
ALTER TABLE static_sync_history COMMENT = 'Tracks static page synchronization operations for audit trail';

-- Sample data for testing (optional - remove in production)
-- INSERT INTO static_sync_history 
-- (operation_type, applied_by, applied_at, selected_products, metadata)
-- VALUES 
-- ('sync', 'demo@medpro.com', NOW(), '{"agendamento":"prod_123","clinica":"prod_456"}', '{"test":true}');