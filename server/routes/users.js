const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// Encryption helpers (reused from environments.js)
const algorithm = 'aes-256-cbc';
const getEncryptionKey = () => {
    const keyString = process.env.ENCRYPTION_KEY || 'abcdefghijklmnopqrstuvwxyz123456';
    return Buffer.from(keyString.slice(0, 32), 'utf8');
};

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Helper function to get environment and create MedPro database connection
const getEnvironmentConnection = async (environmentId) => {
    try {
        // Get environment details from admin database
        const environments = await executeQuery(
            adminPool,
            'SELECT * FROM environments WHERE id = ? AND is_active = 1',
            [environmentId]
        );

        if (!environments || environments.length === 0) {
            throw new Error('Environment not found or inactive');
        }

        const environment = environments[0];
        
        // Decrypt database password
        const dbPassword = decrypt(environment.db_password_encrypted);
        
        // Create connection to MedPro environment database
        const medproConnection = await mysql.createConnection({
            host: environment.db_host,
            port: environment.db_port || 3306,
            user: environment.db_user,
            password: dbPassword,
            database: environment.db_name,
            charset: 'utf8mb4',
            timezone: '+00:00'
        });

        return { connection: medproConnection, environment };
    } catch (error) {
        logger.error('Failed to connect to environment database:', error);
        throw error;
    }
};

