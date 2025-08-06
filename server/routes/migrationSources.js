const express = require('express');
const router = express.Router();
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');



/**
 * GET /api/v1/migration-sources
 * List all migration sources
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT id, name, display_name, description, script_path, parameters, is_active, created_at
            FROM migration_sources 
            WHERE is_active = TRUE 
            ORDER BY display_name
        `;
        
        const sources = await executeQuery(adminPool, query);
        
        logger.info(`Retrieved ${sources.length} migration sources`);
        
        res.json({
            success: true,
            data: Array.isArray(sources) ? sources : [sources]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration sources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration sources'
        });
    }
});

/**
 * GET /api/v1/migration-sources/:id
 * Get a specific migration source
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT id, name, display_name, description, script_path, parameters, is_active, created_at
            FROM migration_sources 
            WHERE id = ? AND is_active = TRUE
        `;
        
        const sources = await executeQuery(adminPool, query, [id]);
        
        if (sources.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration source not found'
            });
        }
        
        res.json({
            success: true,
            data: sources[0]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration source:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration source'
        });
    }
});

/**
 * POST /api/v1/migration-sources
 * Create a new migration source
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        logger.info('POST /migration-sources - Start processing request');
        const { name, display_name, description, script_path, parameters } = req.body;
        logger.info(`POST /migration-sources - Extracted fields: name=${name}, display_name=${display_name}`);
        
        // Validate required fields
        if (!name || !display_name || !script_path || !parameters) {
            logger.warn('POST /migration-sources - Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, display_name, script_path, parameters'
            });
        }
        
        logger.info('POST /migration-sources - About to execute INSERT query');
        
        const query = `
            INSERT INTO migration_sources (name, display_name, description, script_path, parameters)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const result = await executeQuery(adminPool, query, [
            name, display_name, description || '', script_path, JSON.stringify(parameters)
        ]);
        
        logger.info(`POST /migration-sources - Query executed successfully. Result: ${JSON.stringify(result)}`);
        logger.info(`Created migration source: ${name} (ID: ${result.insertId})`);
        
        logger.info('POST /migration-sources - Sending success response');
        res.json({
            success: true,
            data: { id: result.insertId, name, display_name, description, script_path, parameters }
        });
        
    } catch (error) {
        logger.error('Error creating migration source:', error);
        
        // Handle duplicate name error
        if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage.includes('name')) {
            logger.info('POST /migration-sources - Sending duplicate error response');
            return res.status(400).json({
                success: false,
                error: `A migration source with the name '${req.body.name}' already exists. Please choose a different name.`
            });
        } else {
            logger.info('POST /migration-sources - Sending general error response');
            return res.status(500).json({
                success: false,
                error: 'Failed to create migration source'
            });
        }
    }
});

/**
 * PUT /api/v1/migration-sources/:id
 * Update a migration source
 */
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, display_name, description, script_path, parameters } = req.body;
        
        // Validate required fields
        if (!name || !display_name || !script_path || !parameters) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, display_name, script_path, parameters'
            });
        }
        
        // Check if source exists
        const checkQuery = 'SELECT id FROM migration_sources WHERE id = ? AND is_active = TRUE';
        const sources = await executeQuery(adminPool, checkQuery, [id]);
        
        if (sources.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration source not found'
            });
        }
        
        const query = `
            UPDATE migration_sources 
            SET name = ?, display_name = ?, description = ?, script_path = ?, parameters = ?
            WHERE id = ?
        `;
        
        await executeQuery(adminPool, query, [
            name, display_name, description || '', script_path, JSON.stringify(parameters), id
        ]);
        
        logger.info(`Updated migration source: ${name} (ID: ${id})`);
        
        res.json({
            success: true,
            data: { id, name, display_name, description, script_path, parameters }
        });
        
    } catch (error) {
        logger.error('Error updating migration source:', error);
        
        // Handle duplicate name error
        if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage.includes('name')) {
            return res.status(400).json({
                success: false,
                error: `A migration source with the name '${name}' already exists. Please choose a different name.`
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to update migration source'
            });
        }
    }
});

/**
 * DELETE /api/v1/migration-sources/:id
 * Delete a migration source
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if source exists
        const checkQuery = 'SELECT id, name FROM migration_sources WHERE id = ? AND is_active = TRUE';
        const sources = await executeQuery(adminPool, checkQuery, [id]);
        
        if (sources.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration source not found'
            });
        }
        
        // Soft delete by setting is_active = FALSE
        const deleteQuery = 'UPDATE migration_sources SET is_active = FALSE WHERE id = ?';
        await executeQuery(adminPool, deleteQuery, [id]);
        
        logger.info(`Deleted migration source: ${sources[0].name} (ID: ${id})`);
        
        res.json({
            success: true,
            message: 'Migration source deleted successfully'
        });
        
    } catch (error) {
        logger.error('Error deleting migration source:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete migration source'
        });
    }
});

module.exports = router; 