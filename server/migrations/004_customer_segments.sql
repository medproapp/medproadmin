-- Customer Segmentation Schema
-- Phase 4: Advanced Features

-- Customer segments table
CREATE TABLE customer_segments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    criteria JSON NOT NULL, -- Segmentation criteria in JSON format
    color VARCHAR(7) DEFAULT '#007bff', -- Hex color for UI display
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE, -- System-generated vs user-created segments
    created_by VARCHAR(255), -- Admin user who created the segment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_active (is_active),
    INDEX idx_system (is_system)
);

-- Customer segment assignments
CREATE TABLE customer_segment_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_customer_id VARCHAR(255) NOT NULL,
    segment_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assignment_score DECIMAL(5,3) DEFAULT 1.000, -- How well the customer fits this segment (0-1)
    metadata JSON, -- Additional assignment metadata
    
    UNIQUE KEY unique_customer_segment (stripe_customer_id, segment_id),
    INDEX idx_customer (stripe_customer_id),
    INDEX idx_segment (segment_id),
    INDEX idx_assigned_at (assigned_at),
    INDEX idx_score (assignment_score),
    
    FOREIGN KEY (stripe_customer_id) REFERENCES customers(stripe_customer_id) ON DELETE CASCADE,
    FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE CASCADE
);

-- Segment analytics and performance tracking
CREATE TABLE segment_analytics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    segment_id INT NOT NULL,
    metric_date DATE NOT NULL,
    customer_count INT DEFAULT 0,
    avg_ltv DECIMAL(10,2) DEFAULT 0,
    avg_health_score DECIMAL(5,2) DEFAULT 0,
    avg_churn_risk DECIMAL(5,3) DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    new_customers INT DEFAULT 0,
    churned_customers INT DEFAULT 0,
    conversion_rate DECIMAL(5,3) DEFAULT 0, -- For acquisition segments
    
    UNIQUE KEY unique_segment_date (segment_id, metric_date),
    INDEX idx_date (metric_date),
    INDEX idx_segment (segment_id),
    
    FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE CASCADE
);

-- Insert default system segments
INSERT INTO customer_segments (name, description, criteria, color, is_system, created_by) VALUES
('High Value', 'Customers with high lifetime value (>$1000)', 
 '{"ltv_min": 100000, "subscription_count_min": 1}', '#28a745', true, 'system'),

('At Risk', 'Customers with high churn probability (>60%)', 
 '{"churn_risk_min": 0.6, "health_score_max": 60}', '#dc3545', true, 'system'),

('New Customers', 'Customers acquired in the last 30 days', 
 '{"days_since_created_max": 30}', '#17a2b8', true, 'system'),

('Power Users', 'Active customers with multiple subscriptions', 
 '{"subscription_count_min": 2, "status": "active"}', '#6f42c1', true, 'system'),

('Low Engagement', 'Customers with low health scores but still active', 
 '{"health_score_max": 40, "health_score_min": 20, "status": "active"}', '#ffc107', true, 'system'),

('Enterprise', 'High-value customers with premium subscriptions', 
 '{"ltv_min": 500000, "subscription_count_min": 3}', '#fd7e14', true, 'system');

-- Create indexes for performance  
CREATE INDEX idx_customers_stripe_created ON customers(stripe_created_at);
CREATE INDEX idx_customers_deleted_delinquent ON customers(deleted, delinquent);