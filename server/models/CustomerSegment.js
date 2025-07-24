const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class CustomerSegment {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.criteria = typeof data.criteria === 'string' ? JSON.parse(data.criteria) : data.criteria;
        this.color = data.color || '#007bff';
        this.is_active = data.is_active !== undefined ? data.is_active : true;
        this.is_system = data.is_system || false;
        this.created_by = data.created_by;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    /**
     * Get all segments with optional filters
     */
    static async findAll(filters = {}) {
        try {
            const { is_active = true, is_system, created_by } = filters;
            
            let whereClause = 'WHERE 1=1';
            const params = [];

            if (is_active !== undefined) {
                whereClause += ' AND is_active = ?';
                params.push(is_active);
            }

            if (is_system !== undefined) {
                whereClause += ' AND is_system = ?';
                params.push(is_system);
            }

            if (created_by) {
                whereClause += ' AND created_by = ?';
                params.push(created_by);
            }

            const query = `
                SELECT 
                    cs.*,
                    COUNT(csa.stripe_customer_id) as customer_count,
                    AVG(csa.assignment_score) as avg_assignment_score
                FROM customer_segments cs
                LEFT JOIN customer_segment_assignments csa ON cs.id = csa.segment_id
                ${whereClause}
                GROUP BY cs.id
                ORDER BY cs.is_system DESC, cs.name ASC
            `;

            const segments = await executeQuery(adminPool, query, params);
            return segments.map(segment => new CustomerSegment(segment));
        } catch (error) {
            logger.error('Error finding segments:', error);
            throw error;
        }
    }

    /**
     * Find segment by ID
     */
    static async findById(segmentId) {
        try {
            const query = `
                SELECT 
                    cs.*,
                    COUNT(csa.stripe_customer_id) as customer_count
                FROM customer_segments cs
                LEFT JOIN customer_segment_assignments csa ON cs.id = csa.segment_id
                WHERE cs.id = ?
                GROUP BY cs.id
            `;

            const segments = await executeQuery(adminPool, query, [segmentId]);
            return segments.length > 0 ? new CustomerSegment(segments[0]) : null;
        } catch (error) {
            logger.error('Error finding segment by ID:', error);
            throw error;
        }
    }

    /**
     * Create a new segment
     */
    async save() {
        try {
            if (this.id) {
                return await this.update();
            } else {
                return await this.create();
            }
        } catch (error) {
            logger.error('Error saving segment:', error);
            throw error;
        }
    }

    /**
     * Create new segment
     */
    async create() {
        try {
            const query = `
                INSERT INTO customer_segments (
                    name, description, criteria, color, is_active, is_system, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                this.name,
                this.description,
                JSON.stringify(this.criteria),
                this.color,
                this.is_active,
                this.is_system,
                this.created_by
            ];

            const result = await executeQuery(adminPool, query, params);
            this.id = result.insertId;

            logger.info('Segment created successfully', { 
                segmentId: this.id, 
                name: this.name 
            });

            // Automatically assign customers to this segment
            await this.assignCustomers();

            return result;
        } catch (error) {
            logger.error('Error creating segment:', error);
            throw error;
        }
    }

    /**
     * Update existing segment
     */
    async update() {
        try {
            const query = `
                UPDATE customer_segments SET
                    name = ?, description = ?, criteria = ?, color = ?, 
                    is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            const params = [
                this.name,
                this.description,
                JSON.stringify(this.criteria),
                this.color,
                this.is_active,
                this.id
            ];

            const result = await executeQuery(adminPool, query, params);

            logger.info('Segment updated successfully', { 
                segmentId: this.id, 
                name: this.name 
            });

            // Re-assign customers based on updated criteria
            await this.assignCustomers();

            return result;
        } catch (error) {
            logger.error('Error updating segment:', error);
            throw error;
        }
    }

    /**
     * Delete segment
     */
    async delete() {
        try {
            if (this.is_system) {
                throw new Error('Cannot delete system segments');
            }

            const query = 'DELETE FROM customer_segments WHERE id = ?';
            const result = await executeQuery(adminPool, query, [this.id]);

            logger.info('Segment deleted successfully', { 
                segmentId: this.id, 
                name: this.name 
            });

            return result;
        } catch (error) {
            logger.error('Error deleting segment:', error);
            throw error;
        }
    }

    /**
     * Assign customers to this segment based on criteria
     */
    async assignCustomers() {
        try {
            // First, remove existing assignments for this segment
            await executeQuery(adminPool, 
                'DELETE FROM customer_segment_assignments WHERE segment_id = ?', 
                [this.id]
            );

            // Build customer query based on criteria
            const { whereClause, params } = this.buildCustomerQuery();

            const customerQuery = `
                SELECT 
                    c.stripe_customer_id,
                    COALESCE(metrics.lifetime_value, 0) as lifetime_value,
                    COALESCE(metrics.health_score, 50) as health_score,
                    COALESCE(metrics.churn_risk_score, 0.5) as churn_risk_score,
                    COALESCE(sub_count.subscription_count, 0) as subscription_count,
                    DATEDIFF(NOW(), c.stripe_created_at) as days_since_created,
                    c.deleted,
                    c.delinquent
                FROM customers c
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
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        COUNT(*) as subscription_count
                    FROM customer_subscriptions 
                    WHERE status = 'active'
                    GROUP BY stripe_customer_id
                ) sub_count ON c.stripe_customer_id = sub_count.stripe_customer_id
                ${whereClause}
            `;

            const customers = await executeQuery(adminPool, customerQuery, params);

            // Calculate assignment scores and insert assignments
            const assignments = [];
            for (const customer of customers) {
                const score = this.calculateAssignmentScore(customer);
                if (score > 0) {
                    assignments.push([
                        customer.stripe_customer_id,
                        this.id,
                        score
                    ]);
                }
            }

            if (assignments.length > 0) {
                // Insert assignments one by one to avoid bulk insert syntax issues
                const insertQuery = `
                    INSERT INTO customer_segment_assignments 
                    (stripe_customer_id, segment_id, assignment_score) 
                    VALUES (?, ?, ?)
                `;
                
                for (const assignment of assignments) {
                    await executeQuery(adminPool, insertQuery, assignment);
                }

                logger.info('Customer assignments completed', {
                    segmentId: this.id,
                    assignedCustomers: assignments.length
                });
            }

            return assignments.length;
        } catch (error) {
            logger.error('Error assigning customers to segment:', error);
            throw error;
        }
    }

    /**
     * Build customer query based on segment criteria
     */
    buildCustomerQuery() {
        const criteria = this.criteria;
        let whereClause = 'WHERE 1=1';
        const params = [];

        // Basic status filtering
        if (criteria.status === 'active') {
            whereClause += ' AND c.deleted = false AND c.delinquent = false';
        } else if (criteria.status === 'deleted') {
            whereClause += ' AND c.deleted = true';
        } else if (criteria.status === 'delinquent') {
            whereClause += ' AND c.delinquent = true';
        }

        // LTV filtering will be applied in post-processing
        // Health score filtering will be applied in post-processing
        // Churn risk filtering will be applied in post-processing
        // Days since created filtering will be applied in post-processing
        // Subscription count filtering will be applied in post-processing

        return { whereClause, params };
    }

    /**
     * Calculate how well a customer fits this segment (0-1 score)
     */
    calculateAssignmentScore(customer) {
        const criteria = this.criteria;
        let score = 1.0;
        let matchCount = 0;
        let totalCriteria = 0;

        // LTV criteria
        if (criteria.ltv_min !== undefined) {
            totalCriteria++;
            if (customer.lifetime_value >= criteria.ltv_min) {
                matchCount++;
            } else {
                score *= 0.8; // Penalty for not meeting LTV requirement
            }
        }

        if (criteria.ltv_max !== undefined) {
            totalCriteria++;
            if (customer.lifetime_value <= criteria.ltv_max) {
                matchCount++;
            } else {
                score *= 0.8;
            }
        }

        // Health score criteria
        if (criteria.health_score_min !== undefined) {
            totalCriteria++;
            if (customer.health_score >= criteria.health_score_min) {
                matchCount++;
            } else {
                score *= 0.9;
            }
        }

        if (criteria.health_score_max !== undefined) {
            totalCriteria++;
            if (customer.health_score <= criteria.health_score_max) {
                matchCount++;
            } else {
                score *= 0.9;
            }
        }

        // Churn risk criteria
        if (criteria.churn_risk_min !== undefined) {
            totalCriteria++;
            if (customer.churn_risk_score >= criteria.churn_risk_min) {
                matchCount++;
            } else {
                score *= 0.8;
            }
        }

        if (criteria.churn_risk_max !== undefined) {
            totalCriteria++;
            if (customer.churn_risk_score <= criteria.churn_risk_max) {
                matchCount++;
            } else {
                score *= 0.8;
            }
        }

        // Subscription count criteria
        if (criteria.subscription_count_min !== undefined) {
            totalCriteria++;
            if (customer.subscription_count >= criteria.subscription_count_min) {
                matchCount++;
            } else {
                score *= 0.7;
            }
        }

        // Days since created criteria
        if (criteria.days_since_created_max !== undefined) {
            totalCriteria++;
            if (customer.days_since_created <= criteria.days_since_created_max) {
                matchCount++;
            } else {
                score *= 0.9;
            }
        }

        // Status criteria is handled in the query, so if we get here, it matches
        if (criteria.status !== undefined) {
            totalCriteria++;
            matchCount++;
        }

        // Only return customers that meet the minimum threshold
        const matchRatio = totalCriteria > 0 ? matchCount / totalCriteria : 1;
        if (matchRatio < 0.7) { // Must match at least 70% of criteria
            return 0;
        }

        return Math.min(1.0, score);
    }

    /**
     * Get customers in this segment
     */
    async getCustomers(limit = 100, offset = 0) {
        try {
            const query = `
                SELECT 
                    c.*,
                    csa.assignment_score,
                    csa.assigned_at,
                    COALESCE(metrics.lifetime_value, 0) as lifetime_value,
                    COALESCE(metrics.health_score, 50) as health_score,
                    COALESCE(metrics.churn_risk_score, 0.5) as churn_risk_score
                FROM customer_segment_assignments csa
                JOIN customers c ON csa.stripe_customer_id = c.stripe_customer_id
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
                WHERE csa.segment_id = ?
                ORDER BY csa.assignment_score DESC, csa.assigned_at DESC
                LIMIT ? OFFSET ?
            `;

            const customers = await executeQuery(adminPool, query, [this.id, limit, offset]);
            return customers;
        } catch (error) {
            logger.error('Error getting segment customers:', error);
            throw error;
        }
    }

    /**
     * Get segment analytics
     */
    async getAnalytics(dateFrom, dateTo) {
        try {
            const query = `
                SELECT * FROM segment_analytics 
                WHERE segment_id = ? 
                AND metric_date BETWEEN ? AND ?
                ORDER BY metric_date ASC
            `;

            const analytics = await executeQuery(adminPool, query, [this.id, dateFrom, dateTo]);
            return analytics;
        } catch (error) {
            logger.error('Error getting segment analytics:', error);
            throw error;
        }
    }

    /**
     * Update segment analytics for a specific date
     */
    static async updateSegmentAnalytics(segmentId, date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];

            // Calculate analytics for the segment
            const analyticsQuery = `
                SELECT 
                    COUNT(csa.stripe_customer_id) as customer_count,
                    AVG(COALESCE(metrics.lifetime_value, 0)) as avg_ltv,
                    AVG(COALESCE(metrics.health_score, 50)) as avg_health_score,
                    AVG(COALESCE(metrics.churn_risk_score, 0.5)) as avg_churn_risk,
                    SUM(COALESCE(metrics.lifetime_value, 0)) as total_revenue
                FROM customer_segment_assignments csa
                LEFT JOIN customers c ON csa.stripe_customer_id = c.stripe_customer_id
                LEFT JOIN (
                    SELECT 
                        stripe_customer_id,
                        MAX(lifetime_value) as lifetime_value,
                        MAX(health_score) as health_score,
                        MAX(churn_risk_score) as churn_risk_score
                    FROM customer_metrics
                    WHERE DATE(metric_date) <= ?
                    AND metric_date = (
                        SELECT MAX(metric_date) 
                        FROM customer_metrics cm2 
                        WHERE cm2.stripe_customer_id = customer_metrics.stripe_customer_id
                        AND DATE(cm2.metric_date) <= ?
                    )
                    GROUP BY stripe_customer_id
                ) metrics ON c.stripe_customer_id = metrics.stripe_customer_id
                WHERE csa.segment_id = ?
            `;

            const [analytics] = await executeQuery(adminPool, analyticsQuery, [targetDate, targetDate, segmentId]);

            // Upsert segment analytics
            const upsertQuery = `
                INSERT INTO segment_analytics (
                    segment_id, metric_date, customer_count, avg_ltv, 
                    avg_health_score, avg_churn_risk, total_revenue
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    customer_count = VALUES(customer_count),
                    avg_ltv = VALUES(avg_ltv),
                    avg_health_score = VALUES(avg_health_score),
                    avg_churn_risk = VALUES(avg_churn_risk),
                    total_revenue = VALUES(total_revenue)
            `;

            await executeQuery(adminPool, upsertQuery, [
                segmentId,
                targetDate,
                analytics.customer_count || 0,
                analytics.avg_ltv || 0,
                analytics.avg_health_score || 50,
                analytics.avg_churn_risk || 0.5,
                analytics.total_revenue || 0
            ]);

            return analytics;
        } catch (error) {
            logger.error('Error updating segment analytics:', error);
            throw error;
        }
    }

    /**
     * Refresh all segment assignments
     */
    static async refreshAllAssignments() {
        try {
            const segments = await CustomerSegment.findAll({ is_active: true });
            
            for (const segment of segments) {
                await segment.assignCustomers();
                await CustomerSegment.updateSegmentAnalytics(segment.id);
            }

            logger.info('All segment assignments refreshed', { 
                segmentCount: segments.length 
            });

            return segments.length;
        } catch (error) {
            logger.error('Error refreshing segment assignments:', error);
            throw error;
        }
    }
}

module.exports = CustomerSegment;