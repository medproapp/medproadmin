const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');

class StaticPageSyncService {
    constructor() {
        this.configurations = new Map(); // In-memory storage for temporary configurations
        this.configTimeout = 30 * 60 * 1000; // 30 minutes expiry
    }
    
    async validateProducts(products) {
        const issues = [];
        const summary = {
            totalProducts: 0,
            validProducts: 0,
            missingPricing: 0,
            incompleteTiers: 0
        };
        
        try {
            for (const [planType, product] of Object.entries(products)) {
                if (!product) continue;
                
                summary.totalProducts++;
                
                // Check if product is active
                if (!product.active) {
                    issues.push({
                        type: 'inactive_product',
                        planType,
                        productId: product.stripe_product_id,
                        message: `Product ${product.name} is inactive`
                    });
                    continue;
                }
                
                // Validate pricing structure
                const pricingValidation = await this.validateProductPricing(product);
                if (!pricingValidation.isValid) {
                    summary.incompleteTiers++;
                    issues.push({
                        type: 'incomplete_pricing',
                        planType,
                        productId: product.stripe_product_id,
                        message: `Product ${product.name} has incomplete pricing`,
                        details: pricingValidation.issues
                    });
                    continue;
                }
                
                summary.validProducts++;
            }
            
            const isValid = issues.length === 0 && summary.validProducts >= 2;
            
            return {
                isValid,
                issues,
                summary
            };
            
        } catch (error) {
            logger.error('Product validation error', { error: error.message });
            throw error;
        }
    }
    
    async validateProductPricing(product) {
        try {
            // Required user tiers for static page
            const requiredTiers = [1, 5, 10, 20, 50];
            const issues = [];
            
            // Get product prices from database
            const prices = await this.getProductPrices(product.stripe_product_id);
            
            // Check if we have pricing for all required tiers
            for (const tier of requiredTiers) {
                const tierPrices = prices.filter(price => {
                    // Try to extract user count from price metadata or name
                    const userCount = this.extractUserCountFromPrice(price);
                    return userCount === tier;
                });
                
                if (tierPrices.length === 0) {
                    issues.push(`Missing pricing for ${tier} user${tier > 1 ? 's' : ''}`);
                }
            }
            
            return {
                isValid: issues.length === 0,
                issues,
                availableTiers: prices.map(p => this.extractUserCountFromPrice(p)).filter(Boolean)
            };
            
        } catch (error) {
            logger.error('Product pricing validation error', { 
                productId: product.stripe_product_id,
                error: error.message 
            });
            return {
                isValid: false,
                issues: ['Failed to validate pricing structure']
            };
        }
    }
    
    async getProductPrices(productId) {
        try {
            const query = `
                SELECT id, stripe_price_id, nickname, unit_amount, currency, 
                       recurring_interval, recurring_interval_count, metadata, active
                FROM product_prices 
                WHERE stripe_product_id = ? AND active = 1
                ORDER BY unit_amount ASC
            `;
            
            return await executeQuery(adminPool, query, [productId]);
            
        } catch (error) {
            logger.error('Failed to get product prices', { productId, error: error.message });
            throw error;
        }
    }
    
