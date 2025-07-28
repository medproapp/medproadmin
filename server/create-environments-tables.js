const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'medpro_admin',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'medpro_admin',
            port: process.env.DB_PORT || 3306
        });
        
        console.log('Connected to database');
        
        // Create environments table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS environments (
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
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('Created environments table');
        
        // Create env_access_log table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS env_access_log (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        console.log('Created env_access_log table');
        
        // Add columns to admin_permissions if they don't exist
        try {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN IF NOT EXISTS allowed_environments JSON COMMENT 'Array of environment IDs this admin can access'
            `);
            console.log('Added allowed_environments column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
            console.log('allowed_environments column already exists');
        }
        
        try {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN IF NOT EXISTS can_manage_environments BOOLEAN DEFAULT FALSE COMMENT 'Can create/edit/delete environments'
            `);
            console.log('Added can_manage_environments column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
            console.log('can_manage_environments column already exists');
        }
        
        try {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN DEFAULT FALSE COMMENT 'Can view/manage users in environments'
            `);
            console.log('Added can_manage_users column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
            console.log('can_manage_users column already exists');
        }
        
        console.log('SUCCESS: All tables and columns created successfully!');
        
    } catch (error) {
        console.error('Failed to create tables:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createTables();