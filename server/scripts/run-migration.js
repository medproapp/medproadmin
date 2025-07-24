const fs = require('fs');
const path = require('path');
const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

async function runMigration(migrationFile) {
    try {
        const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');
        
        // Split SQL content by semicolons, preserving complete statements
        const statements = sqlContent
            .replace(/--[^\n]*/g, '') // Remove single-line comments
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        logger.info(`Running migration: ${migrationFile}`);
        logger.info(`Found ${statements.length} SQL statements to execute`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim()) {
                try {
                    logger.info(`Executing statement ${i + 1}/${statements.length}`);
                    await executeQuery(adminPool, statement);
                    logger.info(`Statement ${i + 1} executed successfully`);
                } catch (error) {
                    if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
                        error.code === 'ER_DUP_KEYNAME' ||
                        error.message.includes('already exists')) {
                        logger.warn(`Statement ${i + 1} skipped (already exists):`, error.message);
                        continue;
                    }
                    logger.error(`Error in statement ${i + 1}:`, error);
                    throw error;
                }
            }
        }

        logger.info(`Migration ${migrationFile} completed successfully`);
        return true;
    } catch (error) {
        logger.error(`Migration ${migrationFile} failed:`, error);
        throw error;
    }
}

// Run the specific migration
if (require.main === module) {
    const migrationFile = process.argv[2] || '004_customer_segments.sql';
    
    runMigration(migrationFile)
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration failed:', error.message);
            process.exit(1);
        });
}

module.exports = { runMigration };