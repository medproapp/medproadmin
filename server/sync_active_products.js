#!/usr/bin/env node

/**
 * Sync active products from Stripe with enhanced metadata parsing
 * Focus on the 11 active products to ensure proper metadata extraction
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const metadataParser = require('./services/metadataParser');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'medpro_admin',
    multipleStatements: true
};

async function syncActiveProducts() {
    console.log('🔄 Syncing Active Stripe Products...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        // Get all active products from Stripe
        const stripeProducts = await stripe.products.list({
            active: true,
            limit: 100
        });
        
        console.log(`📊 Found ${stripeProducts.data.length} active products in Stripe`);
        
        let synced = 0;
        let updated = 0;
        let created = 0;
        let errors = [];
        
        for (const stripeProduct of stripeProducts.data) {
            try {
                console.log(`🔄 Processing: ${stripeProduct.name}`);
                
                // Parse product metadata using enhanced parser
                const parsedProduct = metadataParser.parseProductMetadata(stripeProduct);
                
                console.log(`   📋 Extracted metadata:`, {
                    plan_type: parsedProduct.plan_type,
                    user_tier: parsedProduct.user_tier,
                    max_users: parsedProduct.max_users,
                    ai_quota_monthly: parsedProduct.ai_quota_monthly
                });
                
                // Check if product exists
                const [existing] = await connection.execute(
                    'SELECT id FROM product_catalog WHERE stripe_product_id = ?',
                    [stripeProduct.id]
                );
                
                if (existing.length > 0) {
                    // Update existing product - mark as active and update metadata
                    await connection.execute(`
                        UPDATE product_catalog 
                        SET name = ?, description = ?, active = 1, metadata = ?,
                            plan_type = ?, user_tier = ?, max_users = ?, ai_quota_monthly = ?,
                            is_enterprise = ?, trial_eligible = ?, target_audience = ?,
                            is_popular = ?, is_free_plan = ?, updated_at = NOW()
                        WHERE stripe_product_id = ?
                    `, [
                        parsedProduct.name,
                        parsedProduct.description,
                        parsedProduct.metadata,
                        parsedProduct.plan_type,
                        parsedProduct.user_tier,
                        parsedProduct.max_users,
                        parsedProduct.ai_quota_monthly,
                        parsedProduct.is_enterprise ? 1 : 0,
                        parsedProduct.trial_eligible ? 1 : 0,
                        parsedProduct.target_audience,
                        parsedProduct.is_popular ? 1 : 0,
                        parsedProduct.is_free_plan ? 1 : 0,
                        stripeProduct.id
                    ]);
                    
                    updated++;
                    console.log(`   ✅ Updated existing product`);
                } else {
                    // Create new product
                    await connection.execute(`
                        INSERT INTO product_catalog 
                        (stripe_product_id, name, description, active, metadata,
                         plan_type, user_tier, max_users, ai_quota_monthly, is_enterprise,
                         trial_eligible, target_audience, is_popular, is_free_plan,
                         stripe_created_at, created_at, updated_at)
                        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), NOW(), NOW())
                    `, [
                        parsedProduct.stripe_product_id,
                        parsedProduct.name,
                        parsedProduct.description,
                        parsedProduct.metadata,
                        parsedProduct.plan_type,
                        parsedProduct.user_tier,
                        parsedProduct.max_users,
                        parsedProduct.ai_quota_monthly,
                        parsedProduct.is_enterprise ? 1 : 0,
                        parsedProduct.trial_eligible ? 1 : 0,
                        parsedProduct.target_audience,
                        parsedProduct.is_popular ? 1 : 0,
                        parsedProduct.is_free_plan ? 1 : 0,
                        parsedProduct.stripe_created_at.getTime() / 1000
                    ]);
                    
                    created++;
                    console.log(`   ➕ Created new product`);
                }
                
                // Sync prices for this product
                const stripePrices = await stripe.prices.list({
                    product: stripeProduct.id,
                    active: true,
                    limit: 100
                });
                
                console.log(`   💰 Syncing ${stripePrices.data.length} prices`);
                
                for (const stripePrice of stripePrices.data) {
                    const parsedPrice = metadataParser.parsePriceMetadata(stripePrice);
                    
                    const [existingPrice] = await connection.execute(
                        'SELECT id FROM product_prices WHERE stripe_price_id = ?',
                        [stripePrice.id]
                    );
                    
                    if (existingPrice.length > 0) {
                        // Update existing price - mark as active
                        await connection.execute(`
                            UPDATE product_prices 
                            SET unit_amount = ?, currency = ?, active = 1,
                                recurring_interval = ?, recurring_interval_count = ?,
                                billing_period = ?, lookup_key = ?, nickname = ?,
                                trial_period_days = ?, metadata = ?, updated_at = NOW()
                            WHERE stripe_price_id = ?
                        `, [
                            parsedPrice.unit_amount,
                            parsedPrice.currency,
                            parsedPrice.recurring_interval,
                            parsedPrice.recurring_interval_count,
                            parsedPrice.billing_period,
                            parsedPrice.lookup_key,
                            parsedPrice.nickname,
                            parsedPrice.trial_period_days,
                            parsedPrice.metadata,
                            parsedPrice.stripe_price_id
                        ]);
                    } else {
                        // Create new price
                        await connection.execute(`
                            INSERT INTO product_prices 
                            (stripe_price_id, stripe_product_id, unit_amount, currency,
                             recurring_interval, recurring_interval_count, billing_period,
                             lookup_key, nickname, active, trial_period_days, metadata,
                             stripe_created_at, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, FROM_UNIXTIME(?), NOW(), NOW())
                        `, [
                            parsedPrice.stripe_price_id,
                            parsedPrice.stripe_product_id,
                            parsedPrice.unit_amount,
                            parsedPrice.currency,
                            parsedPrice.recurring_interval,
                            parsedPrice.recurring_interval_count,
                            parsedPrice.billing_period,
                            parsedPrice.lookup_key,
                            parsedPrice.nickname,
                            parsedPrice.trial_period_days,
                            parsedPrice.metadata,
                            parsedPrice.stripe_created_at.getTime() / 1000
                        ]);
                    }
                }
                
                synced++;
                console.log(`   ✅ Product sync completed`);
                
            } catch (error) {
                console.error(`❌ Error syncing product ${stripeProduct.id}:`, error.message);
                errors.push({
                    product_id: stripeProduct.id,
                    product_name: stripeProduct.name,
                    error: error.message
                });
            }
        }
        
        // Mark non-active products as inactive (only if they exist in our DB but not in active Stripe products)
        const activeProductIds = stripeProducts.data.map(p => p.id);
        const placeholders = activeProductIds.map(() => '?').join(',');
        
        if (activeProductIds.length > 0) {
            const [deactivatedResult] = await connection.execute(`
                UPDATE product_catalog 
                SET active = 0, updated_at = NOW()
                WHERE stripe_product_id NOT IN (${placeholders})
                  AND active = 1
            `, activeProductIds);
            
            console.log(`📊 Marked ${deactivatedResult.affectedRows} products as inactive`);
        }
        
        console.log('\n📊 Sync Summary:');
        console.log(`✅ Products synced: ${synced}`);
        console.log(`📝 Products updated: ${updated}`);
        console.log(`➕ Products created: ${created}`);
        console.log(`❌ Errors: ${errors.length}`);
        
        if (errors.length > 0) {
            console.log('\n❌ Errors:');
            errors.forEach(error => {
                console.log(`  - ${error.product_name}: ${error.error}`);
            });
        }
        
        // Show final active product count
        const [activeCount] = await connection.execute(
            'SELECT COUNT(*) as count FROM product_catalog WHERE active = 1'
        );
        console.log(`\n🎉 Total active products in database: ${activeCount[0].count}`);
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

// Run sync
if (require.main === module) {
    syncActiveProducts()
        .then(() => {
            console.log('✅ Active product sync completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Sync failed:', error);
            process.exit(1);
        });
}

module.exports = { syncActiveProducts };