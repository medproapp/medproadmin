const Stripe = require('stripe');
const logger = require('../utils/logger');

class StripeService {
    constructor() {
        const apiKey = process.env.STRIPE_SECRET_KEY;
        
        if (!apiKey || apiKey.includes('test')) {
            logger.warn('Stripe API key not configured or using test key');
        }
        
        this.stripe = Stripe(apiKey || 'sk_test_placeholder');
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    }
    
    // Product Methods
    async createProduct(data) {
        try {
            const productData = {
                name: data.name,
                description: data.description,
                metadata: {
                    plan_type: data.plan_type || '',
                    user_tier: data.user_tier || '',
                    ...data.metadata
                },
                active: data.active !== false
            };
            
            const product = await this.stripe.products.create(productData);
            logger.info(`Created Stripe product: ${product.id}`);
            return product;
        } catch (error) {
            logger.error('Failed to create Stripe product:', error);
            throw error;
        }
    }
    
    async updateProduct(productId, data) {
        try {
            const updateData = {};
            
            if (data.name !== undefined) updateData.name = data.name;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.active !== undefined) updateData.active = data.active;
            if (data.metadata !== undefined) {
                updateData.metadata = {
                    plan_type: data.plan_type || '',
                    user_tier: data.user_tier || '',
                    ...data.metadata
                };
            }
            
            const product = await this.stripe.products.update(productId, updateData);
            logger.info(`Updated Stripe product: ${product.id}`);
            return product;
        } catch (error) {
            logger.error(`Failed to update Stripe product ${productId}:`, error);
            throw error;
        }
    }
    
    async getProduct(productId) {
        try {
            const product = await this.stripe.products.retrieve(productId);
            return product;
        } catch (error) {
            logger.error(`Failed to retrieve Stripe product ${productId}:`, error);
            throw error;
        }
    }
    
    async listProducts(params = {}) {
        try {
            const listParams = {
                limit: params.limit || 100,
                active: params.active,
                expand: ['data.default_price']
            };
            
            if (params.starting_after) {
                listParams.starting_after = params.starting_after;
            }
            
            const products = await this.stripe.products.list(listParams);
            return products;
        } catch (error) {
            logger.error('Failed to list Stripe products:', error);
            throw error;
        }
    }
    
    async deleteProduct(productId) {
        try {
            // Stripe doesn't actually delete products, it archives them
            const product = await this.stripe.products.update(productId, {
                active: false
            });
            logger.info(`Archived Stripe product: ${product.id}`);
            return product;
        } catch (error) {
            logger.error(`Failed to delete Stripe product ${productId}:`, error);
            throw error;
        }
    }
    
    // Price Methods
    async createPrice(data) {
        try {
            const priceData = {
                product: data.product_id,
                currency: data.currency || 'brl',
                unit_amount: Math.round(data.unit_amount * 100), // Convert to cents
                nickname: data.nickname,
                metadata: data.metadata || {}
            };
            
            if (data.recurring) {
                priceData.recurring = {
                    interval: data.recurring.interval,
                    interval_count: data.recurring.interval_count || 1
                };
            }
            
            const price = await this.stripe.prices.create(priceData);
            logger.info(`Created Stripe price: ${price.id}`);
            return price;
        } catch (error) {
            logger.error('Failed to create Stripe price:', error);
            throw error;
        }
    }
    
    async updatePrice(priceId, data) {
        try {
            const updateData = {};
            
            if (data.nickname !== undefined) updateData.nickname = data.nickname;
            if (data.metadata !== undefined) updateData.metadata = data.metadata;
            if (data.active !== undefined) updateData.active = data.active;
            
            const price = await this.stripe.prices.update(priceId, updateData);
            logger.info(`Updated Stripe price: ${price.id}`);
            return price;
        } catch (error) {
            logger.error(`Failed to update Stripe price ${priceId}:`, error);
            throw error;
        }
    }
    
    async getPrice(priceId) {
        try {
            const price = await this.stripe.prices.retrieve(priceId, {
                expand: ['product']
            });
            return price;
        } catch (error) {
            logger.error(`Failed to retrieve Stripe price ${priceId}:`, error);
            throw error;
        }
    }
    
    async listPrices(params = {}) {
        try {
            const listParams = {
                limit: params.limit || 100,
                active: params.active,
                expand: ['data.product']
            };
            
            if (params.product) {
                listParams.product = params.product;
            }
            
            if (params.starting_after) {
                listParams.starting_after = params.starting_after;
            }
            
            const prices = await this.stripe.prices.list(listParams);
            return prices;
        } catch (error) {
            logger.error('Failed to list Stripe prices:', error);
            throw error;
        }
    }
    
    async listPricesForProduct(productId) {
        try {
            const prices = await this.stripe.prices.list({
                product: productId,
                active: true,
                expand: ['data.product']
            });
            return prices.data;
        } catch (error) {
            logger.error(`Failed to list prices for product ${productId}:`, error);
            throw error;
        }
    }
    
    // Webhook Methods
    constructWebhookEvent(payload, signature) {
        try {
            return this.stripe.webhooks.constructEvent(
                payload,
                signature,
                this.webhookSecret
            );
        } catch (error) {
            logger.error('Failed to construct webhook event:', error);
            throw error;
        }
    }
    
    // Sync Methods
    async syncAllProducts() {
        try {
            const products = [];
            let hasMore = true;
            let startingAfter = null;
            
            while (hasMore) {
                const batch = await this.listProducts({
                    limit: 100,
                    starting_after: startingAfter
                });
                
                products.push(...batch.data);
                hasMore = batch.has_more;
                
                if (hasMore && batch.data.length > 0) {
                    startingAfter = batch.data[batch.data.length - 1].id;
                }
            }
            
            logger.info(`Synced ${products.length} products from Stripe`);
            return products;
        } catch (error) {
            logger.error('Failed to sync all products:', error);
            throw error;
        }
    }
    
    async syncAllPrices() {
        try {
            const prices = [];
            let hasMore = true;
            let startingAfter = null;
            
            while (hasMore) {
                const batch = await this.listPrices({
                    limit: 100,
                    starting_after: startingAfter
                });
                
                prices.push(...batch.data);
                hasMore = batch.has_more;
                
                if (hasMore && batch.data.length > 0) {
                    startingAfter = batch.data[batch.data.length - 1].id;
                }
            }
            
            logger.info(`Synced ${prices.length} prices from Stripe`);
            return prices;
        } catch (error) {
            logger.error('Failed to sync all prices:', error);
            throw error;
        }
    }
    
    // Utility Methods
    formatPrice(amount, currency = 'brl') {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount / 100);
    }
    
    async validateApiKey() {
        try {
            // Try to retrieve account details to validate the API key
            const account = await this.stripe.accounts.retrieve();
            const apiKey = process.env.STRIPE_SECRET_KEY;
            return {
                valid: true,
                mode: apiKey && apiKey.startsWith('sk_test_') ? 'test' : 'live',
                account: account.id
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
const stripeService = new StripeService();

module.exports = stripeService;