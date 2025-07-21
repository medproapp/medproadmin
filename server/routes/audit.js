const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken, requirePermission } = require('../middleware/auth');

// Get audit logs
router.get('/', [
    verifyToken,
    requirePermission('can_view_audit')
], async (req, res) => {
    try {
        const {
            admin_email,
            action_type,
            entity_type,
            entity_id,
            status,
            start_date,
            end_date,
            limit = 50,
            offset = 0
        } = req.query;
        
        let query = `
            SELECT * FROM admin_audit_log
            WHERE 1=1
        `;
        const params = [];
        
        // Apply filters
        if (admin_email) {
            query += ' AND admin_email = ?';
            params.push(admin_email);
        }
        
        if (action_type) {
            query += ' AND action_type = ?';
            params.push(action_type);
        }
        
        if (entity_type) {
            query += ' AND entity_type = ?';
            params.push(entity_type);
        }
        
        if (entity_id) {
            query += ' AND entity_id = ?';
            params.push(entity_id);
        }
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (start_date) {
            query += ' AND created_at >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND created_at <= ?';
            params.push(end_date);
        }
        
        // Order and pagination
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const logs = await executeQuery(adminPool, query, params);
        
        // Parse JSON fields
        logs.forEach(log => {
            if (log.changes_json) log.changes_json = JSON.parse(log.changes_json);
            if (log.metadata_before) log.metadata_before = JSON.parse(log.metadata_before);
            if (log.metadata_after) log.metadata_after = JSON.parse(log.metadata_after);
        });
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM admin_audit_log WHERE 1=1';
        const countParams = params.slice(0, -2); // Remove limit and offset
        
        if (admin_email) countQuery += ' AND admin_email = ?';
        if (action_type) countQuery += ' AND action_type = ?';
        if (entity_type) countQuery += ' AND entity_type = ?';
        if (entity_id) countQuery += ' AND entity_id = ?';
        if (status) countQuery += ' AND status = ?';
        if (start_date) countQuery += ' AND created_at >= ?';
        if (end_date) countQuery += ' AND created_at <= ?';
        
        const [countResult] = await executeQuery(adminPool, countQuery, countParams);
        
        res.json({
            success: true,
            data: {
                logs,
                pagination: {
                    total: countResult.total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: parseInt(offset) + logs.length < countResult.total
                }
            }
        });
        
    } catch (error) {
        logger.error('Get audit logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit logs'
        });
    }
});

// Get audit log statistics
router.get('/stats', [
    verifyToken,
    requirePermission('can_view_audit')
], async (req, res) => {
    try {
        const { days = 7 } = req.query;
        
        // Actions by type
        const actionStats = await executeQuery(adminPool, `
            SELECT 
                action_type,
                COUNT(*) as count
            FROM admin_audit_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY action_type
        `, [days]);
        
        // Actions by admin
        const adminStats = await executeQuery(adminPool, `
            SELECT 
                admin_email,
                COUNT(*) as count
            FROM admin_audit_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY admin_email
            ORDER BY count DESC
            LIMIT 10
        `, [days]);
        
        // Actions by day
        const dailyStats = await executeQuery(adminPool, `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM admin_audit_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [days]);
        
        // Error rate
        const errorStats = await executeQuery(adminPool, `
            SELECT 
                status,
                COUNT(*) as count
            FROM admin_audit_log
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY status
        `, [days]);
        
        res.json({
            success: true,
            data: {
                period_days: days,
                actions_by_type: actionStats,
                actions_by_admin: adminStats,
                actions_by_day: dailyStats,
                status_breakdown: errorStats
            }
        });
        
    } catch (error) {
        logger.error('Get audit stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit statistics'
        });
    }
});

module.exports = router;