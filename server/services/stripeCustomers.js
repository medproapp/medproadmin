const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

class StripeCustomerService {
    constructor() {
        this.stripe = stripe;
    }

    /**
     * List customers from Stripe with pagination
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Stripe customers response
     */
    async listCustomers(params = {}) {
        try {
            const defaultParams = {
                limit: 100,
                expand: ['data.subscriptions', 'data.default_source']
            };

            const stripeParams = { ...defaultParams, ...params };
            
            logger.info('Fetching customers from Stripe', { params: stripeParams });
            
            const customers = await this.stripe.customers.list(stripeParams);
            
            logger.info('Successfully fetched customers from Stripe', { 
                count: customers.data.length, 
                hasMore: customers.has_more 
            });
            
            return customers;
        } catch (error) {
            logger.error('Error fetching customers from Stripe:', error);
            throw error;
        }
    }

    /**
     * Get single customer from Stripe
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Stripe customer object
     */
    async getCustomer(customerId) {
        try {
            logger.info('Fetching customer from Stripe', { customerId });
            
            const customer = await this.stripe.customers.retrieve(customerId, {
                expand: ['subscriptions', 'default_source', 'invoice_settings.default_payment_method']
            });
            
            logger.info('Successfully fetched customer from Stripe', { customerId });
            
            return customer;
        } catch (error) {
            logger.error('Error fetching customer from Stripe:', { customerId, error });
            throw error;
        }
    }

    /**
     * Get customer's subscriptions from Stripe
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Customer subscriptions
     */
    async listSubscriptions(customerId) {
        try {
            logger.info('Fetching customer subscriptions from Stripe', { customerId });
            
            const subscriptions = await this.stripe.subscriptions.list({
                customer: customerId,
                expand: ['data.default_payment_method', 'data.items.data.price']
            });
            
            logger.info('Successfully fetched customer subscriptions', { 
                customerId, 
                count: subscriptions.data.length 
            });
            
            return subscriptions;
        } catch (error) {
            logger.error('Error fetching customer subscriptions:', { customerId, error });
            throw error;
        }
    }

    /**
     * Get customer's payment methods from Stripe
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Customer payment methods
     */
    async listPaymentMethods(customerId) {
        try {
            logger.info('Fetching customer payment methods from Stripe', { customerId });
            
            const paymentMethods = await this.stripe.paymentMethods.list({
                customer: customerId,
                type: 'card'
            });
            
            logger.info('Successfully fetched customer payment methods', { 
                customerId, 
                count: paymentMethods.data.length 
            });
            
            return paymentMethods;
        } catch (error) {
            logger.error('Error fetching customer payment methods:', { customerId, error });
            throw error;
        }
    }

    /**
     * Get customer's invoices from Stripe
     * @param {string} customerId - Stripe customer ID
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Customer invoices
     */
    async listInvoices(customerId, params = {}) {
        try {
            logger.info('Fetching customer invoices from Stripe', { customerId, params });
            
            const invoices = await this.stripe.invoices.list({
                customer: customerId,
                limit: params.limit || 100,
                starting_after: params.starting_after
            });
            
            logger.info('Successfully fetched customer invoices', { 
                customerId, 
                count: invoices.data.length 
            });
            
            return invoices;
        } catch (error) {
            logger.error('Error fetching customer invoices:', { customerId, error });
            throw error;
        }
    }

    /**
     * Get all customers from Stripe with automatic pagination
     * @returns {Promise<Array>} All customers
     */
    async getAllCustomers() {
        try {
            logger.info('Starting full customer sync from Stripe');
            
            const allCustomers = [];
            let hasMore = true;
            let startingAfter = null;
            let totalFetched = 0;

            while (hasMore) {
                const params = {
                    limit: 100,
                    expand: ['data.subscriptions']
                };
                
                if (startingAfter) {
                    params.starting_after = startingAfter;
                }

                const batch = await this.listCustomers(params);
                allCustomers.push(...batch.data);
                totalFetched += batch.data.length;

                hasMore = batch.has_more;
                if (hasMore && batch.data.length > 0) {
                    startingAfter = batch.data[batch.data.length - 1].id;
                }

                logger.info('Fetched customer batch', { 
                    batchSize: batch.data.length, 
                    totalFetched, 
                    hasMore 
                });

                // Add small delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            logger.info('Completed full customer sync from Stripe', { totalFetched });
            
            return allCustomers;
        } catch (error) {
            logger.error('Error in full customer sync:', error);
            throw error;
        }
    }

    /**
     * Calculate customer metrics
     * @param {Object} customer - Stripe customer object
     * @returns {Object} Calculated metrics
     */
    calculateCustomerMetrics(customer) {
        try {
            const metrics = {
                stripe_customer_id: customer.id,
                total_revenue: 0,
                subscription_count: 0,
                active_subscription_count: 0,
                lifetime_value: 0,
                last_payment_date: null,
                health_score: 50, // Default score
                churn_risk_score: 0.5 // Default risk
            };

            // Calculate subscription metrics
            if (customer.subscriptions && customer.subscriptions.data) {
                metrics.subscription_count = customer.subscriptions.data.length;
                
                customer.subscriptions.data.forEach(subscription => {
                    if (subscription.status === 'active') {
                        metrics.active_subscription_count++;
                    }
                });
            }

            // Calculate health score based on subscription status and payment history
            if (metrics.active_subscription_count > 0) {
                metrics.health_score = 80;
                metrics.churn_risk_score = 0.2;
            } else if (customer.delinquent) {
                metrics.health_score = 20;
                metrics.churn_risk_score = 0.9;
            } else {
                metrics.health_score = 40;
                metrics.churn_risk_score = 0.6;
            }

            return metrics;
        } catch (error) {
            logger.error('Error calculating customer metrics:', { customerId: customer.id, error });
            return null;
        }
    }
}

module.exports = new StripeCustomerService();