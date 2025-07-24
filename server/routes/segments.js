const express = require('express');
const router = express.Router();
const CustomerSegment = require('../models/CustomerSegment');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply admin authentication to all segment routes
router.use(verifyToken);

// GET /api/v1/segments - List all segments
router.get('/', async (req, res) => {
    try {
        const { is_active, is_system, created_by } = req.query;

        const filters = {};
        if (is_active !== undefined) filters.is_active = is_active === 'true';
        if (is_system !== undefined) filters.is_system = is_system === 'true';
        if (created_by) filters.created_by = created_by;

        logger.info('Fetching customer segments', { 
            filters, 
            adminEmail: req.user.email 
        });

        const segments = await CustomerSegment.findAll(filters);

        res.json({
            success: true,
            data: {
                segments,
                count: segments.length
            }
        });

    } catch (error) {
        logger.error('Error fetching segments:', { error, adminEmail: req.user.email });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch segments',
            message: error.message
        });
    }
});

// GET /api/v1/segments/:id - Get single segment with details
router.get('/:id', async (req, res) => {
    try {
        const { id: segmentId } = req.params;

        logger.info('Fetching segment details', { 
            segmentId, 
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);

        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        // Get segment customers (preview - first 10)
        const customers = await segment.getCustomers(10, 0);

        // Get recent analytics (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const analytics = await segment.getAnalytics(
            thirtyDaysAgo.toISOString().split('T')[0],
            new Date().toISOString().split('T')[0]
        );

        res.json({
            success: true,
            data: {
                segment,
                customers: {
                    items: customers,
                    preview: true,
                    total_count: segment.customer_count || 0
                },
                analytics
            }
        });

    } catch (error) {
        logger.error('Error fetching segment details:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch segment details',
            message: error.message
        });
    }
});

// GET /api/v1/segments/:id/customers - Get customers in segment with pagination
router.get('/:id/customers', async (req, res) => {
    try {
        const { id: segmentId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        logger.info('Fetching segment customers', { 
            segmentId, 
            page: pageNum,
            limit: limitNum,
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);
        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        const customers = await segment.getCustomers(limitNum, offset);
        const totalCustomers = segment.customer_count || 0;
        const totalPages = Math.ceil(totalCustomers / limitNum);

        res.json({
            success: true,
            data: {
                segment: {
                    id: segment.id,
                    name: segment.name,
                    color: segment.color
                },
                customers,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalCustomers,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching segment customers:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch segment customers',
            message: error.message
        });
    }
});

// GET /api/v1/segments/:id/analytics - Get segment analytics
router.get('/:id/analytics', async (req, res) => {
    try {
        const { id: segmentId } = req.params;
        const { 
            date_from: dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            date_to: dateTo = new Date().toISOString().split('T')[0]
        } = req.query;

        logger.info('Fetching segment analytics', { 
            segmentId, 
            dateFrom, 
            dateTo, 
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);
        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        const analytics = await segment.getAnalytics(dateFrom, dateTo);

        res.json({
            success: true,
            data: {
                segment: {
                    id: segment.id,
                    name: segment.name,
                    color: segment.color
                },
                analytics,
                period: { from: dateFrom, to: dateTo }
            }
        });

    } catch (error) {
        logger.error('Error fetching segment analytics:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch segment analytics',
            message: error.message
        });
    }
});

// POST /api/v1/segments - Create new segment
router.post('/', async (req, res) => {
    try {
        const { name, description, criteria, color } = req.body;

        if (!name || !criteria) {
            return res.status(400).json({
                success: false,
                error: 'Name and criteria are required'
            });
        }

        logger.info('Creating new segment', { 
            name, 
            adminEmail: req.user.email 
        });

        const segment = new CustomerSegment({
            name,
            description,
            criteria,
            color: color || '#007bff',
            is_active: true,
            is_system: false,
            created_by: req.user.email
        });

        await segment.save();

        // Update analytics for the new segment
        await CustomerSegment.updateSegmentAnalytics(segment.id);

        res.status(201).json({
            success: true,
            message: 'Segment created successfully',
            data: {
                segment,
                assigned_customers: segment.customer_count || 0
            }
        });

    } catch (error) {
        logger.error('Error creating segment:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to create segment',
            message: error.message
        });
    }
});

// PUT /api/v1/segments/:id - Update segment
router.put('/:id', async (req, res) => {
    try {
        const { id: segmentId } = req.params;
        const { name, description, criteria, color, is_active } = req.body;

        logger.info('Updating segment', { 
            segmentId, 
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);
        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        if (segment.is_system && req.body.criteria) {
            return res.status(400).json({
                success: false,
                error: 'Cannot modify criteria of system segments'
            });
        }

        // Update segment properties
        if (name !== undefined) segment.name = name;
        if (description !== undefined) segment.description = description;
        if (criteria !== undefined && !segment.is_system) segment.criteria = criteria;
        if (color !== undefined) segment.color = color;
        if (is_active !== undefined) segment.is_active = is_active;

        await segment.save();

        // Update analytics
        await CustomerSegment.updateSegmentAnalytics(segment.id);

        res.json({
            success: true,
            message: 'Segment updated successfully',
            data: {
                segment
            }
        });

    } catch (error) {
        logger.error('Error updating segment:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to update segment',
            message: error.message
        });
    }
});

// DELETE /api/v1/segments/:id - Delete segment
router.delete('/:id', async (req, res) => {
    try {
        const { id: segmentId } = req.params;

        logger.info('Deleting segment', { 
            segmentId, 
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);
        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        await segment.delete();

        res.json({
            success: true,
            message: 'Segment deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting segment:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to delete segment',
            message: error.message
        });
    }
});

// POST /api/v1/segments/:id/refresh - Refresh segment assignments
router.post('/:id/refresh', async (req, res) => {
    try {
        const { id: segmentId } = req.params;

        logger.info('Refreshing segment assignments', { 
            segmentId, 
            adminEmail: req.user.email 
        });

        const segment = await CustomerSegment.findById(segmentId);
        if (!segment) {
            return res.status(404).json({
                success: false,
                error: 'Segment not found'
            });
        }

        const assignedCount = await segment.assignCustomers();
        await CustomerSegment.updateSegmentAnalytics(segment.id);

        res.json({
            success: true,
            message: 'Segment assignments refreshed successfully',
            data: {
                segment_id: segment.id,
                assigned_customers: assignedCount
            }
        });

    } catch (error) {
        logger.error('Error refreshing segment assignments:', { 
            segmentId: req.params.id, 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to refresh segment assignments',
            message: error.message
        });
    }
});

// POST /api/v1/segments/refresh-all - Refresh all segment assignments
router.post('/refresh-all', async (req, res) => {
    try {
        logger.info('Refreshing all segment assignments', { 
            adminEmail: req.user.email 
        });

        const refreshedCount = await CustomerSegment.refreshAllAssignments();

        res.json({
            success: true,
            message: 'All segment assignments refreshed successfully',
            data: {
                refreshed_segments: refreshedCount
            }
        });

    } catch (error) {
        logger.error('Error refreshing all segment assignments:', { 
            error, 
            adminEmail: req.user.email 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to refresh segment assignments',
            message: error.message
        });
    }
});

module.exports = router;