#!/usr/bin/env node

/**
 * Migrate existing product and price data to use new metadata processing
 * This script re-processes all existing Stripe data using our new metadata parser
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const metadataParser = require('../services/metadataParser');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'medpro_admin',
    multipleStatements: true
};

async function migrateExistingData() {
    console.log('🔄 Starting migration of existing metadata...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        // Get all existing products that need migration
        const [products] = await connection.execute(`
            SELECT stripe_product_id, name 
            FROM product_catalog 
            ORDER BY created_at DESC
        `);
        
        console.log(`📊 Found ${products.length} products to migrate`);
        
        let migratedProducts = 0;
        let migratedPrices = 0;
        let errors = [];
        
        for (const product of products) {
            try {
                console.log(`🔄 Processing product: ${product.name} (${product.stripe_product_id})`);
                
                // Fetch fresh data from Stripe
                let stripeProduct, stripePrices;
                try {
                    stripeProduct = await stripe.products.retrieve(product.stripe_product_id);
                    stripePrices = await stripe.prices.list({
                        product: product.stripe_product_id,
                        limit: 100
                    });
                } catch (stripeError) {
                    if (stripeError.type === 'StripeInvalidRequestError' && stripeError.message.includes('No such product')) {
                        console.log(`⚠️  Product ${product.stripe_product_id} no longer exists in Stripe, skipping...`);
                        continue;
                    }
                    throw stripeError;
                }
                
                // Parse using our comprehensive metadata parser
                const parsedProduct = metadataParser.parseProductMetadata(stripeProduct);
                
                // Update product with new parsed metadata
                await connection.execute(`
                    UPDATE product_catalog 
                    SET metadata = ?, plan_type = ?, user_tier = ?, max_users = ?, 
                        ai_quota_monthly = ?, is_enterprise = ?, trial_eligible = ?, 
                        target_audience = ?, is_popular = ?, is_free_plan = ?,
                        updated_at = NOW()
                    WHERE stripe_product_id = ?
                `, [
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
                    product.stripe_product_id
                ]);
                
                migratedProducts++;
                console.log(`✅ Migrated product metadata for ${product.name}`);
                
                // Migrate prices for this product
                for (const stripePrice of stripePrices.data) {
                    const parsedPrice = metadataParser.parsePriceMetadata(stripePrice);
                    
                    // Check if price exists
                    const [existingPrice] = await connection.execute(
                        'SELECT id FROM product_prices WHERE stripe_price_id = ?',
                        [stripePrice.id]
                    );
                    
                    if (existingPrice.length > 0) {
                        // Update existing price with new parsed metadata
                        await connection.execute(`
                            UPDATE product_prices 
                            SET billing_period = ?, lookup_key = ?, trial_period_days = ?, 
                                metadata = ?, updated_at = NOW()
                            WHERE stripe_price_id = ?
                        `, [
                            parsedPrice.billing_period,
                            parsedPrice.lookup_key,
                            parsedPrice.trial_period_days,
                            parsedPrice.metadata,
                            stripePrice.id
                        ]);
                        
                        migratedPrices++;
                        console.log(`  ✅ Updated price: ${parsedPrice.billing_period} - ${parsedPrice.unit_amount}`);
                    } else {
                        // Insert new price if it doesn't exist
                        await connection.execute(`
                            INSERT INTO product_prices 
                            (stripe_price_id, stripe_product_id, unit_amount, currency,
                             recurring_interval, recurring_interval_count, billing_period,
                             lookup_key, nickname, active, trial_period_days, metadata,
                             stripe_created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), NOW())
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
                            parsedPrice.active ? 1 : 0,
                            parsedPrice.trial_period_days,
                            parsedPrice.metadata,
                            parsedPrice.stripe_created_at.getTime() / 1000
                        ]);
                        
                        migratedPrices++;
                        console.log(`  ➕ Created new price: ${parsedPrice.billing_period} - ${parsedPrice.unit_amount}`);
                    }
                }
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Error migrating product ${product.stripe_product_id}:`, error.message);
                errors.push({
                    product_id: product.stripe_product_id,
                    product_name: product.name,
                    error: error.message
                });
            }
        }
        
        console.log('\n📊 Migration Summary:');
        console.log(`✅ Products migrated: ${migratedProducts}/${products.length}`);
        console.log(`✅ Prices migrated: ${migratedPrices}`);
        console.log(`❌ Errors: ${errors.length}`);
        
        if (errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            errors.forEach(error => {
                console.log(`  - ${error.product_name} (${error.product_id}): ${error.error}`);
            });
        }
        
        console.log('\n🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateExistingData()
        .then(() => {
            console.log('✅ Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateExistingData };