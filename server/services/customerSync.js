const stripeCustomers = require('./stripeCustomers');
const Customer = require('../models/Customer');
const CustomerSubscription = require('../models/CustomerSubscription');
const CustomerMetrics = require('../models/CustomerMetrics');
const { executeTransaction, adminPool } = require('../config/database');
const logger = require('../utils/logger');

class CustomerSyncService {
    constructor() {
        this.stripe = stripeCustomers;
    }

    async syncAllCustomers() {
        logger.info('Starting full customer sync from Stripe');

        const syncStats = {
            started_at: new Date(),
            customers: {
                processed: 0,
                created: 0,
                updated: 0,
                errors: []
            },
            subscriptions: {
                processed: 0,
                created: 0,
                updated: 0,
                errors: []
            },
            metrics: {
                calculated: 0,
                errors: []
            }
        };

        try {
            // Get all customers from Stripe
            logger.info('Fetching all customers from Stripe');
            const allCustomers = await this.stripe.getAllCustomers();
            
            logger.info('Processing customers from Stripe', { 
                totalCustomers: allCustomers.length 
            });

            // Process customers in optimized batches (respects 10 connection pool limit)
            const batchSize = 8;
            for (let i = 0; i < allCustomers.length; i += batchSize) {
                const batch = allCustomers.slice(i, i + batchSize);
                await this.processBatchOptimized(batch, syncStats);
                
                logger.info('Processed customer batch', { 
                    batch: Math.floor(i / batchSize) + 1,
                    totalBatches: Math.ceil(allCustomers.length / batchSize),
                    processed: syncStats.customers.processed
                });

                // Small delay between batches to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Update daily analytics after sync
            await this.updateDailyAnalytics();

            syncStats.completed_at = new Date();
            syncStats.duration_ms = syncStats.completed_at - syncStats.started_at;

            logger.info('Customer sync completed successfully', syncStats);
            return syncStats;

        } catch (error) {
            logger.error('Error in customer sync:', error);
            syncStats.fatal_error = error.message;
            syncStats.completed_at = new Date();
            throw error;
        }
    }

    async processBatchOptimized(customerBatch, syncStats) {
        logger.info('Processing optimized customer batch', { 
            batchSize: customerBatch.length,
            currentStats: {
                processed: syncStats.customers.processed,
                created: syncStats.customers.created,
                updated: syncStats.customers.updated,
                errors: syncStats.customers.errors.length
            }
        });

        try {
            // Step 1: Batch existence check (single query for all customers)
            const stripeCustomerIds = customerBatch.map(customer => customer.id);
            const existingCustomerIds = await Customer.batchExistenceCheck(stripeCustomerIds);
            const existingSet = new Set(existingCustomerIds);

            logger.info('Batch existence check completed', {
                total: stripeCustomerIds.length,
                existing: existingCustomerIds.length,
                new: stripeCustomerIds.length - existingCustomerIds.length
            });

            // Step 2: Process customers concurrently with pre-determined existence
            const batchPromises = customerBatch.map((stripeCustomer, index) => {
                const isExisting = existingSet.has(stripeCustomer.id);
                logger.info(`Processing customer ${index + 1}/${customerBatch.length} in batch`, {
                    customerId: stripeCustomer.id,
                    email: stripeCustomer.email,
                    isExisting
                });
                return this.syncSingleCustomerOptimized(stripeCustomer, isExisting, syncStats);
            });

            const results = await Promise.allSettled(batchPromises);
            
            // Log batch completion results
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            logger.info('Optimized batch processing completed', {
                batchSize: customerBatch.length,
                succeeded,
                failed,
                totalProcessed: syncStats.customers.processed
            });

            // Log any rejected promises
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    logger.error('Customer sync failed in optimized batch', {
                        customerIndex: index,
                        customerId: customerBatch[index].id,
                        error: result.reason
                    });
                }
            });

        } catch (error) {
            logger.error('Error in optimized batch processing:', error);
            
            // Fallback to individual processing if batch fails
            logger.info('Falling back to individual customer processing');
            for (const stripeCustomer of customerBatch) {
                try {
                    await this.syncSingleCustomer(stripeCustomer, syncStats);
                } catch (individualError) {
                    logger.error('Individual customer sync failed:', {
                        customerId: stripeCustomer.id,
                        error: individualError.message
                    });
                    syncStats.customers.errors.push({
                        customer_id: stripeCustomer.id,
                        email: stripeCustomer.email,
                        error: individualError.message
                    });
                }
            }
        }
    }

    async processBatch(customerBatch, syncStats) {
        logger.info('Processing customer batch', { 
            batchSize: customerBatch.length,
            currentStats: {
                processed: syncStats.customers.processed,
                created: syncStats.customers.created,
                updated: syncStats.customers.updated,
                errors: syncStats.customers.errors.length
            }
        });

        const batchPromises = customerBatch.map((stripeCustomer, index) => {
            logger.info(`Processing customer ${index + 1}/${customerBatch.length} in batch`, {
                customerId: stripeCustomer.id,
                email: stripeCustomer.email
            });
            return this.syncSingleCustomer(stripeCustomer, syncStats);
        });

        const results = await Promise.allSettled(batchPromises);
        
        // Log batch completion results
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        logger.info('Batch processing completed', {
            batchSize: customerBatch.length,
            succeeded,
            failed,
            totalProcessed: syncStats.customers.processed
        });

        // Log any rejected promises
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.error('Customer sync failed in batch', {
                    customerIndex: index,
                    customerId: customerBatch[index].id,
                    error: result.reason
                });
            }
        });
    }

    async syncSingleCustomerOptimized(stripeCustomer, isExisting, syncStats) {
        logger.info('Starting optimized single customer sync', {
            customerId: stripeCustomer.id,
            email: stripeCustomer.email,
            name: stripeCustomer.name,
            isExisting
        });

        try {
            await executeTransaction(adminPool, async (connection) => {
                logger.info('Starting optimized database transaction for customer', {
                    customerId: stripeCustomer.id,
                    isExisting
                });

                // Sync customer data
                const customer = new Customer({
                    stripe_customer_id: stripeCustomer.id,
                    email: stripeCustomer.email || `no-email-${stripeCustomer.id}@stripe.com`,
                    name: stripeCustomer.name || null,
                    description: stripeCustomer.description || null,
                    phone: stripeCustomer.phone || null,
                    address_line1: stripeCustomer.address?.line1 || null,
                    address_line2: stripeCustomer.address?.line2 || null,
                    address_city: stripeCustomer.address?.city || null,
                    address_state: stripeCustomer.address?.state || null,
                    address_postal_code: stripeCustomer.address?.postal_code || null,
                    address_country: stripeCustomer.address?.country || null,
                    metadata: stripeCustomer.metadata || {},
                    currency: stripeCustomer.currency || null,
                    deleted: stripeCustomer.deleted || false,
                    delinquent: stripeCustomer.delinquent || false,
                    balance: stripeCustomer.balance || 0,
                    stripe_created_at: new Date(stripeCustomer.created * 1000),
                    last_sync_at: new Date()
                });

                // Use pre-determined existence check result (no database query needed)
                if (isExisting) {
                    logger.info('Updating existing customer (pre-determined)', {
                        customerId: stripeCustomer.id
                    });
                    await customer.update();
                    syncStats.customers.updated++;
                } else {
                    logger.info('Creating new customer (pre-determined)', {
                        customerId: stripeCustomer.id
                    });
                    await customer.create();
                    syncStats.customers.created++;
                }

                syncStats.customers.processed++;

                logger.info('Customer sync completed, now syncing subscriptions', {
                    customerId: stripeCustomer.id,
                    processed: syncStats.customers.processed
                });

                // Sync customer subscriptions
                await this.syncCustomerSubscriptions(stripeCustomer.id, syncStats);

                logger.info('Subscriptions synced, calculating metrics', {
                    customerId: stripeCustomer.id
                });

                // Calculate and update metrics
                const metrics = await CustomerMetrics.calculateForCustomer(
                    stripeCustomer.id, 
                    stripeCustomer
                );
                
                await metrics.save();
                syncStats.metrics.calculated++;

                logger.info('Customer fully synced successfully (optimized)', {
                    customerId: stripeCustomer.id,
                    processed: syncStats.customers.processed,
                    metricsCalculated: syncStats.metrics.calculated
                });
            });

        } catch (error) {
            logger.error('Error syncing customer (optimized):', { 
                customerId: stripeCustomer.id, 
                email: stripeCustomer.email,
                error: error.message 
            });
            
            syncStats.customers.errors.push({
                customer_id: stripeCustomer.id,
                email: stripeCustomer.email,
                error: error.message
            });
        }
    }

    async syncSingleCustomer(stripeCustomer, syncStats) {
        logger.info('Starting single customer sync', {
            customerId: stripeCustomer.id,
            email: stripeCustomer.email,
            name: stripeCustomer.name
        });

        try {
            await executeTransaction(adminPool, async (connection) => {
                logger.info('Starting database transaction for customer', {
                    customerId: stripeCustomer.id
                });

                // Sync customer data
                const customer = new Customer({
                    stripe_customer_id: stripeCustomer.id,
                    email: stripeCustomer.email || `no-email-${stripeCustomer.id}@stripe.com`,
                    name: stripeCustomer.name || null,
                    description: stripeCustomer.description || null,
                    phone: stripeCustomer.phone || null,
                    address_line1: stripeCustomer.address?.line1 || null,
                    address_line2: stripeCustomer.address?.line2 || null,
                    address_city: stripeCustomer.address?.city || null,
                    address_state: stripeCustomer.address?.state || null,
                    address_postal_code: stripeCustomer.address?.postal_code || null,
                    address_country: stripeCustomer.address?.country || null,
                    metadata: stripeCustomer.metadata || {},
                    currency: stripeCustomer.currency || null,
                    deleted: stripeCustomer.deleted || false,
                    delinquent: stripeCustomer.delinquent || false,
                    balance: stripeCustomer.balance || 0,
                    stripe_created_at: new Date(stripeCustomer.created * 1000),
                    last_sync_at: new Date()
                });

                logger.info('Checking if customer exists in database', {
                    customerId: stripeCustomer.id
                });

                const existingCustomer = await Customer.findByStripeId(stripeCustomer.id);
                
                if (existingCustomer) {
                    logger.info('Updating existing customer', {
                        customerId: stripeCustomer.id
                    });
                    await customer.update();
                    syncStats.customers.updated++;
                } else {
                    logger.info('Creating new customer', {
                        customerId: stripeCustomer.id
                    });
                    await customer.create();
                    syncStats.customers.created++;
                }

                syncStats.customers.processed++;

                logger.info('Customer sync completed, now syncing subscriptions', {
                    customerId: stripeCustomer.id,
                    processed: syncStats.customers.processed
                });

                // Sync customer subscriptions
                await this.syncCustomerSubscriptions(stripeCustomer.id, syncStats);

                logger.info('Subscriptions synced, calculating metrics', {
                    customerId: stripeCustomer.id
                });

                // Calculate and update metrics
                const metrics = await CustomerMetrics.calculateForCustomer(
                    stripeCustomer.id, 
                    stripeCustomer
                );
                
                await metrics.save();
                syncStats.metrics.calculated++;

                logger.info('Customer fully synced successfully', {
                    customerId: stripeCustomer.id,
                    processed: syncStats.customers.processed,
                    metricsCalculated: syncStats.metrics.calculated
                });
            });

        } catch (error) {
            logger.error('Error syncing customer:', { 
                customerId: stripeCustomer.id, 
                email: stripeCustomer.email,
                error: error.message 
            });
            
            syncStats.customers.errors.push({
                customer_id: stripeCustomer.id,
                email: stripeCustomer.email,
                error: error.message
            });
        }
    }

    async syncCustomerSubscriptions(stripeCustomerId, syncStats) {
        try {
            logger.info('🔄 Starting subscription sync for customer', { 
                customerId: stripeCustomerId,
                currentStats: syncStats.subscriptions
            });
            
            const subscriptions = await this.stripe.listSubscriptions(stripeCustomerId);
            
            logger.info('📋 Stripe API response for customer subscriptions', {
                customerId: stripeCustomerId,
                subscriptionCount: subscriptions.data.length,
                hasMore: subscriptions.has_more,
                subscriptions: subscriptions.data.map(sub => ({
                    id: sub.id,
                    status: sub.status,
                    product: sub.items.data[0]?.price?.product,
                    price: sub.items.data[0]?.price?.id
                }))
            });
            
            if (subscriptions.data.length === 0) {
                logger.info('⚠️ No subscriptions found for customer', { customerId: stripeCustomerId });
                return;
            }
            
            for (const stripeSubscription of subscriptions.data) {
                try {
                    logger.info('🔍 Processing individual subscription', {
                        subscriptionId: stripeSubscription.id,
                        customerId: stripeCustomerId,
                        status: stripeSubscription.status,
                        priceId: stripeSubscription.items.data[0]?.price?.id,
                        productId: stripeSubscription.items.data[0]?.price?.product
                    });
                    
                    const subscription = new CustomerSubscription({
                        stripe_subscription_id: stripeSubscription.id,
                        stripe_customer_id: stripeSubscription.customer,
                        stripe_price_id: stripeSubscription.items.data[0]?.price?.id,
                        stripe_product_id: stripeSubscription.items.data[0]?.price?.product,
                        status: stripeSubscription.status,
                        current_period_start: new Date(stripeSubscription.current_period_start * 1000),
                        current_period_end: new Date(stripeSubscription.current_period_end * 1000),
                        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
                        canceled_at: stripeSubscription.canceled_at ? 
                            new Date(stripeSubscription.canceled_at * 1000) : null,
                        ended_at: stripeSubscription.ended_at ? 
                            new Date(stripeSubscription.ended_at * 1000) : null,
                        trial_start: stripeSubscription.trial_start ? 
                            new Date(stripeSubscription.trial_start * 1000) : null,
                        trial_end: stripeSubscription.trial_end ? 
                            new Date(stripeSubscription.trial_end * 1000) : null,
                        metadata: stripeSubscription.metadata
                    });

                    logger.info('💾 Checking if subscription exists in database', {
                        subscriptionId: stripeSubscription.id
                    });

                    const existingSubscription = await CustomerSubscription.findByStripeId(
                        stripeSubscription.id
                    );

                    if (existingSubscription) {
                        logger.info('🔄 Updating existing subscription', {
                            subscriptionId: stripeSubscription.id
                        });
                        await subscription.update();
                        syncStats.subscriptions.updated++;
                        logger.info('✅ Subscription updated successfully', {
                            subscriptionId: stripeSubscription.id
                        });
                    } else {
                        logger.info('➕ Creating new subscription', {
                            subscriptionId: stripeSubscription.id
                        });
                        await subscription.create();
                        syncStats.subscriptions.created++;
                        logger.info('✅ Subscription created successfully', {
                            subscriptionId: stripeSubscription.id
                        });
                    }

                    syncStats.subscriptions.processed++;
                    
                    logger.info('📊 Subscription processing complete', {
                        subscriptionId: stripeSubscription.id,
                        processed: syncStats.subscriptions.processed,
                        created: syncStats.subscriptions.created,
                        updated: syncStats.subscriptions.updated
                    });

                } catch (subError) {
                    logger.error('❌ Error syncing individual subscription:', { 
                        subscriptionId: stripeSubscription.id,
                        customerId: stripeCustomerId,
                        error: subError.message,
                        stack: subError.stack
                    });
                    
                    syncStats.subscriptions.errors.push({
                        subscription_id: stripeSubscription.id,
                        customer_id: stripeCustomerId,
                        error: subError.message
                    });
                }
            }
            
            logger.info('✅ Subscription sync completed for customer', {
                customerId: stripeCustomerId,
                totalSubscriptions: subscriptions.data.length,
                processed: syncStats.subscriptions.processed,
                created: syncStats.subscriptions.created,
                updated: syncStats.subscriptions.updated,
                errors: syncStats.subscriptions.errors.length
            });

        } catch (error) {
            logger.error('❌ Error fetching customer subscriptions from Stripe:', { 
                customerId: stripeCustomerId, 
                error: error.message,
                stack: error.stack
            });
            
            syncStats.subscriptions.errors.push({
                customer_id: stripeCustomerId,
                error: `Failed to fetch subscriptions: ${error.message}`
            });
        }
    }

    async syncSingleCustomerById(stripeCustomerId) {
        logger.info('Syncing single customer from Stripe', { stripeCustomerId });

        try {
            // Fetch customer from Stripe
            const stripeCustomer = await this.stripe.getCustomer(stripeCustomerId);
            
            const syncStats = {
                customers: { processed: 0, created: 0, updated: 0, errors: [] },
                subscriptions: { processed: 0, created: 0, updated: 0, errors: [] },
                metrics: { calculated: 0, errors: [] }
            };

            await this.syncSingleCustomer(stripeCustomer, syncStats);

            logger.info('Single customer sync completed', { 
                stripeCustomerId,
                stats: syncStats 
            });

            return {
                success: true,
                customer: await Customer.findByStripeId(stripeCustomerId),
                stats: syncStats
            };

        } catch (error) {
            logger.error('Error syncing single customer:', { stripeCustomerId, error });
            throw error;
        }
    }

    async updateDailyAnalytics(targetDate = null) {
        const date = targetDate || new Date().toISOString().split('T')[0];
        
        try {
            logger.info('Updating daily analytics', { date });

            // Calculate daily customer analytics
            const analyticsQuery = `
                INSERT INTO customer_analytics_daily (
                    date, new_customers, churned_customers, total_active_customers,
                    total_revenue, average_revenue_per_customer, new_subscriptions,
                    canceled_subscriptions
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    new_customers = VALUES(new_customers),
                    churned_customers = VALUES(churned_customers),
                    total_active_customers = VALUES(total_active_customers),
                    total_revenue = VALUES(total_revenue),
                    average_revenue_per_customer = VALUES(average_revenue_per_customer),
                    new_subscriptions = VALUES(new_subscriptions),
                    canceled_subscriptions = VALUES(canceled_subscriptions)
            `;

            // Get new customers for the date
            const newCustomersQuery = `
                SELECT COUNT(*) as count 
                FROM customers 
                WHERE DATE(stripe_created_at) = ?
            `;

            // Get total active customers
            const activeCustomersQuery = `
                SELECT COUNT(*) as count 
                FROM customers 
                WHERE deleted = false AND delinquent = false
            `;

            // Get subscription data for the date
            const subscriptionDataQuery = `
                SELECT 
                    COUNT(CASE WHEN DATE(cs.created_at) = ? THEN 1 END) as new_subscriptions,
                    COUNT(CASE WHEN DATE(cs.canceled_at) = ? THEN 1 END) as canceled_subscriptions,
                    SUM(CASE WHEN cs.status = 'active' AND pp.unit_amount IS NOT NULL 
                        THEN pp.unit_amount ELSE 0 END) as total_revenue
                FROM customer_subscriptions cs
                LEFT JOIN product_prices pp ON cs.stripe_price_id = pp.stripe_price_id
            `;

            const { executeQuery } = require('../config/database');
            
            const [newCustomers] = await executeQuery(adminPool, newCustomersQuery, [date]);
            const [activeCustomers] = await executeQuery(adminPool, activeCustomersQuery);
            const [subscriptionData] = await executeQuery(adminPool, subscriptionDataQuery, [date, date]);

            const totalRevenue = subscriptionData.total_revenue || 0;
            const activeCount = activeCustomers.count || 0;
            const avgRevenue = activeCount > 0 ? Math.round(totalRevenue / activeCount) : 0;

            await executeQuery(adminPool, analyticsQuery, [
                date,
                newCustomers.count || 0,
                0, // churned customers - would need more complex calculation
                activeCount,
                totalRevenue,
                avgRevenue,
                subscriptionData.new_subscriptions || 0,
                subscriptionData.canceled_subscriptions || 0
            ]);

            logger.info('Daily analytics updated successfully', { 
                date,
                newCustomers: newCustomers.count,
                activeCustomers: activeCount,
                totalRevenue
            });

        } catch (error) {
            logger.error('Error updating daily analytics:', { date, error });
            throw error;
        }
    }

    async getSyncStatus() {
        const { executeQuery } = require('../config/database');
        try {
            // Get last sync information
            const lastSyncQuery = `
                SELECT 
                    MAX(last_sync_at) as last_sync_at,
                    COUNT(*) as total_customers,
                    COUNT(CASE WHEN last_sync_at > DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 END) as recently_synced
                FROM customers
            `;

            const [syncStatus] = await executeQuery(adminPool, lastSyncQuery);

            // Get subscription counts
            const subscriptionQuery = `
                SELECT 
                    COUNT(*) as total_subscriptions,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions
                FROM customer_subscriptions
            `;

            const [subscriptionStatus] = await executeQuery(adminPool, subscriptionQuery);

            return {
                last_sync_at: syncStatus.last_sync_at,
                total_customers: syncStatus.total_customers,
                recently_synced_customers: syncStatus.recently_synced,
                total_subscriptions: subscriptionStatus.total_subscriptions,
                active_subscriptions: subscriptionStatus.active_subscriptions,
                sync_health: syncStatus.recently_synced / Math.max(syncStatus.total_customers, 1)
            };

        } catch (error) {
            logger.error('Error getting sync status:', error);
            throw error;
        }
    }
}

module.exports = new CustomerSyncService();