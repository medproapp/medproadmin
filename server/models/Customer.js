const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class Customer {
    constructor(data) {
        this.stripe_customer_id = data.stripe_customer_id;
        this.email = data.email;
        this.name = data.name;
        this.description = data.description;
        this.phone = data.phone;
        this.address_line1 = data.address_line1;
        this.address_line2 = data.address_line2;
        this.address_city = data.address_city;
        this.address_state = data.address_state;
        this.address_postal_code = data.address_postal_code;
        this.address_country = data.address_country;
        this.metadata = data.metadata;
        this.currency = data.currency;
        this.deleted = data.deleted || false;
        this.delinquent = data.delinquent || false;
        this.balance = data.balance || 0;
        this.stripe_created_at = data.stripe_created_at;
        this.last_sync_at = data.last_sync_at;
    }

    static async findAll(filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20, search, status, dateFrom, dateTo } = { ...filters, ...pagination };
            const offset = (page - 1) * limit;

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (search) {
                whereClause += ' AND (c.email LIKE ? OR c.name LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            if (status) {
                if (status === 'active') {
                    whereClause += ' AND c.deleted = false AND c.delinquent = false';
                } else if (status === 'delinquent') {
                    whereClause += ' AND c.delinquent = true';
                } else if (status === 'deleted') {
                    whereClause += ' AND c.deleted = true';
                }
            }

            if (dateFrom) {
                whereClause += ' AND DATE(c.stripe_created_at) >= ?';
                params.push(dateFrom);
            }

            if (dateTo) {
                whereClause += ' AND DATE(c.stripe_created_at) <= ?';
                params.push(dateTo);
            }

            const countQuery = `
                SELECT COUNT(*) as total 
                FROM customers c 
                ${whereClause}
            `;

            const dataQuery = `
                SELECT 
                    c.*,
                    COALESCE(sub_count.total_subscriptions, 0) as total_subscriptions,
                    COALESCE(sub_count.active_subscriptions, 0) as active_subscriptions,
                    COALESCE(metrics.lifetime_value, 0) as lifetime_value,
                    COALESCE(metrics.health_score, 50) as health_score,
                    COALESCE(metrics.churn_risk_score, 0.5) as churn_risk_score
                FROM customers c
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        COUNT(*) as total_subscriptions,
                        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions
                    FROM customer_subscriptions 
                    GROUP BY stripe_customer_id
                ) sub_count ON c.stripe_customer_id = sub_count.stripe_customer_id
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        MAX(lifetime_value) as lifetime_value,
                        MAX(health_score) as health_score,
                        MAX(churn_risk_score) as churn_risk_score
                    FROM customer_metrics
                    WHERE metric_date = (
                        SELECT MAX(metric_date) 
                        FROM customer_metrics cm2 
                        WHERE cm2.stripe_customer_id = customer_metrics.stripe_customer_id
                    )
                    GROUP BY stripe_customer_id
                ) metrics ON c.stripe_customer_id = metrics.stripe_customer_id
                ${whereClause}
                ORDER BY c.stripe_created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `;

            const [totalResult] = await executeQuery(adminPool, countQuery, params);
            const customers = await executeQuery(adminPool, dataQuery, params);

            const total = totalResult.total;
            const totalPages = Math.ceil(total / limit);

            return {
                customers,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            logger.error('Error finding customers:', error);
            throw error;
        }
    }

    static async batchExistenceCheck(stripeCustomerIds) {
        try {
            if (!stripeCustomerIds || stripeCustomerIds.length === 0) {
                return [];
            }

            const placeholders = stripeCustomerIds.map(() => '?').join(',');
            const query = `
                SELECT stripe_customer_id 
                FROM customers 
                WHERE stripe_customer_id IN (${placeholders})
            `;

            const existingCustomers = await executeQuery(adminPool, query, stripeCustomerIds);
            return existingCustomers.map(row => row.stripe_customer_id);
        } catch (error) {
            logger.error('Error checking customer existence in batch:', { 
                customerCount: stripeCustomerIds?.length, 
                error 
            });
            throw error;
        }
    }

    static async findByStripeId(stripeCustomerId) {
        try {
            const query = `
                SELECT 
                    c.*,
                    COALESCE(sub_count.total_subscriptions, 0) as total_subscriptions,
                    COALESCE(sub_count.active_subscriptions, 0) as active_subscriptions,
                    COALESCE(metrics.lifetime_value, 0) as lifetime_value,
                    COALESCE(metrics.health_score, 50) as health_score,
                    COALESCE(metrics.churn_risk_score, 0.5) as churn_risk_score
                FROM customers c
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        COUNT(*) as total_subscriptions,
                        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions
                    FROM customer_subscriptions 
                    WHERE stripe_customer_id = ?
                    GROUP BY stripe_customer_id
                ) sub_count ON c.stripe_customer_id = sub_count.stripe_customer_id
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        lifetime_value,
                        health_score,
                        churn_risk_score
                    FROM customer_metrics
                    WHERE stripe_customer_id = ?
                    AND metric_date = (
                        SELECT MAX(metric_date) 
                        FROM customer_metrics cm2 
                        WHERE cm2.stripe_customer_id = ?
                    )
                ) metrics ON c.stripe_customer_id = metrics.stripe_customer_id
                WHERE c.stripe_customer_id = ?
            `;

            const customers = await executeQuery(adminPool, query, [stripeCustomerId, stripeCustomerId, stripeCustomerId, stripeCustomerId]);
            return customers.length > 0 ? customers[0] : null;
        } catch (error) {
            logger.error('Error finding customer by Stripe ID:', { stripeCustomerId, error });
            throw error;
        }
    }

    async save() {
        try {
            const existing = await Customer.findByStripeId(this.stripe_customer_id);
            
            if (existing) {
                return await this.update();
            } else {
                return await this.create();
            }
        } catch (error) {
            logger.error('Error saving customer:', error);
            throw error;
        }
    }

    async create() {
        try {
            const query = `
                INSERT INTO customers (
                    stripe_customer_id, email, name, description, phone,
                    address_line1, address_line2, address_city, address_state,
                    address_postal_code, address_country, metadata, currency,
                    deleted, delinquent, balance, stripe_created_at, last_sync_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                this.stripe_customer_id,
                this.email,
                this.name,
                this.description,
                this.phone,
                this.address_line1,
                this.address_line2,
                this.address_city,
                this.address_state,
                this.address_postal_code,
                this.address_country,
                JSON.stringify(this.metadata || {}),
                this.currency,
                this.deleted,
                this.delinquent,
                this.balance,
                this.stripe_created_at,
                this.last_sync_at || new Date()
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Customer created successfully', { 
                stripeCustomerId: this.stripe_customer_id,
                email: this.email 
            });

            return result;
        } catch (error) {
            logger.error('Error creating customer:', { 
                stripeCustomerId: this.stripe_customer_id, 
                error 
            });
            throw error;
        }
    }

    async update() {
        try {
            const query = `
                UPDATE customers SET
                    email = ?, name = ?, description = ?, phone = ?,
                    address_line1 = ?, address_line2 = ?, address_city = ?, 
                    address_state = ?, address_postal_code = ?, address_country = ?,
                    metadata = ?, currency = ?, deleted = ?, delinquent = ?,
                    balance = ?, stripe_created_at = ?, last_sync_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE stripe_customer_id = ?
            `;

            const params = [
                this.email,
                this.name,
                this.description,
                this.phone,
                this.address_line1,
                this.address_line2,
                this.address_city,
                this.address_state,
                this.address_postal_code,
                this.address_country,
                JSON.stringify(this.metadata || {}),
                this.currency,
                this.deleted,
                this.delinquent,
                this.balance,
                this.stripe_created_at,
                this.last_sync_at || new Date(),
                this.stripe_customer_id
            ];

            const result = await executeQuery(adminPool, query, params);
            
            logger.info('Customer updated successfully', { 
                stripeCustomerId: this.stripe_customer_id,
                email: this.email 
            });

            return result;
        } catch (error) {
            logger.error('Error updating customer:', { 
                stripeCustomerId: this.stripe_customer_id, 
                error 
            });
            throw error;
        }
    }

    static async getAnalytics(dateFrom, dateTo) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_customers,
                    COUNT(CASE WHEN DATE(stripe_created_at) BETWEEN ? AND ? THEN 1 END) as new_customers,
                    COUNT(CASE WHEN deleted = false AND delinquent = false THEN 1 END) as active_customers,
                    COUNT(CASE WHEN delinquent = true THEN 1 END) as delinquent_customers,
                    AVG(CASE WHEN cm.lifetime_value IS NOT NULL THEN cm.lifetime_value END) as avg_lifetime_value,
                    AVG(CASE WHEN cm.health_score IS NOT NULL THEN cm.health_score END) as avg_health_score
                FROM customers c
                LEFT JOIN (
                    SELECT DISTINCT 
                        stripe_customer_id,
                        lifetime_value,
                        health_score
                    FROM customer_metrics cm1
                    WHERE metric_date = (
                        SELECT MAX(metric_date) 
                        FROM customer_metrics cm2 
                        WHERE cm2.stripe_customer_id = cm1.stripe_customer_id
                    )
                ) cm ON c.stripe_customer_id = cm.stripe_customer_id
            `;

            const result = await executeQuery(adminPool, query, [dateFrom, dateTo]);
            return result[0];
        } catch (error) {
            logger.error('Error getting customer analytics:', error);
            throw error;
        }
    }

    static async getDailyGrowth(dateFrom, dateTo) {
        try {
            const query = `
                SELECT 
                    DATE(stripe_created_at) as date,
                    COUNT(*) as new_customers
                FROM customers
                WHERE DATE(stripe_created_at) BETWEEN ? AND ?
                GROUP BY DATE(stripe_created_at)
                ORDER BY date ASC
            `;

            const result = await executeQuery(adminPool, query, [dateFrom, dateTo]);
            return result;
        } catch (error) {
            logger.error('Error getting daily growth data:', error);
            throw error;
        }
    }
}

module.exports = Customer;