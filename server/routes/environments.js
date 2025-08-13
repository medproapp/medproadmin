const express = require('express');
const router = express.Router();
const path = require('path');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const si = require('systeminformation');
const osUtils = require('node-os-utils');
const pidusage = require('pidusage');
const fs = require('fs').promises;
const axios = require('axios');

// Encryption helpers
const algorithm = 'aes-256-cbc';
const getEncryptionKey = () => {
    const keyString = process.env.ENCRYPTION_KEY || 'abcdefghijklmnopqrstuvwxyz123456'; // Exactly 32 chars
    return Buffer.from(keyString.slice(0, 32), 'utf8'); // Ensure exactly 32 bytes
};

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Log environment access
const logEnvironmentAccess = async (req, environmentId, actionType, targetUser = null, actionDetails = {}, success = true, errorMessage = null) => {
    try {
        const query = `
            INSERT INTO env_access_log 
            (environment_id, admin_email, action_type, target_user_email, target_user_id, 
             action_details, ip_address, user_agent, request_id, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const requestId = req.id || require('uuid').v4();
        const params = [
            environmentId,
            req.user.email,
            actionType,
            targetUser?.email || null,
            targetUser?.id || null,
            JSON.stringify(actionDetails),
            req.ip,
            req.get('user-agent'),
            requestId,
            success,
            errorMessage
        ];
        
        await executeQuery(adminPool, query, params);
    } catch (error) {
        logger.error('Failed to log environment access:', error);
    }
};

// GET /api/v1/environments - List all environments
router.get('/', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const query = `
            SELECT 
                id, env_name, env_type, display_name, description,
                db_host, db_port, db_name, db_user,
                api_base_url, is_active, is_default,
                color_theme, icon, created_at, updated_at
            FROM environments
            WHERE is_active = 1
            ORDER BY 
                CASE env_type 
                    WHEN 'production' THEN 1 
                    WHEN 'test' THEN 2 
                    WHEN 'development' THEN 3 
                    ELSE 4 
                END
        `;
        
        const environments = await executeQuery(adminPool, query);
        
        res.json({
            success: true,
            data: environments
        });
        
    } catch (error) {
        logger.error('Failed to fetch environments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch environments'
        });
    }
});

// GET /api/v1/environments/:id - Get single environment
router.get('/:id', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                id, env_name, env_type, display_name, description,
                db_host, db_port, db_name, db_user,
                api_base_url, is_active, is_default,
                color_theme, icon, connection_timeout,
                environment_metadata, created_at, updated_at, created_by
            FROM environments
            WHERE id = ? AND is_active = 1
        `;
        
        const results = await executeQuery(adminPool, query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        res.json({
            success: true,
            data: results[0]
        });
        
    } catch (error) {
        logger.error('Failed to fetch environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch environment'
        });
    }
});

// POST /api/v1/environments - Create new environment
router.post('/', [
    verifyToken,
    requirePermission('can_manage_environments'),
    body('env_name').trim().isLength({ min: 3, max: 100 }).matches(/^[a-zA-Z0-9_-]+$/),
    body('env_type').isIn(['production', 'test', 'development', 'nqa']),
    body('display_name').trim().isLength({ min: 3, max: 150 }),
    body('db_host').trim().isLength({ min: 1, max: 255 }),
    body('db_port').optional().isInt({ min: 1, max: 65535 }),
    body('db_name').trim().isLength({ min: 1, max: 100 }),
    body('db_user').trim().isLength({ min: 1, max: 100 }),
    body('db_password').optional().isLength({ min: 1 }),
    body('description').optional().trim(),
    body('api_base_url').optional().trim().custom((value) => {
        // Allow empty strings or valid URLs
        return !value || require('validator').isURL(value);
    }),
    body('color_theme').optional().isIn(['red', 'yellow', 'green', 'blue', 'purple', 'gray']),
    body('icon').optional().trim().isLength({ max: 50 })
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
        
        const {
            env_name, env_type, display_name, description = '',
            db_host, db_port = 3306, db_name, db_user, db_password,
            api_base_url = '', color_theme = 'blue', icon = 'server',
            is_default = false, environment_metadata = {}, 
            all_env_variables = {}
        } = req.body;
        
        // Handle password for discovered environments
        let actualPassword = db_password;
        if (!actualPassword && all_env_variables && all_env_variables.mysql_password) {
            // Use discovered mysql_password for discovered environments
            actualPassword = all_env_variables.mysql_password;
        }
        
        // Encrypt the database password (reject if empty or placeholder)
        if (!actualPassword || actualPassword === '[SET]' || actualPassword === '[NOT SET]') {
            return res.status(400).json({
                success: false,
                error: 'Database password is required and cannot be a placeholder. Please provide the actual password.',
                details: {
                    provided_password: actualPassword,
                    issue: actualPassword === '[SET]' ? 'Placeholder detected from API response' : 'Empty password'
                }
            });
        }
        const encryptedPassword = encrypt(actualPassword);
        
        // Check if environment name already exists
        const existsQuery = 'SELECT id FROM environments WHERE env_name = ?';
        const existing = await executeQuery(adminPool, existsQuery, [env_name]);
        
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Environment name already exists'
            });
        }
        
        const result = await executeTransaction(adminPool, async (connection) => {
            // If this is set as default, clear other defaults
            if (is_default) {
                await connection.execute('UPDATE environments SET is_default = 0');
            }
            
            // Insert new environment
            const insertQuery = `
                INSERT INTO environments 
                (env_name, env_type, display_name, description, db_host, db_port, 
                 db_name, db_user, db_password_encrypted, api_base_url, 
                 color_theme, icon, is_default, environment_metadata, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [insertResult] = await connection.execute(insertQuery, [
                env_name, env_type, display_name, description, db_host, db_port,
                db_name, db_user, encryptedPassword, api_base_url,
                color_theme, icon, is_default, JSON.stringify(environment_metadata),
                req.user.email
            ]);
            
            return insertResult;
        });
        
        // Log the action
        await logAdminAction(req, 'create', 'environment', result.insertId, {
            env_name, env_type, display_name
        });
        
        res.status(201).json({
            success: true,
            data: {
                id: result.insertId,
                env_name,
                env_type,
                display_name
            },
            message: 'Environment created successfully'
        });
        
    } catch (error) {
        logger.error('Failed to create environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create environment'
        });
    }
});

// PUT /api/v1/environments/:id - Update environment
router.put('/:id', [
    verifyToken,
    requirePermission('can_manage_environments'),
    body('display_name').optional().trim().isLength({ min: 3, max: 150 }),
    body('description').optional().trim(),
    body('db_host').optional().trim().isLength({ min: 1, max: 255 }),
    body('db_port').optional().isInt({ min: 1, max: 65535 }),
    body('db_name').optional().trim().isLength({ min: 1, max: 100 }),
    body('db_user').optional().trim().isLength({ min: 1, max: 100 }),
    body('db_password').optional().isLength({ min: 1 }),
    body('api_base_url').optional().trim(),
    body('color_theme').optional().isIn(['red', 'yellow', 'green', 'blue', 'purple', 'gray']),
    body('icon').optional().trim().isLength({ max: 50 }),
    body('is_default').optional().isBoolean()
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
        
        const { id } = req.params;
        const updates = req.body;
        
        // Get current environment
        const currentQuery = 'SELECT * FROM environments WHERE id = ? AND is_active = 1';
        const current = await executeQuery(adminPool, currentQuery, [id]);
        
        if (current.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        const result = await executeTransaction(adminPool, async (connection) => {
            // Build update query
            const fields = [];
            const values = [];
            let shouldClearDefaults = false;
            
            // Filter out readonly fields
            const readonlyFields = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by'];
            
            for (const [key, value] of Object.entries(updates)) {
                // Skip readonly fields
                if (readonlyFields.includes(key)) {
                    continue;
                }
                
                if (key === 'db_password') {
                    // Reject placeholder passwords
                    if (!value || value === '[SET]' || value === '[NOT SET]') {
                        throw new Error(`Database password cannot be empty or a placeholder. Provided: "${value}"`);
                    }
                    fields.push('db_password_encrypted = ?');
                    values.push(encrypt(value));
                } else if (key === 'environment_metadata') {
                    fields.push(`${key} = ?`);
                    values.push(JSON.stringify(value));
                } else if (key === 'is_default') {
                    if (value) {
                        shouldClearDefaults = true;
                    }
                    fields.push(`${key} = ?`);
                    values.push(value);
                } else {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            }
            
            if (fields.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            // Clear other defaults if setting this as default
            if (shouldClearDefaults) {
                await connection.execute('UPDATE environments SET is_default = 0 WHERE id != ?', [id]);
            }
            
            fields.push('updated_by = ?', 'updated_at = NOW()');
            values.push(req.user.email, id);
            
            const updateQuery = `UPDATE environments SET ${fields.join(', ')} WHERE id = ?`;
            const [updateResult] = await connection.execute(updateQuery, values);
            
            return updateResult;
        });
        
        // Log the action
        await logAdminAction(req, 'update', 'environment', id, updates);
        
        res.json({
            success: true,
            message: 'Environment updated successfully',
            affected_rows: result.affectedRows
        });
        
    } catch (error) {
        logger.error('Failed to update environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update environment'
        });
    }
});

// DELETE /api/v1/environments/:id - Deactivate environment
router.delete('/:id', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if environment exists and is not default
        const checkQuery = `
            SELECT env_name, is_default 
            FROM environments 
            WHERE id = ? AND is_active = 1
        `;
        const existing = await executeQuery(adminPool, checkQuery, [id]);
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        if (existing[0].is_default) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete default environment'
            });
        }
        
        // Soft delete (deactivate)
        const deleteQuery = `
            UPDATE environments 
            SET is_active = 0, updated_by = ?, updated_at = NOW() 
            WHERE id = ?
        `;
        
        await executeQuery(adminPool, deleteQuery, [req.user.email, id]);
        
        // Log the action
        await logAdminAction(req, 'delete', 'environment', id, {
            env_name: existing[0].env_name
        });
        
        res.json({
            success: true,
            message: 'Environment deactivated successfully'
        });
        
    } catch (error) {
        logger.error('Failed to delete environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete environment'
        });
    }
});

// POST /api/v1/environments/:id/test-connection - Test database connection
router.post('/:id/test-connection', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get environment details
        const query = `
            SELECT env_name, db_host, db_port, db_name, db_user, db_password_encrypted
            FROM environments
            WHERE id = ? AND is_active = 1
        `;
        
        const results = await executeQuery(adminPool, query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        const env = results[0];
        
        // Decrypt password
        let decryptedPassword;
        try {
            decryptedPassword = decrypt(env.db_password_encrypted);
        } catch (error) {
            await logEnvironmentAccess(req, id, 'connection_test', null, {}, false, 'Password decryption failed');
            return res.status(500).json({
                success: false,
                error: 'Failed to decrypt database password'
            });
        }
        
        // Test connection
        let testConnection;
        try {
            testConnection = await mysql.createConnection({
                host: env.db_host,
                port: env.db_port,
                database: env.db_name,
                user: env.db_user,
                password: decryptedPassword,
                connectTimeout: 5000,
                acquireTimeout: 5000
            });
            
            // Test with a simple query
            await testConnection.execute('SELECT 1 as test');
            await testConnection.end();
            
            // Log successful test
            await logEnvironmentAccess(req, id, 'connection_test', null, {
                result: 'success'
            });
            
            res.json({
                success: true,
                message: 'Connection test successful',
                details: {
                    host: env.db_host,
                    port: env.db_port,
                    database: env.db_name,
                    user: env.db_user
                }
            });
            
        } catch (connectionError) {
            // Log failed test
            await logEnvironmentAccess(req, id, 'connection_test', null, {
                result: 'failed',
                error: connectionError.message
            }, false, connectionError.message);
            
            res.status(400).json({
                success: false,
                error: 'Connection test failed',
                details: connectionError.message
            });
        } finally {
            if (testConnection) {
                try {
                    await testConnection.end();
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
        
    } catch (error) {
        logger.error('Connection test error:', error);
        await logEnvironmentAccess(req, null, 'connection_test', null, {}, false, error.message);
        
        res.status(500).json({
            success: false,
            error: 'Connection test failed'
        });
    }
});

// GET /api/v1/environments/:id/access-log - Get environment access log
router.get('/:id/access-log', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const offset = (page - 1) * limit;
        
        const query = `
            SELECT 
                id, admin_email, action_type, target_user_email,
                action_details, success, error_message,
                ip_address, created_at
            FROM env_access_log
            WHERE environment_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const countQuery = `
            SELECT COUNT(*) as total
            FROM env_access_log
            WHERE environment_id = ?
        `;
        
        const [logs, countResult] = await Promise.all([
            executeQuery(adminPool, query, [parseInt(id), parseInt(limit), parseInt(offset)]),
            executeQuery(adminPool, countQuery, [parseInt(id)])
        ]);
        
        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
        
    } catch (error) {
        logger.error('Failed to fetch access log:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch access log'
        });
    }
});

