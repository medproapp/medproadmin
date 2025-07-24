-- Migrate existing recurring_interval data to billing_period column

-- Update billing_period based on existing recurring_interval and recurring_interval_count
UPDATE product_prices 
SET billing_period = CASE 
    WHEN recurring_interval = 'month' AND recurring_interval_count = 1 THEN 'month'
    WHEN recurring_interval = 'month' AND recurring_interval_count = 6 THEN 'semester'  
    WHEN recurring_interval = 'year' AND recurring_interval_count = 1 THEN 'year'
    WHEN recurring_interval IS NULL THEN 'one_time'
    ELSE 'month' -- fallback
END
WHERE billing_period IS NULL;

-- Show migration results
SELECT 
    recurring_interval,
    recurring_interval_count,
    billing_period,
    COUNT(*) as count
FROM product_prices 
GROUP BY recurring_interval, recurring_interval_count, billing_period
ORDER BY count DESC;