const logger = require('../utils/logger');

/**
 * Metadata Parser Service
 * Processes Stripe product and price metadata into structured format
 */
class MetadataParser {
    
    /**
     * Parse Stripe product metadata into database fields
     * @param {Object} stripeProduct - Stripe product object
     * @returns {Object} Parsed product data
     */
    parseProductMetadata(stripeProduct) {
        try {
            const metadata = stripeProduct.metadata || {};
            
            const parsed = {
                // Core product info
                stripe_product_id: stripeProduct.id,
                name: stripeProduct.name,
                description: stripeProduct.description || null,
                active: stripeProduct.active,
                stripe_created_at: new Date(stripeProduct.created * 1000),
                
                // Parsed metadata fields
                plan_type: this.extractPlanType(metadata),
                user_tier: this.extractUserTier(metadata),
                max_users: this.extractMaxUsers(metadata),
                ai_quota_monthly: this.extractAiQuota(metadata),
                is_enterprise: this.extractBoolean(metadata.is_enterprise),
                trial_eligible: this.extractBoolean(metadata.trial_eligible, true), // default true
                target_audience: metadata.target_audience || null,
                is_popular: this.extractBoolean(metadata.is_popular),
                is_free_plan: this.extractBoolean(metadata.is_free_plan),
                
                // Store full metadata as JSON for flexibility
                metadata: JSON.stringify(metadata)
            };
            
            logger.debug('Parsed product metadata:', {
                product_id: stripeProduct.id,
                plan_type: parsed.plan_type,
                user_tier: parsed.user_tier,
                max_users: parsed.max_users
            });
            
            return parsed;
            
        } catch (error) {
            logger.error('Error parsing product metadata:', error);
            throw error;
        }
    }
    
    /**
     * Parse Stripe price metadata into database fields
     * @param {Object} stripePrice - Stripe price object
     * @returns {Object} Parsed price data
     */
    parsePriceMetadata(stripePrice) {
        try {
            const parsed = {
                // Core price info
                stripe_price_id: stripePrice.id,
                stripe_product_id: stripePrice.product,
                unit_amount: stripePrice.unit_amount,
                currency: stripePrice.currency,
                active: stripePrice.active,
                nickname: stripePrice.nickname || null,
                lookup_key: stripePrice.lookup_key || null,
                stripe_created_at: new Date(stripePrice.created * 1000),
                
                // Recurring info
                recurring_interval: stripePrice.recurring ? stripePrice.recurring.interval : null,
                recurring_interval_count: stripePrice.recurring ? stripePrice.recurring.interval_count : null,
                trial_period_days: stripePrice.recurring ? (stripePrice.recurring.trial_period_days || 0) : 0,
                
                // Computed billing period
                billing_period: this.computeBillingPeriod(stripePrice),
                
                // Store full metadata as JSON
                metadata: JSON.stringify(stripePrice.metadata || {})
            };
            
            logger.debug('Parsed price metadata:', {
                price_id: stripePrice.id,
                billing_period: parsed.billing_period,
                lookup_key: parsed.lookup_key,
                unit_amount: parsed.unit_amount
            });
            
            return parsed;
            
        } catch (error) {
            logger.error('Error parsing price metadata:', error);
            throw error;
        }
    }
    