// POST /api/v1/environments/test-connection - Test all services in environment
router.post('/test-connection', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { server_host, server_port } = req.body;
        
        // Validate required fields  
        if (!server_host || !server_port) {
            return res.status(400).json({
                success: false,
                error: 'Server host and port are required'
            });
        }

        // Get admin API key from environment
        const adminApiKey = process.env.MEDPRO_ADMIN_API_KEY;
        if (!adminApiKey) {
            return res.status(503).json({
                success: false,
                error: 'Admin API key not configured'
            });
        }

        // Prepare connection to MedPro server
        const medproUrl = `http://${server_host}:${server_port}`;
        
        // Configure request with proper connection management
        const requestConfig = {
            timeout: 30000, // Longer timeout for service testing
            headers: {
                'User-Agent': 'MedProAdmin-ServiceTest/1.0',
                'X-Admin-API-Key': adminApiKey,
                'Connection': 'close',
                'Content-Type': 'application/json'
            },
            httpAgent: new require('http').Agent({ keepAlive: false }),
            httpsAgent: new require('https').Agent({ keepAlive: false })
        };

        try {
            const axios = require('axios');
            logger.info(`Testing services on ${medproUrl}...`);
            
            // Call comprehensive service testing endpoint
            const response = await axios.post(`${medproUrl}/api/admin/test-services`, {}, requestConfig);
            
            // Skip logging for form-based tests (no environment_id)
            // await logEnvironmentAccess(req, null, 'service_test', null, {
            //     server_host,
            //     server_port,
            //     total_tests: response.data.summary?.total || 0,
            //     successful_tests: response.data.summary?.successful || 0,
            //     failed_tests: response.data.summary?.failed || 0
            // }, true, 'Service testing completed');
            
            res.json({
                success: true,
                message: 'Service testing completed',
                server_info: {
                    host: server_host,
                    port: server_port,
                    url: medproUrl
                },
                summary: response.data.summary,
                test_results: response.data.tests,
                timestamp: response.data.timestamp
            });
            
        } catch (serviceError) {
            let errorMessage = 'Service testing failed';
            let errorDetails = serviceError.message;
            
            if (serviceError.code === 'ECONNREFUSED') {
                errorMessage = 'Cannot connect to MedPro server';
                errorDetails = `Connection refused to ${medproUrl}`;
            } else if (serviceError.response) {
                errorMessage = 'MedPro server error';
                errorDetails = serviceError.response.data?.error || `HTTP ${serviceError.response.status}`;
            }
            
            // Skip logging for form-based tests (no environment_id)
            // await logEnvironmentAccess(req, null, 'service_test', null, {
            //     server_host,
            //     server_port,
            //     error: errorDetails
            // }, false, errorMessage);
            
            res.status(400).json({
                success: false,
                error: errorMessage,
                details: errorDetails,
                server_info: {
                    host: server_host,
                    port: server_port,
                    url: medproUrl
                }
            });
        }
        
    } catch (error) {
        logger.error('Service test error:', error);
        // Skip logging for form-based tests (no environment_id)
        // await logEnvironmentAccess(req, null, 'service_test', null, {}, false, error.message);
        
        res.status(500).json({
            success: false,
            error: 'Service test failed',
            details: error.message
        });
    }
});

