const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Execute script on MedPro server via SSH
 */
async function executeScriptOnMedProServer(executionId, job, commandExecuted, environmentId, environmentConfig) {
    try {
        logger.info(`Executing script on MedPro server for execution ${executionId}: ${commandExecuted}`);
        
        // Use SSH configuration from environment table
        const sshHost = environmentConfig?.ssh_host || 'localhost';
        const sshUser = environmentConfig?.ssh_user || 'root';
        const sshKey = environmentConfig?.ssh_key_path || '~/.ssh/id_rsa';
        const sshPort = environmentConfig?.ssh_port || 22;
        const nodePath = environmentConfig?.node_path || 'node';
        
        logger.info(`Using SSH config from environment: ${sshUser}@${sshHost}:${sshPort}`);
        
        // SSH command to execute on remote server with proper terminal allocation
        const sshCommand = [
            '-t', // Allocate pseudo-terminal for proper environment
            '-i', sshKey,
            '-o', 'StrictHostKeyChecking=no',
            `${sshUser}@${sshHost}`,
            commandExecuted
        ];
        
        logger.info(`SSH command: ssh ${sshCommand.join(' ')}`);
        
        // Update progress to 20%
        await executeQuery(adminPool, 
            'UPDATE migration_executions SET progress = 20 WHERE id = ?',
            [executionId]
        );
        
        // Spawn SSH process
        const sshProcess = spawn('ssh', sshCommand);
        
        let stdout = '';
        let stderr = '';
        let progressCount = 30;
        
        // Handle stdout
        sshProcess.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            
            // Log output to database
            try {
                await executeQuery(adminPool, 
                    'INSERT INTO migration_logs (execution_id, log_level, message) VALUES (?, "info", ?)',
                    [executionId, output.trim()]
                );
                
                // Update progress incrementally
                progressCount = Math.min(progressCount + 5, 90);
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET progress = ? WHERE id = ?',
                    [progressCount, executionId]
                );
                
            } catch (logError) {
                logger.error('Error logging stdout:', logError);
            }
        });
        
        // Handle stderr
        sshProcess.stderr.on('data', async (data) => {
            const output = data.toString();
            stderr += output;
            
            // Log error to database
            try {
                await executeQuery(adminPool, 
                    'INSERT INTO migration_logs (execution_id, log_level, message) VALUES (?, "error", ?)',
                    [executionId, output.trim()]
                );
            } catch (logError) {
                logger.error('Error logging stderr:', logError);
            }
        });
        
        // Handle process completion
        sshProcess.on('close', async (code) => {
            try {
                const success = code === 0;
                const status = success ? 'completed' : 'failed';
                const progress = success ? 100 : progressCount;
                
                // Update execution status
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET status = ?, completed_at = NOW(), progress = ?, result_summary = ? WHERE id = ?',
                    [status, progress, JSON.stringify({ 
                        exit_code: code, 
                        stdout_length: stdout.length,
                        stderr_length: stderr.length 
                    }), executionId]
                );
                
                // Final log entry
                await executeQuery(adminPool, 
                    'INSERT INTO migration_logs (execution_id, log_level, message) VALUES (?, ?, ?)',
                    [executionId, success ? 'info' : 'error', 
                     `Migration ${success ? 'completed successfully' : 'failed'} with exit code ${code}`]
                );
                
                logger.info(`Migration execution ${executionId} ${status} with exit code ${code}`);
                
            } catch (updateError) {
                logger.error('Error updating execution completion:', updateError);
            }
        });
        
        // Handle process error
        sshProcess.on('error', async (error) => {
            logger.error(`SSH process error for execution ${executionId}:`, error);
            
            try {
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET status = "failed", completed_at = NOW(), progress = 0 WHERE id = ?',
                    [executionId]
                );
                
                await executeQuery(adminPool, 
                    'INSERT INTO migration_logs (execution_id, log_level, message) VALUES (?, "error", ?)',
                    [executionId, `SSH process error: ${error.message}`]
                );
            } catch (logError) {
                logger.error('Error logging SSH process error:', logError);
            }
        });
        
    } catch (error) {
        logger.error(`Error executing script for execution ${executionId}:`, error);
        
        try {
            await executeQuery(adminPool, 
                'UPDATE migration_executions SET status = "failed", completed_at = NOW() WHERE id = ?',
                [executionId]
            );
            
            await executeQuery(adminPool, 
                'INSERT INTO migration_logs (execution_id, log_level, message) VALUES (?, "error", ?)',
                [executionId, `Execution error: ${error.message}`]
            );
        } catch (logError) {
            logger.error('Error logging execution error:', logError);
        }
    }
}

