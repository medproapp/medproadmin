const CustomerSegment = require('../models/CustomerSegment');
const logger = require('../utils/logger');

async function initializeSegments() {
    try {
        logger.info('Starting segment initialization...');

        // Refresh all segment assignments
        const refreshedCount = await CustomerSegment.refreshAllAssignments();
        
        logger.info(`Initialized ${refreshedCount} segments with customer assignments`);

        // Get all segments with customer counts
        const segments = await CustomerSegment.findAll();
        
        logger.info('Segment Summary:');
        for (const segment of segments) {
            logger.info(`- ${segment.name}: ${segment.customer_count || 0} customers (${segment.color})`);
        }

        logger.info('Segment initialization completed successfully!');
        return segments;
    } catch (error) {
        logger.error('Error initializing segments:', error);
        throw error;
    }
}

// Run the initialization if called directly
if (require.main === module) {
    initializeSegments()
        .then((segments) => {
            console.log(`✅ Successfully initialized ${segments.length} segments`);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Segment initialization failed:', error.message);
            process.exit(1);
        });
}

module.exports = { initializeSegments };