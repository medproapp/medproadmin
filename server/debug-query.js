/**
 * Debug the news API query parameter issue
 */

const { executeQuery, adminPool } = require('./config/database');

async function debugQuery() {
    console.log('🔧 Debugging query parameters...');
    
    try {
        // Test the exact same query but with direct values
        console.log('\n1. Testing query without parameters...');
        const directQuery = `
            SELECT 
                id, title, summary, category, type, featured, active, target_audience,
                link_url, link_text, image_url, publish_date, expiry_date, author_email,
                created_at, updated_at
            FROM news_articles 
            ORDER BY created_at DESC
            LIMIT 20 OFFSET 0
        `;
        
        const directResult = await executeQuery(adminPool, directQuery, []);
        console.log(`   ✅ Direct query worked, got ${directResult.length} results`);
        
        // Test with parameters
        console.log('\n2. Testing query with parameters...');
        const paramQuery = `
            SELECT 
                id, title, summary, category, type, featured, active, target_audience,
                link_url, link_text, image_url, publish_date, expiry_date, author_email,
                created_at, updated_at
            FROM news_articles 
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        // Test different parameter combinations
        const testParams = [
            [20, 0],
            ['20', '0'],
            [parseInt('20'), parseInt('0')],
            [Number(20), Number(0)]
        ];
        
        for (let i = 0; i < testParams.length; i++) {
            const params = testParams[i];
            console.log(`\n   Test ${i+1}: Parameters [${params[0]} (${typeof params[0]}), ${params[1]} (${typeof params[1]})]`);
            
            try {
                const result = await executeQuery(adminPool, paramQuery, params);
                console.log(`   ✅ Success: got ${result.length} results`);
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
    
    process.exit(0);
}

debugQuery();