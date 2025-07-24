-- Churn Prediction Schema
-- Phase 4: Advanced Analytics - Predictive Churn Analysis

-- Churn predictions table
CREATE TABLE churn_predictions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    prediction_date DATE NOT NULL,
    
    -- Probability scores (0.00 to 1.00)
    churn_probability_30d DECIMAL(5,3) NOT NULL DEFAULT 0.000,
    churn_probability_60d DECIMAL(5,3) NOT NULL DEFAULT 0.000,
    churn_probability_90d DECIMAL(5,3) NOT NULL DEFAULT 0.000,
    
    -- Risk classification
    risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    
    -- Analysis details (JSON)
    contributing_factors JSON, -- Array of factor identifiers
    recommended_actions JSON, -- Array of recommended actions
    
    -- Model metadata
    confidence_score DECIMAL(5,3) DEFAULT 0.500, -- Model confidence (0-1)
    model_version VARCHAR(10) DEFAULT '1.0',
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Constraints and indexes
    UNIQUE KEY unique_customer_date (stripe_customer_id, prediction_date),
    INDEX idx_risk_level (risk_level),
    INDEX idx_prediction_date (prediction_date),
    INDEX idx_created_at (created_at),
    INDEX idx_30d_probability (churn_probability_30d),
    
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Churn events tracking (actual churns for model validation)
CREATE TABLE churn_events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    churn_date DATE NOT NULL,
    churn_type ENUM('subscription_canceled', 'account_closed', 'payment_failed', 'voluntary', 'involuntary') NOT NULL,
    
    -- Prediction accuracy tracking
    had_prediction BOOLEAN DEFAULT FALSE,
    predicted_probability DECIMAL(5,3), -- What we predicted
    predicted_risk_level ENUM('low', 'medium', 'high', 'critical'),
    days_from_prediction INT, -- How many days from prediction to actual churn
    
    -- Churn details
    final_ltv DECIMAL(10,2) DEFAULT 0,
    subscription_count_at_churn INT DEFAULT 0,
    reason_category VARCHAR(50), -- categorized reason
    reason_details TEXT,
    
    -- Recovery attempts
    retention_attempts JSON, -- Array of retention actions taken
    recovery_successful BOOLEAN DEFAULT FALSE,
    recovery_date DATE NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_churn_date (churn_date),
    INDEX idx_churn_type (churn_type),
    INDEX idx_had_prediction (had_prediction),
    INDEX idx_risk_level (predicted_risk_level),
    
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Retention actions tracking
CREATE TABLE retention_actions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    churn_prediction_id INT,
    
    -- Action details
    action_type ENUM('email_campaign', 'phone_call', 'discount_offer', 'feature_education', 'account_review', 'manager_escalation', 'retention_offer') NOT NULL,
    action_date DATE NOT NULL,
    
    -- Action metadata
    campaign_id VARCHAR(100), -- For tracking email campaigns
    offer_details JSON, -- Discount/offer details
    contact_method VARCHAR(50), -- email, phone, in-app, etc.
    
    -- Results
    customer_response ENUM('no_response', 'positive', 'negative', 'neutral') DEFAULT 'no_response',
    action_successful BOOLEAN DEFAULT FALSE,
    success_metrics JSON, -- e.g., subscription renewed, payment updated
    
    -- Follow-up
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    
    -- Audit
    initiated_by VARCHAR(255), -- admin email or 'system'
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_customer (stripe_customer_id),
    INDEX idx_prediction (churn_prediction_id),
    INDEX idx_action_date (action_date),
    INDEX idx_action_type (action_type),
    INDEX idx_success (action_successful),
    
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE,
    FOREIGN KEY (churn_prediction_id) REFERENCES churn_predictions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Model performance tracking
CREATE TABLE churn_model_performance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    model_version VARCHAR(10) NOT NULL,
    evaluation_date DATE NOT NULL,
    
    -- Performance metrics
    total_predictions INT DEFAULT 0,
    total_actual_churns INT DEFAULT 0,
    
    -- Accuracy by time period
    accuracy_30d DECIMAL(5,3), -- What % of 30-day predictions were correct
    accuracy_60d DECIMAL(5,3),
    accuracy_90d DECIMAL(5,3),
    
    -- Precision and recall by risk level
    precision_critical DECIMAL(5,3),
    recall_critical DECIMAL(5,3),
    precision_high DECIMAL(5,3),
    recall_high DECIMAL(5,3),
    precision_medium DECIMAL(5,3),
    recall_medium DECIMAL(5,3),
    
    -- False positive/negative rates
    false_positive_rate DECIMAL(5,3),
    false_negative_rate DECIMAL(5,3),
    
    -- Model statistics
    avg_confidence DECIMAL(5,3),
    predictions_above_threshold INT, -- High-risk predictions
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_model_date (model_version, evaluation_date),
    INDEX idx_evaluation_date (evaluation_date),
    INDEX idx_model_version (model_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Daily churn analytics summary
CREATE TABLE churn_analytics_daily (
    id INT PRIMARY KEY AUTO_INCREMENT,
    analysis_date DATE NOT NULL,
    
    -- Daily prediction counts
    new_predictions INT DEFAULT 0,
    updated_predictions INT DEFAULT 0,
    critical_risk_customers INT DEFAULT 0,
    high_risk_customers INT DEFAULT 0,
    medium_risk_customers INT DEFAULT 0,
    low_risk_customers INT DEFAULT 0,
    
    -- Churn events
    actual_churns_today INT DEFAULT 0,
    predicted_churns_today INT DEFAULT 0, -- Those we predicted would churn today
    
    -- Retention actions
    retention_actions_taken INT DEFAULT 0,
    successful_retentions INT DEFAULT 0,
    
    -- Health metrics
    avg_churn_probability DECIMAL(5,3),
    avg_model_confidence DECIMAL(5,3),
    customers_analyzed INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_analysis_date (analysis_date),
    INDEX idx_analysis_date (analysis_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert initial model performance tracking record
INSERT INTO churn_model_performance (
    model_version, evaluation_date, 
    total_predictions, avg_confidence
) VALUES (
    '1.0', CURDATE(), 0, 0.500
);

-- Create additional indexes for performance
CREATE INDEX idx_customers_churn_risk ON customers(stripe_customer_id, delinquent, deleted);
CREATE INDEX idx_customer_metrics_latest ON customer_metrics(stripe_customer_id, metric_date);
CREATE INDEX idx_subscriptions_status ON customer_subscriptions(stripe_customer_id, status, cancel_at_period_end);