/**
 * GET /api/v1/migration-executions
 * List migration executions with optional filters
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const { job_id, status, environment_id } = req.query;
        
        let query = `
            SELECT 
                e.id, e.job_id, e.environment_id, e.status, e.progress, 
                e.started_at, e.completed_at, e.executed_by, e.command_executed, e.result_summary,
                j.name as job_name, s.name as source_name
            FROM migration_executions e
            JOIN migration_jobs j ON e.job_id = j.id
            JOIN migration_sources s ON j.source_id = s.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (job_id) {
            query += ' AND e.job_id = ?';
            params.push(job_id);
        }
        
        if (status) {
            query += ' AND e.status = ?';
            params.push(status);
        }
        
        if (environment_id) {
            query += ' AND e.environment_id = ?';
            params.push(environment_id);
        }
        
        query += ' ORDER BY e.started_at DESC LIMIT 50';
        
        const executions = await executeQuery(adminPool, query, params);
        
        logger.info(`Retrieved ${executions.length} migration executions`);
        
        res.json({
            success: true,
            data: Array.isArray(executions) ? executions : [executions]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration executions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration executions'
        });
    }
});

/**
 * GET /api/v1/migration-executions/:id
 * Get a specific migration execution
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                e.id, e.job_id, e.environment_id, e.status, e.progress, 
                e.started_at, e.completed_at, e.executed_by, e.command_executed, e.result_summary,
                j.name as job_name, j.parameters as job_parameters,
                s.name as source_name, s.display_name as source_display_name, s.script_path
            FROM migration_executions e
            JOIN migration_jobs j ON e.job_id = j.id
            JOIN migration_sources s ON j.source_id = s.id
            WHERE e.id = ?
        `;
        
        const executions = await executeQuery(adminPool, query, [id]);
        
        if (executions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration execution not found'
            });
        }
        
        res.json({
            success: true,
            data: executions[0]
        });
        
    } catch (error) {
        logger.error('Error retrieving migration execution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve migration execution'
        });
    }
});

/**
 * GET /api/v1/migration-executions/:id/logs
 * Get logs for a specific execution
 */
router.get('/:id/logs', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 100 } = req.query;
        const limitNum = Math.min(Math.max(parseInt(limit) || 100, 1), 1000); // Clamp between 1-1000
        
        // First verify execution exists
        const executionQuery = 'SELECT id FROM migration_executions WHERE id = ?';
        const executions = await executeQuery(adminPool, executionQuery, [id]);
        
        if (executions.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration execution not found'
            });
        }
        
        const query = `
            SELECT id, log_level, message, logged_at
            FROM migration_logs 
            WHERE execution_id = ? 
            ORDER BY logged_at DESC 
            LIMIT ${limitNum}
        `;
        
        const logs = await executeQuery(adminPool, query, [id]);
        
        logger.info(`Retrieved ${logs.length} logs for execution ${id}`);
        
        res.json({
            success: true,
            data: Array.isArray(logs) ? logs : [logs]
        });
        
    } catch (error) {
        logger.error('Error retrieving execution logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve execution logs'
        });
    }
});

/**
 * POST /api/v1/migration-jobs/:id/execute
 * Execute a migration job
 */
