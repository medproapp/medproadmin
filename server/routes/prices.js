const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const stripeService = require('../services/stripe');

// Get all prices for a product
router.get('/product/:productId', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT * FROM product_prices 
            WHERE stripe_product_id = ?
            ORDER BY unit_amount ASC
        `;
        
        const prices = await executeQuery(adminPool, query, [req.params.productId]);
        
        // Parse metadata for each price
        for (const price of prices) {
            if (price.metadata) {
                try {
                    price.metadata = JSON.parse(price.metadata);
                } catch (e) {
                    price.metadata = {};
                }
            }
        }
        
        res.json({
            success: true,
            data: prices
        });
        
    } catch (error) {
        logger.error('Failed to fetch prices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch prices'
        });
    }
});

// Get single price
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT * FROM product_prices 
            WHERE stripe_price_id = ? OR id = ?
        `;
        
        const prices = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (prices.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Price not found'
            });
        }
        
        const price = prices[0];
        if (price.metadata) {
            try {
                price.metadata = JSON.parse(price.metadata);
            } catch (e) {
                price.metadata = {};
            }
        }
        
        res.json({
            success: true,
            data: price
        });
        
    } catch (error) {
        logger.error('Failed to fetch price:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch price'
        });
    }
});

// Create price
router.post('/', [
    verifyToken,
    requirePermission('can_create_products'),
    body('product_id').notEmpty(),
    body('unit_amount').isFloat({ min: 0 }),
    body('currency').optional().isIn(['brl', 'usd', 'eur']),
    body('nickname').optional().trim(),
    body('recurring').optional().isObject(),
    body('metadata').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { product_id, unit_amount, currency, nickname, recurring, metadata } = req.body;
        
        // Verify product exists
        const productQuery = `
            SELECT stripe_product_id FROM product_catalog 
            WHERE stripe_product_id = ? OR id = ?
        `;
        const products = await executeQuery(adminPool, productQuery, [product_id, product_id]);
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        const stripeProductId = products[0].stripe_product_id;
        
        // Create price in Stripe
        const stripePriceData = {
            product_id: stripeProductId,
            unit_amount,
            currency: currency || 'brl',
            nickname,
            metadata: metadata || {}
        };
        
        if (recurring) {
            stripePriceData.recurring = recurring;
        }
        
        const stripePrice = await stripeService.createPrice(stripePriceData);
        
        // Save to database
        const insertQuery = `
            INSERT INTO product_prices (
                stripe_price_id, stripe_product_id, nickname, currency, unit_amount,
                recurring_interval, recurring_interval_count, active, metadata,
                stripe_created_at, sync_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', ?)
        `;
        
        const result = await executeQuery(adminPool, insertQuery, [
            stripePrice.id,
            stripeProductId,
            stripePrice.nickname,
            stripePrice.currency,
            stripePrice.unit_amount / 100, // Convert from cents
            stripePrice.recurring?.interval || null,
            stripePrice.recurring?.interval_count || null,
            stripePrice.active ? 1 : 0,
            JSON.stringify(stripePrice.metadata),
            stripePrice.created,
            req.user.email
        ]);
        
        // Log admin action
        await logAdminAction(req, 'create', 'price', stripePrice.id, {
            product_id: stripeProductId,
            amount: unit_amount,
            currency,
            recurring
        });
        
        res.json({
            success: true,
            data: {
                id: result.insertId,
                stripe_price_id: stripePrice.id,
                ...req.body
            }
        });
        
    } catch (error) {
        logger.error('Failed to create price:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create price'
        });
    }
});

