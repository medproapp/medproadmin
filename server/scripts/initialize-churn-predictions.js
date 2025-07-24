const ChurnPrediction = require('../models/ChurnPrediction');
const logger = require('../utils/logger');

async function initializeChurnPredictions() {
    try {
        logger.info('Starting churn prediction initialization...');

        // Run batch analysis for all customers (or first 50 for testing)
        const results = await ChurnPrediction.runBatchAnalysis({ 
            limit: 50, 
            offset: 0 
        });
        
        logger.info('Churn prediction initialization completed!', results);

        // Get some sample predictions to verify
        const samplePredictions = await ChurnPrediction.getRecentPredictions({
            limit: 5,
            days_back: 1
        });

        logger.info('Sample predictions created:');
        for (const prediction of samplePredictions) {
            logger.info(`- Customer ${prediction.stripe_customer_id}: ${prediction.risk_level} risk (${Math.round(prediction.churn_probability_30d * 100)}% churn probability)`);
        }

        // Get dashboard summary (skip for now)
        const analytics = [];

        logger.info('Risk distribution:', analytics);

        return {
            ...results,
            sample_predictions: samplePredictions.length,
            risk_analytics: analytics
        };
    } catch (error) {
        logger.error('Error initializing churn predictions:', error);
        throw error;
    }
}

// Run the initialization if called directly
if (require.main === module) {
    initializeChurnPredictions()
        .then((results) => {
            console.log('✅ Successfully initialized churn predictions');
            console.log(`📊 Processed: ${results.processed}, Updated: ${results.updated}, Errors: ${results.errors}`);
            console.log(`⚠️  High Risk: ${results.high_risk} customers`);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Churn prediction initialization failed:', error.message);
            process.exit(1);
        });
}

module.exports = { initializeChurnPredictions };