const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Run V3 audit
router.post('/audit', [
    verifyToken,
    requirePermission('can_run_recovery')
], async (req, res) => {
    try {
        logger.info('Starting V3 audit');
        
        const issues = {
            missing_v3_prefix: [],
            wrong_lookup_key: [],
            orphaned_price: [],
            missing_prices: [],
            missing_metadata: [],
            sync_error: []
        };
        
        // Get all products
        const products = await executeQuery(adminPool, 'SELECT * FROM product_catalog');
        
        for (const product of products) {
            const productIssues = [];
            
            // Check for V3 prefix
            if (!product.name.includes('v3') && !product.name.includes('V3')) {
                issues.missing_v3_prefix.push({
                    product_id: product.stripe_product_id,
                    name: product.name
                });
                productIssues.push('missing_v3_prefix');
            }
            
            // Check metadata
            const metadata = product.metadata ? JSON.parse(product.metadata) : {};
            if (!metadata.ai_quotas || !metadata.subscription_limits) {
                issues.missing_metadata.push({
                    product_id: product.stripe_product_id,
                    name: product.name,
                    missing_fields: []
                });
                if (!metadata.ai_quotas) issues.missing_metadata[issues.missing_metadata.length - 1].missing_fields.push('ai_quotas');
                if (!metadata.subscription_limits) issues.missing_metadata[issues.missing_metadata.length - 1].missing_fields.push('subscription_limits');
                productIssues.push('missing_metadata');
            }
            
            // Check prices
            const prices = await executeQuery(adminPool, 
                'SELECT * FROM product_prices WHERE stripe_product_id = ?',
                [product.stripe_product_id]
            );
            
            // Check for wrong lookup keys
            for (const price of prices) {
                if (price.lookup_key && !price.lookup_key.startsWith('v3_')) {
                    issues.wrong_lookup_key.push({
                        price_id: price.stripe_price_id,
                        product_id: product.stripe_product_id,
                        current_key: price.lookup_key,
                        suggested_key: 'v3_' + price.lookup_key
                    });
                    productIssues.push('wrong_lookup_key');
                }
            }
            
            // Check for missing standard prices
            const periods = prices.map(p => p.billing_period);
            const requiredPeriods = ['month', 'semester', 'year'];
            const missingPeriods = requiredPeriods.filter(p => !periods.includes(p));
            
            if (missingPeriods.length > 0) {
                issues.missing_prices.push({
                    product_id: product.stripe_product_id,
                    name: product.name,
                    missing_periods: missingPeriods
                });
                productIssues.push('missing_prices');
            }
            
            // Check sync status
            if (product.sync_status === 'error' || product.sync_status === 'conflict') {
                issues.sync_error.push({
                    product_id: product.stripe_product_id,
                    name: product.name,
                    sync_status: product.sync_status,
                    sync_error: product.sync_error
                });
                productIssues.push('sync_error');
            }
        }
        
        // Check for orphaned prices
        const orphanedQuery = `
            SELECT p.* 
            FROM product_prices p
            LEFT JOIN product_catalog c ON p.stripe_product_id = c.stripe_product_id
            WHERE c.id IS NULL
        `;
        const orphanedPrices = await executeQuery(adminPool, orphanedQuery);
        
        for (const price of orphanedPrices) {
            issues.orphaned_price.push({
                price_id: price.stripe_price_id,
                product_id: price.stripe_product_id
            });
        }
        
        // Calculate summary
        const summary = {
            total_issues: 0,
            products_affected: 0,
            prices_affected: 0,
            products_clean: 0
        };
        
        const affectedProducts = new Set();
        
        for (const [issueType, issueList] of Object.entries(issues)) {
            summary.total_issues += issueList.length;
            
            issueList.forEach(issue => {
                if (issue.product_id) affectedProducts.add(issue.product_id);
            });
        }
        
        summary.products_affected = affectedProducts.size;
        summary.prices_affected = issues.wrong_lookup_key.length + issues.orphaned_price.length;
        summary.products_clean = products.length - affectedProducts.size;
        
        // Format issues for response
        const formattedIssues = [
            {
                type: 'missing_v3_prefix',
                title: 'Missing v3 Prefix',
                description: 'Products without "v3" in their name',
                count: issues.missing_v3_prefix.length,
                severity: 'high',
                examples: issues.missing_v3_prefix.slice(0, 5).map(i => i.name)
            },
            {
                type: 'wrong_lookup_key',
                title: 'Incorrect Lookup Keys',
                description: 'Price lookup keys missing "v3_" prefix',
                count: issues.wrong_lookup_key.length,
                severity: 'high',
                examples: issues.wrong_lookup_key.slice(0, 5).map(i => i.current_key)
            },
            {
                type: 'orphaned_price',
                title: 'Orphaned Prices',
                description: 'Prices linked to deleted or missing products',
                count: issues.orphaned_price.length,
                severity: 'medium',
                examples: issues.orphaned_price.slice(0, 5).map(i => i.price_id)
            },
            {
                type: 'missing_prices',
                title: 'Missing Price Configurations',
                description: 'Products missing required price periods',
                count: issues.missing_prices.length,
                severity: 'medium',
                examples: issues.missing_prices.slice(0, 5).map(i => `${i.name} (missing: ${i.missing_periods.join(', ')})`)
            },
            {
                type: 'missing_metadata',
                title: 'Incomplete Metadata',
                description: 'Products missing required metadata fields',
                count: issues.missing_metadata.length,
                severity: 'low',
                examples: issues.missing_metadata.slice(0, 5).map(i => `${i.name} (missing: ${i.missing_fields.join(', ')})`)
            },
            {
                type: 'sync_error',
                title: 'Synchronization Errors',
                description: 'Products with sync conflicts or errors',
                count: issues.sync_error.length,
                severity: 'high',
                examples: issues.sync_error.slice(0, 5).map(i => i.name)
            }
        ];
        
        // Log audit action
        await logAdminAction(req, 'recovery', 'audit', 'v3_audit', {
            summary,
            issue_counts: Object.fromEntries(
                Object.entries(issues).map(([k, v]) => [k, v.length])
            )
        });
        
        res.json({
            success: true,
            data: {
                summary,
                issues: formattedIssues.filter(i => i.count > 0),
                details: issues // Include full details for recovery planning
            }
        });
        
    } catch (error) {
        logger.error('V3 audit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run V3 audit'
        });
    }
});

