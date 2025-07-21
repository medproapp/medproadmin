USE medpro_admin;

-- Create views for common queries
CREATE OR REPLACE VIEW v_active_products_with_prices AS
SELECT 
    p.*,
    COUNT(DISTINCT pr.id) as price_count,
    MIN(pr.unit_amount) as min_price,
    MAX(pr.unit_amount) as max_price,
    GROUP_CONCAT(
        JSON_OBJECT(
            'id', pr.stripe_price_id,
            'amount', pr.unit_amount,
            'currency', pr.currency,
            'interval', pr.recurring_interval
        )
    ) as prices_json
FROM product_catalog p
LEFT JOIN product_prices pr ON p.stripe_product_id = pr.stripe_product_id AND pr.active = TRUE
WHERE p.active = TRUE
GROUP BY p.id;

-- Create view for sync status summary
CREATE OR REPLACE VIEW v_sync_status_summary AS
SELECT 
    'products' as entity_type,
    sync_status,
    COUNT(*) as count
FROM product_catalog
GROUP BY sync_status
UNION ALL
SELECT 
    'prices' as entity_type,
    sync_status,
    COUNT(*) as count
FROM product_prices
GROUP BY sync_status;