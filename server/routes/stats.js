const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { executeQuery, adminPool, medproPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Get dashboard statistics
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        // Product statistics
        const productStats = await executeQuery(adminPool, `
            SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_products,
                SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as sync_errors
            FROM product_catalog
        `);
        
        // Price statistics
        const priceStats = await executeQuery(adminPool, `
            SELECT 
                COUNT(*) as total_prices,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_prices,
                COUNT(DISTINCT stripe_product_id) as products_with_prices
            FROM product_prices
        `);
        
        // Issues count (simplified V3 audit)
        const v3Issues = await executeQuery(adminPool, `
            SELECT 
                SUM(CASE WHEN name NOT LIKE '%v3%' AND name NOT LIKE '%V3%' THEN 1 ELSE 0 END) as missing_v3_prefix,
                SUM(CASE WHEN metadata NOT LIKE '%ai_quotas%' THEN 1 ELSE 0 END) as missing_metadata
            FROM product_catalog
        `);
        
        // Recent activity
        const recentActivity = await executeQuery(adminPool, `
            SELECT 
                action_type,
                entity_type,
                admin_email,
                created_at
            FROM admin_audit_log
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        // Subscription statistics from main database
        let subscriptionStats = { active_subscriptions: 0, monthly_revenue: 0 };
        try {
            const subStats = await executeQuery(medproPool, `
                SELECT 
                    COUNT(DISTINCT subscription_id) as active_subscriptions,
                    SUM(CASE WHEN billing_period = 'month' THEN amount 
                             WHEN billing_period = 'year' THEN amount / 12
                             WHEN billing_period = 'semester' THEN amount / 6
                             ELSE 0 END) as monthly_revenue
                FROM SUBSCRIPTIONS
                WHERE status = 'active'
            `);
            if (subStats.length > 0) {
                subscriptionStats = subStats[0];
            }
        } catch (error) {
            logger.warn('Could not fetch subscription stats:', error);
        }
        
        res.json({
            success: true,
            data: {
                products: productStats[0],
                prices: priceStats[0],
                issues: {
                    total: (v3Issues[0].missing_v3_prefix || 0) + (v3Issues[0].missing_metadata || 0),
                    missing_v3_prefix: v3Issues[0].missing_v3_prefix || 0,
                    missing_metadata: v3Issues[0].missing_metadata || 0
                },
                subscriptions: subscriptionStats,
                recent_activity: recentActivity
            }
        });
        
    } catch (error) {
        logger.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve dashboard statistics'
        });
    }
});

// Get product distribution
router.get('/products/distribution', verifyToken, async (req, res) => {
    try {
        // By plan type
        const byPlanType = await executeQuery(adminPool, `
            SELECT 
                plan_type,
                COUNT(*) as count,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
            FROM product_catalog
            WHERE plan_type IS NOT NULL
            GROUP BY plan_type
        `);
        
        // By user tier
        const byUserTier = await executeQuery(adminPool, `
            SELECT 
                user_tier,
                COUNT(*) as count,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
            FROM product_catalog
            WHERE user_tier IS NOT NULL
            GROUP BY user_tier
            ORDER BY user_tier
        `);
        
        // Price ranges
        const priceRanges = await executeQuery(adminPool, `
            SELECT 
                CASE 
                    WHEN unit_amount < 10000 THEN 'Under R$100'
                    WHEN unit_amount < 50000 THEN 'R$100-500'
                    WHEN unit_amount < 100000 THEN 'R$500-1000'
                    ELSE 'Over R$1000'
                END as price_range,
                COUNT(*) as count,
                billing_period
            FROM product_prices
            WHERE active = 1 AND billing_period = 'month'
            GROUP BY price_range, billing_period
            ORDER BY 
                CASE price_range
                    WHEN 'Under R$100' THEN 1
                    WHEN 'R$100-500' THEN 2
                    WHEN 'R$500-1000' THEN 3
                    ELSE 4
                END
        `);
        
        res.json({
            success: true,
            data: {
                by_plan_type: byPlanType,
                by_user_tier: byUserTier,
                price_ranges: priceRanges
            }
        });
        
    } catch (error) {
        logger.error('Get product distribution error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve product distribution'
        });
    }
});

// Get sync metrics
router.get('/sync/metrics', verifyToken, async (req, res) => {
    try {
        const { days = 7 } = req.query;
        
        // Sync operations by day
        const syncByDay = await executeQuery(adminPool, `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_syncs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM sync_queue
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [days]);
        
        // Average sync time
        const syncTimes = await executeQuery(adminPool, `
            SELECT 
                operation_type,
                AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as avg_seconds,
                COUNT(*) as count
            FROM sync_queue
            WHERE status = 'completed' 
                AND started_at IS NOT NULL 
                AND completed_at IS NOT NULL
                AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY operation_type
        `, [days]);
        
        res.json({
            success: true,
            data: {
                period_days: days,
                sync_by_day: syncByDay,
                average_sync_times: syncTimes
            }
        });
        
    } catch (error) {
        logger.error('Get sync metrics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve sync metrics'
        });
    }
});

module.exports = router;