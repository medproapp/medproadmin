const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const stripeService = require('../services/stripe');

// Get all products with filtering
router.get('/', verifyToken, async (req, res) => {
    try {
        logger.info('GET /products - Query params:', req.query);
        
        let sqlQuery = `
            SELECT 
                p.id, p.stripe_product_id, p.name, p.description, p.plan_type, 
                p.user_tier, p.max_users, p.ai_quota_monthly, p.is_enterprise,
                p.trial_eligible, p.target_audience, p.is_popular, p.is_free_plan,
                p.active, p.metadata, p.stripe_created_at, 
                p.sync_status, p.sync_error, p.last_synced_at, p.created_at, 
                p.updated_at, p.created_by, p.updated_by,
                COUNT(DISTINCT pr.id) as price_count,
                MIN(pr.unit_amount) as min_price,
                MAX(pr.unit_amount) as max_price
            FROM product_catalog p
            LEFT JOIN product_prices pr ON p.stripe_product_id = pr.stripe_product_id AND pr.active = 1
            WHERE 1=1
        `;
        
        const params = [];
        
        // Apply filters
        if (req.query.plan_type) {
            sqlQuery += ' AND p.plan_type = ?';
            params.push(req.query.plan_type);
        }
        
        if (req.query.user_tier) {
            sqlQuery += ' AND p.user_tier = ?';
            params.push(parseInt(req.query.user_tier));
        }
        
        if (req.query.active !== undefined) {
            sqlQuery += ' AND p.active = ?';
            params.push(req.query.active === 'true' ? 1 : 0);
        }
        
        if (req.query.search) {
            sqlQuery += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            const searchTerm = `%${req.query.search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        if (req.query.sync_status) {
            sqlQuery += ' AND p.sync_status = ?';
            params.push(req.query.sync_status);
        }
        
        // Group by product - include all non-aggregated columns for MySQL strict mode
        sqlQuery += ` GROUP BY p.id, p.stripe_product_id, p.name, p.description, p.plan_type, 
                      p.user_tier, p.max_users, p.ai_quota_monthly, p.is_enterprise,
                      p.trial_eligible, p.target_audience, p.is_popular, p.is_free_plan,
                      p.active, p.metadata, p.stripe_created_at, 
                      p.sync_status, p.sync_error, p.last_synced_at, p.created_at, 
                      p.updated_at, p.created_by, p.updated_by`;
        
        // Apply sorting
        const sortBy = req.query.sort_by || 'updated_at';
        const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';
        sqlQuery += ` ORDER BY p.${sortBy} ${sortOrder}`;
        
        // Apply pagination
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        sqlQuery += ` LIMIT ${limit} OFFSET ${offset}`;
        
        // Execute query
        logger.info('Executing products query:', { query: sqlQuery, params });
        const products = await executeQuery(adminPool, sqlQuery, params);
        logger.info('Products query result count:', products.length);
        
        // Get prices for each product
        for (const product of products) {
            const pricesQuery = `
                SELECT * FROM product_prices 
                WHERE stripe_product_id = ? AND active = 1
                ORDER BY unit_amount ASC
            `;
            product.prices = await executeQuery(adminPool, pricesQuery, [product.stripe_product_id]);
            
            // Parse original metadata first
            let originalMetadata = {};
            if (product.metadata) {
                try {
                    originalMetadata = JSON.parse(product.metadata);
                } catch (e) {
                    originalMetadata = {};
                }
            }
            
            // Structure metadata for frontend compatibility
            product.metadata = {
                ...originalMetadata,
                classification: {
                    plan_type: product.plan_type,
                    user_tier: product.user_tier,
                    market_segment: product.target_audience,
                    ...(originalMetadata.classification || {})
                },
                subscription_limits: {
                    patients: {
                        max_patients: product.max_users || 0
                    },
                    users: {
                        practitioners: product.user_tier || 0,
                        assistants: Math.floor((product.user_tier || 0) / 2)
                    },
                    ...(originalMetadata.subscription_limits || {})
                },
                ai_quotas: {
                    tokens: {
                        monthly_limit: product.ai_quota_monthly || 0
                    },
                    ...(originalMetadata.ai_quotas || {})
                },
                features: {
                    enterprise: product.is_enterprise || false,
                    trial_eligible: product.trial_eligible || false,
                    popular: product.is_popular || false,
                    free_plan: product.is_free_plan || false,
                    ...(originalMetadata.features || {})
                }
            };
        }
        
        // Get total count
        const countQuery = `
            SELECT COUNT(DISTINCT p.id) as total 
            FROM product_catalog p 
            WHERE 1=1
            ${req.query.plan_type ? ' AND p.plan_type = ?' : ''}
            ${req.query.user_tier ? ' AND p.user_tier = ?' : ''}
            ${req.query.active !== undefined ? ' AND p.active = ?' : ''}
            ${req.query.search ? ' AND (p.name LIKE ? OR p.description LIKE ?)' : ''}
            ${req.query.sync_status ? ' AND p.sync_status = ?' : ''}
        `;
        const countParams = params; // No need to remove limit and offset since we're not using params for them
        const countResult = await executeQuery(adminPool, countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    total,
                    limit,
                    offset,
                    has_more: offset + limit < total
                }
            }
        });
        
    } catch (error) {
        logger.error('Failed to fetch products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products'
        });
    }
});

// Get single product
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT * FROM product_catalog 
            WHERE stripe_product_id = ? OR id = ?
        `;
        const products = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        const product = products[0];
        
        // Get prices
        const pricesQuery = `
            SELECT * FROM product_prices 
            WHERE stripe_product_id = ?
            ORDER BY unit_amount ASC
        `;
        product.prices = await executeQuery(adminPool, pricesQuery, [product.stripe_product_id]);
        
        // Parse metadata
        if (product.metadata) {
            try {
                product.metadata = JSON.parse(product.metadata);
            } catch (e) {
                product.metadata = {};
            }
        }
        
        res.json({
            success: true,
            data: product
        });
        
    } catch (error) {
        logger.error('Failed to fetch product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product'
        });
    }
});

