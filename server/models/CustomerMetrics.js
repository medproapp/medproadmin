const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class CustomerMetrics {
    constructor(data) {
        this.stripe_customer_id = data.stripe_customer_id;
        this.metric_date = data.metric_date || new Date().toISOString().split('T')[0];
        this.total_revenue = data.total_revenue || 0;
        this.subscription_count = data.subscription_count || 0;
        this.active_subscription_count = data.active_subscription_count || 0;
        this.lifetime_value = data.lifetime_value || 0;
        this.average_order_value = data.average_order_value || 0;
        this.last_payment_date = data.last_payment_date || null;
        this.churn_risk_score = data.churn_risk_score || 0.5;
        this.health_score = data.health_score || 50;
    }

    static async findByCustomer(stripeCustomerId, dateFrom = null, dateTo = null) {
        try {
            let query = `
                SELECT * FROM customer_metrics 
                WHERE stripe_customer_id = ?
            `;
            const params = [stripeCustomerId];

            if (dateFrom) {
                query += ' AND metric_date >= ?';
                params.push(dateFrom);
            }

            if (dateTo) {
                query += ' AND metric_date <= ?';
                params.push(dateTo);
            }

            query += ' ORDER BY metric_date DESC';

            const metrics = await executeQuery(adminPool, query, params);
            return metrics;
        } catch (error) {
            logger.error('Error finding metrics by customer:', { stripeCustomerId, error });
            throw error;
        }
    }

    static async findLatestByCustomer(stripeCustomerId) {
        try {
            const query = `
                SELECT * FROM customer_metrics 
                WHERE stripe_customer_id = ?
                ORDER BY metric_date DESC 
                LIMIT 1
            `;

            const metrics = await executeQuery(adminPool, query, [stripeCustomerId]);
            return metrics.length > 0 ? metrics[0] : null;
        } catch (error) {
            logger.error('Error finding latest metrics by customer:', { stripeCustomerId, error });
            throw error;
        }
    }

    async save() {
        try {
            const existing = await this.findExisting();
            
            if (existing) {
                return await this.update();
            } else {
                return await this.create();
            }
        } catch (error) {
            logger.error('Error saving customer metrics:', error);
            throw error;
        }
    }

    async findExisting() {
        try {
            const query = `
                SELECT id FROM customer_metrics 
                WHERE stripe_customer_id = ? AND metric_date = ?
            `;

            const result = await executeQuery(adminPool, query, [this.stripe_customer_id, this.metric_date]);
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error('Error finding existing metrics:', error);
            throw error;
        }
    }

    async create() {
        try {
            const query = `
                INSERT INTO customer_metrics (
                    stripe_customer_id, metric_date, total_revenue,
                    subscription_count, active_subscription_count, lifetime_value,
                    average_order_value, last_payment_date, churn_risk_score,
                    health_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                this.stripe_customer_id,
                this.metric_date,
                this.total_revenue,
                this.subscription_count,
                this.active_subscription_count,
                this.lifetime_value,
                this.average_order_value,
                this.last_payment_date,
                this.churn_risk_score,
                this.health_score
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Customer metrics created successfully', { 
                stripeCustomerId: this.stripe_customer_id,
                metricDate: this.metric_date 
            });

            return result;
        } catch (error) {
            logger.error('Error creating customer metrics:', { 
                stripeCustomerId: this.stripe_customer_id, 
                error 
            });
            throw error;
        }
    }

    async update() {
        try {
            const query = `
                UPDATE customer_metrics SET
                    total_revenue = ?, subscription_count = ?, active_subscription_count = ?,
                    lifetime_value = ?, average_order_value = ?, last_payment_date = ?,
                    churn_risk_score = ?, health_score = ?, updated_at = CURRENT_TIMESTAMP
                WHERE stripe_customer_id = ? AND metric_date = ?
            `;

            const params = [
                this.total_revenue,
                this.subscription_count,
                this.active_subscription_count,
                this.lifetime_value,
                this.average_order_value,
                this.last_payment_date,
                this.churn_risk_score,
                this.health_score,
                this.stripe_customer_id,
                this.metric_date
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Customer metrics updated successfully', { 
                stripeCustomerId: this.stripe_customer_id,
                metricDate: this.metric_date 
            });

            return result;
        } catch (error) {
            logger.error('Error updating customer metrics:', { 
                stripeCustomerId: this.stripe_customer_id, 
                error 
            });
            throw error;
        }
    }

    static async calculateForCustomer(stripeCustomerId, stripeCustomerData = null) {
        try {
            // Get subscription data
            const subscriptionQuery = `
                SELECT 
                    COUNT(*) as total_subscriptions,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
                    SUM(CASE WHEN status = 'active' AND pp.unit_amount IS NOT NULL 
                        THEN pp.unit_amount ELSE 0 END) as monthly_revenue
                FROM customer_subscriptions cs
                LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
                WHERE cs.stripe_customer_id = ?
            `;

            const [subscriptionData] = await executeQuery(adminPool, subscriptionQuery, [stripeCustomerId]);

            // Calculate metrics
            const metrics = new CustomerMetrics({
                stripe_customer_id: stripeCustomerId,
                subscription_count: subscriptionData.total_subscriptions || 0,
                active_subscription_count: subscriptionData.active_subscriptions || 0,
                total_revenue: subscriptionData.monthly_revenue || 0
            });

            // Calculate lifetime value (estimate based on current subscriptions)
            const monthlyRevenue = subscriptionData.monthly_revenue || 0;
            metrics.lifetime_value = monthlyRevenue * 24; // Assume 2-year LTV

            // Calculate health score
            metrics.health_score = CustomerMetrics.calculateHealthScore({
                active_subscriptions: subscriptionData.active_subscriptions || 0,
                delinquent: stripeCustomerData?.delinquent || false,
                total_subscriptions: subscriptionData.total_subscriptions || 0
            });

            // Calculate churn risk
            metrics.churn_risk_score = CustomerMetrics.calculateChurnRisk({
                health_score: metrics.health_score,
                active_subscriptions: subscriptionData.active_subscriptions || 0,
                delinquent: stripeCustomerData?.delinquent || false
            });

            return metrics;
        } catch (error) {
            logger.error('Error calculating customer metrics:', { stripeCustomerId, error });
            throw error;
        }
    }

    static calculateHealthScore(data) {
        let score = 50; // Base score

        // Active subscriptions boost score
        if (data.active_subscriptions > 0) {
            score += 30;
            score += Math.min(data.active_subscriptions * 5, 20); // Up to 20 extra for multiple subs
        }

        // Delinquent status reduces score significantly  
        if (data.delinquent) {
            score -= 40;
        }

        // Having any subscriptions at all is positive
        if (data.total_subscriptions > 0) {
            score += 10;
        }

        return Math.max(0, Math.min(100, score));
    }

    static calculateChurnRisk(data) {
        let risk = 0.5; // Base risk

        // High health score reduces risk
        if (data.health_score >= 80) {
            risk = 0.1;
        } else if (data.health_score >= 60) {
            risk = 0.3;
        } else if (data.health_score <= 30) {
            risk = 0.9;
        }

        // Delinquent customers have high churn risk
        if (data.delinquent) {
            risk = Math.max(risk, 0.8);
        }

        // No active subscriptions means very high risk
        if (data.active_subscriptions === 0) {
            risk = Math.max(risk, 0.7);
        }

        return Math.max(0, Math.min(1, risk));
    }

    static async getDailyAggregates(dateFrom, dateTo) {
        try {
            const query = `
                SELECT 
                    metric_date,
                    COUNT(DISTINCT stripe_customer_id) as customers_with_metrics,
                    AVG(health_score) as avg_health_score,
                    AVG(churn_risk_score) as avg_churn_risk,
                    SUM(total_revenue) as total_revenue,
                    AVG(lifetime_value) as avg_lifetime_value,
                    SUM(active_subscription_count) as total_active_subscriptions
                FROM customer_metrics
                WHERE metric_date BETWEEN ? AND ?
                GROUP BY metric_date
                ORDER BY metric_date ASC
            `;

            const result = await executeQuery(adminPool, query, [dateFrom, dateTo]);
            return result;
        } catch (error) {
            logger.error('Error getting daily aggregates:', error);
            throw error;
        }
    }
}

module.exports = CustomerMetrics;