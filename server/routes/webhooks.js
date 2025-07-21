const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');
const stripeService = require('../services/stripe');

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
        return res.status(400).json({
            success: false,
            error: 'No signature provided'
        });
    }
    
    let event;
    
    try {
        event = stripeService.constructWebhookEvent(req.body, sig);
    } catch (err) {
        logger.error('Webhook signature verification failed:', err);
        return res.status(400).json({
            success: false,
            error: 'Invalid signature'
        });
    }
    
    // Handle the event
    try {
        switch (event.type) {
            case 'product.created':
                await handleProductCreated(event.data.object);
                break;
                
            case 'product.updated':
                await handleProductUpdated(event.data.object);
                break;
                
            case 'product.deleted':
                await handleProductDeleted(event.data.object);
                break;
                
            case 'price.created':
                await handlePriceCreated(event.data.object);
                break;
                
            case 'price.updated':
                await handlePriceUpdated(event.data.object);
                break;
                
            case 'price.deleted':
                await handlePriceDeleted(event.data.object);
                break;
                
            default:
                logger.info(`Unhandled webhook event type: ${event.type}`);
        }
        
        res.json({ received: true });
    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process webhook'
        });
    }
});

// Handler functions
async function handleProductCreated(product) {
    try {
        const checkQuery = `
            SELECT id FROM product_catalog 
            WHERE stripe_product_id = ?
        `;
        const existing = await executeQuery(adminPool, checkQuery, [product.id]);
        
        if (existing.length === 0) {
            const insertQuery = `
                INSERT INTO product_catalog (
                    stripe_product_id, name, description, active, metadata,
                    plan_type, user_tier, stripe_created_at, sync_status, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', NOW())
            `;
            
            await executeQuery(adminPool, insertQuery, [
                product.id,
                product.name,
                product.description,
                product.active ? 1 : 0,
                JSON.stringify(product.metadata),
                product.metadata?.plan_type || null,
                product.metadata?.user_tier || 0,
                product.created
            ]);
            
            logger.info(`Product created via webhook: ${product.id}`);
        }
    } catch (error) {
        logger.error(`Failed to handle product.created webhook:`, error);
        throw error;
    }
}

async function handleProductUpdated(product) {
    try {
        const updateQuery = `
            UPDATE product_catalog SET
                name = ?,
                description = ?,
                active = ?,
                metadata = ?,
                plan_type = ?,
                user_tier = ?,
                sync_status = 'synced',
                last_synced_at = NOW()
            WHERE stripe_product_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [
            product.name,
            product.description,
            product.active ? 1 : 0,
            JSON.stringify(product.metadata),
            product.metadata?.plan_type || null,
            product.metadata?.user_tier || 0,
            product.id
        ]);
        
        logger.info(`Product updated via webhook: ${product.id}`);
    } catch (error) {
        logger.error(`Failed to handle product.updated webhook:`, error);
        throw error;
    }
}

async function handleProductDeleted(product) {
    try {
        const updateQuery = `
            UPDATE product_catalog 
            SET active = 0, sync_status = 'synced', last_synced_at = NOW()
            WHERE stripe_product_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [product.id]);
        
        // Also deactivate all prices
        const updatePricesQuery = `
            UPDATE product_prices 
            SET active = 0
            WHERE stripe_product_id = ?
        `;
        await executeQuery(adminPool, updatePricesQuery, [product.id]);
        
        logger.info(`Product deleted via webhook: ${product.id}`);
    } catch (error) {
        logger.error(`Failed to handle product.deleted webhook:`, error);
        throw error;
    }
}

async function handlePriceCreated(price) {
    try {
        const checkQuery = `
            SELECT id FROM product_prices 
            WHERE stripe_price_id = ?
        `;
        const existing = await executeQuery(adminPool, checkQuery, [price.id]);
        
        if (existing.length === 0) {
            const insertQuery = `
                INSERT INTO product_prices (
                    stripe_price_id, stripe_product_id, nickname, currency, unit_amount,
                    recurring_interval, recurring_interval_count, active, metadata,
                    stripe_created_at, sync_status, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'synced', NOW())
            `;
            
            await executeQuery(adminPool, insertQuery, [
                price.id,
                price.product,
                price.nickname,
                price.currency,
                price.unit_amount / 100,
                price.recurring?.interval || null,
                price.recurring?.interval_count || null,
                price.active ? 1 : 0,
                JSON.stringify(price.metadata),
                price.created
            ]);
            
            logger.info(`Price created via webhook: ${price.id}`);
        }
    } catch (error) {
        logger.error(`Failed to handle price.created webhook:`, error);
        throw error;
    }
}

async function handlePriceUpdated(price) {
    try {
        const updateQuery = `
            UPDATE product_prices SET
                nickname = ?,
                active = ?,
                metadata = ?,
                sync_status = 'synced',
                last_synced_at = NOW()
            WHERE stripe_price_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [
            price.nickname,
            price.active ? 1 : 0,
            JSON.stringify(price.metadata),
            price.id
        ]);
        
        logger.info(`Price updated via webhook: ${price.id}`);
    } catch (error) {
        logger.error(`Failed to handle price.updated webhook:`, error);
        throw error;
    }
}

async function handlePriceDeleted(price) {
    try {
        const updateQuery = `
            UPDATE product_prices 
            SET active = 0, sync_status = 'synced', last_synced_at = NOW()
            WHERE stripe_price_id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [price.id]);
        
        logger.info(`Price deleted via webhook: ${price.id}`);
    } catch (error) {
        logger.error(`Failed to handle price.deleted webhook:`, error);
        throw error;
    }
}

module.exports = router;