// Create product
router.post('/', [
    verifyToken,
    requirePermission('can_create_products'),
    body('name').notEmpty().trim(),
    body('description').optional().trim(),
    body('plan_type').optional().trim(),
    body('user_tier').optional().isInt(),
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
        
        const { name, description, plan_type, user_tier, active, metadata } = req.body;
        
        // Create in Stripe first
        const stripeProduct = await stripeService.createProduct({
            name,
            description,
            active: active !== false,
            metadata: {
                plan_type: plan_type || '',
                user_tier: user_tier || '0',
                ...metadata
            }
        });
        
        // Save to database
        const insertQuery = `
            INSERT INTO product_catalog (
                stripe_product_id, name, description, plan_type, user_tier, 
                active, metadata, stripe_created_at, sync_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', ?)
        `;
        
        const result = await executeQuery(adminPool, insertQuery, [
            stripeProduct.id,
            stripeProduct.name,
            stripeProduct.description,
            plan_type,
            user_tier || 0,
            stripeProduct.active ? 1 : 0,
            JSON.stringify(stripeProduct.metadata),
            stripeProduct.created,
            req.user.email
        ]);
        
        // Log admin action
        await logAdminAction(req, 'create', 'product', stripeProduct.id, {
            name,
            description,
            plan_type,
            user_tier
        });
        
        res.json({
            success: true,
            data: {
                id: result.insertId,
                stripe_product_id: stripeProduct.id,
                ...req.body
            }
        });
        
    } catch (error) {
        logger.error('Failed to create product:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create product'
        });
    }
});

