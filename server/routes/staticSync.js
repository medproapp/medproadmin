const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Import services
const StaticPageSyncService = require('../services/staticPageSync');
const BackupManager = require('../services/backupManager');
const HtmlTemplateEngine = require('../services/htmlTemplateEngine');

// Initialize services
const syncService = new StaticPageSyncService();
const backupManager = new BackupManager();
const templateEngine = new HtmlTemplateEngine();

// Configure sync - analyze selected products and prepare configuration
router.post('/configure', verifyToken, async (req, res) => {
    try {
        const { selectedProducts, tierMapping, backupCurrent, validatePricing } = req.body;
        
        logger.info('Static sync configuration request', { 
            user: req.user.email,
            selectedProducts: Object.keys(selectedProducts),
            tierMapping 
        });
        
        // Validate selected products
        const validation = await syncService.validateProducts(selectedProducts);
        if (!validation.isValid) {
            return res.json({
                success: false,
                error: 'Product validation failed',
                validation: validation.issues
            });
        }
        
        // Extract pricing data from products
        const pricingData = await syncService.extractPricingData(selectedProducts);
        
        // Generate configuration ID
        const configurationId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create backup if requested
        let backupPath = null;
        if (backupCurrent) {
            try {
                backupPath = await backupManager.createBackup('planos/index.html');
                logger.info('Backup created', { backupPath, user: req.user.email });
            } catch (backupError) {
                logger.warn('Backup creation failed', { error: backupError.message });
                // Continue without backup if it fails
            }
        }
        
        // Store configuration temporarily
        await syncService.storeConfiguration(configurationId, {
            selectedProducts,
            tierMapping,
            pricingData,
            backupPath,
            createdBy: req.user.email,
            createdAt: new Date()
        });
        
        res.json({
            success: true,
            data: {
                configurationId,
                pricingData,
                backupPath,
                validation: validation.summary
            }
        });
        
    } catch (error) {
        logger.error('Static sync configuration error', { 
            error: error.message, 
            stack: error.stack,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to configure static sync'
        });
    }
});

// Apply sync - actually update the static page
router.post('/apply', verifyToken, async (req, res) => {
    try {
        const { configurationId, confirmApply } = req.body;
        
        if (!confirmApply) {
            return res.json({
                success: false,
                error: 'Sync confirmation required'
            });
        }
        
        logger.info('Static sync apply request', { 
            configurationId,
            user: req.user.email 
        });
        
        // Retrieve configuration
        const config = await syncService.getConfiguration(configurationId);
        if (!config) {
            return res.json({
                success: false,
                error: 'Configuration not found or expired'
            });
        }
        
        // Generate new HTML content
        const newHtml = await templateEngine.generateStaticPage(config.pricingData);
        
        // Write to static page file
        const staticPagePath = path.join(process.cwd(), '../medprofront/planos/index.html');
        await fs.writeFile(staticPagePath, newHtml, 'utf8');
        
        // Log the sync operation
        await syncService.logSyncOperation({
            configurationId,
            appliedBy: req.user.email,
            appliedAt: new Date(),
            selectedProducts: config.selectedProducts,
            backupPath: config.backupPath
        });
        
        // Clean up configuration
        await syncService.removeConfiguration(configurationId);
        
        logger.info('Static sync applied successfully', { 
            configurationId,
            user: req.user.email,
            staticPagePath 
        });
        
        res.json({
            success: true,
            data: {
                appliedAt: new Date(),
                staticPagePath: '/planos',
                backupPath: config.backupPath
            }
        });
        
    } catch (error) {
        logger.error('Static sync apply error', { 
            error: error.message, 
            stack: error.stack,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to apply static sync'
        });
    }
});

// Preview - generate and serve preview HTML
router.get('/preview/:configurationId', verifyToken, async (req, res) => {
    try {
        const { configurationId } = req.params;
        
        // Retrieve configuration
        const config = await syncService.getConfiguration(configurationId);
        if (!config) {
            return res.status(404).send('Configuration not found or expired');
        }
        
        // Generate preview HTML
        const previewHtml = await templateEngine.generateStaticPage(config.pricingData);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(previewHtml);
        
    } catch (error) {
        logger.error('Static sync preview error', { 
            error: error.message,
            configurationId: req.params.configurationId,
            user: req.user.email 
        });
        
        res.status(500).send('Preview generation failed');
    }
});

// Validate products - check if products are suitable for sync
router.post('/validate', verifyToken, async (req, res) => {
    try {
        const { products } = req.body;
        
        const validation = await syncService.validateProducts(products);
        
        res.json({
            success: true,
            data: validation
        });
        
    } catch (error) {
        logger.error('Product validation error', { 
            error: error.message,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Product validation failed'
        });
    }
});

// Get backups - list available backups
router.get('/backups', verifyToken, async (req, res) => {
    try {
        const backups = await backupManager.listBackups('planos');
        
        res.json({
            success: true,
            data: { backups }
        });
        
    } catch (error) {
        logger.error('Get backups error', { 
            error: error.message,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve backups'
        });
    }
});

// Restore backup - restore a previous version
router.post('/restore', verifyToken, async (req, res) => {
    try {
        const { backupId } = req.body;
        
        logger.info('Static page restore request', { 
            backupId,
            user: req.user.email 
        });
        
        const restored = await backupManager.restoreBackup(backupId, 'planos/index.html');
        
        if (restored) {
            // Log the restore operation
            await syncService.logSyncOperation({
                type: 'restore',
                backupId,
                restoredBy: req.user.email,
                restoredAt: new Date()
            });
            
            res.json({
                success: true,
                data: {
                    restoredAt: new Date(),
                    backupId
                }
            });
        } else {
            res.json({
                success: false,
                error: 'Backup not found or restore failed'
            });
        }
        
    } catch (error) {
        logger.error('Static page restore error', { 
            error: error.message,
            backupId: req.body.backupId,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Restore operation failed'
        });
    }
});

// Get sync history - list previous sync operations
router.get('/history', verifyToken, async (req, res) => {
    try {
        const history = await syncService.getSyncHistory();
        
        res.json({
            success: true,
            data: { history }
        });
        
    } catch (error) {
        logger.error('Get sync history error', { 
            error: error.message,
            user: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve sync history'
        });
    }
});

module.exports = router;