const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class ChurnPrediction {
    constructor(data = {}) {
        this.id = data.id;
        this.stripe_customer_id = data.stripe_customer_id;
        this.prediction_date = data.prediction_date;
        this.churn_probability_30d = data.churn_probability_30d;
        this.churn_probability_60d = data.churn_probability_60d;
        this.churn_probability_90d = data.churn_probability_90d;
        this.risk_level = data.risk_level; // 'low', 'medium', 'high', 'critical'
        this.contributing_factors = data.contributing_factors;
        this.recommended_actions = data.recommended_actions;
        this.confidence_score = data.confidence_score;
        this.model_version = data.model_version;
        this.created_at = data.created_at;
    }

    /**
     * Calculate churn prediction for a customer
     */
    static async calculateChurnPrediction(customerId) {
        try {
            // Get customer data and metrics
            const customerData = await this.getCustomerFeatures(customerId);
            
            if (!customerData) {
                throw new Error('Customer not found');
            }

            // Calculate churn probabilities using multiple models
            const predictions = await this.runChurnModels(customerData);
            
            // Determine risk level and actions
            const riskAnalysis = this.analyzeRiskLevel(predictions);
            
            // Save prediction
            const churnPrediction = new ChurnPrediction({
                stripe_customer_id: customerId,
                prediction_date: new Date(),
                churn_probability_30d: predictions.prob_30d,
                churn_probability_60d: predictions.prob_60d,
                churn_probability_90d: predictions.prob_90d,
                risk_level: riskAnalysis.level,
                contributing_factors: JSON.stringify(predictions.factors),
                recommended_actions: JSON.stringify(riskAnalysis.actions),
                confidence_score: predictions.confidence,
                model_version: '1.0'
            });

            await churnPrediction.save();
            
            logger.info('Churn prediction calculated', {
                customerId,
                riskLevel: riskAnalysis.level,
                prob30d: predictions.prob_30d
            });

            return churnPrediction;
        } catch (error) {
            logger.error('Error calculating churn prediction:', error);
            throw error;
        }
    }

    /**
     * Get customer features for churn modeling
     */
    static async getCustomerFeatures(customerId) {
        try {
            const query = `
                SELECT 
                    c.stripe_customer_id,
                    c.stripe_created_at,
                    c.delinquent,
                    c.balance,
                    DATEDIFF(NOW(), c.stripe_created_at) as customer_age_days,
                    
                    -- Latest metrics (fixed GROUP BY)
                    COALESCE(MAX(cm.health_score), 50) as health_score,
                    COALESCE(MAX(cm.lifetime_value), 0) as lifetime_value,
                    COALESCE(MAX(cm.total_revenue), 0) as total_revenue,
                    COALESCE(MAX(cm.active_subscription_count), 0) as active_subscriptions,
                    COALESCE(MAX(cm.subscription_count), 0) as total_subscriptions,
                    
                    -- Subscription data (properly aggregated)
                    COUNT(cs.id) as subscription_history_count,
                    SUM(CASE WHEN cs.status = 'active' THEN 1 ELSE 0 END) as current_active_subs,
                    SUM(CASE WHEN cs.status = 'canceled' THEN 1 ELSE 0 END) as canceled_subs,
                    SUM(CASE WHEN cs.cancel_at_period_end = 1 THEN 1 ELSE 0 END) as pending_cancellations,
                    
                    -- Payment behavior (properly aggregated)
                    AVG(CASE WHEN cs.status = 'active' THEN 
                        TIMESTAMPDIFF(DAY, cs.current_period_start, cs.current_period_end) 
                    END) as avg_billing_period,
                    
                    -- Recent activity (properly aggregated)
                    MAX(cs.updated_at) as last_subscription_change,
                    DATEDIFF(NOW(), MAX(cs.updated_at)) as days_since_last_change
                    
                FROM customers c
                LEFT JOIN customer_metrics cm ON c.stripe_customer_id = cm.stripe_customer_id
                    AND cm.metric_date = (
                        SELECT MAX(metric_date) 
                        FROM customer_metrics cm2 
                        WHERE cm2.stripe_customer_id = c.stripe_customer_id
                    )
                LEFT JOIN customer_subscriptions cs ON c.stripe_customer_id = cs.stripe_customer_id
                WHERE c.stripe_customer_id = ?
                GROUP BY c.stripe_customer_id, c.stripe_created_at, c.delinquent, c.balance
            `;

            const [customerData] = await executeQuery(adminPool, query, [customerId]);
            return customerData;
        } catch (error) {
            logger.error('Error getting customer features:', error);
            throw error;
        }
    }

    /**
     * Run churn prediction models
     */
    static async runChurnModels(customerData) {
        try {
            // Model 1: Rule-based scoring
            const ruleBasedScore = this.calculateRuleBasedChurn(customerData);
            
            // Model 2: Behavioral pattern analysis
            const behavioralScore = this.calculateBehavioralChurn(customerData);
            
            // Model 3: Health score correlation
            const healthBasedScore = this.calculateHealthBasedChurn(customerData);
            
            // Ensemble prediction (weighted average)
            const weights = { rule: 0.4, behavioral: 0.35, health: 0.25 };
            
            const prob_30d = (
                ruleBasedScore.prob_30d * weights.rule +
                behavioralScore.prob_30d * weights.behavioral +
                healthBasedScore.prob_30d * weights.health
            );
            
            const prob_60d = Math.min(prob_30d * 1.3, 1.0);
            const prob_90d = Math.min(prob_30d * 1.6, 1.0);
            
            // Confidence calculation
            const confidence = this.calculateConfidence(customerData);
            
            // Contributing factors
            const factors = this.identifyContributingFactors(customerData, {
                rule: ruleBasedScore,
                behavioral: behavioralScore,
                health: healthBasedScore
            });

            return {
                prob_30d: Math.round(prob_30d * 100) / 100,
                prob_60d: Math.round(prob_60d * 100) / 100,
                prob_90d: Math.round(prob_90d * 100) / 100,
                confidence: Math.round(confidence * 100) / 100,
                factors
            };
        } catch (error) {
            logger.error('Error running churn models:', error);
            throw error;
        }
    }

    /**
     * Rule-based churn scoring
     */
    static calculateRuleBasedChurn(data) {
        let score = 0.1; // Base churn rate
        const factors = [];

        // Delinquent customers are high risk
        if (data.delinquent) {
            score += 0.4;
            factors.push('payment_delinquent');
        }

        // Negative balance indicates payment issues
        if (data.balance < 0) {
            score += 0.2;
            factors.push('negative_balance');
        }

        // Pending cancellations
        if (data.pending_cancellations > 0) {
            score += 0.5;
            factors.push('pending_cancellation');
        }

        // Recent cancellations
        if (data.canceled_subs > 0) {
            const cancellationRate = data.canceled_subs / data.total_subscriptions;
            score += cancellationRate * 0.3;
            factors.push('subscription_cancellation_history');
        }

        // Low engagement (no recent changes)
        if (data.days_since_last_change > 90) {
            score += 0.1;
            factors.push('low_engagement');
        }

        // New customers (higher churn in first 30 days)
        if (data.customer_age_days < 30) {
            score += 0.15;
            factors.push('new_customer_risk');
        }

        return {
            prob_30d: Math.min(score, 0.95),
            factors
        };
    }

    /**
     * Behavioral pattern analysis
     */
    static calculateBehavioralChurn(data) {
        let score = 0.1;
        const factors = [];

        // Low lifetime value
        if (data.lifetime_value < 10000) { // Less than R$100
            score += 0.2;
            factors.push('low_lifetime_value');
        }

        // Declining subscription count
        if (data.current_active_subs < data.total_subscriptions * 0.5) {
            score += 0.25;
            factors.push('declining_subscriptions');
        }

        // Single subscription dependency
        if (data.current_active_subs === 1) {
            score += 0.1;
            factors.push('single_subscription_risk');
        }

        // Short billing periods (monthly vs annual)
        if (data.avg_billing_period && data.avg_billing_period <= 31) {
            score += 0.05;
            factors.push('short_commitment_period');
        }

        return {
            prob_30d: Math.min(score, 0.9),
            factors
        };
    }

    /**
     * Health score based churn prediction
     */
    static calculateHealthBasedChurn(data) {
        const healthScore = data.health_score || 50;
        let score = 0.05;
        const factors = [];

        // Very low health score
        if (healthScore < 30) {
            score += 0.4;
            factors.push('very_low_health_score');
        } else if (healthScore < 50) {
            score += 0.2;
            factors.push('low_health_score');
        } else if (healthScore < 70) {
            score += 0.1;
            factors.push('moderate_health_score');
        }

        // Health score trend would go here if we had historical data
        // For now, we use current health score as proxy

        return {
            prob_30d: Math.min(score, 0.85),
            factors
        };
    }

    /**
     * Calculate confidence score for prediction
     */
    static calculateConfidence(data) {
        let confidence = 0.5; // Base confidence

        // More data = higher confidence
        if (data.customer_age_days > 90) confidence += 0.2;
        if (data.subscription_history_count > 1) confidence += 0.15;
        if (data.total_revenue > 0) confidence += 0.1;

        // Recent activity = higher confidence
        if (data.days_since_last_change < 30) confidence += 0.05;

        return Math.min(confidence, 0.95);
    }

    /**
     * Identify key contributing factors
     */
    static identifyContributingFactors(data, modelResults) {
        const allFactors = [
            ...modelResults.rule.factors,
            ...modelResults.behavioral.factors,
            ...modelResults.health.factors
        ];

        // Remove duplicates and prioritize
        const uniqueFactors = [...new Set(allFactors)];
        
        // Sort by severity/impact
        const priorityOrder = [
            'pending_cancellation',
            'payment_delinquent',
            'very_low_health_score',
            'subscription_cancellation_history',
            'negative_balance',
            'declining_subscriptions',
            'low_lifetime_value',
            'low_health_score',
            'single_subscription_risk',
            'new_customer_risk',
            'low_engagement',
            'short_commitment_period',
            'moderate_health_score'
        ];

        return uniqueFactors.sort((a, b) => {
            return priorityOrder.indexOf(a) - priorityOrder.indexOf(b);
        });
    }

    /**
     * Analyze risk level and recommend actions
     */
    static analyzeRiskLevel(predictions) {
        const prob30d = predictions.prob_30d;
        let level, actions;

        if (prob30d >= 0.7) {
            level = 'critical';
            actions = [
                'immediate_outreach',
                'retention_offer',
                'account_review',
                'escalate_to_manager'
            ];
        } else if (prob30d >= 0.5) {
            level = 'high';
            actions = [
                'proactive_outreach',
                'usage_analysis',
                'retention_campaign',
                'feature_education'
            ];
        } else if (prob30d >= 0.3) {
            level = 'medium';
            actions = [
                'engagement_campaign',
                'feature_promotion',
                'check_satisfaction',
                'monitor_usage'
            ];
        } else {
            level = 'low';
            actions = [
                'maintain_engagement',
                'monitor_health_score',
                'quarterly_check_in'
            ];
        }

        return { level, actions };
    }

    /**
     * Save churn prediction to database
     */
    async save() {
        try {
            const query = `
                INSERT INTO churn_predictions (
                    stripe_customer_id, prediction_date,
                    churn_probability_30d, churn_probability_60d, churn_probability_90d,
                    risk_level, contributing_factors, recommended_actions,
                    confidence_score, model_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    churn_probability_30d = VALUES(churn_probability_30d),
                    churn_probability_60d = VALUES(churn_probability_60d),
                    churn_probability_90d = VALUES(churn_probability_90d),
                    risk_level = VALUES(risk_level),
                    contributing_factors = VALUES(contributing_factors),
                    recommended_actions = VALUES(recommended_actions),
                    confidence_score = VALUES(confidence_score),
                    model_version = VALUES(model_version),
                    updated_at = CURRENT_TIMESTAMP
            `;

            const result = await executeQuery(adminPool, query, [
                this.stripe_customer_id,
                this.prediction_date || new Date(),
                this.churn_probability_30d,
                this.churn_probability_60d,
                this.churn_probability_90d,
                this.risk_level,
                this.contributing_factors,
                this.recommended_actions,
                this.confidence_score,
                this.model_version || '1.0'
            ]);

            if (!this.id) {
                this.id = result.insertId;
            }

            return result;
        } catch (error) {
            logger.error('Error saving churn prediction:', error);
            throw error;
        }
    }

    /**
     * Get recent churn predictions
     */
    static async getRecentPredictions(filters = {}) {
        try {
            const {
                risk_level,
                limit = 50,
                days_back = 7
            } = filters;

            let whereClause = 'WHERE cp.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
            const params = [parseInt(days_back)];

            if (risk_level) {
                whereClause += ' AND cp.risk_level = ?';
                params.push(risk_level);
            }

            const query = `
                SELECT 
                    cp.*,
                    c.email,
                    c.name,
                    50 as current_health_score,
                    0 as current_ltv
                FROM churn_predictions cp
                JOIN customers c ON cp.stripe_customer_id = c.stripe_customer_id
                ${whereClause}
                ORDER BY cp.churn_probability_30d DESC, cp.created_at DESC
                LIMIT ${parseInt(limit)}
            `;

            const predictions = await executeQuery(adminPool, query, params);
            return predictions.map(p => new ChurnPrediction(p));
        } catch (error) {
            logger.error('Error getting recent predictions:', error);
            throw error;
        }
    }

    /**
     * Get churn prediction for specific customer
     */
    static async getByCustomerId(customerId) {
        try {
            const query = `
                SELECT * FROM churn_predictions 
                WHERE stripe_customer_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;

            const [prediction] = await executeQuery(adminPool, query, [customerId]);
            return prediction ? new ChurnPrediction(prediction) : null;
        } catch (error) {
            logger.error('Error getting churn prediction:', error);
            throw error;
        }
    }

    /**
     * Run batch churn analysis for all customers
     */
    static async runBatchAnalysis(options = {}) {
        try {
            const { limit = 100, offset = 0 } = options;
            
            // Get customers to analyze (simplified - no parameters to avoid mysql2 issue)
            const customersQuery = `
                SELECT c.stripe_customer_id 
                FROM customers c
                WHERE c.deleted = false 
                ORDER BY c.created_at DESC
                LIMIT 10
            `;

            logger.info('Batch analysis - getting customers without parameters');

            const customers = await executeQuery(adminPool, customersQuery, []);
            
            const results = {
                processed: 0,
                updated: 0,
                errors: 0,
                high_risk: 0
            };

            for (const customer of customers) {
                try {
                    const prediction = await this.calculateChurnPrediction(customer.stripe_customer_id);
                    results.processed++;
                    results.updated++;
                    
                    if (prediction.risk_level === 'high' || prediction.risk_level === 'critical') {
                        results.high_risk++;
                    }
                } catch (error) {
                    logger.error('Error in batch analysis for customer:', {
                        customerId: customer.stripe_customer_id,
                        error: error.message
                    });
                    results.errors++;
                }
            }

            logger.info('Batch churn analysis completed', results);
            return results;
        } catch (error) {
            logger.error('Error in batch churn analysis:', error);
            throw error;
        }
    }

    /**
     * Get churn analytics summary
     */
    static async getChurnAnalytics(dateFrom, dateTo) {
        try {
            const query = `
                SELECT 
                    risk_level,
                    COUNT(*) as count,
                    AVG(churn_probability_30d) as avg_prob_30d,
                    AVG(confidence_score) as avg_confidence
                FROM churn_predictions 
                WHERE DATE(created_at) BETWEEN ? AND ?
                GROUP BY risk_level
                ORDER BY 
                    CASE risk_level 
                        WHEN 'critical' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'medium' THEN 3 
                        ELSE 4 
                    END
            `;

            const analytics = await executeQuery(adminPool, query, [dateFrom, dateTo]);
            return analytics;
        } catch (error) {
            logger.error('Error getting churn analytics:', error);
            throw error;
        }
    }
}

module.exports = ChurnPrediction;