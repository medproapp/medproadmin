const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const CustomerSubscription = require('../models/CustomerSubscription');
const CustomerMetrics = require('../models/CustomerMetrics');
const customerSync = require('../services/customerSync');
const stripeCustomers = require('../services/stripeCustomers');
const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

const { verifyToken } = require('../middleware/auth');

// Apply admin authentication to all customer routes
router.use(verifyToken);

// GET /api/v1/customers - List customers with filters and pagination
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            status,
            date_from: dateFrom,
            date_to: dateTo,
            sort_by: sortBy = 'created_at',
            sort_order: sortOrder = 'desc'
        } = req.query;

        // Validate pagination parameters
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Cap at 100

        const filters = {
            search: search ? search.trim() : null,
            status,
            dateFrom,
            dateTo
        };

        const pagination = {
            page: pageNum,
            limit: limitNum
        };

        logger.info('Fetching customers list', { 
            filters, 
            pagination, 
            adminEmail: req.user.email 
        });

        const result = await Customer.findAll(filters, pagination);
        
        // Calculate comprehensive stats for the current filter
        const stats = await Customer.getFilteredStats(filters);

        res.json({
            success: true,
            data: {
                customers: result.customers,
                pagination: result.pagination
            },
            meta: {
                total_results: result.pagination.total,
                page: result.pagination.page,
                per_page: result.pagination.limit,
                total_pages: result.pagination.totalPages,
                stats: stats
            }
        });

    } catch (error) {
        logger.error('Error fetching customers:', { error, adminEmail: req.adminUser.email });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customers',
            message: error.message
        });
    }
});

// GET /api/v1/customers/:id - Get single customer with detailed info
router.get('/:id', async (req, res) => {
    try {
        const { id: stripeCustomerId } = req.params;

        logger.info('Fetching customer details', { 
            stripeCustomerId, 
            adminEmail: req.user.email 
        });

        // Get customer with aggregated data
        const customer = await Customer.findByStripeId(stripeCustomerId);

        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }

        // Get customer subscriptions
        const subscriptions = await CustomerSubscription.findByCustomer(stripeCustomerId);

        // Get customer metrics history (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const metricsHistory = await CustomerMetrics.findByCustomer(
            stripeCustomerId,
            thirtyDaysAgo.toISOString().split('T')[0],
            new Date().toISOString().split('T')[0]
        );

        // Get latest payment methods from Stripe if needed
        let paymentMethods = [];
        try {
            const stripePaymentMethods = await stripeCustomers.listPaymentMethods(stripeCustomerId);
            paymentMethods = stripePaymentMethods.data;
        } catch (stripeError) {
            logger.warn('Failed to fetch payment methods from Stripe', { 
                stripeCustomerId, 
                error: stripeError.message 
            });
        }

        res.json({
            success: true,
            data: {
                customer,
                subscriptions,
                metrics_history: metricsHistory,
                payment_methods: paymentMethods
            }
        });

    } catch (error) {
        logger.error('Error fetching customer details:', { 
            stripeCustomerId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer details',
            message: error.message
        });
    }
});

// GET /api/v1/customers/:id/subscriptions - Get customer subscriptions
router.get('/:id/subscriptions', async (req, res) => {
    try {
        const { id: stripeCustomerId } = req.params;

        logger.info('Fetching customer subscriptions', { 
            stripeCustomerId, 
            adminEmail: req.user.email 
        });

        const subscriptions = await CustomerSubscription.findByCustomer(stripeCustomerId);

        res.json({
            success: true,
            data: {
                customer_id: stripeCustomerId,
                subscriptions,
                count: subscriptions.length
            }
        });

    } catch (error) {
        logger.error('Error fetching customer subscriptions:', { 
            stripeCustomerId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer subscriptions',
            message: error.message
        });
    }
});

// GET /api/v1/customers/:id/invoices - Get customer invoices from Stripe
router.get('/:id/invoices', async (req, res) => {
    try {
        const { id: stripeCustomerId } = req.params;
        const { limit = 10, starting_after } = req.query;

        logger.info('Fetching customer invoices from Stripe', { 
            stripeCustomerId, 
            adminEmail: req.user.email 
        });

        const invoices = await stripeCustomers.listInvoices(stripeCustomerId, {
            limit: Math.min(50, parseInt(limit)),
            starting_after
        });

        res.json({
            success: true,
            data: {
                customer_id: stripeCustomerId,
                invoices: invoices.data,
                has_more: invoices.has_more
            }
        });

    } catch (error) {
        logger.error('Error fetching customer invoices:', { 
            stripeCustomerId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer invoices',
            message: error.message
        });
    }
});