// Execute V3 recovery
router.post('/execute', [
    verifyToken,
    requirePermission('can_run_recovery')
], async (req, res) => {
    try {
        const { issues, dry_run = false } = req.body;
        const recoveryBatch = uuidv4();
        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };
        
        logger.info(`Starting V3 recovery batch: ${recoveryBatch}, dry_run: ${dry_run}`);
        
        // Process missing V3 prefixes
        if (issues.missing_v3_prefix) {
            for (const issue of issues.missing_v3_prefix) {
                try {
                    const newName = issue.name.replace('MedPro -', 'MedPro v3 -');
                    
                    if (!dry_run) {
                        // Update in Stripe
                        await stripe.products.update(issue.product_id, { name: newName });
                        
                        // Update in database
                        await executeQuery(adminPool,
                            'UPDATE product_catalog SET name = ?, sync_status = "synced" WHERE stripe_product_id = ?',
                            [newName, issue.product_id]
                        );
                    }
                    
                    // Log recovery action
                    await executeQuery(adminPool, `
                        INSERT INTO v3_recovery_log 
                        (recovery_batch, issue_type, stripe_entity_id, entity_type, 
                         original_value, fixed_value, action_taken, status, executed_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        recoveryBatch, 'missing_v3_prefix', issue.product_id, 'product',
                        issue.name, newName, 'renamed', dry_run ? 'skipped' : 'fixed',
                        req.user.email
                    ]);
                    
                    if (dry_run) {
                        results.skipped++;
                    } else {
                        results.success++;
                    }
                } catch (error) {
                    logger.error(`Failed to fix V3 prefix for ${issue.product_id}:`, error);
                    results.failed++;
                    results.errors.push({
                        type: 'missing_v3_prefix',
                        id: issue.product_id,
                        error: error.message
                    });
                }
            }
        }
        
        // Process wrong lookup keys
        if (issues.wrong_lookup_key) {
            for (const issue of issues.wrong_lookup_key) {
                try {
                    if (!dry_run) {
                        // Update in Stripe
                        await stripe.prices.update(issue.price_id, {
                            lookup_key: issue.suggested_key
                        });
                        
                        // Update in database
                        await executeQuery(adminPool,
                            'UPDATE product_prices SET lookup_key = ? WHERE stripe_price_id = ?',
                            [issue.suggested_key, issue.price_id]
                        );
                    }
                    
                    // Log recovery action
                    await executeQuery(adminPool, `
                        INSERT INTO v3_recovery_log 
                        (recovery_batch, issue_type, stripe_entity_id, entity_type, 
                         original_value, fixed_value, action_taken, status, executed_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        recoveryBatch, 'wrong_lookup_key', issue.price_id, 'price',
                        issue.current_key, issue.suggested_key, 'updated_metadata', 
                        dry_run ? 'skipped' : 'fixed', req.user.email
                    ]);
                    
                    if (dry_run) {
                        results.skipped++;
                    } else {
                        results.success++;
                    }
                } catch (error) {
                    logger.error(`Failed to fix lookup key for ${issue.price_id}:`, error);
                    results.failed++;
                    results.errors.push({
                        type: 'wrong_lookup_key',
                        id: issue.price_id,
                        error: error.message
                    });
                }
            }
        }
        
        // Process orphaned prices
        if (issues.orphaned_price) {
            for (const issue of issues.orphaned_price) {
                try {
                    if (!dry_run) {
                        // Deactivate in Stripe
                        await stripe.prices.update(issue.price_id, { active: false });
                        
                        // Remove from database
                        await executeQuery(adminPool,
                            'DELETE FROM product_prices WHERE stripe_price_id = ?',
                            [issue.price_id]
                        );
                    }
                    
                    // Log recovery action
                    await executeQuery(adminPool, `
                        INSERT INTO v3_recovery_log 
                        (recovery_batch, issue_type, stripe_entity_id, entity_type, 
                         action_taken, status, executed_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        recoveryBatch, 'orphaned_price', issue.price_id, 'price',
                        'deleted', dry_run ? 'skipped' : 'fixed', req.user.email
                    ]);
                    
                    if (dry_run) {
                        results.skipped++;
                    } else {
                        results.success++;
                    }
                } catch (error) {
                    logger.error(`Failed to remove orphaned price ${issue.price_id}:`, error);
                    results.failed++;
                    results.errors.push({
                        type: 'orphaned_price',
                        id: issue.price_id,
                        error: error.message
                    });
                }
            }
        }
        
        // Log overall recovery action
        await logAdminAction(req, 'recovery', 'batch', recoveryBatch, {
            dry_run,
            results,
            issues_processed: Object.keys(issues).length
        });
        
        res.json({
            success: true,
            data: {
                recovery_batch: recoveryBatch,
                dry_run,
                results,
                message: dry_run ? 
                    'Dry run completed. No changes were made.' : 
                    'Recovery completed successfully.'
            }
        });
        
    } catch (error) {
        logger.error('V3 recovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute V3 recovery'
        });
    }
});

// Get recovery history
router.get('/history', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                recovery_batch,
                COUNT(*) as total_actions,
                SUM(CASE WHEN status = 'fixed' THEN 1 ELSE 0 END) as fixed_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
                MIN(created_at) as started_at,
                MAX(executed_at) as completed_at,
                executed_by
            FROM v3_recovery_log
            GROUP BY recovery_batch
            ORDER BY started_at DESC
            LIMIT 20
        `;
        
        const history = await executeQuery(adminPool, query);
        
        res.json({
            success: true,
            data: history
        });
        
    } catch (error) {
        logger.error('Get recovery history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get recovery history'
        });
    }
});

module.exports = router;