// Log user management access
const logUserAccess = async (req, environmentId, actionType, targetUser = null, actionDetails = {}, success = true, errorMessage = null) => {
    try {
        const query = `
            INSERT INTO env_access_log 
            (environment_id, admin_email, action_type, target_user_email, target_user_id, 
             action_details, ip_address, user_agent, request_id, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const requestId = req.id || require('uuid').v4();
        
        await executeQuery(adminPool, query, [
            environmentId,
            req.user?.email || 'unknown',
            actionType,
            targetUser?.email || null,
            targetUser?.id || null,
            JSON.stringify(actionDetails),
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            requestId,
            success,
            errorMessage
        ]);
    } catch (error) {
        logger.error('Failed to log user access:', error);
    }
};

// GET /api/v1/users - List users from selected environment
router.get('/', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required'),
    query('role').optional().isIn(['all', 'pract', 'patient', 'assist']).withMessage('Invalid role'),
    query('status').optional().isIn(['active', 'inactive', 'locked', 'all']).withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('search').optional().isLength({ min: 0, max: 100 }).withMessage('Search term too long'),
    query('sort_field').optional().isIn(['fullname', 'email', 'role', 'activatedate', 'plan']).withMessage('Invalid sort field'),
    query('sort_direction').optional().isIn(['asc', 'desc']).withMessage('Sort direction must be asc or desc')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const {
            environment_id,
            role = 'all',
            status = 'active',
            page = 1,
            limit = 20,
            search = '',
            sort_field = 'fullname',
            sort_direction = 'asc'
        } = req.query;

        const { connection: medproConnection, environment } = await getEnvironmentConnection(environment_id);

        try {
            const offset = (page - 1) * limit;
            
            // Build WHERE conditions
            const whereConditions = [];
            const queryParams = [];
            
            // Role filter
            if (role !== 'all') {
                whereConditions.push('u.role = ?');
                queryParams.push(role);
            }
            
            // Status filter  
            if (status !== 'all') {
                if (status === 'active') {
                    whereConditions.push('(u.status IS NULL OR u.status = "" OR u.status = "active")');
                } else if (status === 'inactive') {
                    whereConditions.push('u.status = "inactive"');
                } else if (status === 'locked') {
                    whereConditions.push('u.status = "locked"');
                }
            }
            
            // Search filter
            if (search && search.trim() !== '') {
                whereConditions.push('(u.fullname LIKE ? OR u.email LIKE ?)');
                const searchTerm = `%${search.trim()}%`;
                queryParams.push(searchTerm, searchTerm);
            }
            
            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
            
            // Validate and build ORDER BY clause
            const validSortFields = {
                'fullname': 'u.fullname',
                'email': 'u.email', 
                'role': 'u.role',
                'activatedate': 'u.activatedate',
                'plan': 'u.plan'
            };
            
            const sortColumn = validSortFields[sort_field] || 'u.fullname';
            const sortDir = sort_direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            const orderClause = `ORDER BY ${sortColumn} ${sortDir}, u.email ASC`;
            
            // Get total count with filters
            const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
            const [countResult] = await medproConnection.execute(countQuery, queryParams);
            const totalUsers = countResult[0].total;

            // Get paginated users with filters and sorting
            const usersQuery = `
                SELECT 
                    u.email,
                    u.fullname,
                    u.role,
                    u.status,
                    u.plan,
                    u.activatedate,
                    u.admin,
                    u.first_login,
                    u.ai_enabled
                FROM users u
                ${whereClause}
                ${orderClause}
                LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
            `;
            
            const [users] = await medproConnection.execute(usersQuery, queryParams);

            // Log the access
            await logUserAccess(req, environment_id, search ? 'user_search' : 'user_view', null, {
                role,
                status,
                search,
                sort_field,
                sort_direction,
                page,
                limit,
                total_found: totalUsers
            });

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalUsers,
                        totalPages: Math.ceil(totalUsers / limit)
                    },
                    environment: {
                        id: environment.id,
                        name: environment.env_name,
                        display_name: environment.display_name
                    }
                }
            });

        } finally {
            await medproConnection.end();
        }

    } catch (error) {
        logger.error('Error listing users:', error);
        
        // Log failed access
        await logUserAccess(req, req.query.environment_id, 'user_view', null, {
            error: error.message
        }, false, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to list users',
            message: error.message
        });
    }
});

// GET /api/v1/users/stats - Get user statistics from selected environment
router.get('/stats', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { environment_id } = req.query;

        const { connection: medproConnection, environment } = await getEnvironmentConnection(environment_id);

        try {
            // Get user statistics
            const [userStats] = await medproConnection.execute(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN role = 'pract' THEN 1 END) as practitioners,
                    COUNT(CASE WHEN role = 'patient' THEN 1 END) as patients,
                    COUNT(CASE WHEN role = 'assist' THEN 1 END) as assistants,
                    COUNT(CASE WHEN status = 'active' OR status IS NULL OR status = '' THEN 1 END) as active_users,
                    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
                    COUNT(CASE WHEN admin = 1 THEN 1 END) as admin_users,
                    COUNT(CASE WHEN first_login = 0 THEN 1 END) as users_not_logged_in,
                    COUNT(CASE WHEN ai_enabled = 1 THEN 1 END) as ai_enabled_users
                FROM users
            `);

            // Get plan distribution
            const [planStats] = await medproConnection.execute(`
                SELECT 
                    plan,
                    COUNT(*) as user_count
                FROM users 
                WHERE plan IS NOT NULL AND plan != ''
                GROUP BY plan
                ORDER BY user_count DESC
            `);

            // Get recent user activity (last 30 days)
            const [recentUsers] = await medproConnection.execute(`
                SELECT 
                    COUNT(*) as recent_signups
                FROM users 
                WHERE activatedate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            `);

            // Get practitioner-specific stats if practitioners table exists
            let practitionerStats = null;
            try {
                const [practStats] = await medproConnection.execute(`
                    SELECT 
                        COUNT(*) as total_practitioners_with_details,
                        COUNT(CASE WHEN active = 1 THEN 1 END) as active_practitioners,
                        COUNT(CASE WHEN crm IS NOT NULL AND crm != '' AND crm != 'none' THEN 1 END) as practitioners_with_crm,
                        COUNT(CASE WHEN cpf IS NOT NULL THEN 1 END) as practitioners_with_cpf,
                        COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as practitioners_with_phone
                    FROM practitioners
                `);
                practitionerStats = practStats[0];
            } catch (practError) {
                // If practitioners table doesn't exist or has issues, that's fine
                logger.warn('Could not fetch practitioner stats:', practError.message);
            }

            // Log the access
            await logUserAccess(req, environment_id, 'user_view', null, {
                action: 'get_user_statistics',
                total_users: userStats[0].total_users
            });

            res.json({
                success: true,
                data: {
                    overview: userStats[0],
                    plans: planStats,
                    recent_activity: recentUsers[0],
                    practitioner_details: practitionerStats,
                    environment: {
                        id: environment.id,
                        name: environment.env_name,
                        display_name: environment.display_name
                    }
                }
            });

        } finally {
            await medproConnection.end();
        }

    } catch (error) {
        logger.error('Error getting user statistics:', error);
        
        // Log failed access
        await logUserAccess(req, req.query.environment_id, 'user_view', null, {
            action: 'get_user_statistics',
            error: error.message
        }, false, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to get user statistics',
            message: error.message
        });
    }
});

