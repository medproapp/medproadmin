// Load environment variables first
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

async function checkStripeSubscriptions() {
    try {
        logger.info('🔍 Checking all subscriptions directly in Stripe');
        
        let allSubscriptions = [];
        let hasMore = true;
        let startingAfter = null;
        let totalCount = 0;
        
        while (hasMore) {
            const params = {
                limit: 100,
                expand: ['data.customer']
            };
            
            if (startingAfter) {
                params.starting_after = startingAfter;
            }
            
            logger.info('📋 Fetching subscriptions batch from Stripe', { 
                startingAfter,
                totalSoFar: totalCount 
            });
            
            const subscriptions = await stripe.subscriptions.list(params);
            
            allSubscriptions = allSubscriptions.concat(subscriptions.data);
            totalCount += subscriptions.data.length;
            hasMore = subscriptions.has_more;
            
            if (subscriptions.data.length > 0) {
                startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
            }
            
            logger.info('📊 Batch fetched', {
                batchSize: subscriptions.data.length,
                totalSoFar: totalCount,
                hasMore: hasMore
            });
            
            // Log some sample data
            if (subscriptions.data.length > 0) {
                logger.info('📋 Sample subscriptions in this batch', {
                    samples: subscriptions.data.slice(0, 3).map(sub => ({
                        id: sub.id,
                        customer: sub.customer,
                        status: sub.status,
                        created: new Date(sub.created * 1000).toISOString()
                    }))
                });
            }
        }
        
        // Analyze the subscriptions
        const statusCounts = {};
        const customerCounts = {};
        
        allSubscriptions.forEach(sub => {
            // Count by status
            statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
            
            // Count by customer
            customerCounts[sub.customer] = (customerCounts[sub.customer] || 0) + 1;
        });
        
        logger.info('🎯 Stripe subscription analysis complete', {
            totalSubscriptions: allSubscriptions.length,
            statusBreakdown: statusCounts,
            uniqueCustomers: Object.keys(customerCounts).length,
            customersWithMultipleSubscriptions: Object.values(customerCounts).filter(count => count > 1).length
        });
        
        // Show customers with most subscriptions
        const topCustomers = Object.entries(customerCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([customerId, count]) => ({ customerId, subscriptionCount: count }));
            
        logger.info('👑 Top customers by subscription count', { topCustomers });
        
        return {
            totalSubscriptions: allSubscriptions.length,
            statusCounts,
            uniqueCustomers: Object.keys(customerCounts).length,
            subscriptions: allSubscriptions
        };
        
    } catch (error) {
        logger.error('❌ Error checking Stripe subscriptions:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Run the check if called directly
if (require.main === module) {
    checkStripeSubscriptions()
        .then((results) => {
            console.log('✅ Stripe subscription check completed');
            console.log(`📊 Total subscriptions in Stripe: ${results.totalSubscriptions}`);
            console.log(`👥 Unique customers with subscriptions: ${results.uniqueCustomers}`);
            console.log(`📈 Status breakdown:`, results.statusCounts);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Stripe subscription check failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkStripeSubscriptions };