const express = require('express');
const router = express.Router();
const moment = require('moment');
const Customer = require('../models/Customer');
const CustomerSubscription = require('../models/CustomerSubscription');
const CustomerMetrics = require('../models/CustomerMetrics');
const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

const { verifyToken } = require('../middleware/auth');

// Apply admin authentication to all analytics routes
router.use(verifyToken);

// GET /api/v1/analytics/customers/overview - Customer analytics overview
router.get('/customers/overview', async (req, res) => {
    try {
        const { 
            period = '30d',
            date_from: dateFromParam,
            date_to: dateToParam 
        } = req.query;

        // Calculate date range based on period or custom dates
        let dateFrom, dateTo;
        
        if (dateFromParam && dateToParam) {
            dateFrom = dateFromParam;
            dateTo = dateToParam;
        } else {
            dateTo = new Date().toISOString().split('T')[0];
            const daysBack = period === '7d' ? 7 : period === '90d' ? 90 : 30;
            dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }

        logger.info('Fetching customer analytics overview', { 
            period, 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        // Get basic customer metrics
        const customerMetrics = await Customer.getAnalytics(dateFrom, dateTo);
        
        // Get subscription status summary
        const subscriptionSummary = await CustomerSubscription.getStatusSummary();
        
        // Get daily analytics data from the aggregated table
        const dailyAnalyticsQuery = `
            SELECT 
                date,
                new_customers,
                churned_customers,
                total_active_customers,
                total_revenue,
                average_revenue_per_customer,
                new_subscriptions,
                canceled_subscriptions
            FROM customer_analytics_daily
            WHERE date BETWEEN ? AND ?
            ORDER BY date ASC
        `;

        const dailyAnalytics = await executeQuery(adminPool, dailyAnalyticsQuery, [dateFrom, dateTo]);

        // Calculate MRR and growth rate
        const currentMRR = subscriptionSummary
            .filter(s => s.status === 'active')
            .reduce((sum, s) => sum + (s.total_value || 0), 0);

        // Get growth rate (compare to previous period)
        const prevPeriodStart = new Date(new Date(dateFrom).getTime() - (new Date(dateTo) - new Date(dateFrom)));
        const prevPeriodEnd = new Date(dateFrom);
        
        const previousMetrics = await Customer.getAnalytics(
            prevPeriodStart.toISOString().split('T')[0],
            prevPeriodEnd.toISOString().split('T')[0]
        );

        const growthRate = previousMetrics.new_customers > 0 ? 
            ((customerMetrics.new_customers - previousMetrics.new_customers) / previousMetrics.new_customers) * 100 : 0;

        // Calculate churn rate
        const totalCustomers = customerMetrics.total_customers || 0;
        const delinquentCustomers = customerMetrics.delinquent_customers || 0;
        const churnRate = totalCustomers > 0 ? (delinquentCustomers / totalCustomers) * 100 : 0;

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                overview: {
                    total_customers: customerMetrics.total_customers || 0,
                    new_customers: customerMetrics.new_customers || 0,
                    active_customers: customerMetrics.active_customers || 0,
                    delinquent_customers: customerMetrics.delinquent_customers || 0,
                    monthly_recurring_revenue: Math.round(currentMRR / 100), // Convert to dollars
                    average_lifetime_value: Math.round((customerMetrics.avg_lifetime_value || 0) / 100),
                    average_health_score: Math.round(customerMetrics.avg_health_score || 50),
                    customer_growth_rate: Math.round(growthRate * 100) / 100,
                    churn_rate: Math.round(churnRate * 100) / 100
                },
                subscription_breakdown: subscriptionSummary.map(s => ({
                    status: s.status,
                    count: s.count,
                    total_value: Math.round((s.total_value || 0) / 100) // Convert to dollars
                })),
                daily_trends: dailyAnalytics.map(day => ({
                    date: day.date,
                    new_customers: day.new_customers || 0,
                    churned_customers: day.churned_customers || 0,
                    total_active_customers: day.total_active_customers || 0,
                    total_revenue: Math.round((day.total_revenue || 0) / 100),
                    new_subscriptions: day.new_subscriptions || 0,
                    canceled_subscriptions: day.canceled_subscriptions || 0
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching customer analytics overview:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer analytics overview',
            message: error.message
        });
    }
});

// GET /api/v1/analytics/customers/growth - Customer growth trends
router.get('/customers/growth', async (req, res) => {
    try {
        const { 
            period = '30d',
            date_from: dateFromParam,
            date_to: dateToParam 
        } = req.query;

        // Calculate date range
        let dateFrom, dateTo;
        if (dateFromParam && dateToParam) {
            dateFrom = dateFromParam;
            dateTo = dateToParam;
        } else {
            dateTo = new Date().toISOString().split('T')[0];
            const daysBack = period === '7d' ? 7 : period === '90d' ? 90 : 30;
            dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }

        logger.info('Fetching customer growth trends', { 
            period, 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        // Get daily growth data
        const dailyGrowth = await Customer.getDailyGrowth(dateFrom, dateTo);
        
        // Calculate cumulative totals
        let cumulativeTotal = 0;
        const growthData = dailyGrowth.map(day => {
            cumulativeTotal += day.new_customers;
            return {
                date: day.date,
                new_customers: day.new_customers,
                cumulative_customers: cumulativeTotal
            };
        });

        // Get subscription growth data
        const subscriptionGrowthQuery = `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as new_subscriptions
            FROM customer_subscriptions
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;

        const subscriptionGrowth = await executeQuery(adminPool, subscriptionGrowthQuery, [dateFrom, dateTo]);

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                customer_growth: growthData,
                subscription_growth: subscriptionGrowth.map(day => ({
                    date: day.date,
                    new_subscriptions: day.new_subscriptions
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching customer growth trends:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer growth trends',
            message: error.message
        });
    }
});

// GET /api/v1/analytics/customers/revenue - Revenue analytics
router.get('/customers/revenue', async (req, res) => {
    try {
        const { 
            period = '30d',
            date_from: dateFromParam,
            date_to: dateToParam 
        } = req.query;

        let dateFrom, dateTo;
        if (dateFromParam && dateToParam) {
            dateFrom = dateFromParam;
            dateTo = dateToParam;
        } else {
            dateTo = new Date().toISOString().split('T')[0];
            const daysBack = period === '7d' ? 7 : period === '90d' ? 90 : 30;
            dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }

        logger.info('Fetching revenue analytics', { 
            period, 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        // Get revenue by subscription period
        const revenueData = await CustomerSubscription.getRevenueByPeriod(dateFrom, dateTo);

        // Get revenue by product
        const revenueByProductQuery = `
            SELECT 
                pc.name as product_name,
                pc.stripe_product_id,
                COUNT(cs.id) as subscription_count,
                SUM(CASE WHEN pp.unit_amount IS NOT NULL THEN pp.unit_amount ELSE 0 END) as total_revenue
            FROM customer_subscriptions cs
            JOIN product_catalog pc ON cs.stripe_product_id = pc.stripe_product_id
            LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
            WHERE cs.status = 'active'
            GROUP BY pc.stripe_product_id, pc.name
            ORDER BY total_revenue DESC
        `;

        const revenueByProduct = await executeQuery(adminPool, revenueByProductQuery);

        // Get customer lifetime value distribution
        const ltvDistributionQuery = `
            SELECT 
                CASE 
                    WHEN cm.lifetime_value < 5000 THEN '$0-$50'
                    WHEN cm.lifetime_value < 10000 THEN '$50-$100'
                    WHEN cm.lifetime_value < 25000 THEN '$100-$250'
                    WHEN cm.lifetime_value < 50000 THEN '$250-$500'
                    WHEN cm.lifetime_value < 100000 THEN '$500-$1000'
                    ELSE '$1000+'
                END as ltv_range,
                COUNT(*) as customer_count,
                AVG(cm.lifetime_value) as avg_ltv_in_range
            FROM (
                SELECT DISTINCT 
                    stripe_customer_id,
                    lifetime_value
                FROM customer_metrics cm1
                WHERE metric_date = (
                    SELECT MAX(metric_date) 
                    FROM customer_metrics cm2 
                    WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                )
                AND lifetime_value > 0
            ) cm
            GROUP BY ltv_range
            ORDER BY avg_ltv_in_range ASC
        `;

        const ltvDistribution = await executeQuery(adminPool, ltvDistributionQuery);

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                revenue_trends: revenueData.map(day => ({
                    date: day.period_date,
                    active_subscriptions: day.active_subscriptions,
                    total_revenue: Math.round((day.total_revenue || 0) / 100)
                })),
                revenue_by_product: revenueByProduct.map(product => ({
                    product_name: product.product_name,
                    product_id: product.stripe_product_id,
                    subscription_count: product.subscription_count,
                    total_revenue: Math.round((product.total_revenue || 0) / 100)
                })),
                ltv_distribution: ltvDistribution.map(range => ({
                    ltv_range: range.ltv_range,
                    customer_count: range.customer_count,
                    average_ltv: Math.round((range.avg_ltv_in_range || 0) / 100)
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching revenue analytics:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch revenue analytics',
            message: error.message
        });
    }
});

// GET /api/v1/analytics/customers/health - Customer health analytics
router.get('/customers/health', async (req, res) => {
    try {
        logger.info('Fetching customer health analytics', { 
            adminEmail: req.user.email 
        });

        // Get health score distribution
        const healthDistributionQuery = `
            SELECT 
                CASE 
                    WHEN cm.health_score >= 80 THEN 'Excellent (80-100)'
                    WHEN cm.health_score >= 60 THEN 'Good (60-79)'
                    WHEN cm.health_score >= 40 THEN 'Fair (40-59)'
                    WHEN cm.health_score >= 20 THEN 'Poor (20-39)'
                    ELSE 'Critical (0-19)'
                END as health_category,
                COUNT(*) as customer_count,
                AVG(cm.health_score) as avg_health_score,
                AVG(cm.churn_risk_score) as avg_churn_risk
            FROM (
                SELECT DISTINCT 
                    stripe_customer_id,
                    health_score,
                    churn_risk_score
                FROM customer_metrics cm1
                WHERE metric_date = (
                    SELECT MAX(metric_date) 
                    FROM customer_metrics cm2 
                    WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                )
            ) cm
            GROUP BY health_category
            ORDER BY avg_health_score DESC
        `;

        const healthDistribution = await executeQuery(adminPool, healthDistributionQuery);

        // Get customers at risk (churn risk > 0.7)
        const atRiskCustomersQuery = `
            SELECT 
                c.stripe_customer_id,
                c.email,
                c.name,
                cm.health_score,
                cm.churn_risk_score,
                cm.lifetime_value,
                COUNT(cs.id) as active_subscriptions
            FROM customers c
            JOIN (
                SELECT DISTINCT 
                    stripe_customer_id,
                    health_score,
                    churn_risk_score,
                    lifetime_value
                FROM customer_metrics cm1
                WHERE metric_date = (
                    SELECT MAX(metric_date) 
                    FROM customer_metrics cm2 
                    WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                )
                AND churn_risk_score > 0.7
            ) cm ON c.stripe_customer_id = cm.stripe_customer_id
            LEFT JOIN customer_subscriptions cs ON c.stripe_customer_id = cs.stripe_customer_id 
                AND cs.status = 'active'
            GROUP BY c.stripe_customer_id, c.email, c.name, cm.health_score, 
                     cm.churn_risk_score, cm.lifetime_value
            ORDER BY cm.churn_risk_score DESC
            LIMIT 50
        `;

        const atRiskCustomers = await executeQuery(adminPool, atRiskCustomersQuery);

        // Get top customers by health score
        const topCustomersQuery = `
            SELECT 
                c.stripe_customer_id,
                c.email,
                c.name,
                cm.health_score,
                cm.churn_risk_score,
                cm.lifetime_value,
                COUNT(cs.id) as active_subscriptions
            FROM customers c
            JOIN (
                SELECT DISTINCT 
                    stripe_customer_id,
                    health_score,
                    churn_risk_score,
                    lifetime_value
                FROM customer_metrics cm1
                WHERE metric_date = (
                    SELECT MAX(metric_date) 
                    FROM customer_metrics cm2 
                    WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                )
                AND health_score > 80
            ) cm ON c.stripe_customer_id = cm.stripe_customer_id
            LEFT JOIN customer_subscriptions cs ON c.stripe_customer_id = cs.stripe_customer_id 
                AND cs.status = 'active'
            GROUP BY c.stripe_customer_id, c.email, c.name, cm.health_score, 
                     cm.churn_risk_score, cm.lifetime_value
            ORDER BY cm.lifetime_value DESC
            LIMIT 20
        `;

        const topCustomers = await executeQuery(adminPool, topCustomersQuery);

        res.json({
            success: true,
            data: {
                health_distribution: healthDistribution.map(category => ({
                    category: category.health_category,
                    customer_count: category.customer_count,
                    average_health_score: Math.round(category.avg_health_score || 0),
                    average_churn_risk: Math.round((category.avg_churn_risk || 0) * 100) / 100
                })),
                at_risk_customers: atRiskCustomers.map(customer => ({
                    customer_id: customer.stripe_customer_id,
                    email: customer.email,
                    name: customer.name,
                    health_score: customer.health_score,
                    churn_risk_score: Math.round((customer.churn_risk_score || 0) * 100) / 100,
                    lifetime_value: Math.round((customer.lifetime_value || 0) / 100),
                    active_subscriptions: customer.active_subscriptions
                })),
                top_customers: topCustomers.map(customer => ({
                    customer_id: customer.stripe_customer_id,
                    email: customer.email,
                    name: customer.name,
                    health_score: customer.health_score,
                    churn_risk_score: Math.round((customer.churn_risk_score || 0) * 100) / 100,
                    lifetime_value: Math.round((customer.lifetime_value || 0) / 100),
                    active_subscriptions: customer.active_subscriptions
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching customer health analytics:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer health analytics',
            message: error.message
        });
    }
});

// GET /api/v1/analytics/customers/churn - Churn analysis
router.get('/customers/churn', verifyToken, async (req, res) => {
    try {
        const { 
            date_from = moment().subtract(6, 'months').format('YYYY-MM-DD'), 
            date_to = moment().format('YYYY-MM-DD') 
        } = req.query;

        // Monthly churn rate
        const churnRatesQuery = `
            SELECT 
                month,
                churned_customers,
                (
                    SELECT COUNT(DISTINCT c.stripe_customer_id) 
                    FROM customers c 
                    WHERE DATE_FORMAT(c.stripe_created_at, '%Y-%m') <= month
                    AND c.deleted = 0
                ) as total_customers_start_of_month,
                ROUND(
                    (churned_customers * 100.0) / 
                    NULLIF((
                        SELECT COUNT(DISTINCT c.stripe_customer_id) 
                        FROM customers c 
                        WHERE DATE_FORMAT(c.stripe_created_at, '%Y-%m') <= month
                        AND c.deleted = 0
                    ), 0), 2
                ) as churn_rate_percent
            FROM (
                SELECT 
                    DATE_FORMAT(canceled_at, '%Y-%m') as month,
                    COUNT(DISTINCT stripe_customer_id) as churned_customers
                FROM customer_subscriptions cs
                WHERE canceled_at IS NOT NULL 
                AND DATE(canceled_at) BETWEEN ? AND ?
                GROUP BY DATE_FORMAT(canceled_at, '%Y-%m')
            ) monthly_churn
            ORDER BY month DESC
            LIMIT 12
        `;

        // Churn reasons (based on subscription cancellation patterns)
        const churnReasonsQuery = `
            SELECT 
                CASE 
                    WHEN cancel_at_period_end = 1 THEN 'Planned cancellation'
                    WHEN ended_at IS NOT NULL THEN 'Subscription ended'
                    WHEN DATEDIFF(canceled_at, current_period_start) < 7 THEN 'Early cancellation'
                    WHEN status = 'past_due' THEN 'Payment failure'
                    ELSE 'Standard cancellation'
                END as churn_reason,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0) / (
                    SELECT COUNT(*) 
                    FROM customer_subscriptions 
                    WHERE canceled_at IS NOT NULL 
                    AND DATE(canceled_at) BETWEEN ? AND ?
                ), 2) as percentage
            FROM customer_subscriptions cs
            WHERE canceled_at IS NOT NULL 
            AND DATE(canceled_at) BETWEEN ? AND ?
            GROUP BY churn_reason
            ORDER BY count DESC
        `;

        // Customers at high churn risk
        const highRiskCustomersQuery = `
            SELECT 
                c.stripe_customer_id,
                c.email,
                c.name,
                cm.churn_risk_score,
                cm.health_score,
                cm.lifetime_value,
                COUNT(cs.id) as total_subscriptions,
                SUM(CASE WHEN cs.status = 'active' THEN 1 ELSE 0 END) as active_subscriptions
            FROM customers c
            JOIN customer_metrics cm ON c.stripe_customer_id = cm.stripe_customer_id
            LEFT JOIN customer_subscriptions cs ON c.stripe_customer_id = cs.stripe_customer_id
            WHERE cm.metric_date = (
                SELECT MAX(metric_date) 
                FROM customer_metrics cm2 
                WHERE cm2.stripe_customer_id = cm.stripe_customer_id
            )
            AND cm.churn_risk_score > 0.75
            AND c.deleted = 0
            GROUP BY c.stripe_customer_id, c.email, c.name, 
                     cm.churn_risk_score, cm.health_score, cm.lifetime_value
            ORDER BY cm.churn_risk_score DESC
            LIMIT 25
        `;

        // Churn prevention opportunities (customers with declining health scores)
        const preventionOpportunitiesQuery = `
            SELECT 
                c.stripe_customer_id,
                c.email,
                c.name,
                current_cm.health_score as current_health_score,
                previous_cm.health_score as previous_health_score,
                (current_cm.health_score - previous_cm.health_score) as health_score_change,
                current_cm.churn_risk_score,
                COUNT(cs.id) as active_subscriptions
            FROM customers c
            JOIN customer_metrics current_cm ON c.stripe_customer_id = current_cm.stripe_customer_id
            JOIN customer_metrics previous_cm ON c.stripe_customer_id = previous_cm.stripe_customer_id
            LEFT JOIN customer_subscriptions cs ON c.stripe_customer_id = cs.stripe_customer_id 
                AND cs.status = 'active'
            WHERE current_cm.metric_date = (
                SELECT MAX(metric_date) 
                FROM customer_metrics cm1 
                WHERE cm1.stripe_customer_id = current_cm.stripe_customer_id
            )
            AND previous_cm.metric_date = (
                SELECT MAX(metric_date) 
                FROM customer_metrics cm2 
                WHERE cm2.stripe_customer_id = previous_cm.stripe_customer_id
                AND cm2.metric_date < current_cm.metric_date
            )
            AND (current_cm.health_score - previous_cm.health_score) < -10
            AND c.deleted = 0
            GROUP BY c.stripe_customer_id, c.email, c.name, 
                     current_cm.health_score, previous_cm.health_score, current_cm.churn_risk_score
            ORDER BY health_score_change ASC
            LIMIT 20
        `;

        const [churnRates, churnReasons, highRiskCustomers, preventionOpportunities] = await Promise.all([
            executeQuery(adminPool, churnRatesQuery, [date_from, date_to]),
            executeQuery(adminPool, churnReasonsQuery, [date_from, date_to, date_from, date_to]),
            executeQuery(adminPool, highRiskCustomersQuery),
            executeQuery(adminPool, preventionOpportunitiesQuery)
        ]);


        res.json({
            success: true,
            data: {
                period: { from: date_from, to: date_to },
                churn_trends: churnRates.map(rate => ({
                    month: rate.month,
                    churned_customers: rate.churned_customers,
                    total_customers: rate.total_customers_start_of_month,
                    churn_rate: rate.churn_rate_percent
                })),
                churn_reasons: churnReasons.map(reason => ({
                    reason: reason.churn_reason,
                    count: reason.count,
                    percentage: reason.percentage
                })),
                high_risk_customers: highRiskCustomers.map(customer => ({
                    customer_id: customer.stripe_customer_id,
                    email: customer.email,
                    name: customer.name,
                    churn_risk_score: Math.round((customer.churn_risk_score || 0) * 100) / 100,
                    health_score: customer.health_score,
                    lifetime_value: Math.round((customer.lifetime_value || 0) / 100),
                    active_subscriptions: customer.active_subscriptions
                })),
                prevention_opportunities: preventionOpportunities.map(customer => ({
                    customer_id: customer.stripe_customer_id,
                    email: customer.email,
                    name: customer.name,
                    current_health_score: customer.current_health_score,
                    previous_health_score: customer.previous_health_score,
                    health_score_decline: Math.abs(customer.health_score_change),
                    churn_risk_score: Math.round((customer.churn_risk_score || 0) * 100) / 100,
                    active_subscriptions: customer.active_subscriptions
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching churn analytics:', { error, adminEmail: req.user.email });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch churn analytics',
            message: error.message
        });
    }
});

// GET /api/v1/analytics/customers/cohorts - Cohort analysis
router.get('/customers/cohorts', async (req, res) => {
    try {
        const { months_back = 12 } = req.query;
        const monthsBackNum = Math.min(24, Math.max(3, parseInt(months_back)));

        logger.info('Fetching cohort analysis', { 
            monthsBack: monthsBackNum, 
            adminEmail: req.user.email 
        });

        // This is a simplified cohort analysis
        // In a full implementation, you'd track customer retention by signup month
        const cohortQuery = `
            SELECT 
                DATE_FORMAT(stripe_created_at, '%Y-%m') as cohort_month,
                COUNT(*) as customers_acquired,
                COUNT(CASE WHEN c.deleted = false AND c.delinquent = false THEN 1 END) as still_active,
                AVG(CASE WHEN cm.lifetime_value IS NOT NULL THEN cm.lifetime_value END) as avg_ltv
            FROM customers c
            LEFT JOIN (
                SELECT DISTINCT 
                    stripe_customer_id,
                    lifetime_value
                FROM customer_metrics cm1
                WHERE metric_date = (
                    SELECT MAX(metric_date) 
                    FROM customer_metrics cm2 
                    WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                )
            ) cm ON c.stripe_customer_id = cm.stripe_customer_id
            WHERE stripe_created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
            GROUP BY DATE_FORMAT(stripe_created_at, '%Y-%m')
            ORDER BY cohort_month DESC
        `;

        const cohortData = await executeQuery(adminPool, cohortQuery, [monthsBackNum]);

        res.json({
            success: true,
            data: {
                cohort_analysis: cohortData.map(cohort => ({
                    cohort_month: cohort.cohort_month,
                    customers_acquired: cohort.customers_acquired,
                    still_active: cohort.still_active,
                    retention_rate: cohort.customers_acquired > 0 ? 
                        Math.round((cohort.still_active / cohort.customers_acquired) * 100) : 0,
                    average_ltv: Math.round((cohort.avg_ltv || 0) / 100)
                }))
            }
        });

    } catch (error) {
        logger.error('Error fetching cohort analysis:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cohort analysis',
            message: error.message
        });
    }
});

module.exports = router;