router.post('/jobs/:id/execute', verifyToken, async (req, res) => {
    try {
        const { id: jobId } = req.params;
        const { environment_id } = req.body;
        const executedBy = req.user.email;
        
        if (!environment_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: environment_id'
            });
        }
        
        // Get environment details for SSH connection
        const envQuery = 'SELECT * FROM environments WHERE id = ? OR env_name = ? OR display_name = ?';
        const environments = await executeQuery(adminPool, envQuery, [environment_id, environment_id, environment_id]);
        
        let environmentConfig = null;
        if (environments.length > 0) {
            environmentConfig = environments[0];
            logger.info(`Using environment: ${environmentConfig.display_name} (${environmentConfig.db_host})`);
        } else {
            logger.warn(`Environment ${environment_id} not found, using defaults`);
        }
        
        // Verify job exists and get details
        const jobQuery = `
            SELECT 
                j.id, j.name, j.parameters,
                s.script_path
            FROM migration_jobs j
            JOIN migration_sources s ON j.source_id = s.id
            WHERE j.id = ? AND j.is_active = TRUE
        `;
        
        const jobs = await executeQuery(adminPool, jobQuery, [jobId]);
        
        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Migration job not found'
            });
        }
        
        const job = jobs[0];
        
        // Build command from job parameters
        const parameters = typeof job.parameters === 'string' ? JSON.parse(job.parameters) : job.parameters;
        
        // Build positional parameter string for orchestrate-import.js
        // Expected: node orchestrate-import.js <sistema> <usuario> <practitioner-id> <medpro-pract-id> [patient-id]
        const paramParts = [
            parameters.sistema || '',       // <sistema>
            parameters.usuario || '',       // <usuario> 
            parameters['pract-source'] || '', // <practitioner-id>
            parameters['pract-target'] || '', // <medpro-pract-id>
            parameters.patient || ''         // [patient-id] (optional)
        ].filter(p => p); // Remove empty parameters
        
        // Build complete command using environment configuration
        const nodePath = environmentConfig?.node_path || 'node';
        // Source shell configurations to ensure Node.js PATH is available for SSH non-interactive execution
        const shellSources = [
            'source ~/.bashrc 2>/dev/null || true',        // Primary: where NVM is typically configured
            'source ~/.zshrc 2>/dev/null || true',         // Secondary: zsh configuration
            '[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true'  // Fallback: direct NVM sourcing
        ].join('; ');
        
        // Extract directory from script path and change to that directory before execution
        const scriptPath = job.script_path.replace(/^~/, process.env.HOME || '~');
        const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
        const scriptFile = scriptPath.substring(scriptPath.lastIndexOf('/') + 1);
        
        const commandExecuted = `/bin/bash -c "${shellSources}; cd ${scriptDir} && ${nodePath} ${scriptFile} ${paramParts.join(' ')}"`;
        
        logger.info(`Built command: ${commandExecuted}`);
        
        // Create execution record
        const executionQuery = `
            INSERT INTO migration_executions 
            (job_id, environment_id, status, executed_by, command_executed)
            VALUES (?, ?, 'running', ?, ?)
        `;
        
        const result = await executeQuery(adminPool, executionQuery, [
            jobId, environment_id, executedBy, commandExecuted
        ]);
        
        const executionId = result.insertId;
        
        // Log execution start
        const logQuery = `
            INSERT INTO migration_logs (execution_id, log_level, message)
            VALUES (?, 'info', ?)
        `;
        
        await executeQuery(adminPool, logQuery, [
            executionId, 
            `Migration job "${job.name}" started on environment ${environment_id}`
        ]);
        
        logger.info(`Started migration execution ${executionId} for job ${jobId}`);
        
        // Execute actual script on MedPro server
        executeScriptOnMedProServer(executionId, job, commandExecuted, environment_id, environmentConfig);
        
        // Mark as in progress
        await executeQuery(adminPool, 
            'UPDATE migration_executions SET status = "running", progress = 10 WHERE id = ?',
            [executionId]
        );
        
        res.json({
            success: true,
            data: {
                execution_id: executionId,
                job_id: jobId,
                environment_id,
                status: 'running',
                message: 'Migration execution started'
            }
        });
        
    } catch (error) {
        logger.error('Error executing migration job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute migration job'
        });
    }
});

module.exports = router;