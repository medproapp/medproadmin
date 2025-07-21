// Validation Utilities for Product Catalog

class ProductValidator {
    constructor() {
        // Define validation rules
        this.rules = {
            product: {
                name: {
                    required: true,
                    minLength: 3,
                    maxLength: 255,
                    pattern: /^[a-zA-Z0-9\s\-_\.]+$/
                },
                description: {
                    maxLength: 1000
                },
                plan_type: {
                    required: true,
                    enum: ['CLINIC', 'SCHEDULING']
                },
                user_tier: {
                    required: true,
                    enum: [1, 5, 10, 20, 50]
                }
            },
            metadata: {
                qtypatients: {
                    type: 'number',
                    min: 0,
                    max: 100000
                },
                ai_monthly_tokens: {
                    type: 'number',
                    min: 0,
                    max: 10000000
                },
                ai_daily_tokens: {
                    type: 'number',
                    min: 0,
                    max: 1000000
                },
                ai_audio_minutes: {
                    type: 'number',
                    min: 0,
                    max: 10000
                }
            },
            price: {
                unit_amount: {
                    required: true,
                    type: 'number',
                    min: 100, // Minimum R$ 1.00
                    max: 10000000 // Maximum R$ 100,000.00
                },
                currency: {
                    required: true,
                    enum: ['BRL', 'USD']
                },
                billing_period: {
                    required: true,
                    enum: ['month', 'semester', 'year', 'one_time']
                },
                trial_period_days: {
                    type: 'number',
                    min: 0,
                    max: 90
                }
            }
        };
    }
    
    // Validate product data
    validateProduct(data) {
        const errors = {};
        
        // Validate name
        if (!data.name || data.name.trim() === '') {
            errors.name = 'Product name is required';
        } else if (data.name.length < 3) {
            errors.name = 'Product name must be at least 3 characters';
        } else if (data.name.length > 255) {
            errors.name = 'Product name must be less than 255 characters';
        }
        
        // Validate plan_type
        if (!data.plan_type) {
            errors.plan_type = 'Plan type is required';
        } else if (!['CLINIC', 'SCHEDULING'].includes(data.plan_type)) {
            errors.plan_type = 'Invalid plan type';
        }
        
        // Validate user_tier
        if (!data.user_tier) {
            errors.user_tier = 'User tier is required';
        } else if (![1, 5, 10, 20, 50].includes(parseInt(data.user_tier))) {
            errors.user_tier = 'Invalid user tier';
        }
        
        // Check for v3 naming
        if (data.name && !data.name.toLowerCase().includes('v3')) {
            if (!errors.name) errors.name = [];
            if (Array.isArray(errors.name)) {
                errors.name.push('Warning: Product name should include "v3" for version 3');
            }
        }
        
        return {
            valid: Object.keys(errors).length === 0,
            errors
        };
    }
    
    // Validate metadata
    validateMetadata(metadata) {
        const errors = {};
        const warnings = [];
        
        // Check required fields based on plan type
        if (metadata.classification) {
            const planType = metadata.classification.plan_type;
            
            // Validate patient limits
            if (planType === 'CLINIC' && !metadata.subscription_limits?.patients?.max_patients) {
                warnings.push('Clinic plans should specify patient limits');
            }
            
            // Validate AI quotas
            if (!metadata.ai_quotas?.tokens?.monthly_limit) {
                warnings.push('AI monthly token limit not specified');
            }
            
            if (metadata.ai_quotas?.tokens?.daily_limit > metadata.ai_quotas?.tokens?.monthly_limit) {
                errors.ai_quotas = 'Daily token limit cannot exceed monthly limit';
            }
        }
        
        // Validate user limits
        if (metadata.subscription_limits?.users) {
            const users = metadata.subscription_limits.users;
            const totalUsers = (users.practitioners || 0) + (users.assistants || 0) + (users.admins || 0);
            
            if (metadata.classification?.user_tier && totalUsers > metadata.classification.user_tier) {
                errors.user_limits = `Total users (${totalUsers}) exceeds plan tier (${metadata.classification.user_tier})`;
            }
        }
        
        // Validate storage limits
        if (metadata.subscription_limits?.storage) {
            const storage = metadata.subscription_limits.storage;
            if (storage.documents_gb < 0 || storage.images_gb < 0) {
                errors.storage = 'Storage limits cannot be negative';
            }
        }
        
        return {
            valid: Object.keys(errors).length === 0,
            errors,
            warnings
        };
    }
    
