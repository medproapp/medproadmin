#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${msg}`)
};

async function runMigration() {
    let connection;
    
    try {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'medpro_admin',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'medpro_admin',
            port: process.env.DB_PORT || 3306,
            multipleStatements: true
        });
        
        logger.info('Connected to database');
        
        // Read and execute the environments schema
        const schemaPath = path.join(__dirname, '..', 'database', 'environments_schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        logger.info('Executing environments schema migration...');
        
        // Split SQL by semicolons and execute each statement
        const statements = schemaSql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await connection.execute(statement);
                    logger.info(`Executed: ${statement.substring(0, 50)}...`);
                } catch (error) {
                    if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
                        error.code === 'ER_DUP_FIELDNAME' ||
                        error.message.includes('Duplicate column')) {
                        logger.info(`Skipped (already exists): ${statement.substring(0, 50)}...`);
                    } else {
                        throw error;
                    }
                }
            }
        }
        
        // Verify tables were created
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('environments', 'env_access_log')
        `, [process.env.DB_NAME || 'medpro_admin']);
        
        logger.success(`Migration completed successfully!`);
        logger.info(`Created/verified tables: ${tables.map(t => t.TABLE_NAME).join(', ')}`);
        
        // Check if we have sample data
        const [envCount] = await connection.execute('SELECT COUNT(*) as count FROM environments');
        logger.info(`Environments table has ${envCount[0].count} records`);
        
        if (envCount[0].count > 0) {
            const [environments] = await connection.execute(`
                SELECT id, env_name, env_type, display_name, is_default 
                FROM environments 
                ORDER BY is_default DESC, env_type
            `);
            
            logger.info('Current environments:');
            environments.forEach(env => {
                const defaultFlag = env.is_default ? ' (DEFAULT)' : '';
                logger.info(`  ${env.id}: ${env.env_name} (${env.env_type}) - ${env.display_name}${defaultFlag}`);
            });
        }
        
    } catch (error) {
        logger.error(`Migration failed: ${error.message}`);
        if (error.code) {
            logger.error(`Error code: ${error.code}`);
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            logger.info('Database connection closed');
        }
    }
}

// Run migration
runMigration();