// GET /api/v1/customers/:id/activity - Get customer activity timeline
router.get('/:id/activity', verifyToken, async (req, res) => {
    try {
        const { id: stripeCustomerId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        // Get subscription activities
        const subscriptionQuery = `
            SELECT 
                'subscription' as activity_type,
                cs.id as activity_id,
                cs.status as activity_status,
                CONCAT('Subscription ', cs.status) as activity_description,
                cs.current_period_start as activity_date,
                cs.stripe_subscription_id,
                pc.name as product_name,
                pp.unit_amount,
                pp.currency,
                CONCAT(pp.recurring_interval_count, ' ', pp.recurring_interval) as billing_period,
                cs.current_period_end
            FROM customer_subscriptions cs
            LEFT JOIN product_catalog pc ON cs.stripe_product_id = pc.stripe_product_id
            LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
            WHERE cs.stripe_customer_id = ?
            ORDER BY cs.current_period_start DESC
        `;

        // Get customer sync activities
        const syncQuery = `
            SELECT 
                'customer_sync' as activity_type,
                c.id as activity_id,
                'synced' as activity_status,
                'Customer data synced from Stripe' as activity_description,
                c.last_sync_at as activity_date,
                NULL as stripe_subscription_id,
                c.name as product_name,
                NULL as unit_amount,
                c.currency,
                c.email as billing_period,
                NULL as current_period_end
            FROM customers c
            WHERE c.stripe_customer_id = ? AND c.last_sync_at IS NOT NULL
            ORDER BY c.last_sync_at DESC
        `;

        const [subscriptionActivities, syncActivities] = await Promise.all([
            executeQuery(adminPool, subscriptionQuery, [stripeCustomerId]),
            executeQuery(adminPool, syncQuery, [stripeCustomerId])
        ]);

        // Combine and sort activities
        const allActivities = [...subscriptionActivities, ...syncActivities];
        allActivities.sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
        
        // Apply pagination
        const activities = allActivities.slice(offset, offset + limit);

        // Get total count for pagination  
        const subscriptionCountQuery = `SELECT COUNT(*) as count FROM customer_subscriptions WHERE stripe_customer_id = ?`;
        const syncCountQuery = `SELECT COUNT(*) as count FROM customers WHERE stripe_customer_id = ? AND last_sync_at IS NOT NULL`;
        
        const [subscriptionCount, syncCount] = await Promise.all([
            executeQuery(adminPool, subscriptionCountQuery, [stripeCustomerId]),
            executeQuery(adminPool, syncCountQuery, [stripeCustomerId])
        ]);
        
        const totalCount = (subscriptionCount[0]?.count || 0) + (syncCount[0]?.count || 0);


        res.json({
            success: true,
            data: {
                customer_id: stripeCustomerId,
                activities: activities.map(activity => ({
                    activity_type: activity.activity_type,
                    activity_id: activity.activity_id,
                    activity_status: activity.activity_status,
                    activity_description: activity.activity_description,
                    activity_date: activity.activity_date,
                    metadata: {
                        subscription_id: activity.stripe_subscription_id,
                        product_name: activity.product_name,
                        amount: activity.unit_amount,
                        currency: activity.currency,
                        billing_period: activity.billing_period,
                        period_end: activity.current_period_end
                    }
                })),
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total: totalCount
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching customer activity:', { stripeCustomerId: req.params.id, error });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer activity',
            message: error.message
        });
    }
});

// POST /api/v1/customers/sync - Trigger customer sync from Stripe
router.post('/sync', async (req, res) => {
    try {
        const { customer_id: specificCustomerId, force = false } = req.body;

        logger.info('Customer sync triggered', { 
            specificCustomerId, 
            force, 
            adminEmail: req.user.email 
        });

        let syncResult;

        if (specificCustomerId) {
            // Sync specific customer
            syncResult = await customerSync.syncSingleCustomerById(specificCustomerId);
        } else {
            // Sync all customers
            syncResult = await customerSync.syncAllCustomers();
        }

        res.json({
            success: true,
            message: specificCustomerId ? 
                'Customer sync completed successfully' : 
                'Full customer sync completed successfully',
            data: syncResult
        });

    } catch (error) {
        logger.error('Error in customer sync:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Customer sync failed',
            message: error.message
        });
    }
});

// GET /api/v1/customers/sync/status - Get sync status information
router.get('/sync/status', async (req, res) => {
    try {
        logger.info('Fetching sync status', { adminEmail: req.user.email });

        const syncStatus = await customerSync.getSyncStatus();

        res.json({
            success: true,
            data: syncStatus
        });

    } catch (error) {
        logger.error('Error fetching sync status:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sync status',
            message: error.message
        });
    }
});

// GET /api/v1/customers/analytics/overview - Get customer analytics overview
router.get('/analytics/overview', async (req, res) => {
    try {
        const { 
            date_from: dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            date_to: dateTo = new Date().toISOString().split('T')[0]
        } = req.query;

        logger.info('Fetching customer analytics overview', { 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        const analytics = await Customer.getAnalytics(dateFrom, dateTo);

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                metrics: analytics
            }
        });

    } catch (error) {
        logger.error('Error fetching customer analytics:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer analytics',
            message: error.message
        });
    }
});

// POST /api/v1/customers/:id/recalculate-metrics - Recalculate customer metrics
router.post('/:id/recalculate-metrics', async (req, res) => {
    try {
        const { id: stripeCustomerId } = req.params;

        logger.info('Recalculating customer metrics', { 
            stripeCustomerId, 
            adminEmail: req.user.email 
        });

        // Get customer data for calculations
        const customer = await Customer.findByStripeId(stripeCustomerId);
        
        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }

        // Calculate new metrics
        const metrics = await CustomerMetrics.calculateForCustomer(stripeCustomerId, customer);
        await metrics.save();

        res.json({
            success: true,
            message: 'Customer metrics recalculated successfully',
            data: {
                customer_id: stripeCustomerId,
                metrics: {
                    health_score: metrics.health_score,
                    churn_risk_score: metrics.churn_risk_score,
                    lifetime_value: metrics.lifetime_value,
                    total_revenue: metrics.total_revenue,
                    active_subscriptions: metrics.active_subscription_count
                }
            }
        });

    } catch (error) {
        logger.error('Error recalculating customer metrics:', { 
            stripeCustomerId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to recalculate customer metrics',
            message: error.message
        });
    }
});

module.exports = router;