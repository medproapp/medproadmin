// Load environment variables first
require('dotenv').config();

const customerSync = require('../services/customerSync');
const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

async function testSubscriptionSync() {
    try {
        logger.info('🧪 Starting subscription sync test');
        
        // Get a sample customer ID from database
        const customersQuery = 'SELECT stripe_customer_id FROM customers LIMIT 5';
        const customers = await executeQuery(adminPool, customersQuery);
        
        logger.info('📋 Sample customers from database', {
            customerCount: customers.length,
            customers: customers.map(c => c.stripe_customer_id)
        });
        
        if (customers.length === 0) {
            logger.error('❌ No customers found in database');
            return;
        }
        
        // Test with all customers to find ones with subscriptions
        let totalSubscriptionsFound = 0;
        
        for (let i = 0; i < customers.length; i++) {
            const testCustomerId = customers[i].stripe_customer_id;
            logger.info(`🎯 Testing subscription sync with customer ${i + 1}/${customers.length}`, { 
                customerId: testCustomerId 
            });
            
            // Create mock sync stats
            const syncStats = {
                subscriptions: {
                    processed: 0,
                    created: 0,
                    updated: 0,
                    errors: []
                }
            };
            
            // Test the subscription sync for this customer
            await customerSync.syncCustomerSubscriptions(testCustomerId, syncStats);
            
            if (syncStats.subscriptions.processed > 0) {
                totalSubscriptionsFound += syncStats.subscriptions.processed;
                logger.info('✨ Found customer with subscriptions!', {
                    customerId: testCustomerId,
                    subscriptionsFound: syncStats.subscriptions.processed
                });
            }
            
            // Small delay between customers
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logger.info('🏁 All customer subscription sync tests completed', {
            customersChecked: customers.length,
            totalSubscriptionsFound
        });
        
        // Check total database after sync
        const totalCountQuery = 'SELECT COUNT(*) as count FROM customer_subscriptions';
        const [totalResult] = await executeQuery(adminPool, totalCountQuery);
        
        logger.info('💾 Total database check after sync', {
            totalSubscriptionsInDatabase: totalResult.count
        });
        
    } catch (error) {
        logger.error('❌ Test subscription sync failed:', {
            error: error.message,
            stack: error.stack
        });
    } finally {
        process.exit(0);
    }
}

// Run the test if called directly
if (require.main === module) {
    testSubscriptionSync()
        .then(() => {
            console.log('✅ Test completed successfully');
        })
        .catch(error => {
            console.error('❌ Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testSubscriptionSync };