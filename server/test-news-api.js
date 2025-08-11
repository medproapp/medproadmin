/**
 * Test News API and Database Connection
 * This script tests the news API functionality and creates tables if needed
 */

const { executeQuery, adminPool } = require('./config/database');
const logger = require('./utils/logger');

async function testNewsAPI() {
    console.log('🔧 Testing News API and Database Setup...\n');
    
    try {
        // Test 1: Database Connection
        console.log('1. Testing database connection...');
        const connection = await adminPool.getConnection();
        await connection.ping();
        connection.release();
        console.log('   ✅ Database connection successful\n');
        
        // Test 2: Check if news tables exist
        console.log('2. Checking for news tables...');
        try {
            const result = await executeQuery(adminPool, 'SHOW TABLES LIKE "%news%"');
            console.log(`   📊 Found ${result.length} news-related tables:`);
            result.forEach(table => {
                const tableName = Object.values(table)[0];
                console.log(`      - ${tableName}`);
            });
            
            if (result.length === 0) {
                console.log('   ⚠️  No news tables found. Creating them...\n');
                await createNewsTables();
            }
        } catch (error) {
            console.log('   ⚠️  Error checking tables, creating them...\n');
            await createNewsTables();
        }
        
        // Test 3: Test news_articles table
        console.log('3. Testing news_articles table...');
        try {
            const articles = await executeQuery(adminPool, 'SELECT COUNT(*) as count FROM news_articles');
            console.log(`   ✅ Found ${articles[0].count} articles in database\n`);
            
            if (articles[0].count === 0) {
                console.log('   📝 Inserting sample articles...');
                await insertSampleArticles();
            }
        } catch (error) {
            console.log(`   ❌ Error accessing news_articles table: ${error.message}\n`);
            await createNewsTables();
        }
        
        // Test 4: Test categories endpoint
        console.log('4. Testing categories functionality...');
        try {
            const categories = await executeQuery(adminPool, `
                SELECT DISTINCT category 
                FROM news_articles 
                WHERE category IS NOT NULL AND category != ''
                ORDER BY category
            `);
            console.log(`   ✅ Found ${categories.length} categories`);
            categories.forEach(cat => console.log(`      - ${cat.category}`));
            console.log('');
        } catch (error) {
            console.log(`   ❌ Categories test failed: ${error.message}\n`);
        }
        
        // Test 5: Test basic news query
        console.log('5. Testing news query...');
        try {
            const news = await executeQuery(adminPool, `
                SELECT id, title, category, type, active, featured, created_at
                FROM news_articles 
                ORDER BY created_at DESC 
                LIMIT 5
            `);
            console.log(`   ✅ Successfully queried ${news.length} articles:`);
            news.forEach(article => {
                console.log(`      - [${article.id}] ${article.title} (${article.type})`);
            });
            console.log('');
        } catch (error) {
            console.log(`   ❌ News query failed: ${error.message}\n`);
        }
        
        console.log('🎉 News API test completed successfully!');
        console.log('\n✅ The news management system should now work properly.');
        console.log('   Try refreshing the admin page: http://localhost:4040/medproadmin/news/\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('\n💡 The medpro_admin database does not exist.');
            console.log('   Please create it first with: CREATE DATABASE medpro_admin;');
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Cannot connect to MySQL server.');
            console.log('   Please make sure MySQL is running and check your connection settings.');
        }
    }
}

async function createNewsTables() {
    console.log('   🔨 Creating news tables...');
    
    // Create news_articles table
    const createNewsTableSQL = `
        CREATE TABLE IF NOT EXISTS news_articles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          summary TEXT,
          content LONGTEXT,
          category VARCHAR(100),
          type ENUM('feature', 'update', 'fix', 'security', 'maintenance') DEFAULT 'update',
          featured BOOLEAN DEFAULT FALSE,
          active BOOLEAN DEFAULT TRUE,
          target_audience ENUM('all', 'practitioners', 'patients') DEFAULT 'all',
          link_url VARCHAR(500),
          link_text VARCHAR(100),
          image_url VARCHAR(500),
          publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expiry_date TIMESTAMP NULL,
          author_email VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_active_published (active, publish_date),
          INDEX idx_target_audience (target_audience),
          INDEX idx_category (category),
          INDEX idx_type (type),
          INDEX idx_author (author_email),
          INDEX idx_featured (featured),
          INDEX idx_created_at (created_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    // Create audit log table
    const createAuditTableSQL = `
        CREATE TABLE IF NOT EXISTS news_audit_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          news_article_id INT,
          action ENUM('create', 'update', 'delete', 'publish', 'unpublish') NOT NULL,
          admin_email VARCHAR(255) NOT NULL,
          changes JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          INDEX idx_article_action (news_article_id, action),
          INDEX idx_admin_time (admin_email, created_at),
          INDEX idx_action_time (action, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;
    
    try {
        await executeQuery(adminPool, createNewsTableSQL);
        console.log('      ✅ news_articles table created');
        
        await executeQuery(adminPool, createAuditTableSQL);
        console.log('      ✅ news_audit_log table created');
        
        await insertSampleArticles();
        
    } catch (error) {
        console.error('      ❌ Failed to create tables:', error.message);
        throw error;
    }
}

async function insertSampleArticles() {
    console.log('   📝 Inserting sample articles...');
    
    const sampleArticles = [
        {
            title: 'Welcome to MedPro Platform News',
            summary: 'Stay updated with the latest MedPro platform developments, new features, and important announcements.',
            content: 'We are excited to launch the MedPro Platform News system! This dedicated news section will keep you informed about new feature releases, system updates, security enhancements, and platform announcements.',
            category: 'Platform Updates',
            type: 'feature',
            featured: true,
            target_audience: 'all',
            author_email: 'admin@medpro.com'
        },
        {
            title: 'Enhanced Practitioner Dashboard Released',
            summary: 'New analytics, improved patient management, and enhanced reporting capabilities now available.',
            content: 'We have significantly enhanced the practitioner dashboard with powerful new features including real-time analytics, improved patient management tools, and comprehensive reporting capabilities.',
            category: 'Features',
            type: 'update',
            featured: false,
            target_audience: 'practitioners',
            author_email: 'admin@medpro.com'
        },
        {
            title: 'Security Update: Enhanced Authentication System',
            summary: 'Important security improvements to protect your practice data with multi-factor authentication.',
            content: 'We have implemented significant security enhancements including multi-factor authentication support, improved password policies, and enhanced session management.',
            category: 'Security',
            type: 'security',
            featured: true,
            target_audience: 'all',
            author_email: 'admin@medpro.com'
        },
        {
            title: 'Mobile App Beta Now Available',
            summary: 'Test the new MedPro mobile application for iOS and Android devices.',
            content: 'We are thrilled to announce the beta release of the MedPro mobile application with features including patient dashboard access, appointment scheduling, and secure messaging.',
            category: 'Mobile',
            type: 'feature',
            featured: false,
            target_audience: 'patients',
            author_email: 'admin@medpro.com'
        }
    ];
    
    for (const article of sampleArticles) {
        try {
            await executeQuery(adminPool, `
                INSERT IGNORE INTO news_articles 
                (title, summary, content, category, type, featured, target_audience, author_email)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                article.title,
                article.summary, 
                article.content,
                article.category,
                article.type,
                article.featured,
                article.target_audience,
                article.author_email
            ]);
            
            console.log(`      ✅ Created: "${article.title}"`);
        } catch (error) {
            console.log(`      ⚠️  Skipped: "${article.title}" (${error.message})`);
        }
    }
}

// Run the test
testNewsAPI().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
});