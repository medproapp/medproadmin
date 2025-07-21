const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

async function setupDatabase() {
    let connection;
    
    try {
        // Connect to MySQL without specifying database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            multipleStatements: true
        });
        
        console.log('Connected to MySQL server');
        
        // Read and execute schema
        const schemaPath = path.join(__dirname, '../../database/schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');
        
        console.log('Executing database schema...');
        await connection.query(schema);
        
        console.log('Database setup completed successfully!');
        
        // Create demo admin user if in development
        if (process.env.NODE_ENV === 'development') {
            console.log('Creating demo admin user...');
            
            await connection.query(`
                USE medpro_admin;
                INSERT IGNORE INTO admin_permissions 
                (email, role, can_create_products, can_edit_products, 
                 can_delete_products, can_sync_stripe, can_run_recovery, 
                 can_view_audit, is_active, created_by)
                VALUES 
                ('demo@medpro.com', 'super_admin', 1, 1, 1, 1, 1, 1, 1, 'system'),
                ('admin@medpro.com', 'super_admin', 1, 1, 1, 1, 1, 1, 1, 'system');
            `);
            
            console.log('Demo admin users created');
        }
        
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run setup
setupDatabase();