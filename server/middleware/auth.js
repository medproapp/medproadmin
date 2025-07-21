const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : null;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user is admin
        const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['demo@medpro.com'];
        if (!adminEmails.includes(decoded.email)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }
        
        // For demo mode, skip database check
        if (process.env.NODE_ENV === 'development' && decoded.email === 'demo@medpro.com') {
            req.user = {
                email: decoded.email,
                id: decoded.id || 'demo',
                permissions: {
                    role: 'super_admin',
                    can_create_products: true,
                    can_edit_products: true,
                    can_delete_products: true,
                    can_sync_stripe: true,
                    can_run_recovery: true,
                    can_view_audit: true
                }
            };
        } else {
            // Check permissions in database
            const query = `
                SELECT * FROM admin_permissions 
                WHERE email = ? AND is_active = 1
            `;
            const permissions = await executeQuery(adminPool, query, [decoded.email]);
            
            if (permissions.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. No active permissions found.'
                });
            }
            
            // Add user info to request
            req.user = {
                email: decoded.email,
                id: decoded.id,
                permissions: permissions[0]
            };
            
            // Update last login
            await executeQuery(adminPool, 
                'UPDATE admin_permissions SET last_login = NOW() WHERE email = ?',
                [decoded.email]
            );
        }
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired'
            });
        }
        
        logger.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

// Check specific permissions
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions) {
            return res.status(403).json({
                success: false,
                error: 'No permissions found'
            });
        }
        
        const perms = req.user.permissions;
        
        // Super admin has all permissions
        if (perms.role === 'super_admin') {
            return next();
        }
        
        // Check specific permission
        if (!perms[permission]) {
            return res.status(403).json({
                success: false,
                error: `Permission denied: ${permission} required`
            });
        }
        
        next();
    };
};

// Log admin action
const logAdminAction = async (req, action, entityType, entityId, changes = {}, status = 'success', error = null) => {
    try {
        const query = `
            INSERT INTO admin_audit_log 
            (admin_email, action_type, entity_type, entity_id, changes_json, 
             ip_address, user_agent, request_id, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const requestId = req.id || require('uuid').v4();
        const params = [
            req.user.email,
            action,
            entityType,
            entityId,
            JSON.stringify(changes),
            req.ip,
            req.get('user-agent'),
            requestId,
            status,
            error
        ];
        
        await executeQuery(adminPool, query, params);
    } catch (error) {
        logger.error('Failed to log admin action:', error);
        // Don't throw - logging failure shouldn't break the request
    }
};

module.exports = {
    verifyToken,
    requirePermission,
    logAdminAction
};