// GET /api/v1/users/:email - Get user details from selected environment
router.get('/:email', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email } = req.params;
        const { environment_id } = req.query;

        const { connection: medproConnection, environment } = await getEnvironmentConnection(environment_id);

        try {
            // Get user details with practitioner info if applicable
            const userQuery = `
                SELECT 
                    u.email,
                    u.fullname,
                    u.role,
                    u.status,
                    u.plan,
                    u.activatedate,
                    u.admin,
                    u.first_login,
                    u.ai_enabled,
                    u.relateduser,
                    u.stripe_customer,
                    u.stripe_subscription,
                    p.name as practitioner_name,
                    p.cpf,
                    p.active as practitioner_active,
                    p.crm,
                    p.qualification,
                    p.phone,
                    p.address,
                    p.city,
                    p.state,
                    p.cep,
                    p.cityname,
                    p.bio,
                    p.gender,
                    p.birthDate,
                    p.valoratendimento,
                    p.tempoatendimento,
                    p.intervaloatendimentos,
                    p.cnpj,
                    p.category,
                    p.medsite
                FROM users u
                LEFT JOIN practitioners p ON u.email = p.email AND u.role = 'pract'
                WHERE u.email = ?
            `;
            
            const [userResult] = await medproConnection.execute(userQuery, [email]);
            
            if (!userResult || userResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = userResult[0];

            // Get additional stats for this user if they're a practitioner
            let userStats = null;
            if (user.role === 'pract') {
                try {
                    // Get appointment count for practitioner
                    const [appointmentStats] = await medproConnection.execute(`
                        SELECT 
                            COUNT(*) as total_appointments,
                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
                            COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_appointments,
                            COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments
                        FROM appointments 
                        WHERE practitioner_email = ?
                    `, [email]);

                    userStats = appointmentStats[0] || {};
                } catch (statsError) {
                    // If appointments table doesn't exist, that's fine
                    logger.warn('Could not fetch appointment stats:', statsError.message);
                }
            }

            // Log the access
            await logUserAccess(req, environment_id, 'user_view', { email: user.email }, {
                user_role: user.role,
                has_practitioner_details: !!user.practitioner_name
            });

            res.json({
                success: true,
                data: {
                    user,
                    stats: userStats,
                    environment: {
                        id: environment.id,
                        name: environment.env_name,
                        display_name: environment.display_name
                    }
                }
            });

        } finally {
            await medproConnection.end();
        }

    } catch (error) {
        logger.error('Error getting user details:', error);
        
        // Log failed access
        await logUserAccess(req, req.query.environment_id, 'user_view', null, {
            requested_email: req.params.email,
            error: error.message
        }, false, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to get user details',
            message: error.message
        });
    }
});