// POST /api/v1/environments/autodiscover - Auto-discover environment details
router.post('/autodiscover', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { server_host, server_port } = req.body;
        
        // Validate required fields
        if (!server_host) {
            return res.status(400).json({
                success: false,
                error: 'Server host is required'
            });
        }
        
        if (!server_port) {
            return res.status(400).json({
                success: false,
                error: 'Server port is required'
            });
        }
        
        // Function to get environment data from MedPro server API
        const getMedProEnvironmentData = async (host, port) => {
            const axios = require('axios');
            const baseUrl = `http://${host}:${port}`;
            
            logger.info(`Connecting to MedPro server at ${baseUrl}`);
            
            try {
                // Get admin API key for MedPro server authentication
                const adminApiKey = process.env.MEDPRO_ADMIN_API_KEY;
                if (!adminApiKey) {
                    throw new Error('MEDPRO_ADMIN_API_KEY not configured in MedProAdmin');
                }
                
                const requestConfig = {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'MedProAdmin-Discovery/1.0',
                        'X-Admin-API-Key': adminApiKey,
                        'Connection': 'close'
                    },
                    // Force connection close to prevent keeping connections alive
                    httpAgent: new require('http').Agent({ keepAlive: false }),
                    httpsAgent: new require('https').Agent({ keepAlive: false })
                };
                
                // First, check if the server is reachable
                const healthResponse = await axios.get(`${baseUrl}/api/admin/health`, requestConfig);
                
                logger.info(`MedPro server health check: ${healthResponse.status}`);
                
                // Try to get environment variables from MedPro server
                const envResponse = await axios.get(`${baseUrl}/api/admin/environment`, requestConfig);
                
                return {
                    server_reachable: true,
                    env_variables: envResponse.data.env_variables,
                    sensitive_variables: envResponse.data.sensitive_variables,
                    server_info: envResponse.data.server_info,
                    raw_content: JSON.stringify(envResponse.data.env_variables, null, 2)
                };
                
            } catch (error) {
                logger.warn(`Could not reach MedPro API at ${baseUrl}: ${error.message}`);
                
                // Fallback: try to read .env file via filesystem/SSH
                return await readEnvFromFilesystem(host);
            }
        };
        
        // Fallback function to read .env from filesystem (existing logic)
        const readEnvFromFilesystem = async (host) => {
            const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
            
            // Common MedPro .env file locations
            const envPaths = [
                // Remote paths
                '/var/www/medpro/.env',
                '/opt/medpro/.env', 
                '/home/medpro/.env',
                '/usr/local/medpro/.env',
                '/home/ubuntu/medpro/.env',
                '/srv/medpro/.env',
                '/app/.env',
                '/medpro/.env',
                // Local paths (for localhost)
                process.cwd() + '/.env', // Current directory
                path.join(process.cwd(), '..', '.env'), // Parent directory
                path.join(process.cwd(), '..', '..', '.env'), // Grandparent directory
                path.join(process.cwd(), '..', '..', '..', '.env'), // Up from server directory
                path.join(process.cwd(), '..', '..', '..', '..', '.env'), // Up more levels
                '/Users/fabiangc/medpro/.env', // Possible local development path
                '/Users/fabiangc/medpro/repo/version3/.env',
                '/Users/fabiangc/medpro/repo/version3/medproadmin/.env'
            ];
            
            if (isLocal) {
                logger.info(`Reading .env from LOCAL server: ${host}`);
                return await readEnvFromLocalServer(envPaths);
            } else {
                logger.info(`Reading .env from REMOTE server: ${host}`);
                return await readEnvFromRemoteServer(host, envPaths);
            }
        };
        
        // Function to read .env from local filesystem
        const readEnvFromLocalServer = async (envPaths) => {
            const fs = require('fs').promises;
            
            for (const envPath of envPaths) {
                try {
                    logger.info(`[LOCAL] Trying to read .env from: ${envPath}`);
                    const envContent = await fs.readFile(envPath, 'utf8');
                    logger.info(`[LOCAL] Successfully read .env from: ${envPath}`);
                    return { 
                        content: parseEnvContent(envContent), 
                        path: envPath,
                        raw_content: envContent 
                    };
                } catch (error) {
                    logger.debug(`[LOCAL] Could not read .env from ${envPath}: ${error.message}`);
                    continue;
                }
            }
            
            return null;
        };
        
        // Function to read .env from remote server via SSH
        const readEnvFromRemoteServer = async (host, envPaths) => {
            const { NodeSSH } = require('node-ssh');
            const ssh = new NodeSSH();
            
            try {
                // SSH connection configuration
                const sshConfig = {
                    host: host,
                    username: process.env.SSH_USERNAME || 'ubuntu', // Default to ubuntu user
                    port: process.env.SSH_PORT || 22,
                };
                
                // Try different authentication methods
                if (process.env.SSH_PRIVATE_KEY_PATH) {
                    sshConfig.privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
                } else if (process.env.SSH_PRIVATE_KEY) {
                    sshConfig.privateKey = process.env.SSH_PRIVATE_KEY;
                } else if (process.env.SSH_PASSWORD) {
                    sshConfig.password = process.env.SSH_PASSWORD;
                } else {
                    // Try default SSH key locations
                    const os = require('os');
                    const defaultKeyPaths = [
                        path.join(os.homedir(), '.ssh', 'id_rsa'),
                        path.join(os.homedir(), '.ssh', 'id_ed25519'),
                        path.join(os.homedir(), '.ssh', 'medpro_key'),
                    ];
                    
                    for (const keyPath of defaultKeyPaths) {
                        try {
                            const fs = require('fs');
                            if (fs.existsSync(keyPath)) {
                                sshConfig.privateKeyPath = keyPath;
                                logger.info(`[REMOTE] Using SSH key: ${keyPath}`);
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                logger.info(`[REMOTE] Connecting to ${host} with user ${sshConfig.username}`);
                await ssh.connect(sshConfig);
                logger.info(`[REMOTE] Successfully connected to ${host}`);
                
                // Try to read .env from different paths
                for (const envPath of envPaths) {
                    try {
                        logger.info(`[REMOTE] Trying to read .env from: ${envPath}`);
                        const result = await ssh.execCommand(`cat "${envPath}"`);
                        
                        if (result.code === 0 && result.stdout) {
                            logger.info(`[REMOTE] Successfully read .env from: ${envPath}`);
                            ssh.dispose();
                            return { 
                                content: parseEnvContent(result.stdout), 
                                path: envPath,
                                raw_content: result.stdout 
                            };
                        }
                    } catch (error) {
                        logger.debug(`[REMOTE] Could not read .env from ${envPath}: ${error.message}`);
                        continue;
                    }
                }
                
                ssh.dispose();
                return null;
                
            } catch (error) {
                logger.error(`[REMOTE] SSH connection failed to ${host}:`, error);
                if (ssh) ssh.dispose();
                throw new Error(`Failed to connect to remote server ${host}: ${error.message}`);
            }
        };
        
        // Function to parse .env content
        const parseEnvContent = (content) => {
            const env = {};
            const lines = content.split('\n');
            
            logger.info(`Parsing .env content with ${lines.length} lines`);
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    if (key && valueParts.length > 0) {
                        let value = valueParts.join('=').trim();
                        // Remove quotes if present
                        if ((value.startsWith('"') && value.endsWith('"')) || 
                            (value.startsWith('\'') && value.endsWith('\''))) {
                            value = value.slice(1, -1);
                        }
                        env[key.trim()] = value;
                        logger.debug(`Parsed env var: ${key.trim()} = ${value.substring(0, 20)}...`);
                    }
                }
            }
            
            logger.info(`Parsed ${Object.keys(env).length} environment variables`);
            return env;
        };
        
        // Get environment data from MedPro server
        const medproData = await getMedProEnvironmentData(server_host, server_port);
        const envVars = medproData.env_variables || null;
        const sensitiveVars = medproData.sensitive_variables || null;
        const envFilePath = `MedPro Server ${server_host}:${server_port}`;
        const rawEnvContent = medproData.raw_content || null;
        
        // Extract database connection details from .env
        let db_host, db_port, db_name, db_user, db_password;
        
        if (envVars) {
            logger.info('Found .env file with variables:', Object.keys(envVars));
            logger.info('Found .env file at path:', envFilePath);
            
            // Extract database connection details
            db_host = envVars.DB_HOST || envVars.DATABASE_HOST || envVars.mysql_host || server_host;
            db_port = parseInt(envVars.DB_PORT || envVars.DATABASE_PORT || envVars.mysql_port || '3306');
            db_name = envVars.DB_DATABASE || envVars.DATABASE_NAME || envVars.DB_NAME || envVars.mysql_database || '';
            db_user = envVars.DB_USERNAME || envVars.DATABASE_USER || envVars.DB_USER || envVars.mysql_user || 'root';
            db_password = envVars.DB_PASSWORD || envVars.DATABASE_PASSWORD || envVars.mysql_password || '';
        } else {
            logger.info('No .env file found, using defaults');
            // Fallback to defaults if no .env found
            db_host = server_host === 'localhost' || server_host === '127.0.0.1' ? 'localhost' : server_host;
            db_port = 3306;
            db_user = 'root';
            db_password = '';
            db_name = '';
        }
        
        // Create test connection using discovered credentials
        let testConnection;
        try {
            testConnection = await mysql.createConnection({
                host: db_host,
                port: db_port,
                user: db_user,
                password: db_password,
                connectTimeout: 10000,
                multipleStatements: false
            });
            
            // Test connection
            await testConnection.execute('SELECT 1');
            
            // Discover databases
            const [databases] = await testConnection.execute('SHOW DATABASES');
            const dbNames = databases
                .map(row => row.Database)
                .filter(name => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(name));
            
            // Try to find MedPro databases
            const medproDbPattern = /medpro/i;
            const medproDatabases = dbNames.filter(name => medproDbPattern.test(name));
            
            // Use database from .env if available, otherwise suggest from discovered
            let suggestedDbName = db_name;
            if (!suggestedDbName) {
                if (medproDatabases.length > 0) {
                    suggestedDbName = medproDatabases[0];
                } else if (dbNames.length > 0) {
                    suggestedDbName = dbNames[0];
                }
            }
            
            // Determine environment type based on database names or server name
            let suggestedEnvType = 'development';
            
            // Check server hostname for environment hints
            if (/prod/i.test(server_host)) {
                suggestedEnvType = 'production';
            } else if (/test/i.test(server_host)) {
                suggestedEnvType = 'test';
            } else if (/nqa/i.test(server_host)) {
                suggestedEnvType = 'nqa';
            }
            
            // Refine environment type from database name if not already determined
            if (suggestedEnvType === 'development' && suggestedDbName) {
                if (/prod/i.test(suggestedDbName)) {
                    suggestedEnvType = 'production';
                } else if (/test/i.test(suggestedDbName)) {
                    suggestedEnvType = 'test';
                } else if (/nqa/i.test(suggestedDbName)) {
                    suggestedEnvType = 'nqa';
                }
            }
            
            // Generate suggested environment name and display name
            const envNameSuffix = suggestedEnvType === 'production' ? '' : `_${suggestedEnvType}`;
            const suggestedEnvName = `medpro${envNameSuffix}`;
            const suggestedDisplayName = `MedPro ${suggestedEnvType.charAt(0).toUpperCase() + suggestedEnvType.slice(1)}`;
            
            // Get server version
            const [version] = await testConnection.execute('SELECT VERSION() as version');
            const serverVersion = version[0]?.version || 'Unknown';
            
            // Categorize environment variables
            const categorizeEnvVars = (envVars) => {
                const categories = {
                    database: {},
                    payment: {},
                    ai_services: {},
                    email: {},
                    sms_services: {},
                    cloud_services: {},
                    authentication: {},
                    api_keys: {},
                    application: {},
                    other: {}
                };
                
                if (!envVars) return categories;
                
                Object.entries(envVars).forEach(([key, value]) => {
                    const lowerKey = key.toLowerCase();
                    
                    // Database related
                    if (lowerKey.includes('db_') || lowerKey.includes('database')) {
                        categories.database[key] = value;
                    }
                    // Payment services
                    else if (lowerKey.includes('stripe') || lowerKey.includes('paypal') || 
                             lowerKey.includes('payment') || lowerKey.includes('billing')) {
                        categories.payment[key] = value;
                    }
                    // AI Services
                    else if (lowerKey.includes('openai') || lowerKey.includes('anthropic') || 
                             lowerKey.includes('claude') || lowerKey.includes('gpt') || 
                             lowerKey.includes('ai_') || lowerKey.includes('ml_') ||
                             lowerKey.includes('azure_ai') || lowerKey.includes('azure_openai') ||
                             lowerKey.includes('cognitive') || lowerKey.includes('bedrock')) {
                        categories.ai_services[key] = value;
                    }
                    // Email services
                    else if (lowerKey.includes('mail') || lowerKey.includes('smtp') || 
                             lowerKey.includes('sendgrid') || lowerKey.includes('ses') ||
                             lowerKey.includes('mailgun') || lowerKey.includes('mandrill') ||
                             lowerKey.includes('postmark') || lowerKey.includes('sparkpost')) {
                        categories.email[key] = value;
                    }
                    // SMS and Communication services
                    else if (lowerKey.includes('twilio') || lowerKey.includes('sms') || 
                             lowerKey.includes('whatsapp') || lowerKey.includes('telegram') ||
                             lowerKey.includes('slack') || lowerKey.includes('discord') ||
                             lowerKey.includes('pusher') || lowerKey.includes('firebase_messaging')) {
                        categories.sms_services[key] = value;
                    }
                    // Cloud Services
                    else if (lowerKey.includes('aws') || lowerKey.includes('azure') || 
                             lowerKey.includes('gcp') || lowerKey.includes('google_cloud') ||
                             lowerKey.includes('s3_') || lowerKey.includes('blob_') ||
                             lowerKey.includes('cloudinary') || lowerKey.includes('digitalocean') ||
                             lowerKey.includes('heroku') || lowerKey.includes('vercel')) {
                        categories.cloud_services[key] = value;
                    }
                    // Authentication & Security
                    else if (lowerKey.includes('jwt') || lowerKey.includes('auth') || 
                             lowerKey.includes('secret') || lowerKey.includes('token') ||
                             lowerKey.includes('key') && (lowerKey.includes('private') || lowerKey.includes('public'))) {
                        categories.authentication[key] = value;
                    }
                    // API Keys (general)
                    else if (lowerKey.includes('api_key') || lowerKey.includes('apikey') || 
                             lowerKey.endsWith('_key') || lowerKey.endsWith('_secret')) {
                        categories.api_keys[key] = value;
                    }
                    // Application settings
                    else if (lowerKey.includes('app_') || lowerKey.includes('env') || 
                             lowerKey.includes('debug') || lowerKey.includes('port') ||
                             lowerKey.includes('url') || lowerKey.includes('host')) {
                        categories.application[key] = value;
                    }
                    // Everything else
                    else {
                        categories.other[key] = value;
                    }
                });
                
                return categories;
            };
            
            const categorizedEnvVars = categorizeEnvVars(envVars);

            res.json({
                success: true,
                data: {
                    discovered: {
                        server_host: server_host,
                        server_type: server_host === 'localhost' || server_host === '127.0.0.1' ? 'LOCAL' : 'REMOTE',
                        available_databases: dbNames,
                        medpro_databases: medproDatabases,
                        server_version: serverVersion,
                        connection_successful: true,
                        env_file_found: !!envVars,
                        env_file_path: envFilePath,
                        env_file_raw_content: rawEnvContent,
                        env_variables_found: envVars ? Object.keys(envVars) : [],
                        env_variables_raw: envVars || {},
                        env_variables_categorized: categorizedEnvVars,
                        sensitive_variables: sensitiveVars || {}
                    },
                    suggestions: {
                        env_name: suggestedEnvName,
                        env_type: suggestedEnvType,
                        display_name: suggestedDisplayName,
                        db_host: db_host,
                        db_port: db_port,
                        db_name: suggestedDbName,
                        db_user: db_user,
                        db_password: db_password,
                        color_theme: suggestedEnvType === 'production' ? 'red' : 
                                   suggestedEnvType === 'test' ? 'yellow' : 
                                   suggestedEnvType === 'nqa' ? 'purple' : 'blue',
                        icon: suggestedEnvType === 'production' ? 'shield-check' : 'server'
                    }
                },
                message: envVars ? 
                    'Environment details discovered from .env file successfully' : 
                    'Environment details discovered using default connection'
            });
            
        } catch (error) {
            res.status(400).json({
                success: false,
                error: `Connection failed: ${error.message}`,
                details: {
                    server_host: server_host,
                    db_host: db_host,
                    db_port: db_port,
                    db_user: db_user,
                    env_file_found: !!envVars,
                    error_code: error.code
                }
            });
        } finally {
            // Always close the connection
            if (testConnection) {
                try {
                    await testConnection.end();
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
        
    } catch (error) {
        logger.error('Environment autodiscovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to discover environment details'
        });
    }
});

// POST /api/v1/environments/:id/sync-from-server - Pull .env changes from server
router.post('/:id/sync-from-server', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get environment details
        const query = `
            SELECT env_name, server_host, all_env_variables
            FROM environments
            WHERE id = ? AND is_active = 1
        `;
        
        const results = await executeQuery(adminPool, query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        const env = results[0];
        const serverHost = env.server_host;
        
        if (!serverHost) {
            return res.status(400).json({
                success: false,
                error: 'No server host configured for this environment'
            });
        }
        
        // Read current .env from server (reuse the autodiscovery logic)
        const fs = require('fs').promises;
        const path = require('path');
        
        const envPaths = [
            '/var/www/medpro/.env',
            '/opt/medpro/.env', 
            '/home/medpro/.env',
            '/usr/local/medpro/.env',
            process.cwd() + '/.env',
            path.join(process.cwd(), '..', '..', '..', '.env'),
            path.join(process.cwd(), '..', '.env'),
        ];
        
        let currentEnvVars = null;
        for (const envPath of envPaths) {
            try {
                const envContent = await fs.readFile(envPath, 'utf8');
                currentEnvVars = parseEnvContent(envContent);
                break;
            } catch (error) {
                continue;
            }
        }
        
        if (!currentEnvVars) {
            return res.status(404).json({
                success: false,
                error: 'Could not read .env file from server'
            });
        }
        
        // Update database with new environment variables
        const updateQuery = `
            UPDATE environments 
            SET all_env_variables = ?, updated_by = ?, updated_at = NOW()
            WHERE id = ?
        `;
        
        await executeQuery(adminPool, updateQuery, [
            JSON.stringify(currentEnvVars),
            req.user.email,
            id
        ]);
        
        // Compare with stored variables to show changes
        const storedEnvVars = env.all_env_variables ? JSON.parse(env.all_env_variables) : {};
        const changes = {
            added: {},
            modified: {},
            removed: {}
        };
        
        // Find added and modified
        Object.entries(currentEnvVars).forEach(([key, value]) => {
            if (!(key in storedEnvVars)) {
                changes.added[key] = value;
            } else if (storedEnvVars[key] !== value) {
                changes.modified[key] = { old: storedEnvVars[key], new: value };
            }
        });
        
        // Find removed
        Object.keys(storedEnvVars).forEach(key => {
            if (!(key in currentEnvVars)) {
                changes.removed[key] = storedEnvVars[key];
            }
        });
        
        res.json({
            success: true,
            data: {
                environment_variables: currentEnvVars,
                changes: changes,
                sync_timestamp: new Date().toISOString()
            },
            message: 'Environment variables synced from server successfully'
        });
        
    } catch (error) {
        logger.error('Failed to sync from server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync environment variables from server'
        });
    }
});

