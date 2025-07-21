-- Create medpro_admin database if not exists
CREATE DATABASE IF NOT EXISTS medpro_admin;

-- IMPORTANT: Make sure we're using the admin database, not the main medpro database
USE medpro_admin;

-- Admin permissions table
CREATE TABLE IF NOT EXISTS admin_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    role ENUM('super_admin', 'admin', 'viewer') DEFAULT 'viewer',
    can_create_products BOOLEAN DEFAULT FALSE,
    can_edit_products BOOLEAN DEFAULT FALSE,
    can_delete_products BOOLEAN DEFAULT FALSE,
    can_sync_stripe BOOLEAN DEFAULT FALSE,
    can_run_recovery BOOLEAN DEFAULT FALSE,
    can_view_audit BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product catalog table
CREATE TABLE IF NOT EXISTS product_catalog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_product_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plan_type VARCHAR(50),
    user_tier INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    metadata JSON,
    stripe_created_at TIMESTAMP NULL,
    sync_status ENUM('synced', 'local_only', 'needs_update', 'error') DEFAULT 'synced',
    sync_error TEXT,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    INDEX idx_stripe_product_id (stripe_product_id),
    INDEX idx_plan_type (plan_type),
    INDEX idx_user_tier (user_tier),
    INDEX idx_active (active),
    INDEX idx_sync_status (sync_status),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product prices table
CREATE TABLE IF NOT EXISTS product_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
    stripe_product_id VARCHAR(255) NOT NULL,
    nickname VARCHAR(255),
    currency VARCHAR(3) DEFAULT 'brl',
    unit_amount DECIMAL(10,2),
    recurring_interval VARCHAR(20),
    recurring_interval_count INT DEFAULT 1,
    active BOOLEAN DEFAULT TRUE,
    metadata JSON,
    stripe_created_at TIMESTAMP NULL,
    sync_status ENUM('synced', 'local_only', 'needs_update', 'error') DEFAULT 'synced',
    sync_error TEXT,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    INDEX idx_stripe_price_id (stripe_price_id),
    INDEX idx_stripe_product_id (stripe_product_id),
    INDEX idx_active (active),
    INDEX idx_unit_amount (unit_amount),
    INDEX idx_sync_status (sync_status),
    FOREIGN KEY (stripe_product_id) REFERENCES product_catalog(stripe_product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- V3 recovery log table
CREATE TABLE IF NOT EXISTS v3_recovery_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_product_name VARCHAR(255),
    correct_product_name VARCHAR(255),
    stripe_product_id VARCHAR(255),
    plan_type VARCHAR(50),
    user_tier INT,
    action_taken ENUM('renamed', 'merged', 'archived', 'skipped') NOT NULL,
    action_details JSON,
    recovery_status ENUM('pending', 'completed', 'failed', 'rolled_back') DEFAULT 'pending',
    error_message TEXT,
    executed_by VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP NULL,
    rolled_back_by VARCHAR(255),
    INDEX idx_stripe_product_id (stripe_product_id),
    INDEX idx_recovery_status (recovery_status),
    INDEX idx_executed_at (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_email VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    changes_json JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(255),
    status ENUM('success', 'failed') DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_email (admin_email),
    INDEX idx_action_type (action_type),
    INDEX idx_entity_type (entity_type),
    INDEX idx_entity_id (entity_id),
    INDEX idx_created_at (created_at),
    INDEX idx_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stripe sync history table
CREATE TABLE IF NOT EXISTS stripe_sync_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sync_type ENUM('full', 'partial', 'single_product', 'single_price') NOT NULL,
    sync_direction ENUM('stripe_to_local', 'local_to_stripe', 'bidirectional') NOT NULL,
    entity_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    sync_status ENUM('running', 'completed', 'failed', 'cancelled') DEFAULT 'running',
    error_details JSON,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    executed_by VARCHAR(255) NOT NULL,
    INDEX idx_sync_type (sync_type),
    INDEX idx_sync_status (sync_status),
    INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default super admin (demo user)
INSERT INTO admin_permissions (
    email, 
    role, 
    can_create_products, 
    can_edit_products, 
    can_delete_products, 
    can_sync_stripe, 
    can_run_recovery, 
    can_view_audit
) VALUES (
    'demo@medpro.com',
    'super_admin',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
) ON DUPLICATE KEY UPDATE role = 'super_admin';

-- Create views for common queries
CREATE OR REPLACE VIEW v_active_products_with_prices AS
SELECT 
    p.*,
    COUNT(DISTINCT pr.id) as price_count,
    MIN(pr.unit_amount) as min_price,
    MAX(pr.unit_amount) as max_price,
    GROUP_CONCAT(
        JSON_OBJECT(
            'id', pr.stripe_price_id,
            'amount', pr.unit_amount,
            'currency', pr.currency,
            'interval', pr.recurring_interval
        )
    ) as prices_json
FROM product_catalog p
LEFT JOIN product_prices pr ON p.stripe_product_id = pr.stripe_product_id AND pr.active = TRUE
WHERE p.active = TRUE
GROUP BY p.id;

-- Create view for sync status summary
CREATE OR REPLACE VIEW v_sync_status_summary AS
SELECT 
    'products' as entity_type,
    sync_status,
    COUNT(*) as count
FROM product_catalog
GROUP BY sync_status
UNION ALL
SELECT 
    'prices' as entity_type,
    sync_status,
    COUNT(*) as count
FROM product_prices
GROUP BY sync_status;