-- MedPro Admin Database Schema
-- This creates a separate admin database for product catalog management

-- Create admin database
CREATE DATABASE IF NOT EXISTS medpro_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE medpro_admin;

-- Product catalog mirror from Stripe
CREATE TABLE product_catalog (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    metadata JSON COMMENT 'Complete Stripe metadata',
    
    -- Parsed metadata for easier querying
    plan_type VARCHAR(50),
    user_tier INT,
    environment VARCHAR(20) DEFAULT 'production',
    
    -- Sync tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_stripe_sync TIMESTAMP NULL,
    sync_status ENUM('synced', 'pending', 'error', 'conflict') DEFAULT 'pending',
    sync_error TEXT,
    
    -- Reference to MedPro database
    medpro_plan_code VARCHAR(50) COMMENT 'Links to medpro.PLANS.plan',
    
    INDEX idx_stripe_id (stripe_product_id),
    INDEX idx_active (active),
    INDEX idx_sync_status (sync_status),
    INDEX idx_plan_type (plan_type, user_tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Price information from Stripe
CREATE TABLE product_prices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_product_id VARCHAR(255) NOT NULL,
    
    -- Price details
    unit_amount INT NOT NULL COMMENT 'Amount in cents',
    currency VARCHAR(3) NOT NULL,
    billing_period ENUM('month', 'semester', 'year', 'one_time') NOT NULL,
    lookup_key VARCHAR(255),
    nickname VARCHAR(255),
    active BOOLEAN DEFAULT true,
    trial_period_days INT DEFAULT 0,
    
    -- Metadata
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (stripe_product_id) REFERENCES product_catalog(stripe_product_id) ON DELETE CASCADE,
    INDEX idx_stripe_price_id (stripe_price_id),
    INDEX idx_product (stripe_product_id),
    INDEX idx_lookup_key (lookup_key),
    INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit log for all admin actions
CREATE TABLE admin_audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_email VARCHAR(255) NOT NULL,
    action_type ENUM('create', 'update', 'delete', 'sync', 'bulk_update', 'recovery') NOT NULL,
    entity_type ENUM('product', 'price', 'metadata', 'sync') NOT NULL,
    entity_id VARCHAR(255) COMMENT 'Stripe ID of affected entity',
    
    -- Change details
    changes_json JSON COMMENT 'What changed',
    metadata_before JSON,
    metadata_after JSON,
    
    -- Request context
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(36) COMMENT 'UUID for tracking related actions',
    
    -- Results
    status ENUM('success', 'error', 'partial') DEFAULT 'success',
    error_message TEXT,
    affected_count INT DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_admin (admin_email, created_at),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_request (request_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sync queue for Stripe operations
CREATE TABLE sync_queue (
    id INT PRIMARY KEY AUTO_INCREMENT,
    operation_type ENUM('create_product', 'update_product', 'create_price', 'update_price', 'archive') NOT NULL,
    entity_type ENUM('product', 'price') NOT NULL,
    entity_id VARCHAR(255),
    
    -- Operation data
    operation_data JSON NOT NULL,
    priority INT DEFAULT 5 COMMENT '1-10, 1 is highest',
    
    -- Status tracking
    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    
    -- Scheduling
    scheduled_for TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- Error tracking
    last_error TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_status_priority (status, priority, scheduled_for),
    INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Metadata templates for quick product creation
CREATE TABLE metadata_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    category ENUM('subscription', 'ai_addon', 'bundle') NOT NULL,
    description TEXT,
    
    -- Template content
    base_metadata JSON NOT NULL,
    variable_fields JSON COMMENT 'Fields that need user input',
    validation_rules JSON,
    
    -- Usage tracking
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_category (category),
    INDEX idx_usage (usage_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- V3 recovery tracking
CREATE TABLE v3_recovery_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    recovery_batch VARCHAR(36) NOT NULL COMMENT 'UUID for grouping related fixes',
    
    -- What was fixed
    issue_type ENUM('missing_v3_prefix', 'wrong_lookup_key', 'orphaned_price', 'missing_price') NOT NULL,
    stripe_entity_id VARCHAR(255),
    entity_type ENUM('product', 'price') NOT NULL,
    
    -- Fix details
    original_value TEXT,
    fixed_value TEXT,
    action_taken ENUM('renamed', 'updated_metadata', 'created', 'archived', 'deleted') NOT NULL,
    
    -- Status
    status ENUM('pending', 'fixed', 'failed', 'skipped') DEFAULT 'pending',
    error_message TEXT,
    
    -- Audit
    executed_at TIMESTAMP NULL,
    executed_by VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_batch (recovery_batch),
    INDEX idx_status (status),
    INDEX idx_issue (issue_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin user permissions
CREATE TABLE admin_permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('super_admin', 'product_admin', 'viewer') DEFAULT 'viewer',
    
    -- Specific permissions
    can_create_products BOOLEAN DEFAULT FALSE,
    can_edit_products BOOLEAN DEFAULT FALSE,
    can_delete_products BOOLEAN DEFAULT FALSE,
    can_sync_stripe BOOLEAN DEFAULT FALSE,
    can_run_recovery BOOLEAN DEFAULT FALSE,
    can_view_audit BOOLEAN DEFAULT TRUE,
    
    -- Access control
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_email (email),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default metadata templates
INSERT INTO metadata_templates (name, category, description, base_metadata, created_by) VALUES
('Clinic Plan - Basic', 'subscription', 'Basic clinic plan template', JSON_OBJECT(
    'classification', JSON_OBJECT(
        'plan_type', 'CLINIC',
        'market_segment', 'small_practice'
    ),
    'subscription_limits', JSON_OBJECT(
        'patients', JSON_OBJECT('max_patients', 1000),
        'users', JSON_OBJECT('practitioners', 10, 'assistants', 5),
        'storage', JSON_OBJECT('documents_gb', 50, 'images_gb', 25)
    ),
    'ai_quotas', JSON_OBJECT(
        'tokens', JSON_OBJECT('monthly_limit', 500000, 'daily_limit', 20000),
        'audio', JSON_OBJECT('monthly_minutes', 600)
    ),
    'features', JSON_OBJECT(
        'clinical', JSON_OBJECT(
            'electronic_prescriptions', true,
            'lab_integrations', true
        ),
        'scheduling', JSON_OBJECT(
            'online_booking', true,
            'sms_reminders', true
        )
    )
), 'system'),

('Scheduling Plan - Basic', 'subscription', 'Basic scheduling plan template', JSON_OBJECT(
    'classification', JSON_OBJECT(
        'plan_type', 'SCHEDULING',
        'market_segment', 'small_practice'
    ),
    'subscription_limits', JSON_OBJECT(
        'patients', JSON_OBJECT('max_patients', 500),
        'users', JSON_OBJECT('practitioners', 5, 'assistants', 2),
        'storage', JSON_OBJECT('documents_gb', 25, 'images_gb', 10)
    ),
    'ai_quotas', JSON_OBJECT(
        'tokens', JSON_OBJECT('monthly_limit', 250000, 'daily_limit', 10000),
        'audio', JSON_OBJECT('monthly_minutes', 300)
    ),
    'features', JSON_OBJECT(
        'scheduling', JSON_OBJECT(
            'online_booking', true,
            'sms_reminders', true,
            'recurring_appointments', true
        )
    )
), 'system'),

('AI Professional Add-on', 'ai_addon', 'Professional AI features add-on', JSON_OBJECT(
    'package_type', 'ai_addon',
    'package_id', 'ai_professional',
    'quotas', JSON_OBJECT(
        'monthly_tokens', 1000000,
        'audio_minutes', 1200,
        'priority_multiplier', 2
    ),
    'features', JSON_OBJECT(
        'advanced_prompts', true,
        'custom_assistants', true,
        'api_access', true
    )
), 'system');

-- Create database user (run as root)
-- CREATE USER 'medpro_admin'@'localhost' IDENTIFIED BY 'secure_password_here';
-- GRANT ALL PRIVILEGES ON medpro_admin.* TO 'medpro_admin'@'localhost';
-- GRANT SELECT ON medpro.* TO 'medpro_admin'@'localhost';
-- FLUSH PRIVILEGES;