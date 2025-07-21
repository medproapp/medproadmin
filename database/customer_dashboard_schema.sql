-- MedPro Admin - Customer Dashboard Schema Addition
-- Add customer-related tables to existing medpro_admin database

USE medpro_admin;

-- Customer data from Stripe
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    description TEXT,
    phone VARCHAR(50),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(100),
    address_postal_code VARCHAR(20),
    address_country VARCHAR(2),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    stripe_created_at TIMESTAMP NULL,
    currency VARCHAR(3),
    deleted BOOLEAN DEFAULT FALSE,
    delinquent BOOLEAN DEFAULT FALSE,
    balance INT DEFAULT 0,
    last_sync_at TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_created (stripe_created_at),
    INDEX idx_sync (last_sync_at),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer subscriptions
CREATE TABLE customer_subscriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_price_id VARCHAR(255),
    stripe_product_id VARCHAR(255),
    status VARCHAR(50), -- active, canceled, past_due, etc.
    current_period_start TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP NULL,
    ended_at TIMESTAMP NULL,
    trial_start TIMESTAMP NULL,
    trial_end TIMESTAMP NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customer (stripe_customer_id),
    INDEX idx_status (status),
    INDEX idx_product (stripe_product_id),
    INDEX idx_subscription_id (stripe_subscription_id),
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer metrics and analytics
CREATE TABLE customer_metrics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    metric_date DATE NOT NULL,
    total_revenue INT DEFAULT 0,
    subscription_count INT DEFAULT 0,
    active_subscription_count INT DEFAULT 0,
    lifetime_value INT DEFAULT 0,
    average_order_value INT DEFAULT 0,
    last_payment_date TIMESTAMP NULL,
    churn_risk_score DECIMAL(3,2), -- 0.00 to 1.00
    health_score INT, -- 0 to 100
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_customer_date (stripe_customer_id, metric_date),
    INDEX idx_date (metric_date),
    INDEX idx_health_score (health_score),
    INDEX idx_churn_risk (churn_risk_score),
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer activity log
CREATE TABLE customer_activity (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50), -- subscription_created, payment_succeeded, etc.
    activity_date TIMESTAMP NULL,
    description TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_date (stripe_customer_id, activity_date),
    INDEX idx_type (activity_type),
    INDEX idx_activity_date (activity_date),
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aggregated analytics data
CREATE TABLE customer_analytics_daily (
    id INT PRIMARY KEY AUTO_INCREMENT,
    date DATE NOT NULL,
    new_customers INT DEFAULT 0,
    churned_customers INT DEFAULT 0,
    total_active_customers INT DEFAULT 0,
    total_revenue INT DEFAULT 0,
    average_revenue_per_customer INT DEFAULT 0,
    new_subscriptions INT DEFAULT 0,
    canceled_subscriptions INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_date (date),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Update admin permissions to include customer management
ALTER TABLE admin_permissions 
ADD COLUMN can_view_customers BOOLEAN DEFAULT FALSE AFTER can_view_audit,
ADD COLUMN can_manage_customers BOOLEAN DEFAULT FALSE AFTER can_view_customers,
ADD COLUMN can_view_analytics BOOLEAN DEFAULT FALSE AFTER can_manage_customers;

-- Update audit log to support customer actions
ALTER TABLE admin_audit_log 
MODIFY COLUMN entity_type ENUM('product', 'price', 'metadata', 'sync', 'stripe', 'customer', 'analytics') NOT NULL;

-- Insert sample customer analytics data for testing (optional - for demo purposes)
-- This would typically be populated by the sync service
INSERT INTO customer_analytics_daily (date, new_customers, total_active_customers, total_revenue) VALUES
(CURDATE() - INTERVAL 30 DAY, 5, 120, 15000000), -- 30 days ago
(CURDATE() - INTERVAL 15 DAY, 3, 123, 15300000), -- 15 days ago
(CURDATE() - INTERVAL 7 DAY, 2, 125, 15500000),  -- 7 days ago
(CURDATE() - INTERVAL 1 DAY, 1, 126, 15600000),  -- Yesterday
(CURDATE(), 0, 126, 15600000);                   -- Today