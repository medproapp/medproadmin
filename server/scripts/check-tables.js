const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

async function checkTables() {
    try {
        logger.info('Checking database tables...');
        
        // Check if tables exist
        const tables = await executeQuery(adminPool, 'SHOW TABLES');
        console.log('\nCurrent tables in database:');
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`- ${tableName}`);
        });

        // Check for customer segments specifically
        const segmentTables = tables.filter(table => {
            const tableName = Object.values(table)[0];
            return tableName.includes('segment');
        });

        console.log(`\nSegment-related tables: ${segmentTables.length}`);
        segmentTables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`- ${tableName}`);
        });

        return tables;
    } catch (error) {
        logger.error('Error checking tables:', error);
        throw error;
    }
}

if (require.main === module) {
    checkTables()
        .then(() => {
            console.log('\n✅ Table check completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Table check failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkTables };