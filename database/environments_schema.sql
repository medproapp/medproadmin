-- Environment Management Schema for MedPro Admin
-- This adds environment management capabilities to the medpro_admin database

USE medpro_admin;

-- Environments table - stores configuration for multiple MedPro environments
CREATE TABLE environments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    
    -- Environment identification
    env_name VARCHAR(100) UNIQUE NOT NULL COMMENT 'Internal environment name',
    env_type ENUM('production', 'test', 'development', 'nqa') NOT NULL,
    display_name VARCHAR(150) NOT NULL COMMENT 'Human-readable name',
    description TEXT,
    
    -- Database connection details
    db_host VARCHAR(255) NOT NULL,
    db_port INT DEFAULT 3306,
    db_name VARCHAR(100) NOT NULL,
    db_user VARCHAR(100) NOT NULL,
    db_password_encrypted TEXT NOT NULL COMMENT 'AES encrypted password',
    
    -- API configuration
    api_base_url VARCHAR(500),
    api_timeout INT DEFAULT 30000 COMMENT 'Timeout in milliseconds',
    
    -- Display configuration
    color_theme VARCHAR(20) DEFAULT 'blue' COMMENT 'UI theme color',
    icon VARCHAR(50) DEFAULT 'server',
    
    -- Status and configuration
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    connection_timeout INT DEFAULT 5000 COMMENT 'Connection timeout in ms',
    
    -- Metadata
    environment_metadata JSON COMMENT 'Additional environment configuration',
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255),
    
    -- Indexes
    INDEX idx_env_type (env_type),
    INDEX idx_active (is_active),
    INDEX idx_default (is_default),
    INDEX idx_created (created_at),
    
    -- Ensure only one default environment
    CONSTRAINT check_default_env CHECK (is_default IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Environment access log - audit trail for environment access and user operations
CREATE TABLE env_access_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    
    -- Environment and admin info
    environment_id INT NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    
    -- Action details
    action_type ENUM('environment_switch', 'user_view', 'user_search', 'user_update', 'user_create', 'user_delete', 'connection_test') NOT NULL,
    target_user_email VARCHAR(255) COMMENT 'Email of user being managed (if applicable)',
    target_user_id INT COMMENT 'ID of user being managed (if applicable)',
    
    -- Action data
    action_details JSON COMMENT 'Additional action-specific data',
    search_criteria JSON COMMENT 'Search filters used',
    
    -- Results
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(36),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE,
    INDEX idx_env_admin (environment_id, admin_email),
    INDEX idx_target (target_user_email),
    INDEX idx_created (created_at),
    INDEX idx_action_type (action_type),
    INDEX idx_success (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add environment management permissions to existing admin_permissions table
ALTER TABLE admin_permissions 
ADD COLUMN allowed_environments JSON COMMENT 'Array of environment IDs this admin can access',
ADD COLUMN can_manage_environments BOOLEAN DEFAULT FALSE COMMENT 'Can create/edit/delete environments',
ADD COLUMN can_manage_users BOOLEAN DEFAULT FALSE COMMENT 'Can view/manage users in environments';

-- Note: Triggers removed for now - will be handled in application logic to avoid SQL parsing issues

-- Sample environments data
INSERT INTO environments (env_name, env_type, display_name, description, db_host, db_port, db_name, db_user, db_password_encrypted, api_base_url, color_theme, icon, is_default, created_by) VALUES
('medpro_prod', 'production', 'Production', 'Main production environment', 'localhost', 3306, 'medpro', 'medpro_readonly', 'placeholder_encrypted_password', 'https://api.medpro.com', 'red', 'shield-check', TRUE, 'system'),
('medpro_test', 'test', 'Testing', 'Testing environment for QA', 'localhost', 3306, 'medpro_test', 'medpro_readonly', 'placeholder_encrypted_password', 'https://test-api.medpro.com', 'yellow', 'bug', FALSE, 'system'),
('medpro_dev', 'development', 'Development', 'Development environment', 'localhost', 3306, 'medpro_dev', 'medpro', 'placeholder_encrypted_password', 'http://localhost:3000', 'green', 'code', FALSE, 'system'),
('medpro_nqa', 'nqa', 'NQA', 'Network Quality Assurance environment', 'localhost', 3306, 'medpro_nqa', 'medpro_readonly', 'placeholder_encrypted_password', 'https://nqa-api.medpro.com', 'blue', 'network', FALSE, 'system');

-- Update admin permissions for super_admin to access all environments
UPDATE admin_permissions 
SET allowed_environments = JSON_ARRAY(1, 2, 3, 4),
    can_manage_environments = TRUE,
    can_manage_users = TRUE
WHERE role = 'super_admin';

-- Create view for environment overview
CREATE VIEW environment_overview AS
SELECT 
    e.id,
    e.env_name,
    e.env_type,
    e.display_name,
    e.description,
    e.db_host,
    e.db_port,
    e.db_name,
    e.is_active,
    e.is_default,
    e.color_theme,
    e.icon,
    e.created_at,
    e.updated_at,
    COUNT(DISTINCT eal.admin_email) as unique_users_accessed,
    MAX(eal.created_at) as last_accessed
FROM environments e
LEFT JOIN env_access_log eal ON e.id = eal.environment_id
WHERE e.is_active = 1
GROUP BY e.id
ORDER BY e.is_default DESC, e.env_type, e.display_name;