    extractUserCountFromPrice(price) {
        // Try to extract user count from price metadata
        if (price.metadata) {
            try {
                const metadata = typeof price.metadata === 'string' ? 
                    JSON.parse(price.metadata) : price.metadata;
                    
                if (metadata.max_users) {
                    return parseInt(metadata.max_users);
                }
                if (metadata.user_count) {
                    return parseInt(metadata.user_count);
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
        
        // Try to extract from nickname
        if (price.nickname) {
            const match = price.nickname.match(/(\d+)\s*(user|usuário)/i);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        return null;
    }
    
    async extractPricingData(products) {
        const pricingData = {};
        
        try {
            for (const [planType, product] of Object.entries(products)) {
                if (!product) continue;
                
                const prices = await this.getProductPrices(product.stripe_product_id);
                const tierPricing = {};
                
                // Extract pricing for each tier
                const requiredTiers = [1, 5, 10, 20, 50];
                
                for (const tier of requiredTiers) {
                    const tierPrice = prices.find(price => {
                        const userCount = this.extractUserCountFromPrice(price);
                        return userCount === tier;
                    });
                    
                    if (tierPrice) {
                        tierPricing[`${tier}Users`] = {
                            monthly: tierPrice.unit_amount / 100, // Convert cents to currency
                            annual: (tierPrice.unit_amount * 12) / 100,
                            perUser: tierPrice.unit_amount / (100 * tier),
                            currency: tierPrice.currency || 'brl',
                            priceId: tierPrice.stripe_price_id
                        };
                    } else {
                        // Handle missing pricing
                        tierPricing[`${tier}Users`] = {
                            monthly: 0,
                            annual: 0,
                            perUser: 0,
                            currency: 'brl',
                            priceId: null,
                            missing: true
                        };
                    }
                }
                
                pricingData[planType] = {
                    product: {
                        id: product.stripe_product_id,
                        name: product.name,
                        description: product.description
                    },
                    pricing: tierPricing,
                    features: this.extractProductFeatures(product)
                };
            }
            
            return pricingData;
            
        } catch (error) {
            logger.error('Pricing data extraction error', { error: error.message });
            throw error;
        }
    }
    
    extractProductFeatures(product) {
        // Extract features from product metadata
        const features = [];
        
        try {
            if (product.metadata) {
                const metadata = typeof product.metadata === 'string' ? 
                    JSON.parse(product.metadata) : product.metadata;
                
                // Look for features in various metadata fields
                if (metadata.features && Array.isArray(metadata.features)) {
                    features.push(...metadata.features);
                }
                
                if (metadata.description_features) {
                    features.push(...metadata.description_features.split('\n'));
                }
            }
            
            // Default features based on plan type
            if (features.length === 0) {
                if (product.plan_type === 'SCHEDULING' || product.name.toLowerCase().includes('agendamento')) {
                    features.push(
                        'Pacientes e Profissionais',
                        'Cadastro de Pacientes',
                        'Agendamento pelo Médico/Assistente',
                        'Agendamento pelo Paciente'
                    );
                } else if (product.plan_type === 'CLINIC' || product.name.toLowerCase().includes('clínica')) {
                    features.push(
                        'Todas as funções do plano Agendamento +',
                        'Prontuário Eletrônico',
                        'Gravação de Encontros',
                        'Inteligência Artificial'
                    );
                }
            }
            
        } catch (error) {
            logger.warn('Failed to extract product features', { 
                productId: product.stripe_product_id,
                error: error.message 
            });
        }
        
        return features;
    }
    
    async storeConfiguration(configurationId, config) {
        // Store configuration with timeout
        this.configurations.set(configurationId, config);
        
        // Set expiry timeout
        setTimeout(() => {
            this.configurations.delete(configurationId);
        }, this.configTimeout);
        
        logger.info('Configuration stored', { configurationId, expiresIn: this.configTimeout });
    }
    
    async getConfiguration(configurationId) {
        return this.configurations.get(configurationId) || null;
    }
    
    async removeConfiguration(configurationId) {
        return this.configurations.delete(configurationId);
    }
    
    async logSyncOperation(operation) {
        try {
            // Store sync operation in database for audit trail
            const query = `
                INSERT INTO static_sync_history 
                (operation_type, configuration_id, applied_by, applied_at, selected_products, backup_path, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const metadata = JSON.stringify({
                type: operation.type || 'sync',
                backupPath: operation.backupPath,
                restoredAt: operation.restoredAt,
                backupId: operation.backupId
            });
            
            await executeTransaction(adminPool, async (connection) => {
                const query = `
                    INSERT INTO static_sync_history 
                    (operation_type, configuration_id, applied_by, applied_at, selected_products, backup_path, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                
                await connection.execute(query, [
                    operation.type || 'sync',
                    operation.configurationId || null,
                    operation.appliedBy || operation.restoredBy,
                    operation.appliedAt || operation.restoredAt || new Date(),
                    JSON.stringify(operation.selectedProducts || {}),
                    operation.backupPath || null,
                    metadata
                ]);
            });
            
            logger.info('Sync operation logged', { operation: operation.type || 'sync' });
            
        } catch (error) {
            logger.error('Failed to log sync operation', { error: error.message });
            // Don't throw - logging failure shouldn't break the sync
        }
    }
    
    async getSyncHistory(limit = 50) {
        try {
            const query = `
                SELECT operation_type, configuration_id, applied_by, applied_at, 
                       selected_products, backup_path, metadata,
                       created_at
                FROM static_sync_history 
                ORDER BY applied_at DESC 
                LIMIT ?
            `;
            
            const results = await executeQuery(adminPool, query, [limit]);
            
            return results.map(row => ({
                ...row,
                selected_products: this.parseJSON(row.selected_products),
                metadata: this.parseJSON(row.metadata)
            }));
            
        } catch (error) {
            logger.error('Failed to get sync history', { error: error.message });
            return [];
        }
    }
    
    parseJSON(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            return null;
        }
    }
}

module.exports = StaticPageSyncService;