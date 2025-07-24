const express = require('express');
const router = express.Router();
const ChurnPrediction = require('../models/ChurnPrediction');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply admin authentication to all churn routes
router.use(verifyToken);

// GET /api/v1/churn/predictions - Get recent churn predictions
router.get('/predictions', async (req, res) => {
    try {
        const { 
            risk_level,
            limit = 50,
            days_back = 7
        } = req.query;

        logger.info('Fetching churn predictions', { 
            risk_level,
            limit: parseInt(limit),
            days_back: parseInt(days_back),
            adminEmail: req.user.email 
        });

        const filters = {
            risk_level,
            limit: parseInt(limit),
            days_back: parseInt(days_back)
        };

        const predictions = await ChurnPrediction.getRecentPredictions(filters);

        res.json({
            success: true,
            data: {
                predictions: predictions.map(p => ({
                    id: p.id,
                    customer_id: p.stripe_customer_id,
                    customer_email: p.email,
                    customer_name: p.name,
                    prediction_date: p.prediction_date,
                    churn_probability_30d: p.churn_probability_30d,
                    churn_probability_60d: p.churn_probability_60d,
                    churn_probability_90d: p.churn_probability_90d,
                    risk_level: p.risk_level,
                    contributing_factors: JSON.parse(p.contributing_factors || '[]'),
                    recommended_actions: JSON.parse(p.recommended_actions || '[]'),
                    confidence_score: p.confidence_score,
                    current_health_score: p.current_health_score,
                    current_ltv: p.current_ltv
                })),
                count: predictions.length,
                filters: filters
            }
        });

    } catch (error) {
        logger.error('Error fetching churn predictions:', { error, adminEmail: req.user.email });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch churn predictions',
            message: error.message
        });
    }
});

// GET /api/v1/churn/predictions/:customerId - Get churn prediction for specific customer
router.get('/predictions/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;

        logger.info('Fetching churn prediction for customer', { 
            customerId, 
            adminEmail: req.user.email 
        });

        const prediction = await ChurnPrediction.getByCustomerId(customerId);

        if (!prediction) {
            return res.status(404).json({
                success: false,
                error: 'No churn prediction found for this customer'
            });
        }

        res.json({
            success: true,
            data: {
                id: prediction.id,
                customer_id: prediction.stripe_customer_id,
                prediction_date: prediction.prediction_date,
                churn_probability_30d: prediction.churn_probability_30d,
                churn_probability_60d: prediction.churn_probability_60d,
                churn_probability_90d: prediction.churn_probability_90d,
                risk_level: prediction.risk_level,
                contributing_factors: JSON.parse(prediction.contributing_factors || '[]'),
                recommended_actions: JSON.parse(prediction.recommended_actions || '[]'),
                confidence_score: prediction.confidence_score,
                model_version: prediction.model_version,
                created_at: prediction.created_at
            }
        });

    } catch (error) {
        logger.error('Error fetching customer churn prediction:', { 
            customerId: req.params.customerId, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch churn prediction',
            message: error.message
        });
    }
});

// POST /api/v1/churn/calculate/:customerId - Calculate churn prediction for specific customer
router.post('/calculate/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;

        logger.info('Calculating churn prediction for customer', { 
            customerId, 
            adminEmail: req.user.email 
        });

        const prediction = await ChurnPrediction.calculateChurnPrediction(customerId);

        res.json({
            success: true,
            message: 'Churn prediction calculated successfully',
            data: {
                customer_id: customerId,
                risk_level: prediction.risk_level,
                churn_probability_30d: prediction.churn_probability_30d,
                churn_probability_60d: prediction.churn_probability_60d,
                churn_probability_90d: prediction.churn_probability_90d,
                contributing_factors: JSON.parse(prediction.contributing_factors || '[]'),
                recommended_actions: JSON.parse(prediction.recommended_actions || '[]'),
                confidence_score: prediction.confidence_score
            }
        });

    } catch (error) {
        logger.error('Error calculating churn prediction:', { 
            customerId: req.params.customerId, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to calculate churn prediction',
            message: error.message
        });
    }
});

// POST /api/v1/churn/batch-analysis - Run batch churn analysis
router.post('/batch-analysis', async (req, res) => {
    try {
        const { 
            limit = 100, 
            offset = 0 
        } = req.body;

        logger.info('Starting batch churn analysis', { 
            limit, 
            offset, 
            adminEmail: req.user.email 
        });

        const results = await ChurnPrediction.runBatchAnalysis({ 
            limit: parseInt(limit), 
            offset: parseInt(offset) 
        });

        res.json({
            success: true,
            message: 'Batch churn analysis completed',
            data: results
        });

    } catch (error) {
        logger.error('Error in batch churn analysis:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to run batch analysis',
            message: error.message
        });
    }
});