// Update price (limited - can only update nickname, metadata, and active status)
router.put('/:id', [
    verifyToken,
    requirePermission('can_edit_products'),
    body('nickname').optional().trim(),
    body('active').optional().isBoolean(),
    body('metadata').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        // Get existing price
        const query = `
            SELECT * FROM product_prices 
            WHERE stripe_price_id = ? OR id = ?
        `;
        const prices = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (prices.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Price not found'
            });
        }
        
        const stripePriceId = prices[0].stripe_price_id;
        
        // Update in Stripe
        const stripePrice = await stripeService.updatePrice(stripePriceId, req.body);
        
        // Update in database
        const updateQuery = `
            UPDATE product_prices SET
                nickname = ?,
                active = ?,
                metadata = ?,
                sync_status = 'synced',
                updated_by = ?
            WHERE stripe_price_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [
            stripePrice.nickname,
            stripePrice.active ? 1 : 0,
            JSON.stringify(stripePrice.metadata),
            req.user.email,
            stripePriceId
        ]);
        
        // Log admin action
        await logAdminAction(req, 'update', 'price', stripePriceId, req.body);
        
        res.json({
            success: true,
            data: {
                stripe_price_id: stripePriceId,
                ...req.body
            }
        });
        
    } catch (error) {
        logger.error('Failed to update price:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update price'
        });
    }
});

// Deactivate price
router.delete('/:id', [
    verifyToken,
    requirePermission('can_delete_products')
], async (req, res) => {
    try {
        // Get existing price
        const query = `
            SELECT * FROM product_prices 
            WHERE stripe_price_id = ? OR id = ?
        `;
        const prices = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (prices.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Price not found'
            });
        }
        
        const stripePriceId = prices[0].stripe_price_id;
        
        // Deactivate in Stripe
        await stripeService.updatePrice(stripePriceId, { active: false });
        
        // Update in database
        const updateQuery = `
            UPDATE product_prices 
            SET active = 0, sync_status = 'synced', updated_by = ?
            WHERE stripe_price_id = ?
        `;
        await executeQuery(adminPool, updateQuery, [req.user.email, stripePriceId]);
        
        // Log admin action
        await logAdminAction(req, 'deactivate', 'price', stripePriceId);
        
        res.json({
            success: true,
            message: 'Price deactivated successfully'
        });
        
    } catch (error) {
        logger.error('Failed to deactivate price:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to deactivate price'
        });
    }
});

// Sync prices from Stripe
router.post('/sync', [
    verifyToken,
    requirePermission('can_sync_stripe')
], async (req, res) => {
    try {
        // Create sync history entry
        const syncHistoryQuery = `
            INSERT INTO stripe_sync_history (
                sync_type, sync_direction, sync_status, executed_by
            ) VALUES ('full', 'stripe_to_local', 'running', ?)
        `;
        const syncResult = await executeQuery(adminPool, syncHistoryQuery, [req.user.email]);
        const syncId = syncResult.insertId;
        
        // Fetch all prices from Stripe
        const stripePrices = await stripeService.syncAllPrices();
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Process each price
        for (const stripePrice of stripePrices) {
            try {
                // Check if price exists
                const checkQuery = `
                    SELECT id FROM product_prices 
                    WHERE stripe_price_id = ?
                `;
                const existing = await executeQuery(adminPool, checkQuery, [stripePrice.id]);
                
                if (existing.length > 0) {
                    // Update existing
                    const updateQuery = `
                        UPDATE product_prices SET
                            nickname = ?,
                            currency = ?,
                            unit_amount = ?,
                            recurring_interval = ?,
                            recurring_interval_count = ?,
                            active = ?,
                            metadata = ?,
                            stripe_created_at = FROM_UNIXTIME(?),
                            sync_status = 'synced',
                            last_synced_at = NOW()
                        WHERE stripe_price_id = ?
                    `;
                    
                    await executeQuery(adminPool, updateQuery, [
                        stripePrice.nickname,
                        stripePrice.currency,
                        stripePrice.unit_amount / 100,
                        stripePrice.recurring?.interval || null,
                        stripePrice.recurring?.interval_count || null,
                        stripePrice.active ? 1 : 0,
                        JSON.stringify(stripePrice.metadata),
                        stripePrice.created,
                        stripePrice.id
                    ]);
                } else {
                    // Insert new
                    const insertQuery = `
                        INSERT INTO product_prices (
                            stripe_price_id, stripe_product_id, nickname, currency, unit_amount,
                            recurring_interval, recurring_interval_count, active, metadata,
                            stripe_created_at, sync_status, last_synced_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', NOW())
                    `;
                    
                    await executeQuery(adminPool, insertQuery, [
                        stripePrice.id,
                        stripePrice.product,
                        stripePrice.nickname,
                        stripePrice.currency,
                        stripePrice.unit_amount / 100,
                        stripePrice.recurring?.interval || null,
                        stripePrice.recurring?.interval_count || null,
                        stripePrice.active ? 1 : 0,
                        JSON.stringify(stripePrice.metadata),
                        stripePrice.created
                    ]);
                }
                
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push({
                    price_id: stripePrice.id,
                    error: error.message
                });
                logger.error(`Failed to sync price ${stripePrice.id}:`, error);
            }
        }
        
        // Update sync history
        const updateSyncQuery = `
            UPDATE stripe_sync_history SET
                entity_count = ?,
                success_count = ?,
                error_count = ?,
                sync_status = ?,
                error_details = ?,
                completed_at = NOW()
            WHERE id = ?
        `;
        
        await executeQuery(adminPool, updateSyncQuery, [
            stripePrices.length,
            successCount,
            errorCount,
            errorCount > 0 ? 'completed' : 'completed',
            errorCount > 0 ? JSON.stringify(errors) : null,
            syncId
        ]);
        
        // Log admin action
        await logAdminAction(req, 'sync', 'prices', null, {
            total: stripePrices.length,
            success: successCount,
            errors: errorCount
        });
        
        res.json({
            success: true,
            data: {
                total: stripePrices.length,
                synced: successCount,
                errors: errorCount,
                error_details: errors
            }
        });
        
    } catch (error) {
        logger.error('Failed to sync prices:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync prices'
        });
    }
});

module.exports = router;