const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, executeTransaction, adminPool } = require('../config/database');
const { verifyToken, requirePermission, logAdminAction } = require('../middleware/auth');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// Encryption helpers (reused from other routes)
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

// Log database management access
const logDatabaseAccess = async (req, environmentId, actionType, actionDetails = {}, success = true, errorMessage = null) => {
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
            null, // target_user_email
            null, // target_user_id
            JSON.stringify(actionDetails),
            req.ip || req.connection?.remoteAddress || 'unknown',
            req.get('User-Agent') || 'unknown',
            requestId,
            success,
            errorMessage
        ]);
    } catch (error) {
        logger.error('Failed to log database access:', error);
    }
};

// GET /api/v1/database/stats - Get entity statistics from selected environment
router.get('/stats', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required')
], async (req, res) => {
    let medproConnection = null;
    
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

        logger.info(`Loading database statistics for environment ${environment_id} by ${req.user.email}`);

        const { connection, environment } = await getEnvironmentConnection(environment_id);
        medproConnection = connection;

        // Get entity counts from MedPro database
        const stats = {};
        
        try {
            // Users count
            const [usersResult] = await medproConnection.execute('SELECT COUNT(*) as count FROM users');
            stats.users = usersResult[0]?.count || 0;
            
            // Practitioners count
            const [practitionersResult] = await medproConnection.execute('SELECT COUNT(*) as count FROM practitioners');
            stats.practitioners = practitionersResult[0]?.count || 0;
            
            // Patients count  
            const [patientsResult] = await medproConnection.execute('SELECT COUNT(*) as count FROM patients');
            stats.patients = patientsResult[0]?.count || 0;
            
            // Organizations count
            const [organizationsResult] = await medproConnection.execute('SELECT COUNT(*) as count FROM organization');
            stats.organizations = organizationsResult[0]?.count || 0;
            
            // Active Subscriptions count
            const [activeSubscriptionsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM user_subscriptions WHERE status = 'active'");
            stats.activeSubscriptions = activeSubscriptionsResult[0]?.count || 0;

            // Appointments count
            const [appointmentsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM appointments");
            stats.appointments = appointmentsResult[0]?.count || 0;

            // Encounters count
            const [encountersResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM encounters");
            stats.encounters = encountersResult[0]?.count || 0;

            // Clinical Records count
            const [clinicalRecordsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM clinicalrecord");
            stats.clinicalRecords = clinicalRecordsResult[0]?.count || 0;

            // Medication Records count
            const [medicationRecordsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM medicationrecord");
            stats.medicationRecords = medicationRecordsResult[0]?.count || 0;

            // Locations count
            const [locationsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM locations");
            stats.locations = locationsResult[0]?.count || 0;

            // Schedules count
            const [schedulesResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM schedules");
            stats.schedules = schedulesResult[0]?.count || 0;

            // Invoices count
            const [invoicesResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM invoices");
            stats.invoices = invoicesResult[0]?.count || 0;

            // Attachments count
            const [attachmentsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM attachments");
            stats.attachments = attachmentsResult[0]?.count || 0;

            // Care Plans count
            const [carePlansResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM practcareplans");
            stats.carePlans = carePlansResult[0]?.count || 0;

            // Patient Leads count
            const [patientLeadsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM patientleads");
            stats.patientLeads = patientLeadsResult[0]?.count || 0;

            // Communications count
            const [communicationsResult] = await medproConnection.execute("SELECT COUNT(*) as count FROM internal_messages");
            stats.communications = communicationsResult[0]?.count || 0;
        } catch (queryError) {
            logger.warn('Some statistics queries failed:', queryError);
            // Set defaults for failed queries
            if (!stats.users) stats.users = 0;
            if (!stats.practitioners) stats.practitioners = 0;
            if (!stats.patients) stats.patients = 0;
            if (!stats.organizations) stats.organizations = 0;
        }

        // Log successful access
        await logDatabaseAccess(req, environment_id, 'view_stats', { 
            environment_name: environment.name,
            stats_retrieved: Object.keys(stats)
        }, true);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Error loading database statistics:', error);
        
        // Log failed access
        await logDatabaseAccess(req, req.query.environment_id, 'view_stats', {}, false, error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to load database statistics',
            message: error.message
        });
    } finally {
        if (medproConnection) {
            try {
                await medproConnection.end();
            } catch (closeError) {
                logger.error('Error closing MedPro connection:', closeError);
            }
        }
    }
});

// GET /api/v1/database/procedures - List available stored procedures
router.get('/procedures', [
    verifyToken,
    query('environment_id').isInt().withMessage('Environment ID is required')
], async (req, res) => {
    let medproConnection = null;
    
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

        logger.info(`Loading stored procedures for environment ${environment_id} by ${req.user.email}`);

        const { connection, environment } = await getEnvironmentConnection(environment_id);
        medproConnection = connection;

        // Get stored procedures from MedPro database
        const [proceduresResult] = await medproConnection.execute(`
            SELECT 
                ROUTINE_NAME as name,
                ROUTINE_COMMENT as comment,
                CREATED as created
            FROM information_schema.ROUTINES 
            WHERE ROUTINE_SCHEMA = ? 
            AND ROUTINE_TYPE = 'PROCEDURE'
            ORDER BY ROUTINE_NAME
        `, [environment.db_name]);

        // Configure stored procedures with their parameters
        // Based on actual stored procedures found in MedPro database
        const procedureConfigs = {
            'ResetEnvironment': {
                displayName: 'Reset MedPro Environment',
                description: 'Truncates all transactional tables in the MedPro database, effectively resetting it to a clean state. THIS IS A DESTRUCTIVE OPERATION AND CANNOT BE UNDONE.',
                category: 'Data Management',
                riskLevel: 'CRITICAL',
                parameters: {
                    'p_confirm': {
                        type: 'confirm-checkbox',
                        default: false,
                        label: 'I confirm that I want to permanently delete all transactional data.',
                        description: 'This action is irreversible. Check this box to confirm you understand the consequences.',
                        required: true,
                        confirmValue: 'CONFIRM-RESET'
                    }
                }
            },
            'CleanPatientData_HardcodedTables': {
                displayName: 'Clean Patient Data (Hardcoded Tables)',
                description: 'Truncates patient-related tables to clean up test data. CAUTION: This will permanently delete data from predefined tables.',
                category: 'Data Management',
                riskLevel: 'HIGH',
                parameters: {
                    'p_confirm': {
                        type: 'confirm-checkbox',
                        default: false,
                        label: 'I confirm that I want to DELETE data',
                        description: 'Check this box to confirm you understand this will delete data from the database',
                        required: true,
                        confirmValue: 'CONFIRM-DELETE'
                    },
                    'p_dry_run': {
                        type: 'boolean',
                        default: true,
                        label: 'Dry Run Mode',
                        description: 'TRUE to only show what would be deleted without actually deleting, FALSE to execute the cleanup',
                        required: true
                    }
                }
            }
        };

        // Build procedures list with configurations
        const procedures = proceduresResult.map(proc => {
            const config = procedureConfigs[proc.name] || {};
            return {
                name: proc.name,
                displayName: config.displayName || proc.name,
                description: config.description || proc.comment || 'No description available',
                parameters: config.parameters || {},
                created: proc.created
            };
        });

        // Log successful access
        await logDatabaseAccess(req, environment_id, 'list_procedures', { 
            environment_name: environment.name,
            procedures_count: procedures.length,
            procedures_found: procedures.map(p => p.name)
        }, true);

        res.json({
            success: true,
            data: procedures
        });

    } catch (error) {
        logger.error('Error loading stored procedures:', error);
        
        // Log failed access
        await logDatabaseAccess(req, req.query.environment_id, 'list_procedures', {}, false, error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to load stored procedures',
            message: error.message
        });
    } finally {
        if (medproConnection) {
            try {
                await medproConnection.end();
            } catch (closeError) {
                logger.error('Error closing MedPro connection:', closeError);
            }
        }
    }
});

// POST /api/v1/database/execute-procedure - Execute stored procedure
router.post('/execute-procedure', [
    verifyToken,
    body('environmentId').isInt().withMessage('Environment ID is required'),
    body('procedureName').isString().notEmpty().withMessage('Procedure name is required'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object')
], async (req, res) => {
    let medproConnection = null;
    
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

        const { environmentId, procedureName, parameters = {} } = req.body;

        logger.info(`Executing stored procedure ${procedureName} for environment ${environmentId} by ${req.user.email}`, {
            parameters
        });

        const { connection, environment } = await getEnvironmentConnection(environmentId);
        medproConnection = connection;

        // Build procedure call
        const paramKeys = Object.keys(parameters);
        const paramValues = Object.values(parameters);
        const placeholders = paramKeys.map(() => '?').join(', ');
        
        const procedureCall = `CALL ${procedureName}(${placeholders})`;
        
        logger.info(`Executing: ${procedureCall}`, { parameters: paramValues });

        // Execute stored procedure
        const [results] = await medproConnection.execute(procedureCall, paramValues);

        // Log successful execution
        await logDatabaseAccess(req, environmentId, 'execute_procedure', { 
            environment_name: environment.name,
            procedure_name: procedureName,
            parameters: parameters,
            results_count: Array.isArray(results) ? results.length : 1
        }, true);

        res.json({
            success: true,
            data: {
                message: `Procedure ${procedureName} executed successfully`,
                results: results,
                executedAt: new Date().toISOString(),
                procedureName,
                parameters
            }
        });

    } catch (error) {
        logger.error('Error executing stored procedure:', error);
        
        // Log failed execution
        await logDatabaseAccess(req, req.body.environmentId, 'execute_procedure', {
            procedure_name: req.body.procedureName,
            parameters: req.body.parameters
        }, false, error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to execute stored procedure',
            message: error.message,
            procedureName: req.body.procedureName
        });
    } finally {
        if (medproConnection) {
            try {
                await medproConnection.end();
            } catch (closeError) {
                logger.error('Error closing MedPro connection:', closeError);
            }
        }
    }
});

module.exports = router;