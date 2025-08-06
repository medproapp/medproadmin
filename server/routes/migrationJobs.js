const express = require('express');
const router = express.Router();
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/v1/migration-jobs
 * List all migration jobs
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                j.id, j.name, j.description, j.parameters, j.is_active, j.created_at,
                s.name as source_name, s.display_name as source_display_name
            FROM migration_jobs j
            JOIN migration_sources s ON j.source_id = s.id
            WHERE j.is_active = TRUE 
            ORDER BY j.created_at DESC
        `;
        
        const jobs = await executeQuery(adminPool, query);
        
        logger.info(`Retrieved ${jobs.length} migration jobs`);
        
        res.json({
            success: true,
            data: Array.isArray(jobs) ? jobs : [jobs]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration jobs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration jobs'
        });
    }
});

/**
 * GET /api/v1/migration-jobs/:id
 * Get a specific migration job
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                j.id, j.source_id, j.name, j.description, j.parameters, j.is_active, j.created_at,
                s.name as source_name, s.display_name as source_display_name, s.script_path
            FROM migration_jobs j
            JOIN migration_sources s ON j.source_id = s.id
            WHERE j.id = ? AND j.is_active = TRUE
        `;
        
        const jobs = await executeQuery(adminPool, query, [id]);
        
        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration job not found'
            });
        }
        
        res.json({
            success: true,
            data: jobs[0]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration job'
        });
    }
});

/**
 * POST /api/v1/migration-jobs
 * Create a new migration job
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const { source_id, name, description, parameters } = req.body;
        
        // Validate required fields
        if (!source_id || !name || !parameters) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: source_id, name, parameters'
            });
        }
        
        // Verify source exists
        const sourceQuery = 'SELECT id FROM migration_sources WHERE id = ? AND is_active = TRUE';
        const sources = await executeQuery(adminPool, sourceQuery, [source_id]);
        
        if (sources.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid source_id: source not found'
            });
        }
        
        const query = `
            INSERT INTO migration_jobs (source_id, name, description, parameters)
            VALUES (?, ?, ?, ?)
        `;
        
        const result = await executeQuery(adminPool, query, [
            source_id, name, description || '', JSON.stringify(parameters)
        ]);
        
        logger.info(`Created migration job: ${name} (ID: ${result.insertId})`);
        
        res.json({
            success: true,
            data: { id: result.insertId, source_id, name, description, parameters }
        });
        
    } catch (error) {
        logger.error('Error creating migration job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create migration job'
        });
    }
});

/**
 * PUT /api/v1/migration-jobs/:id
 * Update a migration job
 */
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parameters } = req.body;
        
        // Check if job exists
        const checkQuery = 'SELECT id FROM migration_jobs WHERE id = ? AND is_active = TRUE';
        const jobs = await executeQuery(adminPool, checkQuery, [id]);
        
        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration job not found'
            });
        }
        
        const query = `
            UPDATE migration_jobs 
            SET name = ?, description = ?, parameters = ?
            WHERE id = ?
        `;
        
        await executeQuery(adminPool, query, [
            name, description || '', JSON.stringify(parameters), id
        ]);
        
        logger.info(`Updated migration job: ${name} (ID: ${id})`);
        
        res.json({
            success: true,
            message: 'Migration job updated successfully'
        });
        
    } catch (error) {
        logger.error('Error updating migration job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update migration job'
        });
    }
});

/**
 * DELETE /api/v1/migration-jobs/:id
 * Delete a migration job
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if job exists
        const checkQuery = 'SELECT id, name FROM migration_jobs WHERE id = ? AND is_active = TRUE';
        const jobs = await executeQuery(adminPool, checkQuery, [id]);
        
        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration job not found'
            });
        }
        
        // Soft delete by setting is_active = FALSE
        const deleteQuery = 'UPDATE migration_jobs SET is_active = FALSE WHERE id = ?';
        await executeQuery(adminPool, deleteQuery, [id]);
        
        logger.info(`Deleted migration job: ${jobs[0].name} (ID: ${id})`);
        
        res.json({
            success: true,
            message: 'Migration job deleted successfully'
        });
        
    } catch (error) {
        logger.error('Error deleting migration job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete migration job'
        });
    }
});

module.exports = router;