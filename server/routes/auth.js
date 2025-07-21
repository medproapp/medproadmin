const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Login endpoint
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { email, password } = req.body;
        
        // For demo mode, accept specific credentials
        if (process.env.NODE_ENV === 'development' && email === 'demo@medpro.com' && password === 'demo123') {
            const token = jwt.sign(
                { email, id: 'demo' },
                process.env.JWT_SECRET || 'demo_secret',
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );
            
            return res.json({
                success: true,
                data: {
                    token,
                    user: {
                        email,
                        role: 'super_admin',
                        name: 'Demo Admin'
                    }
                }
            });
        }
        
        // Check if user exists in admin permissions
        const query = 'SELECT * FROM admin_permissions WHERE email = ? AND is_active = 1';
        const users = await executeQuery(adminPool, query, [email]);
        
        if (users.length === 0) {
            logger.warn(`Login attempt for non-admin email: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
        
        const user = users[0];
        
        // In production, you would verify password hash
        // For now, we'll use a simple check
        // TODO: Implement proper password verification
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                email: user.email, 
                id: user.id,
                role: user.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        // Update last login
        await executeQuery(adminPool, 
            'UPDATE admin_permissions SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        // Log successful login
        logger.info(`Admin login successful: ${email}`);
        
        res.json({
            success: true,
            data: {
                token,
                user: {
                    email: user.email,
                    role: user.role,
                    permissions: {
                        can_create_products: user.can_create_products,
                        can_edit_products: user.can_edit_products,
                        can_delete_products: user.can_delete_products,
                        can_sync_stripe: user.can_sync_stripe,
                        can_run_recovery: user.can_run_recovery,
                        can_view_audit: user.can_view_audit
                    }
                }
            }
        });
        
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        data: {
            user: req.user
        }
    });
});

// Logout endpoint (mainly for audit logging)
router.post('/logout', verifyToken, async (req, res) => {
    try {
        logger.info(`Admin logout: ${req.user.email}`);
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

// Get current user info
router.get('/me', verifyToken, async (req, res) => {
    try {
        // For demo mode, return demo user info
        if (process.env.NODE_ENV === 'development' && req.user.email === 'demo@medpro.com') {
            return res.json({
                success: true,
                data: {
                    email: req.user.email,
                    role: 'super_admin',
                    permissions: {
                        can_create_products: true,
                        can_edit_products: true,
                        can_delete_products: true,
                        can_sync_stripe: true,
                        can_run_recovery: true,
                        can_view_audit: true
                    },
                    lastLogin: new Date(),
                    createdAt: new Date()
                }
            });
        }
        
        const query = 'SELECT * FROM admin_permissions WHERE email = ?';
        const users = await executeQuery(adminPool, query, [req.user.email]);
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const user = users[0];
        
        res.json({
            success: true,
            data: {
                email: user.email,
                role: user.role,
                permissions: {
                    can_create_products: user.can_create_products,
                    can_edit_products: user.can_edit_products,
                    can_delete_products: user.can_delete_products,
                    can_sync_stripe: user.can_sync_stripe,
                    can_run_recovery: user.can_run_recovery,
                    can_view_audit: user.can_view_audit
                },
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });
        
    } catch (error) {
        logger.error('Get user info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user info'
        });
    }
});

module.exports = router;