    // Validate price data
    validatePrice(data) {
        const errors = {};
        
        // Validate amount
        if (!data.unit_amount || data.unit_amount < 100) {
            errors.unit_amount = 'Price must be at least R$ 1.00';
        }
        
        // Validate currency
        if (!data.currency) {
            errors.currency = 'Currency is required';
        } else if (!['BRL', 'USD'].includes(data.currency)) {
            errors.currency = 'Invalid currency';
        }
        
        // Validate billing period
        if (!data.billing_period) {
            errors.billing_period = 'Billing period is required';
        }
        
        // Validate trial period
        if (data.trial_period_days && data.trial_period_days > 90) {
            errors.trial_period_days = 'Trial period cannot exceed 90 days';
        }
        
        return {
            valid: Object.keys(errors).length === 0,
            errors
        };
    }
    
    // Check for issues in product
    detectProductIssues(product) {
        const issues = [];
        
        // Check for v3 naming
        if (!product.name.toLowerCase().includes('v3') && 
            !product.stripe_product_id.includes('v3')) {
            issues.push({
                type: 'naming',
                severity: 'high',
                message: 'Missing v3 prefix in product name'
            });
        }
        
        // Check for missing prices
        const expectedPrices = ['month', 'semester', 'year'];
        const existingPeriods = product.prices?.map(p => p.billing_period) || [];
        const missingPeriods = expectedPrices.filter(p => !existingPeriods.includes(p));
        
        if (missingPeriods.length > 0) {
            issues.push({
                type: 'pricing',
                severity: 'medium',
                message: `Missing prices for: ${missingPeriods.join(', ')}`
            });
        }
        
        // Check for incorrect lookup keys
        product.prices?.forEach(price => {
            if (price.lookup_key && !price.lookup_key.startsWith('v3_')) {
                issues.push({
                    type: 'lookup_key',
                    severity: 'high',
                    message: `Invalid lookup key: ${price.lookup_key}`
                });
            }
        });
        
        // Check for missing AI metadata
        if (!product.metadata?.ai_monthly_tokens) {
            issues.push({
                type: 'metadata',
                severity: 'medium',
                message: 'Missing AI quota configuration'
            });
        }
        
        // Check sync status
        if (product.sync_status === 'error') {
            issues.push({
                type: 'sync',
                severity: 'high',
                message: 'Sync error with Stripe'
            });
        }
        
        return issues;
    }
    
    // Validate bulk operation
    validateBulkOperation(productIds, operation) {
        const errors = [];
        
        if (!productIds || productIds.length === 0) {
            errors.push('No products selected');
        }
        
        if (productIds.length > 100) {
            errors.push('Cannot process more than 100 products at once');
        }
        
        if (operation === 'delete' && productIds.length > 10) {
            errors.push('Cannot delete more than 10 products at once for safety');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    // Generate lookup key
    generateLookupKey(productData, billingPeriod) {
        const parts = [
            'v3',
            productData.plan_type.toLowerCase(),
            `${productData.user_tier}users`,
            billingPeriod
        ];
        
        return parts.join('_');
    }
    
    // Validate lookup key format
    validateLookupKey(key) {
        const pattern = /^v3_[a-z]+_\d+users_(month|semester|year)$/;
        return pattern.test(key);
    }
}

// Create global instance
window.productValidator = new ProductValidator();