// PUT /api/v1/users/:email/status - Update user status (enable/disable/lock)
router.put('/:email/status', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required'),
    body('status').isIn(['active', 'inactive', 'locked']).withMessage('Status must be active, inactive, or locked'),
    body('reason').optional().isLength({ min: 0, max: 255 }).withMessage('Reason too long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email } = req.params;
        const { environment_id } = req.query;
        const { status, reason = '' } = req.body;

        const { connection: medproConnection, environment } = await getEnvironmentConnection(environment_id);

        try {
            // Check if user exists first
            const checkQuery = `SELECT email, status FROM users WHERE email = ?`;
            const [checkResult] = await medproConnection.execute(checkQuery, [email]);
            
            if (checkResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const oldStatus = checkResult[0].status;

            // Update user status in MedPro database
            const updateQuery = `
                UPDATE users 
                SET status = ?, updated_at = NOW()
                WHERE email = ?
            `;
            
            const [result] = await medproConnection.execute(updateQuery, [status, email]);

            // Get updated user data
            const userQuery = `
                SELECT email, fullname, role, status, plan, activatedate, admin, first_login, ai_enabled
                FROM users 
                WHERE email = ?
            `;
            const [users] = await medproConnection.execute(userQuery, [email]);
            const updatedUser = users[0];

            // Log the action
            await logUserAccess(req, environment_id, 'user_status_update', updatedUser, {
                old_status: oldStatus || 'active',
                new_status: status,
                reason: reason
            });

            res.json({
                success: true,
                data: {
                    user: updatedUser,
                    message: `User status updated to ${status}`
                }
            });

        } finally {
            await medproConnection.end();
        }

    } catch (error) {
        logger.error('Error updating user status:', error);
        
        await logUserAccess(req, req.query.environment_id, 'user_status_update', null, {
            email: req.params.email,
            error: error.message
        }, false, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

// POST /api/v1/users/:email/reset-password - Reset user password
router.post('/:email/reset-password', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required'),
    body('new_password').optional().isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters'),
    body('send_email').optional().isBoolean().withMessage('Send email must be boolean'),
    body('force_change').optional().isBoolean().withMessage('Force change must be boolean')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { email } = req.params;
        const { environment_id } = req.query;
        const { new_password, send_email = true, force_change = true } = req.body;

        const { connection: medproConnection, environment } = await getEnvironmentConnection(environment_id);

        try {
            // Check if user exists
            const userQuery = `
                SELECT email, fullname, role, status
                FROM users 
                WHERE email = ?
            `;
            const [users] = await medproConnection.execute(userQuery, [email]);
            
            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = users[0];
            let generatedPassword = null;

            // Generate password if not provided
            if (!new_password) {
                generatedPassword = generateSecurePassword();
            }

            const passwordToUse = new_password || generatedPassword;
            
            // Hash the password (using bcrypt-style hashing)
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash(passwordToUse, 12);

            // Update password in database
            const updateQuery = `
                UPDATE users 
                SET password = ?, 
                    password_changed_at = NOW(),
                    force_password_change = ?,
                    updated_at = NOW()
                WHERE email = ?
            `;
            
            await medproConnection.execute(updateQuery, [hashedPassword, force_change ? 1 : 0, email]);

            // Log the action (don't log the actual password)
            await logUserAccess(req, environment_id, 'password_reset', user, {
                password_generated: !new_password,
                force_change: force_change,
                send_email: send_email
            });

            // Prepare response (include generated password only for admin)
            const responseData = {
                user: {
                    email: user.email,
                    fullname: user.fullname
                },
                message: 'Password reset successfully',
                force_change: force_change
            };

            // Include generated password in response for admin (if generated)
            if (generatedPassword) {
                responseData.generated_password = generatedPassword;
                responseData.message += '. Generated password included in response.';
            }

            res.json({
                success: true,
                data: responseData
            });

        } finally {
            await medproConnection.end();
        }

    } catch (error) {
        logger.error('Error resetting password:', error);
        
        await logUserAccess(req, req.query.environment_id, 'password_reset', null, {
            email: req.params.email,
            error: error.message
        }, false, error.message);

        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
});

// Helper function to generate secure password
function generateSecurePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one of each character type
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = router;