    /**
     * Extract plan type from metadata (handles both flat and JSON formats)
     */
    extractPlanType(metadata) {
        // Try flat format first
        const planCategory = metadata.plan_category;
        if (['PATIENT', 'CLINIC', 'SCHEDULING'].includes(planCategory)) {
            return planCategory;
        }
        
        // Try direct plan_type field
        const planType = metadata.plan_type;
        if (['PATIENT', 'CLINIC', 'SCHEDULING'].includes(planType)) {
            return planType;
        }
        
        // Try JSON encoded classification
        if (metadata.classification) {
            try {
                const classification = JSON.parse(metadata.classification);
                if (classification.plan_type && ['PATIENT', 'CLINIC', 'SCHEDULING'].includes(classification.plan_type)) {
                    return classification.plan_type;
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
        
        return null;
    }
    
    /**
     * Extract user tier from metadata
     */
    extractUserTier(metadata) {
        const userTier = metadata.user_tier;
        if (userTier && !isNaN(parseInt(userTier))) {
            return parseInt(userTier);
        }
        return null;
    }
    
    /**
     * Extract max users from metadata (handles both flat and JSON formats)
     */
    extractMaxUsers(metadata) {
        // Try flat format first
        const maxUsers = metadata.max_users;
        if (maxUsers && !isNaN(parseInt(maxUsers))) {
            return parseInt(maxUsers);
        }
        
        // Try JSON encoded subscription_limits
        if (metadata.subscription_limits) {
            try {
                const limits = JSON.parse(metadata.subscription_limits);
                if (limits.patients && limits.patients.max_patients && !isNaN(parseInt(limits.patients.max_patients))) {
                    return parseInt(limits.patients.max_patients);
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
        
        return null;
    }
    
    /**
     * Extract AI quota from metadata (handles both flat and JSON formats)
     */
    extractAiQuota(metadata) {
        // Try flat format first
        const aiQuota = metadata.ai_quota_monthly;
        if (aiQuota && !isNaN(parseInt(aiQuota))) {
            return parseInt(aiQuota);
        }
        
        // Try JSON encoded ai_quotas
        if (metadata.ai_quotas) {
            try {
                const quotas = JSON.parse(metadata.ai_quotas);
                if (quotas.tokens && quotas.tokens.monthly_limit && !isNaN(parseInt(quotas.tokens.monthly_limit))) {
                    return parseInt(quotas.tokens.monthly_limit);
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        }
        
        return null;
    }
    
    /**
     * Extract boolean value from metadata
     */
    extractBoolean(value, defaultValue = false) {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return defaultValue;
    }
    
    /**
     * Compute billing period from Stripe price object
     */
    computeBillingPeriod(stripePrice) {
        if (!stripePrice.recurring) {
            return 'one_time';
        }
        
        const interval = stripePrice.recurring.interval;
        const intervalCount = stripePrice.recurring.interval_count;
        
        if (interval === 'month' && intervalCount === 1) {
            return 'month';
        } else if (interval === 'month' && intervalCount === 6) {
            return 'semester';
        } else if (interval === 'year' && intervalCount === 1) {
            return 'year';
        } else {
            logger.warn('Unknown billing period pattern:', { interval, intervalCount });
            return 'month'; // fallback
        }
    }
    
    /**
     * Generate feature matrix from product metadata
     * @param {Object} metadata - Product metadata object
     * @returns {Object} Structured feature matrix
     */
    generateFeatureMatrix(metadata) {
        return {
            // Core Features
            features: {
                clinical_notes: this.extractBoolean(metadata.clinical_notes),
                diagnosis_support: this.extractBoolean(metadata.diagnosis_support),
                medical_imaging: this.extractBoolean(metadata.medical_imaging),
                medical_reports: this.extractBoolean(metadata.medical_reports),
                prescription_generation: this.extractBoolean(metadata.prescription_generation),
                patient_history: this.extractBoolean(metadata.patient_history),
                procedure_tracking: this.extractBoolean(metadata.procedure_tracking),
                treatment_plans: this.extractBoolean(metadata.treatment_plans),
                lab_integration: this.extractBoolean(metadata.lab_integration),
                financial_reports: this.extractBoolean(metadata.financial_reports)
            },
            
            // AI & Analytics
            ai: {
                enabled: this.extractBoolean(metadata.ai_features_enabled),
                monthly_quota: this.extractAiQuota(metadata),
                analytics_dashboard: metadata.analytics_dashboard || null
            },
            
            // Limits & Quotas
            limits: {
                max_users: this.extractMaxUsers(metadata),
                max_active_schedules: this.parseLimit(metadata.max_active_schedules),
                max_patients_per_schedule: this.parseLimit(metadata.max_patients_per_schedule)
            },
            
            // Support & Services
            support: {
                priority_support: metadata.priority_support || 'standard',
                dedicated_support: this.extractBoolean(metadata.dedicated_support),
                api_access: metadata.api_access || 'standard'
            },
            
            // Branding & Customization
            branding: {
                custom_branding: metadata.custom_branding || 'none',
                white_label_options: metadata.white_label_options || 'false',
                multi_location_support: this.extractBoolean(metadata.multi_location_support)
            }
        };
    }
    
    /**
     * Parse limit values (handles 'unlimited' string)
     */
    parseLimit(value) {
        if (value === 'unlimited') return -1;
        if (value && !isNaN(parseInt(value))) return parseInt(value);
        return null;
    }
}

// Create singleton instance
const metadataParser = new MetadataParser();

module.exports = metadataParser;