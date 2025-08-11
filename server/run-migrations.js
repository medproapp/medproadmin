/**
 * Migration Runner Script
 * Runs the news management database migrations
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables
require('dotenv').config();

async function runMigrations() {
    let connection;
    
    try {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.ADMIN_DB_HOST || 'localhost',
            user: process.env.ADMIN_DB_USER || 'root',
            password: process.env.ADMIN_DB_PASSWORD || '',
            database: process.env.ADMIN_DB_NAME || 'medpro_admin',
            multipleStatements: true
        });

        console.log('✅ Connected to database');

        // Get migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log(`📁 Found ${migrationFiles.length} migration files`);

        // Run each migration
        for (const file of migrationFiles) {
            console.log(`\n🔄 Running migration: ${file}`);
            
            const migrationPath = path.join(migrationsDir, file);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
            
            // Split by semicolons and run each statement
            const statements = migrationSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            for (const statement of statements) {
                if (statement.trim()) {
                    try {
                        await connection.execute(statement);
                    } catch (error) {
                        if (!error.message.includes('already exists') && 
                            !error.message.includes('Duplicate entry')) {
                            throw error;
                        }
                        console.log(`   ⚠️  Skipping (already exists): ${error.message.split('\n')[0]}`);
                    }
                }
            }
            
            console.log(`   ✅ Migration ${file} completed`);
        }

        // Verify tables were created
        console.log('\n🔍 Verifying tables...');
        const [tables] = await connection.execute("SHOW TABLES LIKE '%news%'");
        console.log(`   ✅ Found ${tables.length} news-related tables`);

        // Check sample data
        const [articles] = await connection.execute('SELECT COUNT(*) as count FROM news_articles');
        console.log(`   ✅ Found ${articles[0].count} sample articles`);

        console.log('\n🎉 All migrations completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('💡 Database does not exist. Please create it first:');
            console.error('   CREATE DATABASE medpro_admin;');
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run migrations
runMigrations();