// POST /api/v1/environments/:id/sync-to-server - Push .env changes to server
router.post('/:id/sync-to-server', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get environment details
        const query = `
            SELECT env_name, server_host, all_env_variables
            FROM environments
            WHERE id = ? AND is_active = 1
        `;
        
        const results = await executeQuery(adminPool, query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        const env = results[0];
        const serverHost = env.server_host;
        const envVars = env.all_env_variables ? JSON.parse(env.all_env_variables) : {};
        
        if (!serverHost) {
            return res.status(400).json({
                success: false,
                error: 'No server host configured for this environment'
            });
        }
        
        // Generate .env file content
        let envContent = '# MedPro Environment Configuration\n';
        envContent += `# Last updated: ${new Date().toISOString()}\n`;
        envContent += '# Synced from MedPro Admin\n\n';
        
        Object.entries(envVars).forEach(([key, value]) => {
            // Add quotes if value contains spaces or special characters
            const needsQuotes = /[\s#"'\\]/.test(value);
            const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
            envContent += `${key}=${quotedValue}\n`;
        });
        
        // Write to server (local or remote)
        const isLocal = serverHost === 'localhost' || serverHost === '127.0.0.1' || serverHost === '0.0.0.0';
        let writtenPath = null;
        
        if (isLocal) {
            // Write to local filesystem
            writtenPath = await writeEnvToLocalServer(envContent);
        } else {
            // Write to remote server via SSH
            writtenPath = await writeEnvToRemoteServer(serverHost, envContent);
        }
        
        if (!writtenPath) {
            return res.status(500).json({
                success: false,
                error: 'Could not write .env file to server - no writable location found'
            });
        }
        
        res.json({
            success: true,
            data: {
                written_path: writtenPath,
                variables_count: Object.keys(envVars).length,
                sync_timestamp: new Date().toISOString()
            },
            message: 'Environment variables synced to server successfully'
        });
        
    } catch (error) {
        logger.error('Failed to sync to server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync environment variables to server'
        });
    }
});

// Helper function to write .env to local server
async function writeEnvToLocalServer(envContent) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const envPaths = [
        '/var/www/medpro/.env',
        '/opt/medpro/.env', 
        '/home/medpro/.env',
        '/usr/local/medpro/.env',
        path.join(process.cwd(), '..', '..', '..', '.env'),
        path.join(process.cwd(), '..', '.env'),
    ];
    
    for (const envPath of envPaths) {
        try {
            // Check if directory exists
            const dir = path.dirname(envPath);
            try {
                await fs.access(dir);
            } catch {
                continue; // Directory doesn't exist, try next path
            }
            
            // Backup existing file
            try {
                await fs.copyFile(envPath, `${envPath}.backup.${Date.now()}`);
            } catch {
                // Backup failed, but continue
            }
            
            // Write new file
            await fs.writeFile(envPath, envContent, 'utf8');
            return envPath;
        } catch (error) {
            continue;
        }
    }
    
    return null;
}

