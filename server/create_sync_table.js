#!/usr/bin/env node

const { adminPool, executeQuery } = require('./config/database');
const logger = require('./utils/logger');

async function createSyncTable() {
    try {
        const createTableSQL = `
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
            )
        `;

        const commentSQL = `
            ALTER TABLE static_sync_history 
            COMMENT = 'Tracks static page synchronization operations for audit trail'
        `;

        console.log('Creating static_sync_history table...');
        await executeQuery(adminPool, createTableSQL);
        console.log('✅ Table created successfully');

        console.log('Adding table comment...');
        await executeQuery(adminPool, commentSQL);
        console.log('✅ Comment added successfully');

        console.log('✅ Static sync table setup complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating table:', error.message);
        logger.error('Table creation failed:', error);
        process.exit(1);
    }
}

createSyncTable();