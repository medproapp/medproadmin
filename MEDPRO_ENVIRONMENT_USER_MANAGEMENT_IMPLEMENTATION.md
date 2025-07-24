# MedPro Environment Management & User Management Implementation Guide

## Executive Summary

This document provides a comprehensive implementation guide for adding MedPro environment management and user management features to the MedPro Admin system. The implementation follows existing patterns and architecture while introducing new capabilities for managing multiple MedPro environments and their users.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Management Feature](#environment-management-feature)
3. [User Management Feature](#user-management-feature)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [Implementation Phases](#implementation-phases)
8. [Security Considerations](#security-considerations)
9. [Testing Strategy](#testing-strategy)
10. [Migration Guide](#migration-guide)

## Architecture Overview

### Current System Architecture

The MedPro Admin system currently uses:
- **Backend**: Node.js + Express.js with JWT authentication
- **Database**: Dual database architecture
  - `medpro_admin`: Write operations for admin features
  - `medpro`: Read-only access to main system data
- **Frontend**: Vanilla JavaScript with component-based architecture
- **Authentication**: JWT tokens with role-based permissions

### Proposed Architecture Extension

```
┌─────────────────────────────────────────────────────────────────┐
│                    MedPro Admin Frontend                        │
│                Environment Manager | User Manager               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ JWT Auth
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server (Port 4040)                   │
│              Environment API | User Management API              │
└─────────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   medpro_admin (Write)  │     │  Multiple MedPro DBs    │
│  - environments table   │     │  - Production (Read)    │
│  - env_access_log      │     │  - Test (Read)         │
│  - user_audit_log      │     │  - Development (Read)  │
└─────────────────────────┘     └─────────────────────────┘
```

## Environment Management Feature

### Overview

The environment management feature allows administrators to:
- Configure multiple MedPro environments (production, test, development, NQA)
- Store environment-specific connection details securely
- Switch between environments seamlessly
- Track environment access and changes

### Key Components

1. **Environment Configuration**
   - Server connection details
   - Database credentials (encrypted)
   - API endpoints
   - Environment metadata

2. **Environment Selector**
   - Quick switch dropdown in header
   - Environment status indicator
   - Last accessed timestamp

3. **Environment Settings Page**
   - CRUD operations for environments
   - Connection testing
   - Access logs

## User Management Feature

### Overview

The user management feature provides:
- View users from selected MedPro environment
- User details and activity information
- Role and permission management
- User status management (active/inactive)
- Audit trail for all user operations

### Key Components

1. **User List View**
   - Paginated table with search/filter
   - Quick actions (view, edit status)
   - Bulk operations support

2. **User Detail View**
   - Complete user information
   - Associated practitioners/patients
   - Activity history
   - Permission management

3. **User Analytics**
   - User growth trends
   - Activity metrics
   - Role distribution

## Database Schema

### New Tables in medpro_admin Database

```sql
-- Environment configuration table
CREATE TABLE environments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    env_name VARCHAR(50) UNIQUE NOT NULL,
    env_type ENUM('production', 'test', 'development', 'nqa') NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Connection details (encrypted)
    db_host VARCHAR(255) NOT NULL,
    db_port INT DEFAULT 3306,
    db_name VARCHAR(100) NOT NULL,
    db_user VARCHAR(100) NOT NULL,
    db_password_encrypted TEXT NOT NULL, -- AES encrypted
    
    -- API configuration
    api_base_url VARCHAR(255),
    api_key_encrypted TEXT,
    
    -- Status and metadata
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    color_theme VARCHAR(7) DEFAULT '#0066cc', -- For UI distinction
    icon VARCHAR(50) DEFAULT 'server',
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    
    INDEX idx_active (is_active),
    INDEX idx_type (env_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Environment access log
CREATE TABLE environment_access_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    environment_id INT NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    action ENUM('connect', 'disconnect', 'test', 'query') NOT NULL,
    
    -- Query details for user management
    query_type VARCHAR(50), -- e.g., 'list_users', 'view_user', 'update_user'
    affected_entity VARCHAR(255), -- e.g., user email
    query_details JSON,
    
    -- Results
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    response_time_ms INT,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE,
    INDEX idx_env_admin (environment_id, admin_email),
    INDEX idx_created (created_at),
    INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User management audit log
CREATE TABLE user_management_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    environment_id INT NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    
    -- Action details
    action ENUM('view', 'update_status', 'update_role', 'update_permissions', 'reset_password', 'export') NOT NULL,
    target_user_email VARCHAR(255) NOT NULL,
    target_user_type ENUM('practitioner', 'patient', 'admin') NOT NULL,
    
    -- Changes
    changes_json JSON,
    previous_values JSON,
    new_values JSON,
    
    -- Results
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(36),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE,
    INDEX idx_env_admin (environment_id, admin_email),
    INDEX idx_target (target_user_email),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin permissions extension for environment access
ALTER TABLE admin_permissions ADD COLUMN allowed_environments JSON COMMENT 'Array of environment IDs';
ALTER TABLE admin_permissions ADD COLUMN can_manage_environments BOOLEAN DEFAULT FALSE;
ALTER TABLE admin_permissions ADD COLUMN can_manage_users BOOLEAN DEFAULT FALSE;
```

### Sample Data

```sql
-- Insert default environments
INSERT INTO environments (env_name, env_type, display_name, description, db_host, db_port, db_name, db_user, db_password_encrypted, created_by) VALUES
('medpro_prod', 'production', 'Production', 'Main production environment', 'prod.medpro.com', 3306, 'medpro', 'medpro_read', AES_ENCRYPT('password', 'encryption_key'), 'system'),
('medpro_test', 'test', 'Testing', 'Testing environment for QA', 'test.medpro.com', 3306, 'medpro_test', 'medpro_read', AES_ENCRYPT('password', 'encryption_key'), 'system'),
('medpro_dev', 'development', 'Development', 'Development environment', 'localhost', 3306, 'medpro_dev', 'medpro', AES_ENCRYPT('medpro', 'encryption_key'), 'system');

-- Update admin permissions
UPDATE admin_permissions 
SET allowed_environments = JSON_ARRAY(1, 2, 3),
    can_manage_environments = TRUE,
    can_manage_users = TRUE
WHERE role = 'super_admin';
```

## API Endpoints

### Environment Management Endpoints

#### Backend Implementation - Environment Routes
Create file: `/medproadmin/server/routes/environments.js`

```javascript
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool, medproPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// Encryption helpers
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_char_encryption_key_here';
const algorithm = 'aes-256-cbc';

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

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
        
        // Check user's allowed environments
        const userEnvs = req.user.permissions.allowed_environments || [];
        const filteredEnvs = environments.filter(env => 
            req.user.permissions.role === 'super_admin' || userEnvs.includes(env.id)
        );
        
        res.json({
            success: true,
            data: filteredEnvs
        });
    } catch (error) {
        logger.error('Error fetching environments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch environments'
        });
    }
});

// GET /api/v1/environments/:id - Get environment details
router.get('/:id', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const envId = req.params.id;
        
        const [environment] = await executeQuery(adminPool, 
            'SELECT * FROM environments WHERE id = ? AND is_active = 1',
            [envId]
        );
        
        if (!environment) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        // Check access
        const userEnvs = req.user.permissions.allowed_environments || [];
        if (req.user.permissions.role !== 'super_admin' && !userEnvs.includes(environment.id)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to this environment'
            });
        }
        
        res.json({
            success: true,
            data: environment
        });
    } catch (error) {
        logger.error('Error fetching environment:', error);
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
    body('env_name').isAlphanumeric('en-US', {ignore: '_'}).notEmpty(),
    body('env_type').isIn(['production', 'test', 'development', 'nqa']),
    body('display_name').notEmpty(),
    body('db_host').notEmpty(),
    body('db_name').notEmpty(),
    body('db_user').notEmpty(),
    body('db_password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            errors: errors.array() 
        });
    }
    
    try {
        const {
            env_name, env_type, display_name, description,
            db_host, db_port, db_name, db_user, db_password,
            api_base_url, api_key, color_theme, icon
        } = req.body;
        
        // Encrypt sensitive data
        const encryptedPassword = encrypt(db_password);
        const encryptedApiKey = api_key ? encrypt(api_key) : null;
        
        const result = await executeQuery(adminPool, `
            INSERT INTO environments (
                env_name, env_type, display_name, description,
                db_host, db_port, db_name, db_user, db_password_encrypted,
                api_base_url, api_key_encrypted, color_theme, icon,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            env_name, env_type, display_name, description,
            db_host, db_port || 3306, db_name, db_user, encryptedPassword,
            api_base_url, encryptedApiKey, color_theme || '#0066cc', icon || 'server',
            req.user.email
        ]);
        
        await logAdminAction(req, 'create', 'environment', result.insertId, req.body);
        
        res.status(201).json({
            success: true,
            data: {
                id: result.insertId,
                env_name,
                display_name
            }
        });
    } catch (error) {
        logger.error('Error creating environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create environment'
        });
    }
});

// POST /api/v1/environments/:id/test - Test environment connection
router.post('/:id/test', verifyToken, requirePermission('can_manage_environments'), async (req, res) => {
    try {
        const envId = req.params.id;
        
        const [environment] = await executeQuery(adminPool,
            'SELECT * FROM environments WHERE id = ?',
            [envId]
        );
        
        if (!environment) {
            return res.status(404).json({
                success: false,
                error: 'Environment not found'
            });
        }
        
        // Decrypt password
        const password = decrypt(environment.db_password_encrypted);
        
        // Test connection
        let testConnection;
        try {
            testConnection = await mysql.createConnection({
                host: environment.db_host,
                port: environment.db_port,
                user: environment.db_user,
                password: password,
                database: environment.db_name
            });
            
            // Test query
            await testConnection.execute('SELECT 1');
            await testConnection.end();
            
            // Log successful test
            await executeQuery(adminPool, `
                INSERT INTO environment_access_log 
                (environment_id, admin_email, action, success, ip_address, user_agent)
                VALUES (?, ?, 'test', true, ?, ?)
            `, [envId, req.user.email, req.ip, req.get('user-agent')]);
            
            res.json({
                success: true,
                data: {
                    status: 'connected',
                    message: 'Connection successful'
                }
            });
        } catch (connError) {
            // Log failed test
            await executeQuery(adminPool, `
                INSERT INTO environment_access_log 
                (environment_id, admin_email, action, success, error_message, ip_address, user_agent)
                VALUES (?, ?, 'test', false, ?, ?, ?)
            `, [envId, req.user.email, connError.message, req.ip, req.get('user-agent')]);
            
            res.json({
                success: false,
                error: 'Connection failed',
                details: connError.message
            });
        }
    } catch (error) {
        logger.error('Error testing environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test environment'
        });
    }
});

// POST /api/v1/environments/:id/connect - Switch to environment
router.post('/:id/connect', verifyToken, requirePermission('can_manage_users'), async (req, res) => {
    try {
        const envId = req.params.id;
        const sessionId = crypto.randomUUID();
        
        // Store in session
        req.session = req.session || {};
        req.session.currentEnvironment = envId;
        req.session.environmentSessionId = sessionId;
        
        // Log access
        await executeQuery(adminPool, `
            INSERT INTO environment_access_log 
            (environment_id, admin_email, action, session_id, ip_address, user_agent)
            VALUES (?, ?, 'connect', ?, ?, ?)
        `, [envId, req.user.email, sessionId, req.ip, req.get('user-agent')]);
        
        const [environment] = await executeQuery(adminPool,
            'SELECT id, env_name, display_name, env_type, is_active FROM environments WHERE id = ?',
            [envId]
        );
        
        res.json({
            success: true,
            data: {
                environment,
                connection_status: 'connected',
                session_id: sessionId
            }
        });
    } catch (error) {
        logger.error('Error connecting to environment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to connect to environment'
        });
    }
});

module.exports = router;
```

### User Management Endpoints

#### Backend Implementation - User Routes
Create file: `/medproadmin/server/routes/users.js`

```javascript
const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const { executeQuery } = require('../config/database');
const { getEnvironmentConnection } = require('../services/environmentService');
const logger = require('../utils/logger');

// Middleware to get environment connection
async function withEnvironment(req, res, next) {
    try {
        const envId = req.headers['x-environment-id'] || req.session?.currentEnvironment;
        if (!envId) {
            return res.status(400).json({
                success: false,
                error: 'No environment selected'
            });
        }
        
        req.envConnection = await getEnvironmentConnection(envId);
        req.environmentId = envId;
        next();
    } catch (error) {
        logger.error('Error getting environment connection:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to connect to environment'
        });
    }
}

