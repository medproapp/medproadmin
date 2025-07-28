const mysql = require('mysql2/promise');
require('dotenv').config();

async function addPermissions() {
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
        
        // Check if columns exist first
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_permissions'
        `, [process.env.DB_NAME || 'medpro_admin']);
        
        const existingColumns = columns.map(c => c.COLUMN_NAME);
        console.log('Existing columns:', existingColumns);
        
        // Add allowed_environments column
        if (!existingColumns.includes('allowed_environments')) {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN allowed_environments JSON COMMENT 'Array of environment IDs this admin can access'
            `);
            console.log('Added allowed_environments column');
        } else {
            console.log('allowed_environments column already exists');
        }
        
        // Add can_manage_environments column
        if (!existingColumns.includes('can_manage_environments')) {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN can_manage_environments BOOLEAN DEFAULT FALSE COMMENT 'Can create/edit/delete environments'
            `);
            console.log('Added can_manage_environments column');
        } else {
            console.log('can_manage_environments column already exists');
        }
        
        // Add can_manage_users column
        if (!existingColumns.includes('can_manage_users')) {
            await connection.execute(`
                ALTER TABLE admin_permissions 
                ADD COLUMN can_manage_users BOOLEAN DEFAULT FALSE COMMENT 'Can view/manage users in environments'
            `);
            console.log('Added can_manage_users column');
        } else {
            console.log('can_manage_users column already exists');
        }
        
        console.log('SUCCESS: All permission columns added!');
        
    } catch (error) {
        console.error('Failed to add permissions:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addPermissions();