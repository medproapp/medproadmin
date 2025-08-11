const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * LogBuffer class for batching log inserts to reduce database load
 */
class LogBuffer {
    constructor(executionId, flushInterval = 1000) {
        this.executionId = executionId;
        this.buffer = [];
        this.flushInterval = flushInterval;
        this.timer = null;
        this.isFlushing = false;
        this.sequenceNumber = 0;
    }
    
    add(level, message) {
        if (!message || message.trim().length === 0) return;
        
        this.buffer.push({ 
            level, 
            message: message.trim(), 
            timestamp: new Date(),
            sequence: this.sequenceNumber++
        });
        
        // Start flush timer if not already running
        if (!this.timer && !this.isFlushing) {
            this.timer = setTimeout(() => this.flush(), this.flushInterval);
        }
        
        // Force flush if buffer is getting large
        if (this.buffer.length >= 50) {
            this.flush();
        }
    }
    
    async flush() {
        if (this.buffer.length === 0 || this.isFlushing) return;
        
        this.isFlushing = true;
        clearTimeout(this.timer);
        this.timer = null;
        
        const logs = this.buffer.splice(0);
        
        try {
            // Batch insert with sequence numbers for proper ordering
            if (logs.length === 1) {
                // Single log, use simple insert
                await executeQuery(adminPool,
                    'INSERT INTO migration_logs (execution_id, log_level, message, sequence_num) VALUES (?, ?, ?, ?)',
                    [this.executionId, logs[0].level, logs[0].message, logs[0].sequence]
                );
            } else {
                // Multiple logs, use batch insert
                const placeholders = logs.map(() => '(?, ?, ?, ?)').join(',');
                const values = logs.flatMap(log => [this.executionId, log.level, log.message, log.sequence]);
                
                await executeQuery(adminPool,
                    `INSERT INTO migration_logs (execution_id, log_level, message, sequence_num) VALUES ${placeholders}`,
                    values
                );
            }
            
            logger.debug(`IMPROVEMENT: Log buffer flushed ${logs.length} entries for execution ${this.executionId}`);
        } catch (error) {
            logger.error('Error flushing log buffer:', error);
            
            // Fallback to individual inserts if batch fails
            for (const log of logs) {
                try {
                    await executeQuery(adminPool,
                        'INSERT INTO migration_logs (execution_id, log_level, message, sequence_num) VALUES (?, ?, ?, ?)',
                        [this.executionId, log.level, log.message, log.sequence]
                    );
                } catch (logError) {
                    logger.error(`Failed to insert log: ${logError.message}`);
                }
            }
        } finally {
            this.isFlushing = false;
        }
    }
    
    async forceFlush() {
        clearTimeout(this.timer);
        this.timer = null;
        await this.flush();
    }
}

/**
 * Parse structured execution results from stdout
 */