// GET /api/v1/churn/analytics - Get churn analytics summary
router.get('/analytics', async (req, res) => {
    try {
        const { 
            date_from: dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            date_to: dateTo = new Date().toISOString().split('T')[0]
        } = req.query;

        logger.info('Fetching churn analytics', { 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        const analytics = await ChurnPrediction.getChurnAnalytics(dateFrom, dateTo);

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                risk_distribution: analytics,
                summary: {
                    total_predictions: analytics.reduce((sum, item) => sum + item.count, 0),
                    high_risk_count: analytics
                        .filter(item => item.risk_level === 'high' || item.risk_level === 'critical')
                        .reduce((sum, item) => sum + item.count, 0),
                    average_confidence: analytics.reduce((sum, item) => sum + (item.avg_confidence * item.count), 0) / 
                        Math.max(1, analytics.reduce((sum, item) => sum + item.count, 0))
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching churn analytics:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch churn analytics',
            message: error.message
        });
    }
});

// GET /api/v1/churn/high-risk - Get high-risk customers for immediate action
router.get('/high-risk', async (req, res) => {
    try {
        const { limit = 25 } = req.query;

        logger.info('Fetching high-risk customers', { 
            limit: parseInt(limit), 
            adminEmail: req.user.email 
        });

        const predictions = await ChurnPrediction.getRecentPredictions({
            risk_level: null, // Get all risk levels
            limit: 200, // Get more to filter
            days_back: 7
        });

        // Filter and sort high-risk customers
        const highRisk = predictions
            .filter(p => p.risk_level === 'high' || p.risk_level === 'critical')
            .sort((a, b) => b.churn_probability_30d - a.churn_probability_30d)
            .slice(0, parseInt(limit));

        res.json({
            success: true,
            data: {
                high_risk_customers: highRisk.map(p => ({
                    customer_id: p.stripe_customer_id,
                    customer_email: p.email,
                    customer_name: p.name,
                    risk_level: p.risk_level,
                    churn_probability_30d: p.churn_probability_30d,
                    contributing_factors: JSON.parse(p.contributing_factors || '[]'),
                    recommended_actions: JSON.parse(p.recommended_actions || '[]'),
                    current_health_score: p.current_health_score,
                    current_ltv: p.current_ltv,
                    prediction_date: p.prediction_date
                })),
                count: highRisk.length,
                total_high_risk: predictions.filter(p => p.risk_level === 'high' || p.risk_level === 'critical').length
            }
        });

    } catch (error) {
        logger.error('Error fetching high-risk customers:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch high-risk customers',
            message: error.message
        });
    }
});

// GET /api/v1/churn/dashboard - Get churn dashboard data
router.get('/dashboard', async (req, res) => {
    try {
        logger.info('Fetching churn dashboard data', { 
            adminEmail: req.user.email 
        });

        // Get recent predictions summary
        const recentPredictions = await ChurnPrediction.getRecentPredictions({
            limit: 1000,
            days_back: 7
        });

        // Calculate dashboard metrics
        const totalPredictions = recentPredictions.length;
        const riskDistribution = {
            critical: recentPredictions.filter(p => p.risk_level === 'critical').length,
            high: recentPredictions.filter(p => p.risk_level === 'high').length,
            medium: recentPredictions.filter(p => p.risk_level === 'medium').length,
            low: recentPredictions.filter(p => p.risk_level === 'low').length
        };

        const avgChurnProb = recentPredictions.length > 0 
            ? recentPredictions.reduce((sum, p) => sum + p.churn_probability_30d, 0) / recentPredictions.length 
            : 0;

        const avgConfidence = recentPredictions.length > 0 
            ? recentPredictions.reduce((sum, p) => sum + p.confidence_score, 0) / recentPredictions.length 
            : 0;

        // Get top contributing factors
        const allFactors = recentPredictions
            .flatMap(p => JSON.parse(p.contributing_factors || '[]'))
            .reduce((acc, factor) => {
                acc[factor] = (acc[factor] || 0) + 1;
                return acc;
            }, {});

        const topFactors = Object.entries(allFactors)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([factor, count]) => ({ factor, count, percentage: (count / totalPredictions * 100).toFixed(1) }));

        res.json({
            success: true,
            data: {
                overview: {
                    total_predictions: totalPredictions,
                    avg_churn_probability_30d: Math.round(avgChurnProb * 100) / 100,
                    avg_confidence_score: Math.round(avgConfidence * 100) / 100,
                    immediate_action_required: riskDistribution.critical + riskDistribution.high
                },
                risk_distribution: riskDistribution,
                top_contributing_factors: topFactors,
                recent_high_risk: recentPredictions
                    .filter(p => p.risk_level === 'critical' || p.risk_level === 'high')
                    .sort((a, b) => b.churn_probability_30d - a.churn_probability_30d)
                    .slice(0, 10)
                    .map(p => ({
                        customer_id: p.stripe_customer_id,
                        customer_email: p.email,
                        risk_level: p.risk_level,
                        churn_probability_30d: p.churn_probability_30d,
                        top_factors: JSON.parse(p.contributing_factors || '[]').slice(0, 3)
                    }))
            }
        });

    } catch (error) {
        logger.error('Error fetching churn dashboard data:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard data',
            message: error.message
        });
    }
});

module.exports = router;