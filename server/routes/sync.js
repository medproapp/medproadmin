const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
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
                    
                    const metadata = stripeProduct.metadata || {};
                    const fullMetadata = {
                        classification: {
                            plan_type: metadata.plan_type,
                            user_tier: metadata.user_tier ? parseInt(metadata.user_tier) : null,
                            market_segment: metadata.market_segment
                        },
                        // Add other metadata fields as needed
                    };
                    
                    if (existing.length === 0) {
                        // Insert new product
                        await connection.execute(`
                            INSERT INTO product_catalog 
                            (stripe_product_id, name, description, active, metadata,
                             plan_type, user_tier, sync_status, last_synced_at, stripe_created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', NOW(), FROM_UNIXTIME(?))
                        `, [
                            stripeProduct.id,
                            stripeProduct.name,
                            stripeProduct.description || null,
                            stripeProduct.active ? 1 : 0,
                            JSON.stringify(fullMetadata),
                            metadata.plan_type || null,
                            metadata.user_tier ? parseInt(metadata.user_tier) : null,
                            stripeProduct.created
                        ]);
                        stats.products_created++;
                    } else {
                        // Update existing product
                        await connection.execute(`
                            UPDATE product_catalog 
                            SET name = ?, description = ?, active = ?, metadata = ?,
                                plan_type = ?, user_tier = ?, sync_status = 'synced',
                                last_synced_at = NOW()
                            WHERE stripe_product_id = ?
                        `, [
                            stripeProduct.name,
                            stripeProduct.description || null,
                            stripeProduct.active ? 1 : 0,
                            JSON.stringify(fullMetadata),
                            metadata.plan_type || null,
                            metadata.user_tier ? parseInt(metadata.user_tier) : null,
                            stripeProduct.id
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
                        
                        const billingPeriod = stripePrice.recurring ? 
                            (stripePrice.recurring.interval_count === 6 ? 'semester' : stripePrice.recurring.interval) :
                            'one_time';
                        
                        if (existingPrice.length === 0) {
                            await connection.execute(`
                                INSERT INTO product_prices 
                                (stripe_price_id, stripe_product_id, unit_amount, currency,
                                 recurring_interval, recurring_interval_count, nickname, active, 
                                 stripe_created_at, sync_status, last_synced_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', NOW())
                            `, [
                                stripePrice.id,
                                stripeProduct.id,
                                stripePrice.unit_amount,
                                stripePrice.currency,
                                stripePrice.recurring ? stripePrice.recurring.interval : null,
                                stripePrice.recurring ? stripePrice.recurring.interval_count : null,
                                stripePrice.nickname || null,
                                stripePrice.active ? 1 : 0,
                                stripePrice.created
                            ]);
                        } else {
                            await connection.execute(`
                                UPDATE product_prices 
                                SET unit_amount = ?, currency = ?, recurring_interval = ?,
                                    recurring_interval_count = ?, nickname = ?, active = ?, 
                                    sync_status = 'synced', last_synced_at = NOW()
                                WHERE stripe_price_id = ?
                            `, [
                                stripePrice.unit_amount,
                                stripePrice.currency,
                                stripePrice.recurring ? stripePrice.recurring.interval : null,
                                stripePrice.recurring ? stripePrice.recurring.interval_count : null,
                                stripePrice.nickname || null,
                                stripePrice.active ? 1 : 0,
                                stripePrice.id
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
            // Update product
            const metadata = stripeProduct.metadata || {};
            const fullMetadata = {
                classification: {
                    plan_type: metadata.plan_type,
                    user_tier: metadata.user_tier ? parseInt(metadata.user_tier) : null,
                    market_segment: metadata.market_segment
                }
            };
            
            await connection.execute(`
                UPDATE product_catalog 
                SET name = ?, description = ?, active = ?, metadata = ?,
                    plan_type = ?, user_tier = ?, sync_status = 'synced',
                    last_stripe_sync = NOW()
                WHERE stripe_product_id = ?
            `, [
                stripeProduct.name,
                stripeProduct.description,
                stripeProduct.active ? 1 : 0,
                JSON.stringify(fullMetadata),
                metadata.plan_type,
                metadata.user_tier ? parseInt(metadata.user_tier) : null,
                productId
            ]);
            
            // Update prices
            for (const stripePrice of stripePrices.data) {
                const billingPeriod = stripePrice.recurring ? 
                    (stripePrice.recurring.interval_count === 6 ? 'semester' : stripePrice.recurring.interval) :
                    'one_time';
                
                const [existing] = await connection.execute(
                    'SELECT * FROM product_prices WHERE stripe_price_id = ?',
                    [stripePrice.id]
                );
                
                if (existing.length > 0) {
                    await connection.execute(`
                        UPDATE product_prices 
                        SET unit_amount = ?, active = ?, lookup_key = ?
                        WHERE stripe_price_id = ?
                    `, [
                        stripePrice.unit_amount,
                        stripePrice.active ? 1 : 0,
                        stripePrice.lookup_key,
                        stripePrice.id
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