function parseExecutionResults(stdout) {
    const results = {
        success: false,
        metrics: {
            imported: {},
            migrated: {}
        },
        warnings: [],
        errors: [],
        summary: null,
        details: {}
    };
    
    try {
        // Parse Portuguese log format for migrated data
        // Example: "✅ Pacientes: 1/1 migrados"
        const patientsMatch = stdout.match(/✅ Pacientes:\s*(\d+)\/\d+ migrados/);
        if (patientsMatch) {
            results.details.total_patients = parseInt(patientsMatch[1]);
            results.metrics.migrated.patients = parseInt(patientsMatch[1]);
        }
        
        // Example: "⚠️ Encontros: 165/11 migrados"
        const encountersMatch = stdout.match(/[✅⚠️] Encontros:\s*(\d+)\/(\d+) migrados/);
        if (encountersMatch) {
            results.details.total_encounters = parseInt(encountersMatch[1]);
            results.metrics.migrated.encounters = parseInt(encountersMatch[1]);
            results.metrics.imported.encounters = parseInt(encountersMatch[2]);
        }
        
        // Example: "💊 Medicamentos: 75 registros criados"
        const medicationsMatch = stdout.match(/💊 Medicamentos:\s*(\d+) registros criados/);
        if (medicationsMatch) {
            results.details.total_medications = parseInt(medicationsMatch[1]);
            results.metrics.migrated.medications = parseInt(medicationsMatch[1]);
        }
        
        // Example: "📎 Anexos: 105 arquivos processados"
        const attachmentsMatch = stdout.match(/📎 Anexos:\s*(\d+) arquivos processados/);
        if (attachmentsMatch) {
            results.details.total_attachments = parseInt(attachmentsMatch[1]);
            results.metrics.migrated.attachments = parseInt(attachmentsMatch[1]);
        }
        
        // Parse success rates
        // Example: "👥 Pacientes: 100% (1/1)"
        const patientRateMatch = stdout.match(/👥 Pacientes:\s*(\d+)%/);
        if (patientRateMatch) {
            results.details.success_rate_patients = parseInt(patientRateMatch[1]);
        }
        
        // Example: "🏥 Encontros: 1500% (165/11)" - cap at 100% for anomalies
        const encounterRateMatch = stdout.match(/🏥 Encontros:\s*(\d+)%/);
        if (encounterRateMatch) {
            const rate = parseInt(encounterRateMatch[1]);
            results.details.success_rate_encounters = rate > 100 ? 100 : rate;
        }
        
        // Parse warnings
        const warningsMatch = stdout.match(/⚠️\s*AVISOS ENCONTRADOS:([\s\S]*?)(?=📈|⏱️|$)/);
        if (warningsMatch) {
            const warningLines = warningsMatch[1].match(/\d+\.\s*([^\n]+)/g);
            if (warningLines) {
                results.warnings = warningLines.map(line => line.replace(/^\d+\.\s*/, ''));
            }
        }
        
        // Parse duration
        const durationMatch = stdout.match(/⏰ Duração total:\s*(\d+)s/);
        if (durationMatch) {
            results.details.duration = parseInt(durationMatch[1]);
        }
        
        // Check for success indicators
        if (stdout.includes('✅ SUCESSO COMPLETO') || 
            stdout.includes('✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO!') ||
            stdout.includes('Status geral: ✅')) {
            results.success = true;
        }
        
        // Also try to parse JSON summary if present
        const jsonMatch = stdout.match(/\[DATA\]\s*({[\s\S]*?})\s*\[/);
        if (jsonMatch) {
            try {
                // Try to fix JavaScript object notation to JSON
                let jsonStr = jsonMatch[1]
                    .replace(/(\w+):/g, '"$1":')  // Add quotes to keys
                    .replace(/'/g, '"')            // Replace single quotes with double
                    .replace(/,\s*}/g, '}');       // Remove trailing commas
                
                const summary = JSON.parse(jsonStr);
                results.summary = summary;
                
                // Merge parsed JSON data if available
                if (summary.data?.migrated) {
                    results.metrics.migrated = { ...results.metrics.migrated, ...summary.data.migrated };
                }
                if (summary.data?.imported) {
                    results.metrics.imported = { ...results.metrics.imported, ...summary.data.imported };
                }
            } catch (parseError) {
                // JSON parsing failed, but we already extracted data from text
                logger.debug('Could not parse JSON summary, using text extraction');
            }
        }
        
    } catch (error) {
        logger.error('Error parsing execution results:', error);
    }
    
    return results;
}

/**
 * Helper function to validate migration parameters
 * @param {Object} parameters - The parameters to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateMigrationParameters(parameters) {
    const errors = [];
    
    // Check required parameters for orchestrate-import.js
    if (!parameters.sistema) {
        errors.push('Sistema parameter is required');
    }
    if (!parameters.usuario) {
        errors.push('Usuario parameter is required');
    }
    if (!parameters['pract-source']) {
        errors.push('Practitioner source parameter is required');
    }
    if (!parameters['pract-target']) {
        errors.push('Practitioner target parameter is required');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Helper function to categorize SSH/execution errors
 * @param {number} exitCode - Process exit code
 * @param {string} stderr - Error output
 * @returns {string} - Error category
 */
function categorizeExecutionError(exitCode, stderr) {
    const errorStr = stderr ? stderr.toLowerCase() : '';
    
    if (errorStr.includes('permission denied')) {
        return 'AUTHENTICATION_ERROR';
    } else if (errorStr.includes('command not found') || errorStr.includes('no such file')) {
        return 'COMMAND_NOT_FOUND';
    } else if (errorStr.includes('connection refused') || errorStr.includes('connection timeout')) {
        return 'CONNECTION_ERROR';
    } else if (errorStr.includes('host key verification failed')) {
        return 'SSH_HOST_KEY_ERROR';
    } else if (exitCode === 124) {
        return 'TIMEOUT_ERROR';
    } else if (exitCode === 255) {
        return 'SSH_GENERAL_ERROR';
    } else if (exitCode === 127) {
        return 'COMMAND_NOT_FOUND';
    } else if (exitCode === 1) {
        return 'SCRIPT_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
}

/**
 * Helper function to check if script exists on remote server
 * @param {string} scriptPath - Path to the script
 * @param {Object} environmentConfig - Environment configuration
 * @returns {Promise<boolean>} - True if script exists
 */
function checkScriptExists(scriptPath, environmentConfig) {
    return new Promise((resolve) => {
        const sshHost = environmentConfig?.ssh_host || 'localhost';
        const sshUser = environmentConfig?.ssh_user || 'root';
        const sshKey = environmentConfig?.ssh_key_path || '~/.ssh/id_rsa';
        
        // Test command to check file existence
        const testCommand = `test -f ${scriptPath} && echo "EXISTS" || echo "NOT_FOUND"`;
        
        const sshProcess = spawn('ssh', [
            '-i', sshKey,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=5',
            `${sshUser}@${sshHost}`,
            testCommand
        ]);
        
        let output = '';
        
        sshProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        sshProcess.on('close', () => {
            const exists = output.includes('EXISTS');
            logger.debug(`Script existence check for ${scriptPath}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
            resolve(exists);
        });
        
        sshProcess.on('error', (error) => {
            logger.warn(`Script existence check failed: ${error.message}`);
            resolve(false);
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            if (!sshProcess.killed) {
                sshProcess.kill();
                resolve(false);
            }
        }, 10000);
    });
}

/**
 * Execute script on MedPro server via SSH
 */
async function executeScriptOnMedProServer(executionId, job, commandExecuted, environmentId, environmentConfig) {
    // Create log buffer for batched logging
    const logBuffer = new LogBuffer(executionId, 1000);
    
    try {
        logger.info(`Executing script on MedPro server for execution ${executionId}: ${commandExecuted}`);
        
        // Use SSH configuration from environment table
        const sshHost = environmentConfig?.ssh_host || 'localhost';
        const sshUser = environmentConfig?.ssh_user || 'root';
        const sshKey = environmentConfig?.ssh_key_path || '~/.ssh/id_rsa';
        const sshPort = environmentConfig?.ssh_port || 22;
        // Note: node_path is now handled in the main execute endpoint and passed via commandExecuted
        
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
        
        // Add timeout protection (10 minutes default, configurable via environment)
        const timeoutMs = environmentConfig?.migration_timeout || 600000;
        const timeoutId = setTimeout(() => {
            if (sshProcess && !sshProcess.killed) {
                logger.warn(`Migration execution ${executionId} timed out after ${timeoutMs}ms`);
                sshProcess.kill('SIGTERM');
                // Give it 5 seconds to gracefully terminate
                setTimeout(() => {
                    if (!sshProcess.killed) {
                        sshProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, timeoutMs);
        
        // Clear timeout on process completion
        sshProcess.on('exit', () => {
            clearTimeout(timeoutId);
        });
        
        let stdout = '';
        let stderr = '';
        let progressCount = 30;
        let stdoutBuffer = ''; // Buffer for incomplete lines
        let stderrBuffer = ''; // Buffer for incomplete lines
        
        // Handle stdout - process line by line
        sshProcess.stdout.on('data', async (data) => {
            const chunk = data.toString();
            stdout += chunk;
            
            // Add to buffer and process complete lines
            stdoutBuffer += chunk;
            const lines = stdoutBuffer.split('\n');
            
            // Keep the last incomplete line in the buffer
            stdoutBuffer = lines.pop() || '';
            
            // Log each complete line separately
            for (const line of lines) {
                if (line.trim()) {
                    logBuffer.add('info', line);
                }
            }
            
            // Update progress incrementally
            progressCount = Math.min(progressCount + 5, 90);
            try {
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET progress = ? WHERE id = ?',
                    [progressCount, executionId]
                );
            } catch (updateError) {
                logger.error('Error updating progress:', updateError);
            }
        });
        
        // Handle stderr - process line by line
        sshProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            
            // Add to buffer and process complete lines
            stderrBuffer += chunk;
            const lines = stderrBuffer.split('\n');
            
            // Keep the last incomplete line in the buffer
            stderrBuffer = lines.pop() || '';
            
            // Log each complete line separately
            for (const line of lines) {
                if (line.trim()) {
                    logBuffer.add('error', line);
                }
            }
        });
        
        // Handle process completion
        sshProcess.on('close', async (code) => {
            try {
                // Flush any remaining buffered lines
                if (stdoutBuffer.trim()) {
                    logBuffer.add('info', stdoutBuffer);
                }
                if (stderrBuffer.trim()) {
                    logBuffer.add('error', stderrBuffer);
                }
                
                // Wait for orchestrator to finish writing logs
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try to read the actual log file to get complete output
                let completeLog = stdout; // fallback to what we captured
                try {
                    // Extract log file path from stdout if available
                    const logFileMatch = stdout.match(/Log File: ([^\n]+\.log)/);
                    if (logFileMatch) {
                        const logFilePath = logFileMatch[1];
                        logger.info(`Reading complete log from file: ${logFilePath}`);
                        
                        // Read the actual log file via SSH
                        const { exec } = require('child_process');
                        const util = require('util');
                        const execPromise = util.promisify(exec);
                        
                        const catCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o LogLevel=ERROR ${sshUser}@${sshHost} "cat ${logFilePath}"`;
                        const { stdout: fileContent } = await execPromise(catCommand, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
                        
                        if (fileContent) {
                            // Replace our partial stdout with complete file content
                            stdout = fileContent;
                            completeLog = fileContent;
                            
                            // Process the complete log line by line and add to buffer
                            const allLines = fileContent.split('\n');
                            // Clear existing logs and add all lines
                            for (let i = 0; i < allLines.length; i++) {
                                const line = allLines[i];
                                if (line.trim()) {
                                    // Add with proper sequence starting from where we left off
                                    logBuffer.sequenceNumber = i;
                                    logBuffer.add('info', line);
                                }
                            }
                        }
                    }
                } catch (readError) {
                    logger.error('Error reading complete log file:', readError);
                    // Continue with partial log
                }
                
                // Parse the rich execution results from complete log
                const results = parseExecutionResults(completeLog);
                
                // Determine final status
                const success = code === 0 && results.success;
                const status = success ? 'completed' : 'failed';
                const progress = success ? 100 : progressCount;
                
                // Categorize error if failed
                const errorCategory = success ? null : categorizeExecutionError(code, stderr);
                
                // Build comprehensive result summary
                const resultSummary = {
                    exit_code: code,
                    success: results.success,
                    error_category: errorCategory,
                    metrics: {
                        imported: results.metrics.imported || {},
                        migrated: results.metrics.migrated || {},
                        duration: results.details.duration || null
                    },
                    details: {
                        total_patients: results.details.total_patients || 0,
                        total_encounters: results.details.total_encounters || 0,
                        total_medications: results.details.total_medications || 0,
                        total_attachments: results.details.total_attachments || 0,
                        success_rate_patients: results.details.success_rate_patients || null,
                        success_rate_encounters: results.details.success_rate_encounters || null
                    },
                    validation: {
                        warnings: results.warnings || [],
                        errors: results.errors || [],
                        passed: results.warnings.length === 0 && results.errors.length === 0
                    },
                    summary: results.summary || null
                };
                
                // Add final log entry to buffer
                logBuffer.add(
                    success ? 'info' : 'error',
                    `Migration ${success ? 'completed successfully' : 'failed'} with exit code ${code}`
                );
                
                // Force flush all remaining logs before updating status
                await logBuffer.forceFlush();
                
                // Update execution status with rich results
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET status = ?, completed_at = NOW(), progress = ?, result_summary = ? WHERE id = ?',
                    [status, progress, JSON.stringify(resultSummary), executionId]
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
                // Add error to log buffer
                logBuffer.add('error', `SSH process error: ${error.message}`);
                
                // Force flush logs
                await logBuffer.forceFlush();
                
                await executeQuery(adminPool, 
                    'UPDATE migration_executions SET status = "failed", completed_at = NOW(), progress = 0 WHERE id = ?',
                    [executionId]
                );
            } catch (logError) {
                logger.error('Error handling SSH process error:', logError);
            }
        });
        
    } catch (error) {
        logger.error(`Error executing script for execution ${executionId}:`, error);
        
        try {
            // Try to flush any pending logs
            if (logBuffer) {
                logBuffer.add('error', `Execution error: ${error.message}`);
                await logBuffer.forceFlush();
            }
            
            await executeQuery(adminPool, 
                'UPDATE migration_executions SET status = "failed", completed_at = NOW() WHERE id = ?',
                [executionId]
            );
        } catch (logError) {
            logger.error('Error handling execution error:', logError);
        }
    }
}

/**
 * GET /api/v1/migration-executions
 * List migration executions with optional filters and pagination
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const { job_id, status, environment_id, page = 1, limit = 20 } = req.query;
        
        // Parse pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100); // Clamp between 1-100
        const offset = (pageNum - 1) * limitNum;
        
        // Build base query for both count and data
        let baseQuery = `
            FROM migration_executions e
            JOIN migration_jobs j ON e.job_id = j.id
            JOIN migration_sources s ON j.source_id = s.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (job_id) {
            baseQuery += ' AND e.job_id = ?';
            params.push(job_id);
        }
        
        if (status) {
            baseQuery += ' AND e.status = ?';
            params.push(status);
        }
        
        if (environment_id) {
            baseQuery += ' AND e.environment_id = ?';
            params.push(environment_id);
        }
        
        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const countResult = await executeQuery(adminPool, countQuery, params);
        const total = countResult[0]?.total || 0;
        
        // Get paginated data
        const dataQuery = `
            SELECT 
                e.id, e.job_id, e.environment_id, e.status, e.progress, 
                e.started_at, e.completed_at, e.executed_by, e.command_executed, e.result_summary,
                j.name as job_name, s.name as source_name
            ${baseQuery}
            ORDER BY e.started_at DESC 
            LIMIT ${limitNum} OFFSET ${offset}
        `;
        
        const executions = await executeQuery(adminPool, dataQuery, params);
        
        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limitNum);
        
        logger.info(`Retrieved ${executions.length} migration executions (page ${pageNum}/${totalPages})`);
        
        res.json({
            success: true,
            data: Array.isArray(executions) ? executions : [executions],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                totalPages: totalPages,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1
            }
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
        const limitNum = Math.min(Math.max(parseInt(limit) || 100, 1), 10000); // Clamp between 1-10000
        
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
            SELECT id, log_level, message, logged_at, sequence_num
            FROM migration_logs 
            WHERE execution_id = ? 
            ORDER BY sequence_num ASC, id ASC 
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
        
        // Validate parameters before execution
        const validation = validateMigrationParameters(parameters);
        if (!validation.valid) {
            logger.warn(`Parameter validation failed for job ${jobId}: ${validation.errors.join(', ')}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid job parameters',
                details: validation.errors
            });
        }
        
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
        
        // Extract directory from script path and change to that directory before execution
        const scriptPath = job.script_path.replace(/^~/, process.env.HOME || '~');
        const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
        const scriptFile = scriptPath.substring(scriptPath.lastIndexOf('/') + 1);
        
        // Check if script exists before attempting execution (non-blocking warning)
        checkScriptExists(scriptPath, environmentConfig).then(exists => {
            if (!exists) {
                logger.warn(`IMPROVEMENT: Script may not exist at ${scriptPath} - execution will continue`);
            } else {
                logger.debug(`IMPROVEMENT: Script existence verified at ${scriptPath}`);
            }
        }).catch(err => {
            logger.debug(`IMPROVEMENT: Could not verify script existence: ${err.message}`);
        });
        
        // Build command with proper shell environment for NVM
        // Source NVM to ensure node is available in the SSH session
        const commandExecuted = `/bin/bash -c "source ~/.nvm/nvm.sh 2>/dev/null || true; cd ${scriptDir} && ${nodePath} ${scriptFile} ${paramParts.join(' ')}"`;
        
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