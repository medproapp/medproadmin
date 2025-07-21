const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class CustomerSubscription {
    constructor(data) {
        this.stripe_subscription_id = data.stripe_subscription_id;
        this.stripe_customer_id = data.stripe_customer_id;
        this.stripe_price_id = data.stripe_price_id;
        this.stripe_product_id = data.stripe_product_id;
        this.status = data.status;
        this.current_period_start = data.current_period_start;
        this.current_period_end = data.current_period_end;
        this.cancel_at_period_end = data.cancel_at_period_end || false;
        this.canceled_at = data.canceled_at;
        this.ended_at = data.ended_at;
        this.trial_start = data.trial_start;
        this.trial_end = data.trial_end;
        this.metadata = data.metadata;
    }

    static async findByCustomer(stripeCustomerId) {
        try {
            const query = `
                SELECT 
                    cs.*,
                    pc.name as product_name,
                    pc.description as product_description,
                    pp.unit_amount,
                    pp.currency,
                    CONCAT(pp.recurring_interval_count, ' ', pp.recurring_interval) as billing_period,
                    pp.nickname as price_nickname
                FROM customer_subscriptions cs
                LEFT JOIN product_catalog pc ON cs.stripe_product_id = pc.stripe_product_id
                LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
                WHERE cs.stripe_customer_id = ?
                ORDER BY cs.created_at DESC
            `;

            const subscriptions = await executeQuery(adminPool, query, [stripeCustomerId]);
            return subscriptions;
        } catch (error) {
            logger.error('Error finding subscriptions by customer:', { stripeCustomerId, error });
            throw error;
        }
    }

    static async findByStripeId(stripeSubscriptionId) {
        try {
            const query = `
                SELECT * FROM customer_subscriptions 
                WHERE stripe_subscription_id = ?
            `;

            const subscriptions = await executeQuery(adminPool, query, [stripeSubscriptionId]);
            return subscriptions.length > 0 ? subscriptions[0] : null;
        } catch (error) {
            logger.error('Error finding subscription by Stripe ID:', { stripeSubscriptionId, error });
            throw error;
        }
    }

    async save() {
        try {
            const existing = await CustomerSubscription.findByStripeId(this.stripe_subscription_id);
            
            if (existing) {
                return await this.update();
            } else {
                return await this.create();
            }
        } catch (error) {
            logger.error('Error saving subscription:', error);
            throw error;
        }
    }

    async create() {
        try {
            const query = `
                INSERT INTO customer_subscriptions (
                    stripe_subscription_id, stripe_customer_id, stripe_price_id,
                    stripe_product_id, status, current_period_start,
                    current_period_end, cancel_at_period_end, canceled_at,
                    ended_at, trial_start, trial_end, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                this.stripe_subscription_id,
                this.stripe_customer_id,
                this.stripe_price_id,
                this.stripe_product_id,
                this.status,
                this.current_period_start,
                this.current_period_end,
                this.cancel_at_period_end,
                this.canceled_at,
                this.ended_at,
                this.trial_start,
                this.trial_end,
                JSON.stringify(this.metadata || {})
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Subscription created successfully', { 
                stripeSubscriptionId: this.stripe_subscription_id,
                stripeCustomerId: this.stripe_customer_id 
            });

            return result;
        } catch (error) {
            logger.error('Error creating subscription:', { 
                stripeSubscriptionId: this.stripe_subscription_id, 
                error 
            });
            throw error;
        }
    }

    async update() {
        try {
            const query = `
                UPDATE customer_subscriptions SET
                    stripe_customer_id = ?, stripe_price_id = ?, stripe_product_id = ?,
                    status = ?, current_period_start = ?, current_period_end = ?,
                    cancel_at_period_end = ?, canceled_at = ?, ended_at = ?,
                    trial_start = ?, trial_end = ?, metadata = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE stripe_subscription_id = ?
            `;

            const params = [
                this.stripe_customer_id,
                this.stripe_price_id,
                this.stripe_product_id,
                this.status,
                this.current_period_start,
                this.current_period_end,
                this.cancel_at_period_end,
                this.canceled_at,
                this.ended_at,
                this.trial_start,
                this.trial_end,
                JSON.stringify(this.metadata || {}),
                this.stripe_subscription_id
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Subscription updated successfully', { 
                stripeSubscriptionId: this.stripe_subscription_id,
                stripeCustomerId: this.stripe_customer_id 
            });

            return result;
        } catch (error) {
            logger.error('Error updating subscription:', { 
                stripeSubscriptionId: this.stripe_subscription_id, 
                error 
            });
            throw error;
        }
    }

    static async getStatusSummary() {
        try {
            const query = `
                SELECT 
                    status,
                    COUNT(*) as count,
                    SUM(CASE WHEN pp.unit_amount IS NOT NULL THEN pp.unit_amount ELSE 0 END) as total_value
                FROM customer_subscriptions cs
                LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
                GROUP BY status
                ORDER BY count DESC
            `;

            const result = await executeQuery(adminPool, query);
            return result;
        } catch (error) {
            logger.error('Error getting subscription status summary:', error);
            throw error;
        }
    }

    static async getRevenueByPeriod(dateFrom, dateTo) {
        try {
            const query = `
                SELECT 
                    DATE(cs.current_period_start) as period_date,
                    COUNT(*) as active_subscriptions,
                    SUM(CASE WHEN pp.unit_amount IS NOT NULL THEN pp.unit_amount ELSE 0 END) as total_revenue
                FROM customer_subscriptions cs
                LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
                WHERE cs.status = 'active'
                AND DATE(cs.current_period_start) BETWEEN ? AND ?
                GROUP BY DATE(cs.current_period_start)
                ORDER BY period_date ASC
            `;

            const result = await executeQuery(adminPool, query, [dateFrom, dateTo]);
            return result;
        } catch (error) {
            logger.error('Error getting revenue by period:', error);
            throw error;
        }
    }
}

module.exports = CustomerSubscription;