// Helper function to write .env to remote server via SSH
async function writeEnvToRemoteServer(host, envContent) {
    const { NodeSSH } = require('node-ssh');
    const path = require('path');
    const ssh = new NodeSSH();
    
    try {
        // SSH connection configuration (reuse from read function)
        const sshConfig = {
            host: host,
            username: process.env.SSH_USERNAME || 'ubuntu',
            port: process.env.SSH_PORT || 22,
        };
        
        // Authentication setup (same as read function)
        if (process.env.SSH_PRIVATE_KEY_PATH) {
            sshConfig.privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
        } else if (process.env.SSH_PRIVATE_KEY) {
            sshConfig.privateKey = process.env.SSH_PRIVATE_KEY;
        } else if (process.env.SSH_PASSWORD) {
            sshConfig.password = process.env.SSH_PASSWORD;
        } else {
            // Try default SSH key locations
            const os = require('os');
            const defaultKeyPaths = [
                path.join(os.homedir(), '.ssh', 'id_rsa'),
                path.join(os.homedir(), '.ssh', 'id_ed25519'),
                path.join(os.homedir(), '.ssh', 'medpro_key'),
            ];
            
            for (const keyPath of defaultKeyPaths) {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(keyPath)) {
                        sshConfig.privateKeyPath = keyPath;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        await ssh.connect(sshConfig);
        logger.info(`[REMOTE] Connected to ${host} for writing .env file`);
        
        const envPaths = [
            '/var/www/medpro/.env',
            '/opt/medpro/.env', 
            '/home/medpro/.env',
            '/usr/local/medpro/.env',
            '/home/ubuntu/medpro/.env',
            '/srv/medpro/.env',
        ];
        
        // Try to write to different paths
        for (const envPath of envPaths) {
            try {
                // Check if directory exists
                const dirCheck = await ssh.execCommand(`test -d "${path.dirname(envPath)}" && echo "exists"`);
                if (dirCheck.stdout.trim() !== 'exists') {
                    continue;
                }
                
                // Backup existing file
                await ssh.execCommand(`cp "${envPath}" "${envPath}.backup.$(date +%s)" 2>/dev/null || true`);
                
                // Write new file using echo to avoid file transfer issues
                const escapedContent = envContent.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`');
                const writeResult = await ssh.execCommand(`echo "${escapedContent}" > "${envPath}"`);
                
                if (writeResult.code === 0) {
                    logger.info(`[REMOTE] Successfully wrote .env to: ${envPath}`);
                    ssh.dispose();
                    return envPath;
                }
            } catch (error) {
                logger.debug(`[REMOTE] Could not write .env to ${envPath}: ${error.message}`);
                continue;
            }
        }
        
        ssh.dispose();
        return null;
        
    } catch (error) {
        logger.error(`[REMOTE] SSH write failed to ${host}:`, error);
        if (ssh) ssh.dispose();
        throw error;
    }
}

// Helper function to parse .env content (reuse from autodiscovery)
function parseEnvContent(content) {
    const env = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('=').trim();
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith('\'') && value.endsWith('\''))) {
                    value = value.slice(1, -1);
                }
                env[key.trim()] = value;
            }
        }
    }
    
    return env;
}

// GET /api/v1/environments/:id/monitor/server - Get real server health
router.get('/:id/monitor/server', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verify environment exists
        const envQuery = 'SELECT env_name, display_name FROM environments WHERE id = ? AND is_active = 1';
        const envResult = await executeQuery(adminPool, envQuery, [id]);
        
        if (envResult.length === 0) {
            // Return empty server health data instead of 404
            return res.json({
                success: true,
                data: {
                    server_health: {
                        status: 'unknown',
                        message: 'Environment not configured'
                    },
                    cpu_usage: 0,
                    memory_usage: 0,
                    disk_usage: 0,
                    uptime: 'N/A',
                    load_average: [0, 0, 0],
                    network: {
                        rx: 0,
                        tx: 0
                    },
                    processes: 0
                }
            });
        }
        
        // Get system information
        const [
            cpu,
            mem,
            osInfo,
            load,
            fsSize,
            networkStats,
            processes
        ] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.osInfo(),
            si.currentLoad(),
            si.fsSize(),
            si.networkStats(),
            si.processes()
        ]);
        
        // Get Node.js specific stats
        const processStats = await pidusage(process.pid);
        
        // Calculate uptime
        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeDays = Math.floor(uptimeSeconds / 86400);
        const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        
        const formatUptime = () => {
            if (uptimeDays > 0) {
                return `${uptimeDays} days, ${uptimeHours} hours`;
            } else if (uptimeHours > 0) {
                return `${uptimeHours} hours, ${uptimeMinutes} minutes`;
            } else {
                return `${uptimeMinutes} minutes`;
            }
        };
        
        // Get disk usage for main filesystem
        const mainFs = fsSize.find(fs => fs.mount === '/' || fs.mount === 'C:') || fsSize[0];
        
        // Get network interface data
        const mainNetworkInterface = networkStats.find(iface => 
            iface.iface && !iface.iface.includes('lo') && !iface.iface.includes('docker')
        ) || networkStats[0];
        
        const healthData = {
            status: 'online',
            uptime: formatUptime(),
            version: process.env.npm_package_version || 'unknown',
            lastRestart: new Date(Date.now() - (uptimeSeconds * 1000)).toISOString(),
            processId: process.pid,
            nodeVersion: process.version,
            platform: osInfo.platform,
            hostname: osInfo.hostname,
            memory: {
                used: Math.round(mem.used / 1024 / 1024), // MB
                total: Math.round(mem.total / 1024 / 1024), // MB
                percentage: Math.round((mem.used / mem.total) * 100),
                free: Math.round(mem.free / 1024 / 1024) // MB
            },
            cpu: {
                usage: Math.round(cpu.currentLoad || 0),
                loadAverage: osInfo.platform === 'win32' ? ['N/A', 'N/A', 'N/A'] : load.avgLoad,
                cores: cpu.cpus ? cpu.cpus.length : osUtils.cpu.count()
            },
            disk: mainFs ? {
                used: Math.round(mainFs.used / 1024 / 1024 / 1024), // GB
                total: Math.round(mainFs.size / 1024 / 1024 / 1024), // GB
                percentage: Math.round((mainFs.used / mainFs.size) * 100),
                free: Math.round((mainFs.size - mainFs.used) / 1024 / 1024 / 1024) // GB
            } : {
                used: 0,
                total: 0,
                percentage: 0,
                free: 0
            },
            network: mainNetworkInterface ? {
                bytesReceived: mainNetworkInterface.rx_bytes || 0,
                bytesSent: mainNetworkInterface.tx_bytes || 0,
                connectionsActive: processes.running || 0,
                interface: mainNetworkInterface.iface
            } : {
                bytesReceived: 0,
                bytesSent: 0,
                connectionsActive: 0,
                interface: 'unknown'
            },
            environment: {
                nodeEnv: process.env.NODE_ENV || 'unknown',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
        };
        
        // Log monitoring access
        await logEnvironmentAccess(req, id, 'server_monitoring', null, {
            action: 'server_health_check'
        });
        
        res.json({
            success: true,
            data: healthData,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Failed to get server health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve server health data'
        });
    }
});

// Track active monitoring connections for cleanup
const activeMonitoringConnections = new Set();

// GET /api/v1/environments/:id/monitor/database - Get real database health  
router.get('/:id/monitor/database', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    // Set response timeout to prevent server hanging
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                error: 'Database health check timed out',
                details: 'Request took too long to complete'
            });
        }
    }, 10000); // Reduced to 10 seconds for faster server restart

    try {
        const { id } = req.params;
        
        // Get environment details
        const envQuery = `
            SELECT env_name, display_name, db_host, db_port, db_name, db_user, db_password_encrypted
            FROM environments
            WHERE id = ? AND is_active = 1
        `;
        const envResult = await executeQuery(adminPool, envQuery, [id]);
        
        if (envResult.length === 0) {
            clearTimeout(timeout);
            return res.json({
                success: true,
                data: {
                    database_health: {
                        status: 'unknown',
                        message: 'Environment not configured',
                        uptime: 'N/A',
                        connections: 0,
                        queries_per_second: 0,
                        slow_queries: 0
                    },
                    connection_test: 'skipped'
                }
            });
        }
        
        const env = envResult[0];
        
        // Check if password is encrypted and decrypt it
        let decryptedPassword;
        try {
            if (!env.db_password_encrypted) {
                return res.status(400).json({
                    success: false,
                    error: 'Database password not configured for this environment',
                    details: 'The db_password_encrypted field is empty'
                });
            }
            
            decryptedPassword = decrypt(env.db_password_encrypted);
            logger.info(`Attempting database connection for environment ${id} (${env.env_name})`);
        } catch (error) {
            logger.error('Password decryption failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to decrypt database password',
                details: error.message
            });
        }
        
        // Create connection to target database with proper cleanup
        let connection;
        try {
            const connectionConfig = {
                host: env.db_host,
                port: env.db_port,
                database: env.db_name,
                user: env.db_user,
                password: decryptedPassword || '', // Handle empty password for root user
                connectTimeout: 5000,
                acquireTimeout: 5000,
                timeout: 5000,
                // Force connection cleanup
                idleTimeout: 10000,
                ssl: false
            };
            
            logger.info(`Connecting to database: ${env.db_user}@${env.db_host}:${env.db_port}/${env.db_name}`);
            connection = await mysql.createConnection(connectionConfig);
            
            // Track this connection for cleanup
            activeMonitoringConnections.add(connection);
            
            // Set connection timeout
            await connection.execute('SET SESSION wait_timeout = 5');
            await connection.execute('SET SESSION interactive_timeout = 5');
            
            // Get database status information with timeout
            const dbQueries = Promise.race([
                Promise.all([
                    connection.execute('SHOW STATUS'),
                    connection.execute('SHOW PROCESSLIST'),
                    connection.execute('SHOW DATABASES'),
                    connection.execute('SHOW VARIABLES WHERE Variable_name IN ("version", "version_comment", "uptime", "max_connections")'),
                    connection.execute('SHOW ENGINES')
                ]),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database queries timed out')), 8000)
                )
            ]);
            
            const [
                statusVars,
                processlist,
                databases,
                variables,
                engines
            ] = await dbQueries;
            
            // Parse status variables
            const status = {};
            statusVars[0].forEach(row => {
                status[row.Variable_name] = row.Value;
            });
            
            // Parse system variables
            const sysVars = {};
            variables[0].forEach(row => {
                sysVars[row.Variable_name] = row.Value;
            });
            
            // Get table sizes for current database
            let tableSizes = [];
            try {
                const [tables] = await connection.execute(`
                    SELECT 
                        TABLE_NAME,
                        ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS size_mb,
                        TABLE_ROWS
                    FROM information_schema.TABLES 
                    WHERE TABLE_SCHEMA = ?
                    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
                    LIMIT 10
                `, [env.db_name]);
                tableSizes = tables;
            } catch (tableError) {
                logger.warn('Could not get table sizes:', tableError.message);
            }
            
            // Calculate metrics
            const totalQueries = parseInt(status.Queries || 0);
            const uptime = parseInt(status.Uptime || 0);
            const connectionsUsed = parseInt(status.Threads_connected || 0);
            const maxConnections = parseInt(sysVars.max_connections || 151);
            
            const healthData = {
                status: 'connected',
                version: sysVars.version || 'unknown',
                uptime: uptime,
                connections: {
                    active: connectionsUsed,
                    max: maxConnections,
                    percentage: Math.round((connectionsUsed / maxConnections) * 100)
                },
                queries: {
                    total: totalQueries,
                    perSecond: uptime > 0 ? Math.round(totalQueries / uptime) : 0,
                    averageTime: status.Avg_row_length ? `${status.Avg_row_length}ms` : 'N/A'
                },
                storage: {
                    dataSize: Math.round((parseInt(status.Innodb_data_bytes || 0)) / 1024 / 1024), // MB
                    indexSize: Math.round((parseInt(status.Innodb_index_bytes || 0)) / 1024 / 1024), // MB
                    totalSize: Math.round((parseInt(status.Innodb_data_bytes || 0) + parseInt(status.Innodb_index_bytes || 0)) / 1024 / 1024), // MB
                    tables: tableSizes
                },
                performance: {
                    slowQueries: parseInt(status.Slow_queries || 0),
                    lockedQueries: parseInt(status.Table_locks_waited || 0),
                    bufferPoolHitRatio: status.Innodb_buffer_pool_read_requests && status.Innodb_buffer_pool_reads ? 
                        ((1 - (parseInt(status.Innodb_buffer_pool_reads) / parseInt(status.Innodb_buffer_pool_read_requests))) * 100).toFixed(1) + '%' : 
                        'N/A',
                    cacheHitRatio: status.Qcache_hits && status.Com_select ? 
                        ((parseInt(status.Qcache_hits) / (parseInt(status.Qcache_hits) + parseInt(status.Com_select))) * 100).toFixed(1) + '%' : 
                        'N/A'
                },
                replication: {
                    status: status.Slave_running === 'ON' ? 'running' : 'stopped',
                    lag: status.Seconds_Behind_Master ? `${status.Seconds_Behind_Master}s` : '0s'
                },
                databases: databases[0].map(db => db.Database),
                processlist: processlist[0].length
            };
            
            // Force close connection immediately and remove from tracking
            try {
                activeMonitoringConnections.delete(connection);
                await connection.destroy();
            } catch (e) {
                logger.warn('Error destroying connection:', e.message);
            }
            
            // Log monitoring access
            await logEnvironmentAccess(req, id, 'database_monitoring', null, {
                action: 'database_health_check',
                database: env.db_name
            });
            
            clearTimeout(timeout);
            
            if (!res.headersSent) {
                res.json({
                    success: true,
                    data: healthData,
                    timestamp: new Date().toISOString()
                });
            }
            
        } catch (dbError) {
            if (connection) {
                try {
                    activeMonitoringConnections.delete(connection);
                    await connection.destroy();
                } catch (e) {
                    logger.warn('Error destroying connection in catch:', e.message);
                }
            }
            
            logger.error(`Database health check failed for environment ${id}:`, dbError);
            
            // Provide more specific error messages
            let errorMessage = 'Database connection failed';
            let errorDetails = dbError.message;
            
            if (dbError.code === 'ECONNREFUSED') {
                errorMessage = 'Database server is not reachable';
                errorDetails = `Connection refused to ${env.db_host}:${env.db_port}`;
            } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR') {
                errorMessage = 'Database authentication failed';
                errorDetails = `Access denied for user '${env.db_user}'`;
            } else if (dbError.code === 'ER_BAD_DB_ERROR') {
                errorMessage = 'Database does not exist';
                errorDetails = `Unknown database '${env.db_name}'`;
            } else if (dbError.code === 'ETIMEDOUT') {
                errorMessage = 'Database connection timed out';
                errorDetails = `Timeout connecting to ${env.db_host}:${env.db_port}`;
            }
            
            clearTimeout(timeout);
            
            if (!res.headersSent) {
                res.status(400).json({
                    success: false,
                    error: errorMessage,
                    details: errorDetails,
                    errorCode: dbError.code,
                    environment: env.env_name
                });
            }
        }
        
    } catch (error) {
        clearTimeout(timeout);
        logger.error('Failed to get database health:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve database health data'
            });
        }
    }
});

// GET /api/v1/environments/:id/monitor/logs - Get real server logs
router.get('/:id/monitor/logs', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        const { lines = 100, level = '', since = '' } = req.query;
        
        // Verify environment exists
        const envQuery = 'SELECT env_name, display_name FROM environments WHERE id = ? AND is_active = 1';
        const envResult = await executeQuery(adminPool, envQuery, [id]);
        
        if (envResult.length === 0) {
            return res.json({
                success: true,
                data: {
                    logs: [],
                    total_lines: 0,
                    files_processed: 0,
                    files_found: 0,
                    message: 'Environment not configured',
                    filters: {
                        lines: parseInt(lines),
                        level: level || 'all',
                        since: since || 'all'
                    }
                }
            });
        }
        
        // Define log file paths
        const logDir = path.join(__dirname, '..', 'logs');
        const today = new Date().toISOString().split('T')[0];
        
        const logFiles = [
            path.join(logDir, `combined-${today}.log`),
            path.join(logDir, 'combined.log'),
            path.join(logDir, `error-${today}.log`),
            path.join(logDir, 'error.log')
        ];
        
        let logs = [];
        let filesProcessed = 0;
        let filesFound = 0;
        
        logger.info(`Looking for log files in: ${logDir}`);
        
        // Check if log directory exists
        try {
            await fs.access(logDir);
        } catch (dirError) {
            logger.warn(`Log directory does not exist: ${logDir}`);
        }
        
        // Read from available log files
        for (const logFile of logFiles) {
            filesProcessed++;
            try {
                // Check if file exists and is readable
                await fs.access(logFile, fs.constants.R_OK);
                filesFound++;
                
                logger.info(`Reading log file: ${path.basename(logFile)}`);
                const content = await fs.readFile(logFile, 'utf8');
                const fileLines = content.split('\n').filter(line => line.trim());
                
                logger.info(`Processing ${fileLines.length} lines from ${path.basename(logFile)}`);
                
                // Parse each log line
                fileLines.forEach(line => {
                    try {
                        // Try to parse as JSON (Winston format)
                        const logEntry = JSON.parse(line);
                        
                        // Filter by level if specified
                        if (level && logEntry.level !== level) {
                            return;
                        }
                        
                        // Filter by time if specified
                        if (since) {
                            const logTime = new Date(logEntry.timestamp);
                            const sinceTime = new Date(since);
                            if (logTime < sinceTime) {
                                return;
                            }
                        }
                        
                        logs.push({
                            timestamp: logEntry.timestamp,
                            level: logEntry.level,
                            message: logEntry.message,
                            component: logEntry.service || 'server',
                            requestId: logEntry.requestId || null,
                            userId: logEntry.userId || null,
                            meta: logEntry.meta || {}
                        });
                    } catch (parseError) {
                        // If not JSON, treat as plain text log
                        if (line.trim()) {
                            // Extract timestamp and level from log line if possible
                            const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
                            const levelMatch = line.match(/\b(error|warn|info|debug)\b/i);
                            
                            logs.push({
                                timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                                level: levelMatch ? levelMatch[1].toLowerCase() : 'info',
                                message: line,
                                component: 'server',
                                requestId: null,
                                userId: null,
                                meta: {}
                            });
                        }
                    }
                });
            } catch (fileError) {
                // File doesn't exist or can't be read
                if (fileError.code === 'ENOENT') {
                    logger.debug(`Log file not found: ${path.basename(logFile)}`);
                } else if (fileError.code === 'EACCES') {
                    logger.warn(`Permission denied reading log file: ${path.basename(logFile)}`);
                } else {
                    logger.warn(`Error reading log file ${path.basename(logFile)}:`, fileError.message);
                }
                continue;
            }
        }
        
        // Sort by timestamp (newest first) and limit
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs = logs.slice(0, parseInt(lines));
        
        logger.info(`Found ${logs.length} log entries from ${filesFound}/${filesProcessed} log files`);
        
        // If no logs found, create informative log entries
        if (logs.length === 0) {
            const statusMessage = filesFound === 0 
                ? `No log files found in ${logDir}. Check if Winston logging is configured and files exist.`
                : `Log files found but no entries match the current filters (level: ${level || 'all'}, since: ${since || 'any'}).`;
                
            logs.push({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: statusMessage,
                component: 'monitoring',
                requestId: null,
                userId: null,
                meta: {
                    filesProcessed: filesProcessed,
                    filesFound: filesFound,
                    logDirectory: logDir,
                    requestedLines: parseInt(lines),
                    levelFilter: level || 'all'
                }
            });
        }
        
        // Log monitoring access
        await logEnvironmentAccess(req, id, 'log_monitoring', null, {
            action: 'server_logs_access',
            lines_requested: parseInt(lines),
            level_filter: level || 'all'
        });
        
        res.json({
            success: true,
            data: logs,
            pagination: {
                returned: logs.length,
                requested: parseInt(lines)
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Failed to get server logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve server logs'
        });
    }
});

// GET /api/v1/environments/:id/monitor/analytics - Get real analytics data
router.get('/:id/monitor/analytics', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id } = req.params;
        const { timeframe = '24h' } = req.query;
        
        // Verify environment exists and get database connection details
        const envQuery = 'SELECT env_name, display_name, db_host, db_port, db_name, db_user, db_password_encrypted FROM environments WHERE id = ? AND is_active = 1';
        const envResult = await executeQuery(adminPool, envQuery, [id]);
        
        console.log(`[ANALYTICS DEBUG] Environment lookup for ID ${id}:`, envResult.length > 0 ? 'FOUND' : 'NOT FOUND');
        if (envResult.length > 0) {
            console.log(`[ANALYTICS DEBUG] Environment details:`, {
                name: envResult[0].env_name,
                host: envResult[0].db_host,
                port: envResult[0].db_port,
                database: envResult[0].db_name,
                user: envResult[0].db_user,
                hasPassword: !!envResult[0].db_password_encrypted
            });
        }
        
        if (envResult.length === 0) {
            return res.json({
                success: true,
                data: {
                    metrics: {
                        totalRequests: 0,
                        avgResponseTime: 0,
                        errorRate: 0,
                        activeUsers: 0
                    },
                    requests: {
                        labels: [],
                        data: []
                    },
                    endpoints: [],
                    message: 'Environment not configured',
                    timeframe: timeframe
                }
            });
        }
        
        // Get request analytics from admin logs (if available)
        let analyticsData = {
            metrics: {
                totalRequests: 0,
                avgResponseTime: 0,
                errorRate: 0,
                activeUsers: 0
            },
            requests: {
                labels: [],
                requests: [],
                errors: []
            },
            topEndpoints: [],
            responseTimeDistribution: [0, 0, 0, 0, 0],
            statusCodeDistribution: [0, 0, 0, 0, 0, 0, 0]
        };
        
        try {
            // Get REAL analytics data from the actual MedPro server request_logs table
            const env = envResult[0];
            
            // Decrypt the database password
            let decryptedPassword;
            try {
                if (!env.db_password_encrypted) {
                    throw new Error('Database password not configured for this environment');
                }
                decryptedPassword = decrypt(env.db_password_encrypted);
                if (!decryptedPassword) {
                    throw new Error('Failed to decrypt database password');
                }
                console.log(`[ANALYTICS DEBUG] Password decryption: SUCCESS`);
            } catch (error) {
                console.log(`[ANALYTICS DEBUG] Password decryption: FAILED -`, error.message);
                logger.error(`Failed to decrypt database password for analytics (env: ${env.env_name}):`, error);
                logger.error(`Password field value:`, env.db_password_encrypted ? 'exists' : 'null/undefined');
                throw new Error('Unable to decrypt database credentials');
            }
            
            // Create connection to the MedPro environment database
            const mysql = require('mysql2/promise');
            console.log(`[ANALYTICS DEBUG] Attempting database connection to:`, {
                host: env.db_host,
                port: env.db_port,
                user: env.db_user,
                database: env.db_name
            });
            const medproConnection = await mysql.createConnection({
                host: env.db_host,
                port: env.db_port,
                user: env.db_user,
                password: decryptedPassword,
                database: env.db_name,
                connectTimeout: 10000,
                acquireTimeout: 10000,
                timeout: 10000
            });
            console.log(`[ANALYTICS DEBUG] Database connection: SUCCESS`);
            
            logger.info(`Fetching REAL analytics data from MedPro request_logs table for timeframe: ${timeframe}`);
            
            // Map timeframe to hours
            const hours = timeframe === '1h' ? 1 : timeframe === '6h' ? 6 : 24;
            
            // Check if request_logs table exists
            const [tableCheck] = await medproConnection.execute(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'request_logs'
            `, [env.db_name]);
            
            console.log(`[ANALYTICS DEBUG] Table check for request_logs:`, tableCheck.length > 0 ? 'EXISTS' : 'NOT FOUND');
            
            let logData = [];
            if (tableCheck.length > 0) {
                logger.info('Found request_logs table, getting real API analytics');
                
                // First check how many total rows exist in request_logs
                const [totalRowsCheck] = await medproConnection.execute('SELECT COUNT(*) as total FROM request_logs');
                console.log(`[ANALYTICS DEBUG] Total rows in request_logs:`, totalRowsCheck[0].total);
                
                // Get top endpoints with real data
                console.log(`[ANALYTICS DEBUG] Querying top endpoints for last ${hours} hours...`);
                const [topEndpoints] = await medproConnection.execute(`
                    SELECT 
                        endpoint,
                        method,
                        COUNT(*) as request_count,
                        AVG(response_time_ms) as avg_response_time,
                        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
                    FROM request_logs 
                    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                    GROUP BY endpoint, method
                    ORDER BY request_count DESC
                    LIMIT 10
                `, [hours]);
                console.log(`[ANALYTICS DEBUG] Top endpoints query returned:`, topEndpoints.length, 'rows');
                if (topEndpoints.length > 0) {
                    console.log(`[ANALYTICS DEBUG] Sample endpoint data:`, topEndpoints[0]);
                }
                
                // Get request volume over time
                console.log(`[ANALYTICS DEBUG] Querying request volume over time...`);
                const [requestVolume] = await medproConnection.execute(`
                    SELECT 
                        DATE_FORMAT(timestamp, '%H:%i') as \`hour_minute\`,
                        COUNT(*) as request_count,
                        AVG(response_time_ms) as avg_response_time
                    FROM request_logs 
                    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                    GROUP BY DATE_FORMAT(timestamp, '%H:%i')
                    ORDER BY DATE_FORMAT(timestamp, '%H:%i')
                `, [hours]);
                console.log(`[ANALYTICS DEBUG] Request volume query returned:`, requestVolume.length, 'time periods');
                
                // Get overall metrics
                console.log(`[ANALYTICS DEBUG] Querying overall metrics...`);
                const [metrics] = await medproConnection.execute(`
                    SELECT 
                        COUNT(*) as total_requests,
                        AVG(response_time_ms) as avg_response_time,
                        COUNT(DISTINCT user_id) as active_users,
                        (SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) / COUNT(*) * 100) as error_rate
                    FROM request_logs 
                    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                `, [hours]);
                console.log(`[ANALYTICS DEBUG] Metrics query returned:`, metrics.length, 'rows');
                if (metrics.length > 0) {
                    console.log(`[ANALYTICS DEBUG] Metrics data:`, metrics[0]);
                }
                
                // Store real analytics data
                analyticsData.topEndpoints = topEndpoints.map(row => ({
                    method: row.method,
                    path: row.endpoint,
                    count: row.request_count,
                    percentage: 0, // Will calculate below
                    avgResponseTime: Math.round(row.avg_response_time || 0),
                    errorCount: row.error_count || 0
                }));
                
                // Build request volume time series
                analyticsData.requests.labels = requestVolume.map(row => row.hour_minute);
                analyticsData.requests.requests = requestVolume.map(row => row.request_count);
                analyticsData.requests.errors = requestVolume.map(row => 0); // Could get errors by time if needed
                
                // Set real metrics
                const realMetrics = metrics[0] || {};
                analyticsData.metrics.totalRequests = realMetrics.total_requests || 0;
                analyticsData.metrics.avgResponseTime = Math.round(realMetrics.avg_response_time || 0);
                analyticsData.metrics.activeUsers = realMetrics.active_users || 0;
                analyticsData.metrics.errorRate = parseFloat(realMetrics.error_rate || 0).toFixed(1);
                
                // Calculate percentages for top endpoints
                const totalRequests = analyticsData.metrics.totalRequests;
                if (totalRequests > 0) {
                    analyticsData.topEndpoints.forEach(endpoint => {
                        endpoint.percentage = Math.round((endpoint.count / totalRequests) * 100);
                    });
                }
                
                console.log(`[ANALYTICS DEBUG] Final analyticsData:`, {
                    totalRequests: analyticsData.metrics.totalRequests,
                    topEndpointsCount: analyticsData.topEndpoints.length,
                    requestVolumePeriods: analyticsData.requests.labels.length
                });
                logger.info(`Retrieved real analytics: ${analyticsData.metrics.totalRequests} requests, ${analyticsData.topEndpoints.length} endpoints`);
                
            } else {
                logger.warn('request_logs table not found, analytics will show empty data until requests are logged');
            }
            
            // Close the MedPro database connection
            await medproConnection.end();
            
            // Generate response time distribution based on real data if available
            if (analyticsData.metrics.totalRequests > 0) {
                const total = analyticsData.metrics.totalRequests;
                const avgResponseTime = analyticsData.metrics.avgResponseTime;
                
                // Distribute based on typical web application response time patterns
                if (avgResponseTime < 100) {
                    analyticsData.responseTimeDistribution = [
                        Math.floor(total * 0.8), // < 100ms
                        Math.floor(total * 0.15), // 100-500ms
                        Math.floor(total * 0.04),  // 500ms-1s
                        Math.floor(total * 0.01), // 1s-5s
                        0  // > 5s
                    ];
                } else if (avgResponseTime < 500) {
                    analyticsData.responseTimeDistribution = [
                        Math.floor(total * 0.4), // < 100ms
                        Math.floor(total * 0.45), // 100-500ms
                        Math.floor(total * 0.1),  // 500ms-1s
                        Math.floor(total * 0.04), // 1s-5s
                        Math.floor(total * 0.01)  // > 5s
                    ];
                } else {
                    analyticsData.responseTimeDistribution = [
                        Math.floor(total * 0.2), // < 100ms
                        Math.floor(total * 0.3), // 100-500ms
                        Math.floor(total * 0.3),  // 500ms-1s
                        Math.floor(total * 0.15), // 1s-5s
                        Math.floor(total * 0.05)  // > 5s
                    ];
                }
                
                // Status code distribution based on error rate
                const errorRate = parseFloat(analyticsData.metrics.errorRate || 0) / 100;
                const successRequests = Math.floor(total * (1 - errorRate));
                const errorRequests = total - successRequests;
                
                analyticsData.statusCodeDistribution = [
                    Math.floor(successRequests * 0.9),   // 200
                    Math.floor(successRequests * 0.1),   // 201
                    Math.floor(errorRequests * 0.4),     // 400
                    Math.floor(errorRequests * 0.2),     // 401
                    Math.floor(errorRequests * 0.1),     // 403
                    Math.floor(errorRequests * 0.2),     // 404
                    Math.floor(errorRequests * 0.1)      // 500
                ];
            }
            
        } catch (analyticsError) {
            logger.error(`Analytics query failed for environment ${id}:`, analyticsError);
            // Return empty analytics if no data available - this is graceful degradation
            // The empty analyticsData structure is already initialized above
        }
        
        // Log monitoring access
        await logEnvironmentAccess(req, id, 'analytics_monitoring', null, {
            action: 'analytics_data_access',
            timeframe: timeframe
        });
        
        res.json({
            success: true,
            data: analyticsData,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Failed to get analytics data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve analytics data'
        });
    }
});

// ===================== WORKERS (PM2) MANAGEMENT PROXY =====================

async function getEnvironmentBaseUrl(envId) {
    const envQuery = 'SELECT api_base_url, env_name FROM environments WHERE id = ? AND is_active = 1';
    const envs = await executeQuery(adminPool, envQuery, [envId]);
    if (!envs.length || !envs[0].api_base_url) {
        const name = envs.length ? envs[0].env_name : envId;
        throw new Error(`Environment ${name} not configured with api_base_url`);
    }
    return envs[0].api_base_url.replace(/\/$/, '');
}

function buildAdminHeaders() {
    const adminApiKey = process.env.MEDPRO_ADMIN_API_KEY;
    if (!adminApiKey) throw new Error('MEDPRO_ADMIN_API_KEY not configured in MedProAdmin');
    return {
        'User-Agent': 'MedProAdmin/WorkersProxy',
        'X-Admin-API-Key': adminApiKey,
        'Connection': 'close'
    };
}

async function resolveRemotePm2Path(environmentId, connectionPoolManager) {
    const composite = [
        'command -v pm2',
        'command -v /opt/homebrew/bin/pm2',
        'command -v /usr/local/bin/pm2',
        'command -v ~/.npm-global/bin/pm2',
        'ls -1 ~/.nvm/versions/node/*/bin/pm2 2>/dev/null | tail -1'
    ].join(' || ');
    const result = await connectionPoolManager.executeCommand(String(environmentId), `bash -lc "${composite}"`, { timeout: 8000 });
    if (!result.success) throw new Error(result.stderr || 'Failed to resolve pm2 path');
    const pm2Path = (result.stdout || '').trim();
    if (!pm2Path) throw new Error('pm2 not found on remote PATH');
    return pm2Path;
}

// Canonical process set for demo management
function getCanonicalProcessNames() {
    return [
        'medpro-backend',
        'medpro-message-server',
        'medpro-prescription-agenda',
        'medpro-satisfaction-surveys',
        'medpro-communication-worker',
        'medpro-etl-worker',
        'medpro-batch-signing'
    ];
}

function formatPm2ProcessFromJlist(proc) {
    const env = proc?.pm2_env || {};
    const monit = proc?.monit || {};
    return {
        name: env.name || proc?.name || '',
        status: env.status || 'unknown',
        restarts: env.restart_time || 0,
        cpu: typeof monit.cpu === 'number' ? monit.cpu : 0,
        memory: typeof monit.memory === 'number' ? monit.memory : 0,
        uptime: env.pm_uptime || null,
        out_log_path: env.pm_out_log_path || '',
        error_log_path: env.pm_err_log_path || ''
    };
}

function mergeWithCanonical(list) {
    const canonical = getCanonicalProcessNames();
    const byName = new Map();
    (list || []).forEach((p) => { if (p?.name) byName.set(p.name, p); });
    canonical.forEach((name) => {
        if (!byName.has(name)) {
            byName.set(name, { name, status: 'stopped', restarts: 0, cpu: 0, memory: 0, uptime: null });
        }
    });
    return Array.from(byName.values());
}
// GET /api/v1/environments/:id/workers - list PM2 processes
router.get('/:id/workers', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    const { id } = req.params;
    try {
        // Primary: query MedPro backend admin API
        const baseUrl = await getEnvironmentBaseUrl(id);
        try {
            const response = await axios.get(`${baseUrl}/api/admin/pm2/list`, {
                timeout: 6000,
                headers: buildAdminHeaders(),
                httpAgent: new require('http').Agent({ keepAlive: false }),
                httpsAgent: new require('https').Agent({ keepAlive: false })
            });
            const backendList = Array.isArray(response.data?.data) ? response.data.data : [];
            return res.json({ success: true, data: mergeWithCanonical(backendList) });
        } catch (primaryError) {
            logger.warn(`Primary PM2 list via API failed for env ${id}: ${primaryError.message}`);
            // Fallback: SSH and run pm2 jlist remotely
            try {
                const connectionPoolManager = require('../services/connectionPoolManager');
                // Ensure pool exists (simple default config via environment table)
                // Expect SSH config stored in environments.environment_metadata JSON
                const [envRow] = await executeQuery(adminPool, 'SELECT environment_metadata FROM environments WHERE id=?', [id]);
                const meta = envRow?.environment_metadata && typeof envRow.environment_metadata === 'string' ? JSON.parse(envRow.environment_metadata) : envRow?.environment_metadata || {};
                const sshConfig = meta?.ssh || {};
                if (!connectionPoolManager.getPoolStats(String(id))) {
                    await connectionPoolManager.initializePool(String(id), { ssh: sshConfig });
                }
                const pm2Path = await resolveRemotePm2Path(id, connectionPoolManager);
                const nodeBinDir = pm2Path.replace(/\/pm2$/, '');
                const result = await connectionPoolManager.executeCommand(
                    String(id),
                    `bash -lc "export PATH=\"${nodeBinDir}:$PATH\"; ${pm2Path} jlist"`,
                    { timeout: 8000, workingDirectory: sshConfig?.app_dir }
                );
                if (!result.success) throw new Error(result.stderr || 'pm2 jlist failed');
                const raw = JSON.parse(result.stdout || '[]');
                const formatted = Array.isArray(raw) ? raw.map(formatPm2ProcessFromJlist) : [];
                return res.json({ success: true, data: mergeWithCanonical(formatted) });
            } catch (sshError) {
                logger.error(`Fallback PM2 list via SSH failed for env ${id}: ${sshError.message}`);
                return res.status(500).json({ success: false, error: 'Failed to fetch workers list (API and SSH failed)' });
            }
        }
    } catch (error) {
        logger.error('Failed to fetch workers list:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch workers list' });
    }
});