// GET /api/v1/users - List users (paginated)
router.get('/', verifyToken, requirePermission('can_manage_users'), withEnvironment, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let whereConditions = ['1=1'];
        let params = [];
        
        if (search) {
            whereConditions.push('(email LIKE ? OR fullname LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (role) {
            whereConditions.push('role = ?');
            params.push(role);
        }
        
        if (status) {
            whereConditions.push('status = ?');
            params.push(status);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get total count
        const [countResult] = await executeQuery(req.envConnection, 
            `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`,
            params
        );
        const total = countResult.total;
        
        // Get paginated users
        const users = await executeQuery(req.envConnection, `
            SELECT 
                email, fullname, role, plan, status, 
                activatedate, admin, first_login,
                stripe_customer, stripe_subscription
            FROM users 
            WHERE ${whereClause}
            ORDER BY email ASC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);
        
        // Log access
        await executeQuery(adminPool, `
            INSERT INTO environment_access_log 
            (environment_id, admin_email, action, query_type, query_details, success, ip_address, user_agent)
            VALUES (?, ?, 'query', 'list_users', ?, true, ?, ?)
        `, [
            req.environmentId, 
            req.user.email, 
            JSON.stringify({ page, limit, search, role, status }),
            req.ip,
            req.get('user-agent')
        ]);
        
        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        logger.error('Error listing users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list users'
        });
    }
});

// GET /api/v1/users/:email - Get user details
router.get('/:email', verifyToken, requirePermission('can_manage_users'), withEnvironment, async (req, res) => {
    try {
        const userEmail = req.params.email;
        
        // Get user details
        const [user] = await executeQuery(req.envConnection,
            'SELECT * FROM users WHERE email = ?',
            [userEmail]
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Get related practitioners
        const practitioners = await executeQuery(req.envConnection,
            'SELECT * FROM practitioners WHERE email = ? OR relateduser = ?',
            [userEmail, userEmail]
        );
        
        // Get related patients (if applicable)
        const patients = await executeQuery(req.envConnection,
            'SELECT COUNT(*) as count FROM patients WHERE email = ?',
            [userEmail]
        );
        
        // Log access
        await executeQuery(adminPool, `
            INSERT INTO user_management_log 
            (environment_id, admin_email, action, target_user_email, target_user_type, success, ip_address, user_agent)
            VALUES (?, ?, 'view', ?, ?, true, ?, ?)
        `, [
            req.environmentId,
            req.user.email,
            userEmail,
            user.role,
            req.ip,
            req.get('user-agent')
        ]);
        
        res.json({
            success: true,
            data: {
                user,
                practitioners,
                patient_count: patients[0].count
            }
        });
    } catch (error) {
        logger.error('Error fetching user details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user details'
        });
    }
});

// PUT /api/v1/users/:email/status - Update user status
router.put('/:email/status', verifyToken, requirePermission('can_manage_users'), withEnvironment, async (req, res) => {
    try {
        const userEmail = req.params.email;
        const { status } = req.body;
        
        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status'
            });
        }
        
        // Get current user
        const [currentUser] = await executeQuery(req.envConnection,
            'SELECT status FROM users WHERE email = ?',
            [userEmail]
        );
        
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Update status
        await executeQuery(req.envConnection,
            'UPDATE users SET status = ? WHERE email = ?',
            [status, userEmail]
        );
        
        // Log change
        await executeQuery(adminPool, `
            INSERT INTO user_management_log 
            (environment_id, admin_email, action, target_user_email, target_user_type, 
             changes_json, previous_values, new_values, success, ip_address, user_agent)
            VALUES (?, ?, 'update_status', ?, 'user', ?, ?, ?, true, ?, ?)
        `, [
            req.environmentId,
            req.user.email,
            userEmail,
            JSON.stringify({ status }),
            JSON.stringify({ status: currentUser.status }),
            JSON.stringify({ status }),
            req.ip,
            req.get('user-agent')
        ]);
        
        res.json({
            success: true,
            message: 'User status updated successfully'
        });
    } catch (error) {
        logger.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

module.exports = router;
```

### Request/Response Examples

#### Switch Environment
```javascript
// Request
POST /api/v1/environments/2/connect
Authorization: Bearer <jwt_token>

// Response
{
  "success": true,
  "data": {
    "environment": {
      "id": 2,
      "env_name": "medpro_test",
      "display_name": "Testing",
      "env_type": "test",
      "is_active": true
    },
    "connection_status": "connected",
    "session_id": "env_session_uuid"
  }
}
```

#### List Users
```javascript
// Request
GET /api/v1/users?page=1&limit=20&search=john&role=practitioner
Authorization: Bearer <jwt_token>
X-Environment-ID: 2

// Response
{
  "success": true,
  "data": {
    "users": [
      {
        "email": "john.doe@example.com",
        "fullname": "John Doe",
        "role": "practitioner",
        "status": "active",
        "last_login": "2025-07-21T10:00:00Z",
        "created_at": "2025-01-15T08:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

## Backend Service Layer

### Environment Service
Create file: `/medproadmin/server/services/environmentService.js`

```javascript
const mysql = require('mysql2/promise');
const { executeQuery, adminPool } = require('../config/database');
const logger = require('../utils/logger');

// Cache for environment connections
const connectionCache = new Map();

// Decrypt helper (import from routes/environments.js)
const { decrypt } = require('../routes/environments');

/**
 * Get a database connection for a specific environment
 */
async function getEnvironmentConnection(envId) {
    // Check cache
    if (connectionCache.has(envId)) {
        const cached = connectionCache.get(envId);
        // Test if connection is still alive
        try {
            await cached.ping();
            return cached;
        } catch (error) {
            // Connection is dead, remove from cache
            connectionCache.delete(envId);
        }
    }
    
    // Get environment details
    const [environment] = await executeQuery(adminPool,
        'SELECT * FROM environments WHERE id = ? AND is_active = 1',
        [envId]
    );
    
    if (!environment) {
        throw new Error('Environment not found or inactive');
    }
    
    // Decrypt password
    const password = decrypt(environment.db_password_encrypted);
    
    // Create connection pool for this environment
    const pool = mysql.createPool({
        host: environment.db_host,
        port: environment.db_port,
        user: environment.db_user,
        password: password,
        database: environment.db_name,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });
    
    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    // Cache the pool
    connectionCache.set(envId, pool);
    
    return pool;
}

/**
 * Clear environment connection cache
 */
function clearConnectionCache(envId = null) {
    if (envId) {
        const pool = connectionCache.get(envId);
        if (pool) {
            pool.end();
            connectionCache.delete(envId);
        }
    } else {
        // Clear all connections
        for (const [id, pool] of connectionCache) {
            pool.end();
        }
        connectionCache.clear();
    }
}

/**
 * Get environment statistics
 */
async function getEnvironmentStats(envId) {
    const pool = await getEnvironmentConnection(envId);
    
    try {
        // Get user counts by role
        const userStats = await executeQuery(pool, `
            SELECT 
                role,
                COUNT(*) as count,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
            FROM users
            GROUP BY role
        `);
        
        // Get recent activity
        const recentActivity = await executeQuery(pool, `
            SELECT COUNT(*) as login_count
            FROM users
            WHERE last_login > DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);
        
        // Get growth metrics
        const growthMetrics = await executeQuery(pool, `
            SELECT 
                DATE_FORMAT(activatedate, '%Y-%m') as month,
                COUNT(*) as new_users
            FROM users
            WHERE activatedate > DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month
            ORDER BY month
        `);
        
        return {
            userStats,
            recentActivity: recentActivity[0].login_count,
            growthMetrics
        };
    } catch (error) {
        logger.error('Error getting environment stats:', error);
        throw error;
    }
}

module.exports = {
    getEnvironmentConnection,
    clearConnectionCache,
    getEnvironmentStats
};
```

## Frontend Components

### Directory Structure

```
medproadmin/
├── environments/
│   ├── index.html                    # Environment management page
│   ├── css/
│   │   └── environments.css          # Environment-specific styles
│   └── js/
│       ├── app.js                    # Main environment app
│       ├── components/
│       │   ├── environmentList.js    # Environment list component
│       │   ├── environmentEditor.js  # Environment CRUD component
│       │   ├── environmentSelector.js # Header dropdown component
│       │   └── connectionTest.js     # Connection testing component
│       └── services/
│           └── environmentApi.js     # API service layer
│
├── users/
│   ├── index.html                    # User management page
│   ├── css/
│   │   └── users.css                 # User management styles
│   └── js/
│       ├── app.js                    # Main user management app
│       ├── components/
│       │   ├── userList.js           # User list/table component
│       │   ├── userDetail.js         # User detail view
│       │   ├── userFilters.js        # Search/filter component
│       │   ├── userStats.js          # User statistics
│       │   └── permissionEditor.js   # Permission management
│       └── services/
│           └── userApi.js            # User API service
│
└── shared/
    └── js/
        └── environmentContext.js     # Shared environment state
```

### Frontend Implementation

#### Environment Management Page
Create file: `/medproadmin/environments/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Environment Management - MedPro Admin</title>
    
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Shared Styles -->
    <link rel="stylesheet" href="/medproadmin/shared/css/admin-base.css">
    <!-- Page Specific Styles -->
    <link rel="stylesheet" href="./css/environments.css">
</head>
<body>
    <!-- Header -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container-fluid">
            <a class="navbar-brand" href="/medproadmin">
                <i class="fas fa-hospital me-2"></i>MedPro Admin
            </a>
            <div class="ms-auto d-flex align-items-center">
                <!-- Environment Selector -->
                <div id="environment-selector-container" class="me-3"></div>
                <!-- User Info -->
                <span class="navbar-text me-3">
                    <i class="fas fa-user-circle me-1"></i>
                    <span id="admin-email">Loading...</span>
                </span>
                <button class="btn btn-outline-light btn-sm" onclick="adminAuth.logout()">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </div>
    </nav>

    <!-- Sidebar -->
    <div class="container-fluid">
        <div class="row">
            <nav class="col-md-2 d-md-block bg-light sidebar">
                <div class="sidebar-sticky pt-3">
                    <ul class="nav flex-column admin-nav">
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin">
                                <i class="fas fa-dashboard me-2"></i>Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link active" href="/medproadmin/environments">
                                <i class="fas fa-server me-2"></i>Environments
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin/users">
                                <i class="fas fa-users me-2"></i>User Management
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin/product-catalog">
                                <i class="fas fa-box me-2"></i>Product Catalog
                            </a>
                        </li>
                    </ul>
                </div>
            </nav>

            <!-- Main Content -->
            <main class="col-md-10 ms-sm-auto px-md-4">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2">
                        <i class="fas fa-server me-2"></i>Environment Management
                    </h1>
                    <div class="btn-toolbar mb-2 mb-md-0">
                        <button type="button" class="btn btn-primary" id="btn-add-environment">
                            <i class="fas fa-plus me-2"></i>Add Environment
                        </button>
                    </div>
                </div>

                <!-- Environment List -->
                <div id="environment-list-container">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2">Loading environments...</p>
                    </div>
                </div>
            </main>
        </div>
    </div>

    <!-- Environment Editor Modal -->
    <div class="modal fade" id="environment-editor-modal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="environment-editor-title">
                        <i class="fas fa-server me-2"></i>Environment Configuration
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body" id="environment-editor-body">
                    <!-- Editor content will be loaded here -->
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script type="module">
        import '/medproadmin/shared/js/adminAuth.js';
        import '/medproadmin/shared/js/adminUtils.js';
        import './js/app.js';
    </script>
</body>
</html>
```

#### Environment List Component
Create file: `/medproadmin/environments/js/components/environmentList.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';

export class EnvironmentList {
    constructor(container) {
        this.container = container;
        this.environments = [];
        this.init();
    }
    
    async init() {
        await this.loadEnvironments();
        this.bindEvents();
    }
    
    async loadEnvironments() {
        try {
            const response = await authenticatedFetch('/api/v1/environments');
            if (response.success) {
                this.environments = response.data;
                this.render();
            } else {
                showToast('Failed to load environments', 'error');
            }
        } catch (error) {
            console.error('Error loading environments:', error);
            showToast('Error loading environments', 'error');
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="row g-4">
                ${this.environments.map(env => this.renderEnvironmentCard(env)).join('')}
            </div>
        `;
    }
    
    renderEnvironmentCard(env) {
        const typeColors = {
            production: 'danger',
            test: 'warning',
            development: 'info',
            nqa: 'secondary'
        };
        
        const typeIcons = {
            production: 'fa-server',
            test: 'fa-flask',
            development: 'fa-code',
            nqa: 'fa-check-circle'
        };
        
        return `
            <div class="col-md-6 col-lg-4">
                <div class="card environment-card ${env.is_default ? 'border-primary' : ''}">
                    <div class="card-header bg-${typeColors[env.env_type]} text-white">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                <i class="fas ${typeIcons[env.env_type]} me-2"></i>
                                ${this.escapeHtml(env.display_name)}
                            </h5>
                            ${env.is_default ? '<span class="badge bg-light text-dark">Default</span>' : ''}
                        </div>
                    </div>
                    <div class="card-body">
                        <p class="card-text">
                            <small class="text-muted">${this.escapeHtml(env.description || 'No description')}</small>
                        </p>
                        <div class="environment-details">
                            <div class="detail-item">
                                <i class="fas fa-database me-2"></i>
                                <span>${env.db_name}@${env.db_host}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-plug me-2"></i>
                                <span>Port: ${env.db_port}</span>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-light">
                        <div class="btn-group btn-group-sm w-100" role="group">
                            <button class="btn btn-outline-primary" onclick="testEnvironment(${env.id})">
                                <i class="fas fa-plug"></i> Test
                            </button>
                            <button class="btn btn-outline-secondary" onclick="editEnvironment(${env.id})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-outline-success" onclick="connectEnvironment(${env.id})">
                                <i class="fas fa-link"></i> Connect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    bindEvents() {
        // Global functions for button clicks
        window.testEnvironment = async (id) => {
            await this.testConnection(id);
        };
        
        window.editEnvironment = (id) => {
            this.editEnvironment(id);
        };
        
        window.connectEnvironment = async (id) => {
            await this.connectToEnvironment(id);
        };
    }
    
    async testConnection(envId) {
        try {
            showLoading('Testing connection...');
            const response = await authenticatedFetch(`/api/v1/environments/${envId}/test`, {
                method: 'POST'
            });
            
            hideLoading();
            
            if (response.success && response.data.status === 'connected') {
                showToast('Connection successful!', 'success');
            } else {
                showToast(`Connection failed: ${response.error || response.data.details}`, 'error');
            }
        } catch (error) {
            hideLoading();
            showToast('Error testing connection', 'error');
        }
    }
    
    async connectToEnvironment(envId) {
        try {
            const response = await authenticatedFetch(`/api/v1/environments/${envId}/connect`, {
                method: 'POST'
            });
            
            if (response.success) {
                showToast(`Connected to ${response.data.environment.display_name}`, 'success');
                // Update global environment context
                if (window.environmentContext) {
                    window.environmentContext.currentEnvironment = response.data.environment;
                    window.environmentContext.notifyListeners();
                }
            } else {
                showToast('Failed to connect to environment', 'error');
            }
        } catch (error) {
            showToast('Error connecting to environment', 'error');
        }
    }
    
    editEnvironment(envId) {
        // Trigger environment editor
        const event = new CustomEvent('edit-environment', { detail: { envId } });
        document.dispatchEvent(event);
    }
}
```

#### Environment Editor Component
Create file: `/medproadmin/environments/js/components/environmentEditor.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';

export class EnvironmentEditor {
    constructor() {
        this.modal = null;
        this.form = null;
        this.isEditing = false;
        this.currentEnvId = null;
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        const modalHtml = `
            <div class="modal fade" id="environmentEditorModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-server me-2"></i>
                                <span id="modal-title">Add Environment</span>
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="environment-form">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Environment Name <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" name="env_name" required
                                                   pattern="[a-zA-Z0-9_]+" title="Alphanumeric and underscore only">
                                            <small class="text-muted">Internal identifier (e.g., medpro_prod)</small>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Display Name <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" name="display_name" required>
                                            <small class="text-muted">User-friendly name</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Environment Type <span class="text-danger">*</span></label>
                                            <select class="form-select" name="env_type" required>
                                                <option value="">Select type...</option>
                                                <option value="production">Production</option>
                                                <option value="test">Test</option>
                                                <option value="development">Development</option>
                                                <option value="nqa">NQA</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="mb-3">
                                            <label class="form-label">Color Theme</label>
                                            <input type="color" class="form-control form-control-color" name="color_theme" value="#0066cc">
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" name="description" rows="2"></textarea>
                                </div>
                                
                                <h6 class="mt-4 mb-3"><i class="fas fa-database me-2"></i>Database Configuration</h6>
                                
                                <div class="row">
                                    <div class="col-md-8">
                                        <div class="mb-3">
                                            <label class="form-label">Database Host <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" name="db_host" required>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">Port</label>
                                            <input type="number" class="form-control" name="db_port" value="3306">
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">Database Name <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" name="db_name" required>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">Username <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control" name="db_user" required>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">Password <span class="text-danger">*</span></label>
                                            <input type="password" class="form-control" name="db_password" required>
                                        </div>
                                    </div>
                                </div>
                                
                                <h6 class="mt-4 mb-3"><i class="fas fa-plug me-2"></i>API Configuration (Optional)</h6>
                                
                                <div class="row">
                                    <div class="col-md-8">
                                        <div class="mb-3">
                                            <label class="form-label">API Base URL</label>
                                            <input type="url" class="form-control" name="api_base_url" placeholder="https://api.example.com">
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="mb-3">
                                            <label class="form-label">API Key</label>
                                            <input type="password" class="form-control" name="api_key">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="test-connection-btn">
                                <i class="fas fa-plug me-2"></i>Test Connection
                            </button>
                            <button type="button" class="btn btn-success" id="save-environment-btn">
                                <i class="fas fa-save me-2"></i>Save Environment
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = new bootstrap.Modal(document.getElementById('environmentEditorModal'));
        this.form = document.getElementById('environment-form');
    }
    
    bindEvents() {
        document.getElementById('save-environment-btn').addEventListener('click', () => this.save());
        document.getElementById('test-connection-btn').addEventListener('click', () => this.testConnection());
        
        // Listen for edit events
        document.addEventListener('edit-environment', (event) => {
            this.edit(event.detail.envId);
        });
    }
    
    show() {
        this.isEditing = false;
        this.currentEnvId = null;
        this.form.reset();
        document.getElementById('modal-title').textContent = 'Add Environment';
        this.modal.show();
    }
    
    async edit(envId) {
        try {
            const response = await authenticatedFetch(`/api/v1/environments/${envId}`);
            if (response.success) {
                this.isEditing = true;
                this.currentEnvId = envId;
                document.getElementById('modal-title').textContent = 'Edit Environment';
                
                // Populate form
                const env = response.data;
                this.form.env_name.value = env.env_name;
                this.form.display_name.value = env.display_name;
                this.form.env_type.value = env.env_type;
                this.form.description.value = env.description || '';
                this.form.db_host.value = env.db_host;
                this.form.db_port.value = env.db_port;
                this.form.db_name.value = env.db_name;
                this.form.db_user.value = env.db_user;
                this.form.api_base_url.value = env.api_base_url || '';
                this.form.color_theme.value = env.color_theme || '#0066cc';
                
                // Password is not returned for security
                this.form.db_password.removeAttribute('required');
                this.form.db_password.placeholder = 'Leave blank to keep current password';
                
                this.modal.show();
            }
        } catch (error) {
            showToast('Failed to load environment details', 'error');
        }
    }
    
    async save() {
        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }
        
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData);
        
        // Remove empty password on edit
        if (this.isEditing && !data.db_password) {
            delete data.db_password;
        }
        
        try {
            const url = this.isEditing 
                ? `/api/v1/environments/${this.currentEnvId}` 
                : '/api/v1/environments';
            const method = this.isEditing ? 'PUT' : 'POST';
            
            const response = await authenticatedFetch(url, {
                method,
                body: JSON.stringify(data)
            });
            
            if (response.success) {
                showToast(`Environment ${this.isEditing ? 'updated' : 'created'} successfully`, 'success');
                this.modal.hide();
                
                // Refresh environment list
                document.dispatchEvent(new Event('refresh-environments'));
            } else {
                showToast(response.error || 'Failed to save environment', 'error');
            }
        } catch (error) {
            showToast('Error saving environment', 'error');
        }
    }
    
    async testConnection() {
        if (!this.form.db_host.value || !this.form.db_name.value || 
            !this.form.db_user.value || !this.form.db_password.value) {
            showToast('Please fill in all database fields', 'warning');
            return;
        }
        
        const btn = document.getElementById('test-connection-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
        btn.disabled = true;
        
        try {
            // First save if new, then test
            if (!this.isEditing) {
                showToast('Please save the environment first', 'info');
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                return;
            }
            
            const response = await authenticatedFetch(`/api/v1/environments/${this.currentEnvId}/test`, {
                method: 'POST'
            });
            
            if (response.success && response.data.status === 'connected') {
                showToast('Connection successful!', 'success');
            } else {
                showToast(response.data?.details || 'Connection failed', 'error');
            }
        } catch (error) {
            showToast('Error testing connection', 'error');
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
}
```

#### Environment Selector Component
Create file: `/medproadmin/environments/js/components/environmentSelector.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';
import { environmentContext } from '/medproadmin/shared/js/environmentContext.js';

export class EnvironmentSelector {
    constructor(container) {
        this.container = container;
        this.environments = [];
        this.currentEnvironment = null;
        this.init();
    }
    
    async init() {
        await this.loadEnvironments();
        this.render();
        this.bindEvents();
        
        // Subscribe to environment changes
        environmentContext.subscribe(() => {
            this.currentEnvironment = environmentContext.getEnvironment();
            this.updateDisplay();
        });
    }
    
    async loadEnvironments() {
        try {
            const response = await authenticatedFetch('/api/v1/environments');
            if (response.success) {
                this.environments = response.data;
                
                // Set default environment
                const defaultEnv = this.environments.find(env => env.is_default);
                if (defaultEnv && !environmentContext.getEnvironment()) {
                    await this.selectEnvironment(defaultEnv.id);
                }
            }
        } catch (error) {
            console.error('Error loading environments:', error);
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-outline-light dropdown-toggle" type="button" 
                        id="environmentDropdown" data-bs-toggle="dropdown">
                    <i class="fas fa-server me-2"></i>
                    <span id="current-env-name">Select Environment</span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end" id="environment-list">
                    ${this.renderEnvironmentList()}
                </ul>
            </div>
        `;
    }
    
    renderEnvironmentList() {
        if (this.environments.length === 0) {
            return '<li><span class="dropdown-item-text">No environments available</span></li>';
        }
        
        return this.environments.map(env => {
            const isActive = this.currentEnvironment?.id === env.id;
            const typeIcon = this.getTypeIcon(env.env_type);
            const typeColor = this.getTypeColor(env.env_type);
            
            return `
                <li>
                    <a class="dropdown-item ${isActive ? 'active' : ''}" 
                       href="#" data-env-id="${env.id}">
                        <div class="d-flex align-items-center">
                            <i class="fas ${typeIcon} me-2 text-${typeColor}"></i>
                            <div>
                                <div class="fw-bold">${this.escapeHtml(env.display_name)}</div>
                                <small class="text-muted">${env.env_type}</small>
                            </div>
                            ${isActive ? '<i class="fas fa-check ms-auto"></i>' : ''}
                        </div>
                    </a>
                </li>
            `;
        }).join('');
    }
    
    bindEvents() {
        this.container.addEventListener('click', async (e) => {
            const envItem = e.target.closest('[data-env-id]');
            if (envItem) {
                e.preventDefault();
                const envId = parseInt(envItem.dataset.envId);
                await this.selectEnvironment(envId);
            }
        });
        
        // Listen for environment refresh events
        document.addEventListener('refresh-environments', () => {
            this.loadEnvironments();
        });
    }
    
    async selectEnvironment(envId) {
        try {
            const response = await authenticatedFetch(`/api/v1/environments/${envId}/connect`, {
                method: 'POST'
            });
            
            if (response.success) {
                const env = response.data.environment;
                environmentContext.setEnvironment(env);
                this.currentEnvironment = env;
                this.updateDisplay();
                showToast(`Connected to ${env.display_name}`, 'success');
                
                // Emit environment change event
                document.dispatchEvent(new CustomEvent('environment-changed', {
                    detail: { environment: env }
                }));
            }
        } catch (error) {
            showToast('Failed to connect to environment', 'error');
        }
    }
    
    updateDisplay() {
        const nameElement = document.getElementById('current-env-name');
        if (this.currentEnvironment) {
            nameElement.textContent = this.currentEnvironment.display_name;
            
            // Update dropdown items
            const dropdown = document.getElementById('environment-list');
            dropdown.innerHTML = this.renderEnvironmentList();
        } else {
            nameElement.textContent = 'Select Environment';
        }
    }
    
    getTypeIcon(type) {
        const icons = {
            production: 'fa-server',
            test: 'fa-flask',
            development: 'fa-code',
            nqa: 'fa-check-circle'
        };
        return icons[type] || 'fa-server';
    }
    
    getTypeColor(type) {
        const colors = {
            production: 'danger',
            test: 'warning',
            development: 'info',
            nqa: 'secondary'
        };
        return colors[type] || 'primary';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

#### Connection Test Component
Create file: `/medproadmin/environments/js/components/connectionTest.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';

export class ConnectionTest {
    constructor() {
        this.modal = null;
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        const modalHtml = `
            <div class="modal fade" id="connectionTestModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-plug me-2"></i>Test Connection
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="test-progress" class="text-center py-4">
                                <div class="spinner-border text-primary mb-3" role="status">
                                    <span class="visually-hidden">Testing...</span>
                                </div>
                                <p class="mb-0">Testing connection...</p>
                            </div>
                            <div id="test-results" class="d-none">
                                <!-- Results will be inserted here -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary d-none" id="retry-test-btn">
                                <i class="fas fa-redo me-2"></i>Retry Test
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = new bootstrap.Modal(document.getElementById('connectionTestModal'));
    }
    
    bindEvents() {
        // Listen for test connection events
        window.testEnvironmentConnection = (envId) => this.test(envId);
        
        document.getElementById('retry-test-btn').addEventListener('click', () => {
            if (this.currentEnvId) {
                this.test(this.currentEnvId);
            }
        });
    }
    
    async test(envId) {
        this.currentEnvId = envId;
        
        // Reset modal state
        document.getElementById('test-progress').classList.remove('d-none');
        document.getElementById('test-results').classList.add('d-none');
        document.getElementById('retry-test-btn').classList.add('d-none');
        
        this.modal.show();
        
        try {
            const response = await authenticatedFetch(`/api/v1/environments/${envId}/test`, {
                method: 'POST'
            });
            
            // Hide progress
            document.getElementById('test-progress').classList.add('d-none');
            
            // Show results
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.classList.remove('d-none');
            
            if (response.success && response.data.status === 'connected') {
                resultsDiv.innerHTML = `
                    <div class="alert alert-success">
                        <h6 class="alert-heading">
                            <i class="fas fa-check-circle me-2"></i>Connection Successful!
                        </h6>
                        <p class="mb-0">Successfully connected to the database.</p>
                        <hr>
                        <div class="small">
                            <strong>Status:</strong> ${response.data.status}<br>
                            <strong>Message:</strong> ${response.data.message}
                        </div>
                    </div>
                `;
            } else {
                resultsDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <h6 class="alert-heading">
                            <i class="fas fa-times-circle me-2"></i>Connection Failed
                        </h6>
                        <p class="mb-0">Could not connect to the database.</p>
                        <hr>
                        <div class="small">
                            <strong>Error:</strong> ${response.data?.details || response.error || 'Unknown error'}
                        </div>
                    </div>
                `;
                
                // Show retry button
                document.getElementById('retry-test-btn').classList.remove('d-none');
            }
        } catch (error) {
            // Hide progress
            document.getElementById('test-progress').classList.add('d-none');
            
            // Show error
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.classList.remove('d-none');
            resultsDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h6 class="alert-heading">
                        <i class="fas fa-exclamation-triangle me-2"></i>Test Error
                    </h6>
                    <p class="mb-0">An error occurred while testing the connection.</p>
                    <hr>
                    <div class="small">
                        <strong>Error:</strong> ${error.message}
                    </div>
                </div>
            `;
            
            // Show retry button
            document.getElementById('retry-test-btn').classList.remove('d-none');
        }
    }
}
```

#### User Management Page
Create file: `/medproadmin/users/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Management - MedPro Admin</title>
    
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Shared Styles -->
    <link rel="stylesheet" href="/medproadmin/shared/css/admin-base.css">
    <!-- Page Specific Styles -->
    <link rel="stylesheet" href="./css/users.css">
</head>
<body>
    <!-- Header with Environment Selector -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container-fluid">
            <a class="navbar-brand" href="/medproadmin">
                <i class="fas fa-hospital me-2"></i>MedPro Admin
            </a>
            <div class="ms-auto d-flex align-items-center">
                <!-- Environment Selector -->
                <div id="environment-selector-container" class="me-3"></div>
                <!-- User Info -->
                <span class="navbar-text me-3">
                    <i class="fas fa-user-circle me-1"></i>
                    <span id="admin-email">Loading...</span>
                </span>
                <button class="btn btn-outline-light btn-sm" onclick="adminAuth.logout()">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <nav class="col-md-2 d-md-block bg-light sidebar">
                <div class="sidebar-sticky pt-3">
                    <ul class="nav flex-column admin-nav">
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin">
                                <i class="fas fa-dashboard me-2"></i>Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin/environments">
                                <i class="fas fa-server me-2"></i>Environments
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link active" href="/medproadmin/users">
                                <i class="fas fa-users me-2"></i>User Management
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/medproadmin/product-catalog">
                                <i class="fas fa-box me-2"></i>Product Catalog
                            </a>
                        </li>
                    </ul>
                </div>
            </nav>

            <!-- Main Area -->
            <main class="col-md-10 ms-sm-auto px-md-4">
                <!-- Page Header -->
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                    <h1 class="h2">
                        <i class="fas fa-users me-2"></i>User Management
                    </h1>
                    <div class="environment-indicator" id="current-environment">
                        <i class="fas fa-server me-1"></i>
                        <span>No environment selected</span>
                    </div>
                </div>

                <!-- Environment Warning -->
                <div class="alert alert-warning" id="no-environment-alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Please select an environment to manage users.
                </div>

                <!-- User Stats -->
                <div id="user-stats-container" style="display: none;">
                    <!-- Stats will be loaded here -->
                </div>

                <!-- User Filters -->
                <div id="user-filters-container" style="display: none;">
                    <!-- Filters will be loaded here -->
                </div>

                <!-- User List -->
                <div id="user-list-container" style="display: none;">
                    <!-- User table will be loaded here -->
                </div>
            </main>
        </div>
    </div>

    <!-- User Detail Modal -->
    <div class="modal fade" id="user-detail-modal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fas fa-user me-2"></i>User Details
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body" id="user-detail-body">
                    <!-- User details will be loaded here -->
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script type="module">
        import '/medproadmin/shared/js/adminAuth.js';
        import '/medproadmin/shared/js/adminUtils.js';
        import '/medproadmin/shared/js/environmentContext.js';
        import './js/app.js';
    </script>
</body>
</html>
```

### User Management Components

#### UserList Component
Create file: `/medproadmin/users/js/components/userList.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';
import { environmentContext } from '/medproadmin/shared/js/environmentContext.js';

export class UserList {
    constructor(container) {
        this.container = container;
        this.users = [];
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalUsers = 0;
        this.filters = {};
        this.sortBy = 'email';
        this.sortOrder = 'asc';
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
        
        // Listen for filter changes
        document.addEventListener('filters-changed', (event) => {
            this.filters = event.detail.filters;
            this.currentPage = 1;
            this.loadUsers();
        });
        
        // Listen for environment changes
        document.addEventListener('environment-changed', () => {
            this.currentPage = 1;
            this.loadUsers();
        });
    }
    
    render() {
        this.container.innerHTML = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-users me-2"></i>Users
                        <span class="badge bg-secondary ms-2" id="user-count">0</span>
                    </h5>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" id="refresh-users-btn">
                            <i class="fas fa-sync"></i>
                        </button>
                        <button class="btn btn-outline-success" id="export-users-btn">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover" id="users-table">
                            <thead>
                                <tr>
                                    <th class="sortable" data-field="email">
                                        Email <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="sortable" data-field="fullname">
                                        Full Name <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="sortable" data-field="role">
                                        Role <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="sortable" data-field="plan">
                                        Plan <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="sortable" data-field="status">
                                        Status <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="sortable" data-field="last_login">
                                        Last Login <i class="fas fa-sort"></i>
                                    </th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="users-tbody">
                                <tr>
                                    <td colspan="7" class="text-center">
                                        <div class="spinner-border text-primary" role="status">
                                            <span class="visually-hidden">Loading...</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination -->
                    <nav id="pagination-container" class="mt-3" style="display: none;">
                        <ul class="pagination justify-content-center">
                            <!-- Pagination items will be added here -->
                        </ul>
                    </nav>
                </div>
            </div>
        `;
    }
    
    bindEvents() {
        // Refresh button
        document.getElementById('refresh-users-btn').addEventListener('click', () => {
            this.loadUsers();
        });
        
        // Export button
        document.getElementById('export-users-btn').addEventListener('click', () => {
            this.exportUsers();
        });
        
        // Sort headers
        this.container.addEventListener('click', (e) => {
            const sortHeader = e.target.closest('.sortable');
            if (sortHeader) {
                const field = sortHeader.dataset.field;
                if (this.sortBy === field) {
                    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy = field;
                    this.sortOrder = 'asc';
                }
                this.loadUsers();
            }
        });
        
        // User actions
        this.container.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-user-btn');
            const editBtn = e.target.closest('.edit-user-btn');
            const statusBtn = e.target.closest('.toggle-status-btn');
            
            if (viewBtn) {
                this.viewUser(viewBtn.dataset.email);
            } else if (editBtn) {
                this.editUser(editBtn.dataset.email);
            } else if (statusBtn) {
                this.toggleUserStatus(statusBtn.dataset.email, statusBtn.dataset.currentStatus);
            }
        });
    }
    
    async loadUsers() {
        const env = environmentContext.getEnvironment();
        if (!env) {
            this.showNoEnvironmentMessage();
            return;
        }
        
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                ...this.filters
            });
            
            const response = await authenticatedFetch(`/api/v1/users?${params}`, {
                headers: {
                    'X-Environment-ID': env.id
                }
            });
            
            if (response.success) {
                this.users = response.data.users;
                this.totalUsers = response.data.pagination.total;
                this.renderUsers();
                this.renderPagination(response.data.pagination);
                
                // Update count
                document.getElementById('user-count').textContent = this.totalUsers;
            } else {
                showToast('Failed to load users', 'error');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            showToast('Error loading users', 'error');
        }
    }
    
    renderUsers() {
        const tbody = document.getElementById('users-tbody');
        
        if (this.users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        No users found
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.users.map(user => `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-sm me-2">
                            <i class="fas fa-user-circle fa-2x text-secondary"></i>
                        </div>
                        <div>
                            <div class="fw-medium">${this.escapeHtml(user.email)}</div>
                            ${user.admin ? '<small class="text-warning"><i class="fas fa-crown"></i> Admin</small>' : ''}
                        </div>
                    </div>
                </td>
                <td>${this.escapeHtml(user.fullname || '-')}</td>
                <td>
                    <span class="badge bg-${this.getRoleBadgeColor(user.role)}">
                        ${this.formatRole(user.role)}
                    </span>
                </td>
                <td>
                    <span class="badge bg-info">
                        ${this.escapeHtml(user.plan || 'FREE')}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${this.getStatusBadgeColor(user.status)}">
                        ${this.formatStatus(user.status)}
                    </span>
                </td>
                <td>
                    ${user.last_login ? this.formatDate(user.last_login) : 'Never'}
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary view-user-btn" 
                                data-email="${user.email}" 
                                title="View details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary edit-user-btn" 
                                data-email="${user.email}" 
                                title="Edit user">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-${user.status === 'active' ? 'warning' : 'success'} toggle-status-btn" 
                                data-email="${user.email}" 
                                data-current-status="${user.status}"
                                title="${user.status === 'active' ? 'Deactivate' : 'Activate'}">
                            <i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    renderPagination(pagination) {
        const container = document.getElementById('pagination-container');
        const ul = container.querySelector('.pagination');
        
        if (pagination.pages <= 1) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        const pages = [];
        const currentPage = pagination.page;
        const totalPages = pagination.pages;
        
        // Previous button
        pages.push(`
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage - 1}">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `);
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                pages.push(`
                    <li class="page-item ${i === currentPage ? 'active' : ''}">
                        <a class="page-link" href="#" data-page="${i}">${i}</a>
                    </li>
                `);
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                pages.push('<li class="page-item disabled"><span class="page-link">...</span></li>');
            }
        }
        
        // Next button
        pages.push(`
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage + 1}">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `);
        
        ul.innerHTML = pages.join('');
        
        // Bind pagination clicks
        ul.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.page-link');
            if (link && !link.parentElement.classList.contains('disabled')) {
                this.currentPage = parseInt(link.dataset.page);
                this.loadUsers();
            }
        });
    }
    
    async viewUser(email) {
        const event = new CustomEvent('view-user', { detail: { email } });
        document.dispatchEvent(event);
    }
    
    editUser(email) {
        // TODO: Implement user editing
        showToast('User editing not implemented yet', 'info');
    }
    
    async toggleUserStatus(email, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const action = currentStatus === 'active' ? 'deactivate' : 'activate';
        
        if (!confirm(`Are you sure you want to ${action} this user?`)) {
            return;
        }
        
        try {
            const env = environmentContext.getEnvironment();
            const response = await authenticatedFetch(`/api/v1/users/${email}/status`, {
                method: 'PUT',
                headers: {
                    'X-Environment-ID': env.id
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.success) {
                showToast(`User ${action}d successfully`, 'success');
                this.loadUsers();
            } else {
                showToast(`Failed to ${action} user`, 'error');
            }
        } catch (error) {
            showToast(`Error ${action}ing user`, 'error');
        }
    }
    
    async exportUsers() {
        try {
            const env = environmentContext.getEnvironment();
            const params = new URLSearchParams({
                limit: 10000, // Export all
                ...this.filters
            });
            
            const response = await authenticatedFetch(`/api/v1/users?${params}`, {
                headers: {
                    'X-Environment-ID': env.id
                }
            });
            
            if (response.success) {
                const csv = this.convertToCSV(response.data.users);
                this.downloadCSV(csv, `users_${env.env_name}_${new Date().toISOString().split('T')[0]}.csv`);
                showToast('Users exported successfully', 'success');
            }
        } catch (error) {
            showToast('Failed to export users', 'error');
        }
    }
    
    convertToCSV(users) {
        const headers = ['Email', 'Full Name', 'Role', 'Plan', 'Status', 'Created Date', 'Last Login'];
        const rows = users.map(user => [
            user.email,
            user.fullname || '',
            user.role,
            user.plan || 'FREE',
            user.status,
            user.activatedate || '',
            user.last_login || ''
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }
    
    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }
    
    showNoEnvironmentMessage() {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    <i class="fas fa-exclamation-circle fa-3x mb-3"></i>
                    <p>Please select an environment to view users</p>
                </td>
            </tr>
        `;
    }
    
    getRoleBadgeColor(role) {
        const colors = {
            practitioner: 'primary',
            admin: 'danger',
            assistant: 'info',
            patient: 'success'
        };
        return colors[role] || 'secondary';
    }
    
    getStatusBadgeColor(status) {
        const colors = {
            active: 'success',
            inactive: 'warning',
            suspended: 'danger'
        };
        return colors[status] || 'secondary';
    }
    
    formatRole(role) {
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
    
    formatStatus(status) {
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    formatDate(date) {
        return new Date(date).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

#### UserDetail Component
Create file: `/medproadmin/users/js/components/userDetail.js`

```javascript
import { authenticatedFetch, showToast } from '/medproadmin/shared/js/adminUtils.js';
import { environmentContext } from '/medproadmin/shared/js/environmentContext.js';

export class UserDetail {
    constructor() {
        this.modal = null;
        this.currentUser = null;
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        const modalElement = document.getElementById('user-detail-modal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
        }
    }
    
    bindEvents() {
        // Listen for view user events
        document.addEventListener('view-user', async (event) => {
            await this.loadUserDetails(event.detail.email);
        });
    }
    
    async loadUserDetails(email) {
        try {
            const env = environmentContext.getEnvironment();
            if (!env) {
                showToast('No environment selected', 'warning');
                return;
            }
            
            const response = await authenticatedFetch(`/api/v1/users/${email}`, {
                headers: {
                    'X-Environment-ID': env.id
                }
            });
            
            if (response.success) {
                this.currentUser = response.data;
                this.render();
                this.modal.show();
            } else {
                showToast('Failed to load user details', 'error');
            }
        } catch (error) {
            console.error('Error loading user details:', error);
            showToast('Error loading user details', 'error');
        }
    }
    
    render() {
        const modalBody = document.getElementById('user-detail-body');
        const user = this.currentUser.user;
        const practitioners = this.currentUser.practitioners || [];
        const patientCount = this.currentUser.patient_count || 0;
        
        modalBody.innerHTML = `
            <div class="user-detail-content">
                <!-- User Header -->
                <div class="user-header mb-4">
                    <div class="d-flex align-items-center">
                        <div class="user-avatar me-3">
                            <i class="fas fa-user-circle fa-4x text-secondary"></i>
                        </div>
                        <div class="flex-grow-1">
                            <h4 class="mb-1">${this.escapeHtml(user.fullname || user.email)}</h4>
                            <p class="text-muted mb-2">${this.escapeHtml(user.email)}</p>
                            <div class="d-flex gap-2">
                                <span class="badge bg-${this.getRoleBadgeColor(user.role)}">
                                    ${this.formatRole(user.role)}
                                </span>
                                <span class="badge bg-${this.getStatusBadgeColor(user.status)}">
                                    ${this.formatStatus(user.status)}
                                </span>
                                ${user.admin ? '<span class="badge bg-warning"><i class="fas fa-crown"></i> Admin</span>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- User Information Tabs -->
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#general-info">
                            <i class="fas fa-info-circle me-2"></i>General
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#subscription-info">
                            <i class="fas fa-credit-card me-2"></i>Subscription
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#practitioner-info">
                            <i class="fas fa-user-md me-2"></i>Practitioners
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" data-bs-toggle="tab" data-bs-target="#activity-info">
                            <i class="fas fa-history me-2"></i>Activity
                        </button>
                    </li>
                </ul>
                
                <!-- Tab Content -->
                <div class="tab-content">
                    <!-- General Information -->
                    <div class="tab-pane fade show active" id="general-info">
                        <div class="row">
                            <div class="col-md-6">
                                <dl class="row">
                                    <dt class="col-sm-4">User ID:</dt>
                                    <dd class="col-sm-8">${user.id || 'N/A'}</dd>
                                    
                                    <dt class="col-sm-4">Full Name:</dt>
                                    <dd class="col-sm-8">${this.escapeHtml(user.fullname || 'Not provided')}</dd>
                                    
                                    <dt class="col-sm-4">Phone:</dt>
                                    <dd class="col-sm-8">${this.escapeHtml(user.phone || 'Not provided')}</dd>
                                    
                                    <dt class="col-sm-4">CPF:</dt>
                                    <dd class="col-sm-8">${this.escapeHtml(user.cpf || 'Not provided')}</dd>
                                </dl>
                            </div>
                            <div class="col-md-6">
                                <dl class="row">
                                    <dt class="col-sm-4">Created:</dt>
                                    <dd class="col-sm-8">${this.formatDate(user.activatedate)}</dd>
                                    
                                    <dt class="col-sm-4">Last Login:</dt>
                                    <dd class="col-sm-8">${user.last_login ? this.formatDate(user.last_login) : 'Never'}</dd>
                                    
                                    <dt class="col-sm-4">First Login:</dt>
                                    <dd class="col-sm-8">${user.first_login === 1 ? 'Yes' : 'No'}</dd>
                                    
                                    <dt class="col-sm-4">Patients:</dt>
                                    <dd class="col-sm-8">${patientCount}</dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Subscription Information -->
                    <div class="tab-pane fade" id="subscription-info">
                        <div class="row">
                            <div class="col-md-6">
                                <dl class="row">
                                    <dt class="col-sm-4">Plan:</dt>
                                    <dd class="col-sm-8">
                                        <span class="badge bg-info">${this.escapeHtml(user.plan || 'FREE')}</span>
                                    </dd>
                                    
                                    <dt class="col-sm-4">Trial End:</dt>
                                    <dd class="col-sm-8">${user.trial_end ? this.formatDate(user.trial_end) : 'N/A'}</dd>
                                    
                                    <dt class="col-sm-4">Trial Days:</dt>
                                    <dd class="col-sm-8">${user.trial_days || 0}</dd>
                                </dl>
                            </div>
                            <div class="col-md-6">
                                <dl class="row">
                                    <dt class="col-sm-4">Stripe Customer:</dt>
                                    <dd class="col-sm-8">
                                        ${user.stripe_customer ? 
                                            `<code>${user.stripe_customer}</code>` : 
                                            '<span class="text-muted">Not created</span>'}
                                    </dd>
                                    
                                    <dt class="col-sm-4">Stripe Subscription:</dt>
                                    <dd class="col-sm-8">
                                        ${user.stripe_subscription ? 
                                            `<code>${user.stripe_subscription}</code>` : 
                                            '<span class="text-muted">No subscription</span>'}
                                    </dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Practitioners Information -->
                    <div class="tab-pane fade" id="practitioner-info">
                        ${this.renderPractitioners(practitioners)}
                    </div>
                    
                    <!-- Activity Information -->
                    <div class="tab-pane fade" id="activity-info">
                        <div class="activity-timeline">
                            <div class="timeline-item">
                                <div class="timeline-icon bg-success">
                                    <i class="fas fa-user-plus"></i>
                                </div>
                                <div class="timeline-content">
                                    <h6>Account Created</h6>
                                    <p class="text-muted mb-0">${this.formatDate(user.activatedate)}</p>
                                </div>
                            </div>
                            
                            ${user.last_login ? `
                                <div class="timeline-item">
                                    <div class="timeline-icon bg-primary">
                                        <i class="fas fa-sign-in-alt"></i>
                                    </div>
                                    <div class="timeline-content">
                                        <h6>Last Login</h6>
                                        <p class="text-muted mb-0">${this.formatDate(user.last_login)}</p>
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${user.stripe_customer ? `
                                <div class="timeline-item">
                                    <div class="timeline-icon bg-info">
                                        <i class="fas fa-credit-card"></i>
                                    </div>
                                    <div class="timeline-content">
                                        <h6>Stripe Customer Created</h6>
                                        <p class="text-muted mb-0">Customer ID: ${user.stripe_customer}</p>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="mt-4 d-flex justify-content-end gap-2">
                    <button class="btn btn-outline-primary" onclick="window.open('mailto:${user.email}')">
                        <i class="fas fa-envelope me-2"></i>Send Email
                    </button>
                    ${user.status === 'active' ? 
                        `<button class="btn btn-outline-warning" onclick="userDetail.toggleStatus('${user.email}', 'inactive')">
                            <i class="fas fa-ban me-2"></i>Deactivate User
                        </button>` :
                        `<button class="btn btn-outline-success" onclick="userDetail.toggleStatus('${user.email}', 'active')">
                            <i class="fas fa-check me-2"></i>Activate User
                        </button>`
                    }
                </div>
            </div>
        `;
    }
    
    renderPractitioners(practitioners) {
        if (practitioners.length === 0) {
            return '<p class="text-muted">No practitioners associated with this user.</p>';
        }
        
        return `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Specialty</th>
                            <th>CRM</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${practitioners.map(p => `
                            <tr>
                                <td>${this.escapeHtml(p.name)}</td>
                                <td>${this.escapeHtml(p.specialty || '-')}</td>
                                <td>${this.escapeHtml(p.crm || '-')}</td>
                                <td>
                                    <span class="badge bg-${p.active ? 'success' : 'secondary'}">
                                        ${p.active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    async toggleStatus(email, newStatus) {
        try {
            const env = environmentContext.getEnvironment();
            const response = await authenticatedFetch(`/api/v1/users/${email}/status`, {
                method: 'PUT',
                headers: {
                    'X-Environment-ID': env.id
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.success) {
                showToast(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`, 'success');
                this.modal.hide();
                
                // Refresh user list
                document.dispatchEvent(new Event('refresh-users'));
            } else {
                showToast('Failed to update user status', 'error');
            }
        } catch (error) {
            showToast('Error updating user status', 'error');
        }
    }
    
    getRoleBadgeColor(role) {
        const colors = {
            practitioner: 'primary',
            admin: 'danger',
            assistant: 'info',
            patient: 'success'
        };
        return colors[role] || 'secondary';
    }
    
    getStatusBadgeColor(status) {
        const colors = {
            active: 'success',
            inactive: 'warning',
            suspended: 'danger'
        };
        return colors[status] || 'secondary';
    }
    
    formatRole(role) {
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
    
    formatStatus(status) {
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    formatDate(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance
window.userDetail = new UserDetail();
```

#### UserFilters Component
Create file: `/medproadmin/users/js/components/userFilters.js`

```javascript
import { environmentContext } from '/medproadmin/shared/js/environmentContext.js';

export class UserFilters {
    constructor(container) {
        this.container = container;
        this.filters = {
            search: '',
            role: '',
            status: '',
            plan: ''
        };
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="card mb-3">
                <div class="card-body">
                    <h6 class="card-title mb-3">
                        <i class="fas fa-filter me-2"></i>Filter Users
                    </h6>
                    <form id="filter-form">
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label">Search</label>
                                <div class="input-group">
                                    <span class="input-group-text">
                                        <i class="fas fa-search"></i>
                                    </span>
                                    <input type="text" class="form-control" name="search" 
                                           placeholder="Email or name..." value="${this.filters.search}">
                                </div>
                            </div>
                            
                            <div class="col-md-2">
                                <label class="form-label">Role</label>
                                <select class="form-select" name="role">
                                    <option value="">All Roles</option>
                                    <option value="practitioner" ${this.filters.role === 'practitioner' ? 'selected' : ''}>Practitioner</option>
                                    <option value="admin" ${this.filters.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    <option value="assistant" ${this.filters.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                                    <option value="patient" ${this.filters.role === 'patient' ? 'selected' : ''}>Patient</option>
                                </select>
                            </div>
                            
                            <div class="col-md-2">
                                <label class="form-label">Status</label>
                                <select class="form-select" name="status">
                                    <option value="">All Status</option>
                                    <option value="active" ${this.filters.status === 'active' ? 'selected' : ''}>Active</option>
                                    <option value="inactive" ${this.filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                    <option value="suspended" ${this.filters.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                </select>
                            </div>
                            
                            <div class="col-md-2">
                                <label class="form-label">Plan</label>
                                <select class="form-select" name="plan">
                                    <option value="">All Plans</option>
                                    <option value="FREE" ${this.filters.plan === 'FREE' ? 'selected' : ''}>Free</option>
                                    <option value="PRACT_DEFAULT" ${this.filters.plan === 'PRACT_DEFAULT' ? 'selected' : ''}>Practitioner</option>
                                    <option value="CLINIC" ${this.filters.plan === 'CLINIC' ? 'selected' : ''}>Clinic</option>
                                    <option value="ENTERPRISE" ${this.filters.plan === 'ENTERPRISE' ? 'selected' : ''}>Enterprise</option>
                                </select>
                            </div>
                            
                            <div class="col-md-3 d-flex align-items-end gap-2">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-filter me-2"></i>Apply Filters
                                </button>
                                <button type="button" class="btn btn-outline-secondary" id="clear-filters-btn">
                                    <i class="fas fa-times me-2"></i>Clear
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }
    
    bindEvents() {
        const form = document.getElementById('filter-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.applyFilters();
        });
        
        // Clear filters button
        document.getElementById('clear-filters-btn').addEventListener('click', () => {
            this.clearFilters();
        });
        
        // Auto-apply on select change
        form.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', () => this.applyFilters());
        });
        
        // Debounced search
        let searchTimeout;
        form.querySelector('input[name="search"]').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.applyFilters();
            }, 300);
        });
    }
    
    applyFilters() {
        const form = document.getElementById('filter-form');
        const formData = new FormData(form);
        
        this.filters = {
            search: formData.get('search'),
            role: formData.get('role'),
            status: formData.get('status'),
            plan: formData.get('plan')
        };
        
        // Remove empty filters
        Object.keys(this.filters).forEach(key => {
            if (!this.filters[key]) {
                delete this.filters[key];
            }
        });
        
        // Emit filter change event
        const event = new CustomEvent('filters-changed', {
            detail: { filters: this.filters }
        });
        document.dispatchEvent(event);
    }
    
    clearFilters() {
        this.filters = {
            search: '',
            role: '',
            status: '',
            plan: ''
        };
        this.render();
        this.bindEvents();
        this.applyFilters();
    }
}
```

#### UserStats Component
Create file: `/medproadmin/users/js/components/userStats.js`

```javascript
import { authenticatedFetch } from '/medproadmin/shared/js/adminUtils.js';
import { environmentContext } from '/medproadmin/shared/js/environmentContext.js';

export class UserStats {
    constructor(container) {
        this.container = container;
        this.stats = null;
        this.init();
    }
    
    init() {
        this.render();
        
        // Listen for environment changes
        document.addEventListener('environment-changed', () => {
            this.loadStats();
        });
        
        // Refresh when users are updated
        document.addEventListener('refresh-users', () => {
            this.loadStats();
        });
    }
    
    async loadStats() {
        const env = environmentContext.getEnvironment();
        if (!env) {
            this.renderNoEnvironment();
            return;
        }
        
        try {
            const response = await authenticatedFetch('/api/v1/users/stats', {
                headers: {
                    'X-Environment-ID': env.id
                }
            });
            
            if (response.success) {
                this.stats = response.data;
                this.render();
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
        }
    }
    
    render() {
        if (!this.stats) {
            this.renderLoading();
            return;
        }
        
        const userStats = this.stats.userStats || [];
        const recentActivity = this.stats.recentActivity || 0;
        const growthMetrics = this.stats.growthMetrics || [];
        
        // Calculate totals
        const totalUsers = userStats.reduce((sum, stat) => sum + stat.count, 0);
        const activeUsers = userStats.reduce((sum, stat) => sum + stat.active_count, 0);
        
        this.container.innerHTML = `
            <div class="row g-3 mb-4">
                <!-- Total Users Card -->
                <div class="col-md-3">
                    <div class="card stat-card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="text-muted mb-2">Total Users</h6>
                                    <h3 class="mb-0">${totalUsers.toLocaleString()}</h3>
                                </div>
                                <div class="stat-icon bg-primary">
                                    <i class="fas fa-users"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Active Users Card -->
                <div class="col-md-3">
                    <div class="card stat-card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="text-muted mb-2">Active Users</h6>
                                    <h3 class="mb-0">${activeUsers.toLocaleString()}</h3>
                                    <small class="text-success">
                                        ${totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0}% of total
                                    </small>
                                </div>
                                <div class="stat-icon bg-success">
                                    <i class="fas fa-user-check"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Recent Activity Card -->
                <div class="col-md-3">
                    <div class="card stat-card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="text-muted mb-2">Active Last 7 Days</h6>
                                    <h3 class="mb-0">${recentActivity.toLocaleString()}</h3>
                                </div>
                                <div class="stat-icon bg-info">
                                    <i class="fas fa-clock"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- User Distribution Card -->
                <div class="col-md-3">
                    <div class="card stat-card">
                        <div class="card-body">
                            <h6 class="text-muted mb-3">User Distribution</h6>
                            <div class="user-distribution">
                                ${userStats.map(stat => `
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <span class="text-capitalize">${stat.role}s</span>
                                        <span class="badge bg-secondary">${stat.count}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Growth Chart -->
            ${growthMetrics.length > 0 ? this.renderGrowthChart(growthMetrics) : ''}
        `;
    }
    
    renderGrowthChart(metrics) {
        return `
            <div class="card mb-4">
                <div class="card-header">
                    <h6 class="mb-0">
                        <i class="fas fa-chart-line me-2"></i>User Growth (Last 6 Months)
                    </h6>
                </div>
                <div class="card-body">
                    <canvas id="growth-chart" height="80"></canvas>
                </div>
            </div>
            <script>
                // Initialize chart after DOM update
                setTimeout(() => {
                    const ctx = document.getElementById('growth-chart');
                    if (ctx && window.Chart) {
                        new Chart(ctx, {
                            type: 'line',
                            data: {
                                labels: ${JSON.stringify(metrics.map(m => m.month))},
                                datasets: [{
                                    label: 'New Users',
                                    data: ${JSON.stringify(metrics.map(m => m.new_users))},
                                    borderColor: 'rgb(75, 192, 192)',
                                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                                    tension: 0.1
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            precision: 0
                                        }
                                    }
                                }
                            }
                        });
                    }
                }, 100);
            </script>
        `;
    }
    
    renderLoading() {
        this.container.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading stats...</span>
                </div>
            </div>
        `;
    }
    
    renderNoEnvironment() {
        this.container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Select an environment to view user statistics.
            </div>
        `;
    }
}
```

### Service Layer Components

#### Environment API Service
Create file: `/medproadmin/environments/js/services/environmentApi.js`

```javascript
import { authenticatedFetch } from '/medproadmin/shared/js/adminUtils.js';

export const environmentApi = {
    // Get all environments
    async getAll() {
        return await authenticatedFetch('/api/v1/environments');
    },
    
    // Get single environment
    async getById(id) {
        return await authenticatedFetch(`/api/v1/environments/${id}`);
    },
    
    // Create new environment
    async create(data) {
        return await authenticatedFetch('/api/v1/environments', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    // Update environment
    async update(id, data) {
        return await authenticatedFetch(`/api/v1/environments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    // Delete environment
    async delete(id) {
        return await authenticatedFetch(`/api/v1/environments/${id}`, {
            method: 'DELETE'
        });
    },
    
    // Test connection
    async testConnection(id) {
        return await authenticatedFetch(`/api/v1/environments/${id}/test`, {
            method: 'POST'
        });
    },
    
    // Connect to environment
    async connect(id) {
        return await authenticatedFetch(`/api/v1/environments/${id}/connect`, {
            method: 'POST'
        });
    }
};
```

#### User API Service  
Create file: `/medproadmin/users/js/services/userApi.js`

```javascript
import { authenticatedFetch } from '/medproadmin/shared/js/adminUtils.js';

export const userApi = {
    // Get users with pagination and filters
    async getUsers(params = {}, environmentId) {
        const queryString = new URLSearchParams(params).toString();
        return await authenticatedFetch(`/api/v1/users?${queryString}`, {
            headers: {
                'X-Environment-ID': environmentId
            }
        });
    },
    
    // Get single user details
    async getUserDetails(email, environmentId) {
        return await authenticatedFetch(`/api/v1/users/${email}`, {
            headers: {
                'X-Environment-ID': environmentId
            }
        });
    },
    
    // Update user status
    async updateUserStatus(email, status, environmentId) {
        return await authenticatedFetch(`/api/v1/users/${email}/status`, {
            method: 'PUT',
            headers: {
                'X-Environment-ID': environmentId
            },
            body: JSON.stringify({ status })
        });
    },
    
    // Get user statistics
    async getStats(environmentId) {
        return await authenticatedFetch('/api/v1/users/stats', {
            headers: {
                'X-Environment-ID': environmentId
            }
        });
    },
    
    // Export users
    async exportUsers(filters = {}, environmentId) {
        const params = {
            ...filters,
            limit: 10000,
            format: 'csv'
        };
        const queryString = new URLSearchParams(params).toString();
        return await authenticatedFetch(`/api/v1/users/export?${queryString}`, {
            headers: {
                'X-Environment-ID': environmentId
            }
        });
    }
};
```

### Shared Components

#### Environment Context
Create file: `/medproadmin/shared/js/environmentContext.js`

```javascript
// Singleton pattern for environment state management
class EnvironmentContext {
    constructor() {
        this.currentEnvironment = null;
        this.listeners = new Set();
        this.loadFromSession();
    }
    
    // Load environment from session storage
    loadFromSession() {
        const stored = sessionStorage.getItem('currentEnvironment');
        if (stored) {
            try {
                this.currentEnvironment = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse stored environment:', e);
            }
        }
    }
    
    // Save environment to session storage
    saveToSession() {
        if (this.currentEnvironment) {
            sessionStorage.setItem('currentEnvironment', JSON.stringify(this.currentEnvironment));
        } else {
            sessionStorage.removeItem('currentEnvironment');
        }
    }
    
    // Get current environment
    getEnvironment() {
        return this.currentEnvironment;
    }
    
    // Set current environment
    setEnvironment(environment) {
        this.currentEnvironment = environment;
        this.saveToSession();
        this.notifyListeners();
    }
    
    // Subscribe to environment changes
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    
    // Notify all listeners
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.currentEnvironment);
            } catch (error) {
                console.error('Error in environment listener:', error);
            }
        });
    }
    
    // Clear environment
    clear() {
        this.currentEnvironment = null;
        this.saveToSession();
        this.notifyListeners();
    }
}

// Export singleton instance
export const environmentContext = new EnvironmentContext();
```

#### Admin Utils
Create file: `/medproadmin/shared/js/adminUtils.js`

```javascript
// JWT Token management
const getToken = () => {
    return localStorage.getItem('adminToken');
};

// Authenticated fetch wrapper
export async function authenticatedFetch(url, options = {}) {
    const token = getToken();
    if (!token) {
        window.location.href = '/medproadmin/login.html';
        throw new Error('No authentication token');
    }
    
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    const response = await fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });
    
    // Handle unauthorized
    if (response.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.href = '/medproadmin/login.html';
        throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }
    
    return data;
}

// Toast notifications
export function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    const toastId = `toast-${Date.now()}`;
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${getToastColor(type)} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 3000 });
    toast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function getToastColor(type) {
    const colors = {
        success: 'success',
        error: 'danger',
        warning: 'warning',
        info: 'primary'
    };
    return colors[type] || 'secondary';
}

// Format date helper
export function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML helper
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### Main Application Files

#### Environment Management App
Create file: `/medproadmin/environments/js/app.js`

```javascript
import { EnvironmentList } from './components/environmentList.js';
import { EnvironmentEditor } from './components/environmentEditor.js';
import { EnvironmentSelector } from '../shared/js/components/environmentSelector.js';
import { ConnectionTest } from './components/connectionTest.js';
import { showToast } from '../shared/js/adminUtils.js';

// Initialize environment management
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize environment selector in header
        const selectorContainer = document.getElementById('environment-selector-container');
        if (selectorContainer) {
            new EnvironmentSelector(selectorContainer);
        }
        
        // Initialize environment list
        const listContainer = document.getElementById('environment-list-container');
        if (listContainer) {
            const environmentList = new EnvironmentList(listContainer);
            
            // Listen for refresh events
            document.addEventListener('refresh-environments', () => {
                environmentList.loadEnvironments();
            });
        }
        
        // Initialize environment editor
        const environmentEditor = new EnvironmentEditor();
        
        // Initialize connection test modal
        const connectionTest = new ConnectionTest();
        
        // Add environment button
        const addBtn = document.getElementById('btn-add-environment');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                environmentEditor.show();
            });
        }
        
        // Display admin email
        const adminEmail = localStorage.getItem('adminEmail');
        if (adminEmail) {
            document.getElementById('admin-email').textContent = adminEmail;
        }
        
    } catch (error) {
        console.error('Error initializing environment management:', error);
        showToast('Failed to initialize environment management', 'error');
    }
});
```

#### User Management App
Create file: `/medproadmin/users/js/app.js`

```javascript
import { UserList } from './components/userList.js';
import { UserDetail } from './components/userDetail.js';
import { UserFilters } from './components/userFilters.js';
import { UserStats } from './components/userStats.js';
import { EnvironmentSelector } from '../shared/js/components/environmentSelector.js';
import { environmentContext } from '../shared/js/environmentContext.js';
import { showToast } from '../shared/js/adminUtils.js';

// Initialize user management
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize environment selector in header
        const selectorContainer = document.getElementById('environment-selector-container');
        if (selectorContainer) {
            new EnvironmentSelector(selectorContainer);
        }
        
        // Get containers
        const statsContainer = document.getElementById('user-stats-container');
        const filtersContainer = document.getElementById('user-filters-container');
        const listContainer = document.getElementById('user-list-container');
        const noEnvAlert = document.getElementById('no-environment-alert');
        const envIndicator = document.getElementById('current-environment');
        
        // Initialize components
        let userList = null;
        let userStats = null;
        let userFilters = null;
        
        // Handle environment changes
        const updateEnvironmentDisplay = () => {
            const env = environmentContext.getEnvironment();
            
            if (env) {
                // Hide no environment alert
                noEnvAlert.style.display = 'none';
                
                // Show containers
                statsContainer.style.display = 'block';
                filtersContainer.style.display = 'block';
                listContainer.style.display = 'block';
                
                // Update indicator
                envIndicator.innerHTML = `
                    <i class="fas fa-server me-1"></i>
                    <span class="badge bg-${getEnvBadgeColor(env.env_type)}">${env.display_name}</span>
                `;
                
                // Initialize components if not already done
                if (!userStats) {
                    userStats = new UserStats(statsContainer);
                    userStats.loadStats();
                }
                
                if (!userFilters) {
                    userFilters = new UserFilters(filtersContainer);
                }
                
                if (!userList) {
                    userList = new UserList(listContainer);
                    userList.loadUsers();
                }
            } else {
                // Show no environment alert
                noEnvAlert.style.display = 'block';
                
                // Hide containers
                statsContainer.style.display = 'none';
                filtersContainer.style.display = 'none';
                listContainer.style.display = 'none';
                
                // Update indicator
                envIndicator.innerHTML = `
                    <i class="fas fa-exclamation-circle me-1"></i>
                    <span>No environment selected</span>
                `;
            }
        };
        
        // Subscribe to environment changes
        environmentContext.subscribe(updateEnvironmentDisplay);
        
        // Initial display update
        updateEnvironmentDisplay();
        
        // Listen for refresh events
        document.addEventListener('refresh-users', () => {
            if (userList) userList.loadUsers();
            if (userStats) userStats.loadStats();
        });
        
        // Display admin email
        const adminEmail = localStorage.getItem('adminEmail');
        if (adminEmail) {
            document.getElementById('admin-email').textContent = adminEmail;
        }
        
    } catch (error) {
        console.error('Error initializing user management:', error);
        showToast('Failed to initialize user management', 'error');
    }
});

function getEnvBadgeColor(type) {
    const colors = {
        production: 'danger',
        test: 'warning',
        development: 'info',
        nqa: 'secondary'
    };
    return colors[type] || 'primary';
}
```

### CSS Styles

#### Environment Management Styles
Create file: `/medproadmin/environments/css/environments.css`

```css
/* Environment Cards */
.environment-card {
    transition: transform 0.2s, box-shadow 0.2s;
    height: 100%;
}

.environment-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.environment-card.border-primary {
    border-width: 2px;
}

.environment-details {
    margin-top: 1rem;
}

.detail-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
}

.detail-item i {
    width: 20px;
    color: #888;
}

/* Environment Type Badges */
.env-type-production { background-color: #dc3545; }
.env-type-test { background-color: #ffc107; }
.env-type-development { background-color: #17a2b8; }
.env-type-nqa { background-color: #6c757d; }

/* Connection Status */
.connection-status {
    position: absolute;
    top: 10px;
    right: 10px;
}

.connection-status.connected {
    color: #28a745;
}

.connection-status.disconnected {
    color: #dc3545;
}

/* Environment Selector Dropdown */
.environment-selector {
    min-width: 200px;
}

.environment-selector .dropdown-item.active {
    background-color: #007bff;
    color: white;
}

.environment-selector .dropdown-item.active i {
    color: white;
}

/* Modal Styles */
.modal-body .nav-tabs {
    border-bottom: 2px solid #dee2e6;
}

.modal-body .nav-tabs .nav-link {
    color: #495057;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
}

.modal-body .nav-tabs .nav-link.active {
    color: #007bff;
    border-bottom-color: #007bff;
    background: none;
}

/* Loading States */
.loading-spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid rgba(0,0,0,.1);
    border-radius: 50%;
    border-top-color: #007bff;
    animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Responsive Design */
@media (max-width: 768px) {
    .environment-card {
        margin-bottom: 1rem;
    }
    
    .detail-item {
        font-size: 0.8rem;
    }
}
```

#### User Management Styles
Create file: `/medproadmin/users/css/users.css`

```css
/* User Statistics Cards */
.stat-card {
    border: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    transition: transform 0.2s, box-shadow 0.2s;
    height: 100%;
}

.stat-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.5rem;
}

/* User Table */
.table-hover tbody tr:hover {
    background-color: #f8f9fa;
    cursor: pointer;
}

.sortable {
    cursor: pointer;
    user-select: none;
}

.sortable:hover {
    background-color: #f8f9fa;
}

.sortable i {
    margin-left: 5px;
    font-size: 0.8rem;
    color: #999;
}

/* User Avatar */
.avatar-sm {
    width: 32px;
    height: 32px;
}

/* Status Badges */
.badge {
    padding: 0.35em 0.65em;
}

/* Filter Form */
.filter-form {
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 0.25rem;
}

/* User Detail Modal */
.user-header {
    padding: 1.5rem;
    background-color: #f8f9fa;
    border-radius: 0.5rem;
}

.user-avatar i {
    font-size: 4rem;
}

/* Activity Timeline */
.activity-timeline {
    position: relative;
    padding-left: 40px;
}

.timeline-item {
    position: relative;
    padding-bottom: 2rem;
}

.timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: -25px;
    top: 36px;
    width: 2px;
    height: calc(100% - 36px);
    background-color: #dee2e6;
}

.timeline-icon {
    position: absolute;
    left: -40px;
    top: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.875rem;
}

.timeline-content h6 {
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
}

/* Charts */
canvas {
    max-height: 300px;
}

/* Pagination */
.pagination {
    margin-bottom: 0;
}

.page-link {
    color: #007bff;
    border-color: #dee2e6;
}

.page-item.active .page-link {
    background-color: #007bff;
    border-color: #007bff;
}

/* Environment Indicator */
.environment-indicator {
    padding: 0.5rem 1rem;
    background-color: #f8f9fa;
    border-radius: 0.25rem;
    font-size: 0.9rem;
}

/* Responsive Design */
@media (max-width: 768px) {
    .stat-card {
        margin-bottom: 1rem;
    }
    
    .table-responsive {
        font-size: 0.875rem;
    }
    
    .btn-group-sm > .btn {
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
    }
    
    .user-header {
        padding: 1rem;
    }
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
    .stat-card,
    .card {
        background-color: #1a1a1a;
        color: #e0e0e0;
    }
    
    .table {
        color: #e0e0e0;
    }
    
    .table-hover tbody tr:hover {
        background-color: #2a2a2a;
    }
    
    .form-control,
    .form-select {
        background-color: #2a2a2a;
        border-color: #444;
        color: #e0e0e0;
    }
}
```

### Troubleshooting Guide

#### Common Issues and Solutions

##### 1. Environment Connection Fails

**Problem**: Cannot connect to environment database
```
Error: Connection failed - Access denied for user
```

**Solutions**:
- Verify database credentials are correct
- Check if database user has proper permissions
- Ensure database host is accessible from admin server
- Check firewall rules

**Debug Steps**:
```bash
# Test database connection manually
mysql -h <host> -u <user> -p<password> -D <database>

# Check network connectivity
ping <database_host>
telnet <database_host> 3306
```

##### 2. Users Not Loading

**Problem**: User list shows "No users found" even though environment is selected

**Solutions**:
- Verify environment is properly connected
- Check browser console for API errors
- Ensure user has `can_manage_users` permission
- Check if environment database has users table

**Debug Steps**:
```javascript
// Check environment context in browser console
console.log(environmentContext.getEnvironment());

// Check API response
fetch('/api/v1/users', {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
        'X-Environment-ID': '1'
    }
}).then(r => r.json()).then(console.log);
```

##### 3. Permission Denied Errors

**Problem**: "Access denied to this environment" error

**Solutions**:
- Check admin permissions in database
- Verify `allowed_environments` includes the environment ID
- Ensure JWT token is valid and not expired

**SQL to Check Permissions**:
```sql
SELECT * FROM admin_permissions WHERE admin_email = 'admin@example.com';
```

##### 4. Session/Authentication Issues

**Problem**: Repeatedly redirected to login page

**Solutions**:
- Check if JWT token exists in localStorage
- Verify token hasn't expired
- Ensure server JWT secret matches
- Check CORS configuration

**Debug Steps**:
```javascript
// Check token in console
console.log(localStorage.getItem('adminToken'));

// Decode JWT token
function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
}
console.log(parseJwt(localStorage.getItem('adminToken')));
```

##### 5. Frontend Components Not Loading

**Problem**: Blank page or components not appearing

**Solutions**:
- Check browser console for JavaScript errors
- Verify all import paths are correct
- Ensure Bootstrap and dependencies are loaded
- Check module script type in HTML

**Common Errors**:
```
Failed to resolve module specifier
Cannot read property of undefined
Bootstrap is not defined
```

##### 6. Database Encryption Issues

**Problem**: "Failed to decrypt password" errors

**Solutions**:
- Verify ENCRYPTION_KEY environment variable is set
- Ensure key is exactly 32 characters
- Check if encrypted data was corrupted

**Test Encryption**:
```javascript
// Test encryption/decryption
const crypto = require('crypto');
const text = 'test123';
const encrypted = encrypt(text);
const decrypted = decrypt(encrypted);
console.log(text === decrypted); // Should be true
```

### Performance Optimization

#### Database Connection Pooling
```javascript
// Optimize connection pool settings
const pool = mysql.createPool({
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true,
    acquireTimeout: 30000,
    timeout: 60000
});
```

#### Frontend Optimization
1. **Lazy Loading**: Load components only when needed
2. **Debouncing**: Debounce search inputs to reduce API calls
3. **Caching**: Cache environment list in sessionStorage
4. **Pagination**: Always use pagination for large datasets

#### API Optimization
1. **Batch Operations**: Group multiple operations when possible
2. **Selective Fields**: Only fetch required fields
3. **Indexing**: Ensure proper database indexes
```sql
-- Add indexes for better performance
ALTER TABLE users ADD INDEX idx_email (email);
ALTER TABLE users ADD INDEX idx_status_role (status, role);
ALTER TABLE environment_access_log ADD INDEX idx_env_date (environment_id, created_at);
```

### Security Best Practices

1. **Never store unencrypted passwords**
2. **Always validate environment access permissions**
3. **Use prepared statements for all queries**
4. **Implement rate limiting on sensitive endpoints**
5. **Log all administrative actions**
6. **Rotate encryption keys periodically**
7. **Use HTTPS for all communications**
8. **Implement session timeouts**
9. **Validate all user inputs**
10. **Regular security audits**

---

**Document Version**: 2.0  
**Last Updated**: July 21, 2025  
**Author**: MedPro Admin Team  
**Status**: Enhanced for Claude Sonnet Implementation
            role: '',
            status: '',
            page: 1,
            limit: 20
        };
        this.init();
    }
    
    async init() {
        this.render();
        this.bindEvents();
        await this.loadUsers();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="user-list-container">
                <div class="user-list-header">
                    <h3>Users</h3>
                    <div class="user-stats" id="user-stats"></div>
                </div>
                
                <div class="user-filters" id="user-filters"></div>
                
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="user-list-body">
                            <tr><td colspan="6" class="text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="pagination" id="user-pagination"></div>
            </div>
        `;
    }
    
    async loadUsers() {
        showLoading('Loading users...');
        
        const queryParams = new URLSearchParams(this.filters);
        const response = await authenticatedFetch(`/api/v1/users?${queryParams}`);
        
        hideLoading();
        
        if (response.success) {
            this.users = response.data.users;
            this.renderUsers();
            this.renderPagination(response.data.pagination);
        } else {
            showToast('Failed to load users', 'error');
        }
    }
    
    renderUsers() {
        const tbody = document.getElementById('user-list-body');
        
        if (this.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.users.map(user => `
            <tr>
                <td>${this.escapeHtml(user.email)}</td>
                <td>${this.escapeHtml(user.fullname)}</td>
                <td><span class="badge bg-${this.getRoleBadgeClass(user.role)}">${user.role}</span></td>
                <td>
                    <span class="badge bg-${user.status === 'active' ? 'success' : 'secondary'}">
                        ${user.status}
                    </span>
                </td>
                <td>${formatDate(user.last_login, 'relative')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewUser('${user.email}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editUserStatus('${user.email}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    getRoleBadgeClass(role) {
        const classes = {
            'admin': 'danger',
            'practitioner': 'primary',
            'patient': 'info',
            'assistant': 'warning'
        };
        return classes[role] || 'secondary';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}
```

### UI/UX Design Patterns

1. **Environment Indicator**
   - Color-coded badge in header
   - Environment name always visible
   - Warning for production environment

2. **Responsive Tables**
   - Mobile-friendly with horizontal scroll
   - Sticky headers
   - Row hover effects

3. **Loading States**
   - Skeleton loaders for initial load
   - Inline spinners for actions
   - Progress bars for bulk operations

4. **Error Handling**
   - Toast notifications for errors
   - Inline validation messages
   - Retry mechanisms

### CSS Styles

#### Environment Management Styles
Create file: `/medproadmin/environments/css/environments.css`

```css
/* Environment Cards */
.environment-card {
    transition: transform 0.2s, box-shadow 0.2s;
    height: 100%;
}

.environment-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.environment-card.border-primary {
    border-width: 2px;
}

.environment-details {
    margin-top: 1rem;
}

.detail-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
}

.detail-item i {
    width: 20px;
    color: #888;
}

/* Environment Selector in Header */
#environment-selector-container {
    position: relative;
}

.environment-selector {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    padding: 0.375rem 0.75rem;
    color: white;
    cursor: pointer;
    min-width: 200px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.environment-selector:hover {
    background: rgba(255,255,255,0.2);
}

.environment-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-left: 0.5rem;
}

.env-production { background-color: #dc3545; }
.env-test { background-color: #ffc107; color: #000; }
.env-development { background-color: #17a2b8; }
.env-nqa { background-color: #6c757d; }

/* Connection Test Results */
.connection-test-results {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
}

.connection-test-results.success {
    background-color: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
}

.connection-test-results.error {
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
}
```

#### User Management Styles
Create file: `/medproadmin/users/css/users.css`

```css
/* Environment Indicator */
.environment-indicator {
    padding: 0.5rem 1rem;
    background-color: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #dee2e6;
}

.environment-indicator.production {
    background-color: #fff5f5;
    border-color: #dc3545;
    color: #dc3545;
}

/* User Stats Cards */
#user-stats-container {
    margin-bottom: 2rem;
}

.stat-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    border: 1px solid #e9ecef;
    transition: transform 0.2s;
}

.stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    margin-bottom: 1rem;
}

.stat-icon.users { background-color: #e3f2fd; color: #1976d2; }
.stat-icon.practitioners { background-color: #f3e5f5; color: #7b1fa2; }
.stat-icon.patients { background-color: #e8f5e9; color: #388e3c; }
.stat-icon.activity { background-color: #fff3e0; color: #f57c00; }

.stat-value {
    font-size: 2rem;
    font-weight: 600;
    color: #333;
}

.stat-label {
    color: #666;
    font-size: 0.9rem;
}

/* User Filters */
.user-filters {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
}

/* User Table */
.user-table {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.user-table table {
    margin-bottom: 0;
}

.user-table th {
    background-color: #f8f9fa;
    font-weight: 600;
    color: #666;
    border-bottom: 2px solid #dee2e6;
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: #e9ecef;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-weight: 600;
    margin-right: 0.5rem;
}

/* Pagination */
.pagination {
    margin-top: 1.5rem;
}

/* User Detail Modal */
.user-detail-section {
    margin-bottom: 2rem;
}

.user-detail-section h6 {
    color: #333;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e9ecef;
}

.detail-row {
    display: flex;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f8f9fa;
}

.detail-label {
    flex: 0 0 150px;
    color: #666;
    font-weight: 500;
}

.detail-value {
    flex: 1;
    color: #333;
}

/* Loading States */
.skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: 4px;
}

@keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.skeleton-text {
    height: 1rem;
    margin-bottom: 0.5rem;
}

.skeleton-card {
    height: 150px;
    margin-bottom: 1rem;
}
```

## Implementation Phases

### Phase 1: Environment Management Backend (Days 1-3)

#### Day 1: Database and Core Setup
1. **Run database migrations**
   ```bash
   # Connect to MySQL
   mysql -u root -p
   
   # Create database and tables
   USE medpro_admin;
   SOURCE /path/to/environment_schema.sql;
   ```

2. **Environment configuration**
   ```bash
   # Add to .env file
   ENCRYPTION_KEY=your_32_character_encryption_key_here
   MAX_ENVIRONMENTS=10
   SESSION_TIMEOUT=3600
   AUDIT_LOG_RETENTION_DAYS=90
   ```

3. **Install dependencies**
   ```bash
   cd medproadmin/server
   npm install express-session
   ```

#### Day 2: Implement Environment Routes
1. Create `/server/routes/environments.js` (code provided above)
2. Create `/server/services/environmentService.js` (code provided above)
3. Update `/server/server.js`:
   ```javascript
   // Add session middleware
   const session = require('express-session');
   app.use(session({
       secret: process.env.SESSION_SECRET || 'your-session-secret',
       resave: false,
       saveUninitialized: false,
       cookie: { secure: process.env.NODE_ENV === 'production' }
   }));
   
   // Add routes
   app.use('/api/v1/environments', require('./routes/environments'));
   ```

#### Day 3: Test Environment API
1. Create test script `/server/tests/test-environments.js`:
   ```javascript
   const request = require('supertest');
   const app = require('../server');
   
   describe('Environment API', () => {
       let authToken;
       
       beforeAll(async () => {
           // Login to get token
           const res = await request(app)
               .post('/api/v1/auth/login')
               .send({ email: 'admin@medpro.com', password: 'password' });
           authToken = res.body.data.token;
       });
       
       test('List environments', async () => {
           const res = await request(app)
               .get('/api/v1/environments')
               .set('Authorization', `Bearer ${authToken}`);
           
           expect(res.status).toBe(200);
           expect(res.body.success).toBe(true);
           expect(Array.isArray(res.body.data)).toBe(true);
       });
   });
   ```

### Phase 2: Environment Management Frontend (Days 4-6)

#### Day 4: Create Frontend Structure
1. Create directory structure:
   ```bash
   mkdir -p medproadmin/environments/{css,js/{components,services}}
   mkdir -p medproadmin/shared/js
   ```

2. Create HTML files (code provided above)
3. Create CSS files (code provided above)

#### Day 5: Implement Components
1. Create `/shared/js/environmentContext.js` (code provided above)
2. Create `/environments/js/components/environmentList.js` (code provided above)
3. Create `/environments/js/app.js`:
   ```javascript
   import { EnvironmentList } from './components/environmentList.js';
   import { EnvironmentEditor } from './components/environmentEditor.js';
   
   document.addEventListener('DOMContentLoaded', async () => {
       const container = document.getElementById('environment-list-container');
       const environmentList = new EnvironmentList(container);
       
       // Add environment button
       document.getElementById('btn-add-environment').addEventListener('click', () => {
           const editor = new EnvironmentEditor();
           editor.show();
       });
   });
   ```

#### Day 6: Test Frontend Integration
1. Start the server
2. Navigate to `/medproadmin/environments`
3. Test all CRUD operations
4. Verify connection testing works

### Phase 3: User Management Backend (Days 7-9)

#### Day 7: User Routes Implementation
1. Create `/server/routes/users.js` (code provided above)
2. Update `/server/server.js`:
   ```javascript
   app.use('/api/v1/users', require('./routes/users'));
   ```

#### Day 8: User Statistics Endpoints
1. Add to `/server/routes/users.js`:
   ```javascript
   // GET /api/v1/users/stats
   router.get('/stats', verifyToken, requirePermission('can_manage_users'), withEnvironment, async (req, res) => {
       try {
           const stats = await getEnvironmentStats(req.environmentId);
           res.json({
               success: true,
               data: stats
           });
       } catch (error) {
           logger.error('Error getting user stats:', error);
           res.status(500).json({
               success: false,
               error: 'Failed to get user statistics'
           });
       }
   });
   ```

#### Day 9: Test User API
1. Create test cases for all user endpoints
2. Test with different environments
3. Verify audit logging works

### Phase 4: User Management Frontend (Days 10-12)

#### Day 10: User List Component
1. Create `/users/js/components/userList.js` (similar to environment list)
2. Create `/users/js/components/userFilters.js`
3. Create `/users/js/components/userStats.js`

#### Day 11: User Detail View
1. Create `/users/js/components/userDetail.js`
2. Implement modal for user details
3. Add status update functionality

#### Day 12: Integration and Testing
1. Test environment switching
2. Verify user data loads correctly
3. Test all user operations

### Phase 5: Final Integration and Testing (Days 13-14)

#### Day 13: End-to-End Testing
1. **Test Checklist:**
   - [ ] Environment CRUD operations
   - [ ] Environment connection testing
   - [ ] Environment switching
   - [ ] User listing with pagination
   - [ ] User search and filtering
   - [ ] User detail view
   - [ ] User status updates
   - [ ] Audit logging
   - [ ] Permission checks

2. **Performance Testing:**
   - Test with multiple environments
   - Test with large user datasets
   - Monitor connection pool usage

#### Day 14: Documentation and Deployment
1. **Create user documentation**
2. **Update API documentation**
3. **Deploy to staging environment**
4. **Final QA testing**

## Troubleshooting Guide

### Common Issues

1. **Environment Connection Fails**
   ```javascript
   // Check encryption key
   console.log('Encryption key length:', process.env.ENCRYPTION_KEY.length);
   // Should be 32 characters
   
   // Test decryption
   const decrypted = decrypt(environment.db_password_encrypted);
   console.log('Decrypted password:', decrypted);
   ```

2. **Session Not Persisting**
   ```javascript
   // Ensure session middleware is configured correctly
   app.use(session({
       secret: process.env.SESSION_SECRET,
       resave: false,
       saveUninitialized: false,
       cookie: { 
           secure: process.env.NODE_ENV === 'production',
           httpOnly: true,
           maxAge: 1000 * 60 * 60 * 24 // 24 hours
       }
   }));
   ```

3. **CORS Issues**
   ```javascript
   // Update CORS configuration
   const corsOptions = {
       origin: ['http://localhost:4040', 'https://admin.medpro.com'],
       credentials: true,
       optionsSuccessStatus: 200
   };
   ```

## Performance Optimization

1. **Connection Pooling**
   - Limit connections per environment
   - Implement connection timeout
   - Monitor pool usage

2. **Caching Strategy**
   - Cache environment connections
   - Cache user stats for 5 minutes
   - Implement Redis for session storage

3. **Query Optimization**
   - Add indexes to frequently queried columns
   - Use pagination for large datasets
   - Implement query result caching

## Security Considerations

### Authentication & Authorization

1. **Environment Access Control**
   - Admin must have explicit permission for each environment
   - Environment-specific roles can be defined
   - All actions are logged

2. **Data Protection**
   - Database credentials encrypted at rest
   - SSL/TLS for all connections
   - No sensitive data in logs

3. **Audit Trail**
   - Every action is logged with user, timestamp, and IP
   - Immutable audit logs
   - Regular audit log reviews

### Best Practices

1. **Principle of Least Privilege**
   - Read-only access to MedPro databases
   - Limited write operations
   - Role-based permissions

2. **Session Management**
   - Environment sessions expire after inactivity
   - Concurrent session limits
   - Session hijacking protection

3. **Input Validation**
   - Sanitize all user inputs
   - SQL injection prevention
   - XSS protection

## Testing Strategy

### Unit Tests

```javascript
// Example: Environment API tests
describe('Environment API', () => {
    test('should create new environment', async () => {
        const env = {
            env_name: 'test_env',
            env_type: 'test',
            display_name: 'Test Environment',
            db_host: 'localhost',
            db_name: 'test_db',
            db_user: 'test_user',
            db_password: 'test_pass'
        };
        
        const response = await request(app)
            .post('/api/v1/environments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(env);
            
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.env_name).toBe(env.env_name);
    });
    
    test('should not allow duplicate environment names', async () => {
        // Test implementation
    });
});
```

### Integration Tests

1. **Environment Switching**
   - Test switching between environments
   - Verify connection isolation
   - Check session management

2. **User Management Flow**
   - List users from different environments
   - Update user across environments
   - Verify audit logging

### UI Tests

```javascript
// Example: Playwright test
test('Environment selector', async ({ page }) => {
    await page.goto('/medproadmin/environments');
    
    // Select test environment
    await page.click('#env-selector');
    await page.click('text=Testing');
    
    // Verify environment switched
    await expect(page.locator('.env-indicator')).toHaveText('Testing');
    
    // Verify user list updated
    await page.goto('/medproadmin/users');
    await expect(page.locator('#user-count')).toContainText('users in Testing');
});
```

## Migration Guide

### For Existing Admins

1. **Permission Updates**
   ```sql
   -- Grant environment access to existing admins
   UPDATE admin_permissions 
   SET can_manage_environments = TRUE,
       can_manage_users = TRUE,
       allowed_environments = JSON_ARRAY(1)
   WHERE role = 'super_admin';
   ```

2. **Initial Environment Setup**
   - Run database migration scripts
   - Configure production environment first
   - Test connections before enabling

### Rollback Plan

1. **Database Rollback**
   ```sql
   -- Remove environment tables
   DROP TABLE IF EXISTS user_management_log;
   DROP TABLE IF EXISTS environment_access_log;
   DROP TABLE IF EXISTS environments;
   
   -- Revert permission changes
   ALTER TABLE admin_permissions 
   DROP COLUMN allowed_environments,
   DROP COLUMN can_manage_environments,
   DROP COLUMN can_manage_users;
   ```

2. **Code Rollback**
   - Revert to previous git commit
   - Clear browser caches
   - Restart application servers

## Appendix

### A. Environment Variables

```bash
# Add to .env file
ENCRYPTION_KEY=your_32_char_encryption_key_here
MAX_ENVIRONMENTS=10
SESSION_TIMEOUT=3600
AUDIT_LOG_RETENTION_DAYS=90
```

### B. Nginx Configuration

```nginx
# Add to nginx config for environment-specific headers
location /api/v1/users {
    proxy_pass http://localhost:4040;
    proxy_set_header X-Environment-ID $http_x_environment_id;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### C. Monitoring

1. **Key Metrics**
   - Environment switch frequency
   - User query response times
   - Failed connection attempts
   - Audit log size growth

2. **Alerts**
   - Failed environment connections
   - Unauthorized access attempts
   - Unusual user activity patterns

---

**Document Version**: 1.0  
**Last Updated**: July 21, 2025  
**Author**: MedPro Admin Team  
**Status**: Ready for Implementation