// Update product
router.put('/:id', [
    verifyToken,
    requirePermission('can_edit_products'),
    body('name').optional().trim(),
    body('description').optional().trim(),
    body('plan_type').optional().trim(),
    body('user_tier').optional().isInt(),
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
        
        // Get existing product
        const query = `
            SELECT * FROM product_catalog 
            WHERE stripe_product_id = ? OR id = ?
        `;
        const products = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        const existingProduct = products[0];
        const stripeProductId = existingProduct.stripe_product_id;
        
        // Update in Stripe
        const updateData = {};
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.active !== undefined) updateData.active = req.body.active;
        if (req.body.metadata !== undefined || req.body.plan_type !== undefined || req.body.user_tier !== undefined) {
            updateData.metadata = {
                plan_type: req.body.plan_type || existingProduct.plan_type || '',
                user_tier: (req.body.user_tier || existingProduct.user_tier || 0).toString(),
                ...(req.body.metadata || {})
            };
        }
        
        const stripeProduct = await stripeService.updateProduct(stripeProductId, updateData);
        
        // Update in database
        const updateQuery = `
            UPDATE product_catalog SET
                name = ?,
                description = ?,
                plan_type = ?,
                user_tier = ?,
                active = ?,
                metadata = ?,
                sync_status = 'synced',
                updated_by = ?
            WHERE stripe_product_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [
            stripeProduct.name,
            stripeProduct.description,
            req.body.plan_type !== undefined ? req.body.plan_type : existingProduct.plan_type,
            req.body.user_tier !== undefined ? req.body.user_tier : existingProduct.user_tier,
            stripeProduct.active ? 1 : 0,
            JSON.stringify(stripeProduct.metadata),
            req.user.email,
            stripeProductId
        ]);
        
        // Log admin action
        await logAdminAction(req, 'update', 'product', stripeProductId, req.body);
        
        res.json({
            success: true,
            data: {
                stripe_product_id: stripeProductId,
                ...req.body
            }
        });
        
    } catch (error) {
        logger.error('Failed to update product:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update product'
        });
    }
});

// Delete product (archive in Stripe)
router.delete('/:id', [
    verifyToken,
    requirePermission('can_delete_products')
], async (req, res) => {
    try {
        // Get existing product
        const query = `
            SELECT * FROM product_catalog 
            WHERE stripe_product_id = ? OR id = ?
        `;
        const products = await executeQuery(adminPool, query, [req.params.id, req.params.id]);
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        const stripeProductId = products[0].stripe_product_id;
        
        // Archive in Stripe (Stripe doesn't actually delete products)
        await stripeService.deleteProduct(stripeProductId);
        
        // Update in database
        const updateQuery = `
            UPDATE product_catalog 
            SET active = 0, sync_status = 'synced', updated_by = ?
            WHERE stripe_product_id = ?
        `;
        await executeQuery(adminPool, updateQuery, [req.user.email, stripeProductId]);
        
        // Also deactivate all prices
        const updatePricesQuery = `
            UPDATE product_prices 
            SET active = 0, updated_by = ?
            WHERE stripe_product_id = ?
        `;
        await executeQuery(adminPool, updatePricesQuery, [req.user.email, stripeProductId]);
        
        // Log admin action
        await logAdminAction(req, 'delete', 'product', stripeProductId);
        
        res.json({
            success: true,
            message: 'Product archived successfully'
        });
        
    } catch (error) {
        logger.error('Failed to delete product:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete product'
        });
    }
});

// Sync products from Stripe
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
        
        // Fetch all products from Stripe
        const stripeProducts = await stripeService.syncAllProducts();
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Process each product
        for (const stripeProduct of stripeProducts) {
            try {
                // Check if product exists
                const checkQuery = `
                    SELECT id FROM product_catalog 
                    WHERE stripe_product_id = ?
                `;
                const existing = await executeQuery(adminPool, checkQuery, [stripeProduct.id]);
                
                if (existing.length > 0) {
                    // Update existing
                    const updateQuery = `
                        UPDATE product_catalog SET
                            name = ?,
                            description = ?,
                            active = ?,
                            metadata = ?,
                            plan_type = ?,
                            user_tier = ?,
                            stripe_created_at = FROM_UNIXTIME(?),
                            sync_status = 'synced',
                            last_synced_at = NOW()
                        WHERE stripe_product_id = ?
                    `;
                    
                    await executeQuery(adminPool, updateQuery, [
                        stripeProduct.name,
                        stripeProduct.description,
                        stripeProduct.active ? 1 : 0,
                        JSON.stringify(stripeProduct.metadata),
                        stripeProduct.metadata?.plan_type || null,
                        stripeProduct.metadata?.user_tier || 0,
                        stripeProduct.created,
                        stripeProduct.id
                    ]);
                } else {
                    // Insert new
                    const insertQuery = `
                        INSERT INTO product_catalog (
                            stripe_product_id, name, description, active, metadata,
                            plan_type, user_tier, stripe_created_at, sync_status, last_synced_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', NOW())
                    `;
                    
                    await executeQuery(adminPool, insertQuery, [
                        stripeProduct.id,
                        stripeProduct.name,
                        stripeProduct.description,
                        stripeProduct.active ? 1 : 0,
                        JSON.stringify(stripeProduct.metadata),
                        stripeProduct.metadata?.plan_type || null,
                        stripeProduct.metadata?.user_tier || 0,
                        stripeProduct.created
                    ]);
                }
                
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push({
                    product_id: stripeProduct.id,
                    error: error.message
                });
                logger.error(`Failed to sync product ${stripeProduct.id}:`, error);
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
            stripeProducts.length,
            successCount,
            errorCount,
            errorCount > 0 ? 'completed' : 'completed',
            errorCount > 0 ? JSON.stringify(errors) : null,
            syncId
        ]);
        
        // Log admin action
        await logAdminAction(req, 'sync', 'products', null, {
            total: stripeProducts.length,
            success: successCount,
            errors: errorCount
        });
        
        res.json({
            success: true,
            data: {
                total: stripeProducts.length,
                synced: successCount,
                errors: errorCount,
                error_details: errors
            }
        });
        
    } catch (error) {
        logger.error('Failed to sync products:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sync products'
        });
    }
});

module.exports = router;