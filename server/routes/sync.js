const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const metadataParser = require('../services/metadataParser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Sync all products from Stripe
router.post('/stripe/full', [
    verifyToken,
    requirePermission('can_sync_stripe')
], async (req, res) => {
    try {
        logger.info('Starting full Stripe sync');
        
        const stats = {
            products_synced: 0,
            products_created: 0,
            products_updated: 0,
            prices_synced: 0,
            errors: []
        };
        
        // Fetch all products from Stripe
        const stripeProducts = [];
        let hasMore = true;
        let startingAfter = null;
        
        while (hasMore) {
            const params = { limit: 100 };
            if (startingAfter) params.starting_after = startingAfter;
            
            const response = await stripe.products.list(params);
            stripeProducts.push(...response.data);
            
            hasMore = response.has_more;
            if (response.data.length > 0) {
                startingAfter = response.data[response.data.length - 1].id;
            }
        }
        
        // Sync each product
        for (const stripeProduct of stripeProducts) {
            try {
                await executeTransaction(adminPool, async (connection) => {
                    // Check if product exists
                    const [existing] = await connection.execute(
                        'SELECT * FROM product_catalog WHERE stripe_product_id = ?',
                        [stripeProduct.id]
                    );
                    
                    // Parse product metadata using our comprehensive parser
                    const parsedProduct = metadataParser.parseProductMetadata(stripeProduct);
                    
                    if (existing.length === 0) {
                        // Insert new product
                        await connection.execute(`
                            INSERT INTO product_catalog 
                            (stripe_product_id, name, description, active, metadata,
                             plan_type, user_tier, max_users, ai_quota_monthly, is_enterprise,
                             trial_eligible, target_audience, is_popular, is_free_plan,
                             sync_status, last_stripe_sync, stripe_created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NOW(), FROM_UNIXTIME(?))
                        `, [
                            parsedProduct.stripe_product_id,
                            parsedProduct.name,
                            parsedProduct.description,
                            parsedProduct.active ? 1 : 0,
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
                        stats.products_created++;
                    } else {
                        // Update existing product
                        await connection.execute(`
                            UPDATE product_catalog 
                            SET name = ?, description = ?, active = ?, metadata = ?,
                                plan_type = ?, user_tier = ?, max_users = ?, ai_quota_monthly = ?,
                                is_enterprise = ?, trial_eligible = ?, target_audience = ?,
                                is_popular = ?, is_free_plan = ?, sync_status = 'synced',
                                last_stripe_sync = NOW()
                            WHERE stripe_product_id = ?
                        `, [
                            parsedProduct.name,
                            parsedProduct.description,
                            parsedProduct.active ? 1 : 0,
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
                            parsedProduct.stripe_product_id
                        ]);
                        stats.products_updated++;
                    }
                    
                    // Sync prices
                    const stripePrices = await stripe.prices.list({
                        product: stripeProduct.id,
                        limit: 100
                    });
                    
                    for (const stripePrice of stripePrices.data) {
                        const [existingPrice] = await connection.execute(
                            'SELECT * FROM product_prices WHERE stripe_price_id = ?',
                            [stripePrice.id]
                        );
                        
                        // Parse price metadata using our comprehensive parser
                        const parsedPrice = metadataParser.parsePriceMetadata(stripePrice);
                        
                        if (existingPrice.length === 0) {
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
                        } else {
                            await connection.execute(`
                                UPDATE product_prices 
                                SET unit_amount = ?, currency = ?, recurring_interval = ?,
                                    recurring_interval_count = ?, billing_period = ?, lookup_key = ?,
                                    nickname = ?, active = ?, trial_period_days = ?, metadata = ?,
                                    updated_at = NOW()
                                WHERE stripe_price_id = ?
                            `, [
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
                                parsedPrice.stripe_price_id
                            ]);
                        }
                        stats.prices_synced++;
                    }
                });
                
                stats.products_synced++;
            } catch (error) {
                logger.error(`Failed to sync product ${stripeProduct.id}:`, error);
                stats.errors.push({
                    product_id: stripeProduct.id,
                    error: error.message
                });
            }
        }
        
        // Log sync action
        await logAdminAction(req, 'sync', 'stripe', 'full_sync', stats);
        
        res.json({
            success: true,
            data: {
                stats,
                message: `Synced ${stats.products_synced} products from Stripe`
            }
        });
        
    } catch (error) {
        logger.error('Full Stripe sync error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync with Stripe'
        });
    }
});

// Sync single product
router.post('/stripe/product/:id', [
    verifyToken,
    requirePermission('can_sync_stripe')
], async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Fetch from Stripe
        const stripeProduct = await stripe.products.retrieve(productId);
        const stripePrices = await stripe.prices.list({
            product: productId,
            limit: 100
        });
        
        await executeTransaction(adminPool, async (connection) => {
            // Parse product metadata using our comprehensive parser
            const parsedProduct = metadataParser.parseProductMetadata(stripeProduct);
            
            await connection.execute(`
                UPDATE product_catalog 
                SET name = ?, description = ?, active = ?, metadata = ?,
                    plan_type = ?, user_tier = ?, max_users = ?, ai_quota_monthly = ?,
                    is_enterprise = ?, trial_eligible = ?, target_audience = ?,
                    is_popular = ?, is_free_plan = ?, sync_status = 'synced',
                    last_stripe_sync = NOW()
                WHERE stripe_product_id = ?
            `, [
                parsedProduct.name,
                parsedProduct.description,
                parsedProduct.active ? 1 : 0,
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
                productId
            ]);
            
            // Update prices with comprehensive metadata parsing
            for (const stripePrice of stripePrices.data) {
                // Parse price metadata using our comprehensive parser
                const parsedPrice = metadataParser.parsePriceMetadata(stripePrice);
                
                const [existing] = await connection.execute(
                    'SELECT * FROM product_prices WHERE stripe_price_id = ?',
                    [stripePrice.id]
                );
                
                if (existing.length > 0) {
                    await connection.execute(`
                        UPDATE product_prices 
                        SET unit_amount = ?, currency = ?, recurring_interval = ?,
                            recurring_interval_count = ?, billing_period = ?, lookup_key = ?,
                            nickname = ?, active = ?, trial_period_days = ?, metadata = ?,
                            updated_at = NOW()
                        WHERE stripe_price_id = ?
                    `, [
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
                        parsedPrice.stripe_price_id
                    ]);
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
                }
            }
        });
        
        // Log action
        await logAdminAction(req, 'sync', 'product', productId);
        
        res.json({
            success: true,
            message: 'Product synced successfully'
        });
        
    } catch (error) {
        logger.error(`Product sync error for ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync product'
        });
    }
});

// Get sync status
router.get('/status', verifyToken, async (req, res) => {
    try {
        const stats = await executeQuery(adminPool, `
            SELECT 
                sync_status,
                COUNT(*) as count,
                MAX(last_stripe_sync) as last_sync
            FROM product_catalog
            GROUP BY sync_status
        `);
        
        const pendingSync = await executeQuery(adminPool, `
            SELECT COUNT(*) as count 
            FROM sync_queue 
            WHERE status IN ('pending', 'processing')
        `);
        
        const recentErrors = await executeQuery(adminPool, `
            SELECT * FROM sync_queue 
            WHERE status = 'failed' 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                product_sync_status: stats,
                pending_operations: pendingSync[0].count,
                recent_errors: recentErrors
            }
        });
        
    } catch (error) {
        logger.error('Get sync status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync status'
        });
    }
});

module.exports = router;