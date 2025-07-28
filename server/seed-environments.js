const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

// Simple encryption function for demo purposes
function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const keyString = process.env.ENCRYPTION_KEY || 'abcdefghijklmnopqrstuvwxyz123456'; // Exactly 32 chars
    const key = Buffer.from(keyString.slice(0, 32), 'utf8'); // Ensure exactly 32 bytes
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function seedEnvironments() {
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
        
        // Check if environments already exist
        const [existing] = await connection.execute('SELECT COUNT(*) as count FROM environments');
        
        if (existing[0].count > 0) {
            console.log(`Environments already exist (${existing[0].count} records). Skipping seed.`);
            return;
        }
        
        // Sample environments with encrypted passwords
        const environments = [
            {
                env_name: 'medpro_prod',
                env_type: 'production',
                display_name: 'Production',
                description: 'Main production environment',
                db_host: 'localhost',
                db_port: 3306,
                db_name: 'medpro',
                db_user: 'medpro_readonly',
                db_password: 'placeholder_password',
                api_base_url: 'https://api.medpro.com',
                color_theme: 'red',
                icon: 'shield-check',
                is_default: true
            },
            {
                env_name: 'medpro_test',
                env_type: 'test',
                display_name: 'Testing',
                description: 'Testing environment for QA',
                db_host: 'localhost',
                db_port: 3306,
                db_name: 'medpro_test',
                db_user: 'medpro_readonly',
                db_password: 'placeholder_password',
                api_base_url: 'https://test-api.medpro.com',
                color_theme: 'yellow',
                icon: 'bug',
                is_default: false
            },
            {
                env_name: 'medpro_dev',
                env_type: 'development',
                display_name: 'Development',
                description: 'Development environment',
                db_host: 'localhost',
                db_port: 3306,
                db_name: 'medpro_dev',
                db_user: 'medpro',
                db_password: 'medpro',
                api_base_url: 'http://localhost:3000',
                color_theme: 'green',
                icon: 'code',
                is_default: false
            },
            {
                env_name: 'medpro_nqa',
                env_type: 'nqa',
                display_name: 'NQA',
                description: 'Network Quality Assurance environment',
                db_host: 'localhost',
                db_port: 3306,
                db_name: 'medpro_nqa',
                db_user: 'medpro_readonly',
                db_password: 'placeholder_password',
                api_base_url: 'https://nqa-api.medpro.com',
                color_theme: 'blue',
                icon: 'network',
                is_default: false
            }
        ];
        
        // Insert environments
        for (const env of environments) {
            const encryptedPassword = encrypt(env.db_password);
            
            await connection.execute(`
                INSERT INTO environments 
                (env_name, env_type, display_name, description, db_host, db_port, 
                 db_name, db_user, db_password_encrypted, api_base_url, 
                 color_theme, icon, is_default, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                env.env_name, env.env_type, env.display_name, env.description,
                env.db_host, env.db_port, env.db_name, env.db_user,
                encryptedPassword, env.api_base_url, env.color_theme,
                env.icon, env.is_default, 'system'
            ]);
            
            console.log(`Created environment: ${env.env_name} (${env.env_type})`);
        }
        
        // Update admin permissions for super_admin
        await connection.execute(`
            UPDATE admin_permissions 
            SET allowed_environments = JSON_ARRAY(1, 2, 3, 4),
                can_manage_environments = TRUE,
                can_manage_users = TRUE
            WHERE role = 'super_admin'
        `);
        
        console.log('Updated super_admin permissions');
        
        // Show created environments
        const [envs] = await connection.execute(`
            SELECT id, env_name, env_type, display_name, is_default 
            FROM environments 
            ORDER BY is_default DESC, env_type
        `);
        
        console.log('\nCreated environments:');
        envs.forEach(env => {
            const defaultFlag = env.is_default ? ' (DEFAULT)' : '';
            console.log(`  ${env.id}: ${env.env_name} (${env.env_type}) - ${env.display_name}${defaultFlag}`);
        });
        
        console.log('\nSUCCESS: Environment seeding completed!');
        
    } catch (error) {
        console.error('Failed to seed environments:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seedEnvironments();