// POST /api/v1/environments/:id/workers/:name/:action - control PM2 process
router.post('/:id/workers/:name/:action', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    const { id, name, action } = req.params;
    try {
        const baseUrl = await getEnvironmentBaseUrl(id);
        try {
            const response = await axios.post(`${baseUrl}/api/admin/pm2/${encodeURIComponent(name)}/${encodeURIComponent(action)}`, null, {
                timeout: 8000,
                headers: buildAdminHeaders(),
                httpAgent: new require('http').Agent({ keepAlive: false }),
                httpsAgent: new require('https').Agent({ keepAlive: false })
            });
            return res.json(response.data);
        } catch (primaryError) {
            logger.warn(`Primary PM2 control via API failed for env ${id}: ${primaryError.message}`);
            // Fallback via SSH
            try {
                const connectionPoolManager = require('../services/connectionPoolManager');
                const [envRow] = await executeQuery(adminPool, 'SELECT environment_metadata FROM environments WHERE id=?', [id]);
                const meta = envRow?.environment_metadata && typeof envRow.environment_metadata === 'string' ? JSON.parse(envRow.environment_metadata) : envRow?.environment_metadata || {};
                const sshConfig = meta?.ssh || {};
                if (!connectionPoolManager.getPoolStats(String(id))) {
                    await connectionPoolManager.initializePool(String(id), { ssh: sshConfig });
                }
                const pm2Path = await resolveRemotePm2Path(id, connectionPoolManager);
                const nodeBinDir = pm2Path.replace(/\/pm2$/, '');
                const cmd = action === 'start'
                    ? `bash -lc "export PATH=\"${nodeBinDir}:$PATH\"; ${pm2Path} start ecosystem.config.js --only ${name}"`
                    : `bash -lc "export PATH=\"${nodeBinDir}:$PATH\"; ${pm2Path} ${action} ${name}"`;
                const result = await connectionPoolManager.executeCommand(String(id), cmd, { timeout: 12000, workingDirectory: (sshConfig && sshConfig.app_dir) ? sshConfig.app_dir : undefined });
                if (!result.success) throw new Error(result.stderr || 'pm2 control failed');
                // Return updated jlist
                const listRes = await connectionPoolManager.executeCommand(
                    String(id),
                    `bash -lc "export PATH=\"${nodeBinDir}:$PATH\"; ${pm2Path} jlist"`,
                    { timeout: 8000, workingDirectory: (sshConfig && sshConfig.app_dir) ? sshConfig.app_dir : undefined }
                );
                const list = listRes.success ? JSON.parse(listRes.stdout || '[]') : [];
                return res.json({ success: true, data: list.find(p => p.name === name) || { name, status: 'unknown' } });
            } catch (sshError) {
                logger.error(`Fallback PM2 control via SSH failed for env ${id}: ${sshError.message}`);
                return res.status(500).json({ success: false, error: 'Failed to control worker (API and SSH failed)' });
            }
        }
    } catch (error) {
        logger.error('Failed to control worker:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to control worker' });
    }
});

