-- Add missing metadata columns to product_prices table
ALTER TABLE product_prices 
ADD COLUMN billing_period ENUM('month', 'semester', 'year', 'one_time') AFTER recurring_interval_count,
ADD COLUMN lookup_key VARCHAR(255) AFTER billing_period,
ADD COLUMN trial_period_days INT DEFAULT 0 AFTER lookup_key;

-- Add enhanced metadata columns to product_catalog table
ALTER TABLE product_catalog
ADD COLUMN max_users INT AFTER user_tier,
ADD COLUMN ai_quota_monthly INT AFTER max_users,
ADD COLUMN is_enterprise BOOLEAN DEFAULT FALSE AFTER ai_quota_monthly,
ADD COLUMN trial_eligible BOOLEAN DEFAULT TRUE AFTER is_enterprise,
ADD COLUMN target_audience VARCHAR(100) AFTER trial_eligible,
ADD COLUMN is_popular BOOLEAN DEFAULT FALSE AFTER target_audience,
ADD COLUMN is_free_plan BOOLEAN DEFAULT FALSE AFTER is_popular;

-- Add indexes for new columns
ALTER TABLE product_prices 
ADD INDEX idx_billing_period (billing_period),
ADD INDEX idx_lookup_key (lookup_key);

ALTER TABLE product_catalog
ADD INDEX idx_max_users (max_users),
ADD INDEX idx_is_enterprise (is_enterprise),
ADD INDEX idx_trial_eligible (trial_eligible);