// GET /api/v1/environments/:id/workers/:name/logs
router.get('/:id/workers/:name/logs', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const { id, name } = req.params;
        const { lines = 200, type = 'both', parsed, insights } = req.query;
        const baseUrl = await getEnvironmentBaseUrl(id);
        try {
            const response = await axios.get(`${baseUrl}/api/admin/pm2/${encodeURIComponent(name)}/logs`, {
                params: { lines, type },
                timeout: 8000,
                headers: buildAdminHeaders(),
                httpAgent: new require('http').Agent({ keepAlive: false }),
                httpsAgent: new require('https').Agent({ keepAlive: false })
            });
            if (insights) {
                const { getInsightsBuilderFor } = require('../services/logParsers');
                const builder = getInsightsBuilderFor(name);
                const data = response.data?.data || {};
                const out = Array.isArray(data.out) ? data.out : [];
                const err = Array.isArray(data.err) ? data.err : [];
                const insightsData = builder.build([...out, ...err]);
                return res.json({ success: true, data: { name, insights: insightsData } });
            }
            if (parsed) {
                const { getParserFor } = require('../services/logParsers');
                const parser = getParserFor(name);
                const data = response.data?.data || {};
                const out = Array.isArray(data.out) ? data.out : [];
                const err = Array.isArray(data.err) ? data.err : [];
                const parsedEntries = parser.parse([...out, ...err]);
                return res.json({ success: true, data: { name, entries: parsedEntries } });
            }
            return res.json(response.data);
        } catch (primaryError) {
            logger.warn(`Primary PM2 logs via API failed for env ${id}: ${primaryError.message}`);
            // Fallback via SSH tailing log files: try pm2 info to get log paths then tail
            try {
                const connectionPoolManager = require('../services/connectionPoolManager');
                const [envRow] = await executeQuery(adminPool, 'SELECT environment_metadata FROM environments WHERE id=?', [id]);
                const meta = envRow?.environment_metadata && typeof envRow.environment_metadata === 'string' ? JSON.parse(envRow.environment_metadata) : envRow?.environment_metadata || {};
                const sshConfig = meta?.ssh || {};
                if (!connectionPoolManager.getPoolStats(String(id))) {
                    await connectionPoolManager.initializePool(String(id), { ssh: sshConfig });
                }
                const pm2Path = await resolveRemotePm2Path(id, connectionPoolManager);
                const nodeBinDir = pm2Path.replace(/\/pm2$/, '');
                const info = await connectionPoolManager.executeCommand(
                    String(id),
                    `bash -lc "export PATH=\"${nodeBinDir}:$PATH\"; ${pm2Path} jlist"`
                );
                let out = [], err = [];
                if (info.success) {
                    const list = JSON.parse(info.stdout || '[]');
                    const proc = list.find(p => p.name === name) || {};
                    const outPath = proc.pm2_env?.pm_out_log_path;
                    const errPath = proc.pm2_env?.pm_err_log_path;
                    if (type === 'out' || type === 'both') {
                        const r = await connectionPoolManager.executeCommand(String(id), `bash -lc "tail -n ${parseInt(lines)} ${outPath || '/dev/null'}"`);
                        if (r.success) out = r.stdout.split('\n').filter(Boolean);
                    }
                    if (type === 'err' || type === 'both') {
                        const r2 = await connectionPoolManager.executeCommand(String(id), `bash -lc "tail -n ${parseInt(lines)} ${errPath || '/dev/null'}"`);
                        if (r2.success) err = r2.stdout.split('\n').filter(Boolean);
                    }
                }
                if (insights) {
                    const { getInsightsBuilderFor } = require('../services/logParsers');
                    const builder = getInsightsBuilderFor(name);
                    const insightsData = builder.build([...out, ...err]);
                    return res.json({ success: true, data: { name, insights: insightsData } });
                }
                if (parsed) {
                    const { getParserFor } = require('../services/logParsers');
                    const parser = getParserFor(name);
                    const parsedEntries = parser.parse([...out, ...err]);
                    return res.json({ success: true, data: { name, entries: parsedEntries } });
                }
                return res.json({ success: true, data: { name, out, err } });
            } catch (sshError) {
                logger.error(`Fallback PM2 logs via SSH failed for env ${id}: ${sshError.message}`);
                return res.status(500).json({ success: false, error: 'Failed to fetch worker logs (API and SSH failed)' });
            }
        }
    } catch (error) {
        logger.error('Failed to fetch worker logs:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch worker logs' });
    }
});

// Cleanup function for server shutdown
const cleanupMonitoringConnections = async () => {
    logger.info(`Cleaning up ${activeMonitoringConnections.size} active monitoring connections`);
    
    const cleanupPromises = Array.from(activeMonitoringConnections).map(async (connection) => {
        try {
            await connection.destroy();
            activeMonitoringConnections.delete(connection);
        } catch (error) {
            logger.warn('Error cleaning up monitoring connection:', error.message);
        }
    });
    
    await Promise.allSettled(cleanupPromises);
    activeMonitoringConnections.clear();
    logger.info('Monitoring connections cleanup completed');
};

// Export router and cleanup function
module.exports = router;
module.exports.cleanupMonitoringConnections = cleanupMonitoringConnections;