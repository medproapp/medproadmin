const EventEmitter = require('events');
const logger = require('../utils/logger');
const connectionPoolManager = require('./connectionPoolManager');
const databaseConnectionManager = require('./databaseConnectionManager');
const { executeQuery, adminPool } = require('../config/database');

class HealthMonitoringSystem extends EventEmitter {
    constructor() {
        super();
        
        // Monitoring configuration
        this.config = {
            healthCheckInterval: 5 * 60 * 1000, // 5 minutes
            degradedThreshold: 3, // failures before marking degraded
            unhealthyThreshold: 5, // failures before marking unhealthy
            recoveryThreshold: 2, // successes before marking recovered
            alertCooldown: 15 * 60 * 1000, // 15 minutes between alerts
            maxRecoveryAttempts: 3,
            recoveryAttemptDelay: 30 * 1000 // 30 seconds between recovery attempts
        };
        
        // Tracking data
        this.environmentHealth = new Map(); // environmentId -> health data
        this.alertHistory = new Map(); // environmentId -> last alert time
        this.recoveryAttempts = new Map(); // environmentId -> attempt count
        this.monitoringIntervals = new Map(); // environmentId -> interval ref
        
        // Overall system health
        this.systemHealth = {
            status: 'unknown',
            lastCheck: null,
            activeEnvironments: 0,
            healthyEnvironments: 0,
            degradedEnvironments: 0,
            unhealthyEnvironments: 0
        };
        
        // Start system-wide monitoring
        this.startSystemMonitoring();
        
        logger.info('Health Monitoring System initialized');
    }

    /**
     * Register an environment for health monitoring
     * @param {string} environmentId - Environment identifier
     * @param {Object} config - Environment-specific monitoring configuration
     */
    registerEnvironment(environmentId, config = {}) {
        logger.info(`Registering environment for health monitoring: ${environmentId}`);
        
        const healthData = {
            environmentId,
            status: 'unknown',
            lastCheck: null,
            lastSuccess: null,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            totalChecks: 0,
            totalFailures: 0,
            ssh: {
                status: 'unknown',
                lastCheck: null,
                responseTime: null,
                error: null
            },
            database: {
                status: 'unknown',
                lastCheck: null,
                read: { healthy: null, responseTime: null },
                write: { healthy: null, responseTime: null },
                error: null
            },
            config: { ...this.config, ...config },
            recoveryInProgress: false,
            lastRecoveryAttempt: null
        };
        
        this.environmentHealth.set(environmentId, healthData);
        
        // Start individual environment monitoring
        this.startEnvironmentMonitoring(environmentId);
        
        this.emit('environmentRegistered', { environmentId });
        logger.info(`Environment registered for monitoring: ${environmentId}`);
    }

    /**
     * Unregister an environment from health monitoring
     * @param {string} environmentId - Environment identifier
     */
    unregisterEnvironment(environmentId) {
        logger.info(`Unregistering environment from health monitoring: ${environmentId}`);
        
        // Stop monitoring
        const interval = this.monitoringIntervals.get(environmentId);
        if (interval) {
            clearInterval(interval);
            this.monitoringIntervals.delete(environmentId);
        }
        
        // Clean up data
        this.environmentHealth.delete(environmentId);
        this.alertHistory.delete(environmentId);
        this.recoveryAttempts.delete(environmentId);
        
        this.emit('environmentUnregistered', { environmentId });
        logger.info(`Environment unregistered from monitoring: ${environmentId}`);
    }

    /**
     * Perform health check for a specific environment
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<Object>} Health check results
     */
    async performHealthCheck(environmentId) {
        const startTime = Date.now();
        const healthData = this.environmentHealth.get(environmentId);
        
        if (!healthData) {
            throw new Error(`Environment ${environmentId} is not registered for monitoring`);
        }
        
        logger.debug(`Performing health check for ${environmentId}`);
        
        const results = {
            environmentId,
            timestamp: new Date(),
            duration: 0,
            ssh: { healthy: false, responseTime: null, error: null },
            database: { 
                healthy: false, 
                read: { healthy: false, responseTime: null }, 
                write: { healthy: false, responseTime: null },
                error: null 
            },
            overall: 'unhealthy'
        };
        
        try {
            // Check SSH connection
            try {
                const sshResult = await connectionPoolManager.testConnection(environmentId);
                results.ssh = {
                    healthy: sshResult.healthy,
                    responseTime: sshResult.responseTime,
                    error: sshResult.error || null
                };
                
                healthData.ssh = {
                    status: sshResult.healthy ? 'healthy' : 'unhealthy',
                    lastCheck: new Date(),
                    responseTime: sshResult.responseTime,
                    error: sshResult.error || null
                };
            } catch (error) {
                results.ssh.error = error.message;
                healthData.ssh = {
                    status: 'unhealthy',
                    lastCheck: new Date(),
                    responseTime: null,
                    error: error.message
                };
                logger.warn(`SSH health check failed for ${environmentId}:`, error);
            }
            
            // Check database connections
            try {
                const dbResult = await databaseConnectionManager.testConnections(environmentId);
                results.database = {
                    healthy: dbResult.overall === 'healthy',
                    read: dbResult.read || { healthy: false, responseTime: null },
                    write: dbResult.write || { healthy: false, responseTime: null },
                    error: null
                };
                
                healthData.database = {
                    status: dbResult.overall,
                    lastCheck: new Date(),
                    read: dbResult.read || { healthy: null, responseTime: null },
                    write: dbResult.write || { healthy: null, responseTime: null },
                    error: null
                };
            } catch (error) {
                results.database.error = error.message;
                healthData.database = {
                    status: 'unhealthy',
                    lastCheck: new Date(),
                    read: { healthy: false, responseTime: null },
                    write: { healthy: false, responseTime: null },
                    error: error.message
                };
                logger.warn(`Database health check failed for ${environmentId}:`, error);
            }
            
            // Determine overall health
            const sshHealthy = results.ssh.healthy;
            const dbHealthy = results.database.healthy;
            
            if (sshHealthy && dbHealthy) {
                results.overall = 'healthy';
            } else if (sshHealthy || dbHealthy) {
                results.overall = 'degraded';
            } else {
                results.overall = 'unhealthy';
            }
            
            results.duration = Date.now() - startTime;
            
            // Update health tracking
            this.updateHealthTracking(environmentId, results);
            
            // Store results in database
            await this.storeHealthCheckResult(environmentId, results);
            
            logger.debug(`Health check completed for ${environmentId}: ${results.overall} (${results.duration}ms)`);
            
            return results;
            
        } catch (error) {
            results.duration = Date.now() - startTime;
            results.error = error.message;
            
            logger.error(`Health check failed for ${environmentId}:`, error);
            
            // Update health tracking with failure
            this.updateHealthTracking(environmentId, results);
            
            return results;
        }
    }

    /**
     * Get current health status for an environment
     * @param {string} environmentId - Environment identifier
     * @returns {Object} Current health status
     */
    getEnvironmentHealth(environmentId) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData) {
            return null;
        }
        
        return {
            environmentId,
            status: healthData.status,
            lastCheck: healthData.lastCheck,
            lastSuccess: healthData.lastSuccess,
            consecutiveFailures: healthData.consecutiveFailures,
            consecutiveSuccesses: healthData.consecutiveSuccesses,
            uptime: this.calculateUptime(healthData),
            ssh: { ...healthData.ssh },
            database: { ...healthData.database },
            recoveryInProgress: healthData.recoveryInProgress,
            lastRecoveryAttempt: healthData.lastRecoveryAttempt
        };
    }

    /**
     * Get system-wide health overview
     * @returns {Object} System health overview
     */
    getSystemHealth() {
        this.updateSystemHealth();
        return { ...this.systemHealth };
    }

    /**
     * Get health history for an environment
     * @param {string} environmentId - Environment identifier
     * @param {number} hours - Hours of history to retrieve (default: 24)
     * @returns {Promise<Array>} Health check history
     */
    async getHealthHistory(environmentId, hours = 24) {
        try {
            const query = `
                SELECT *
                FROM environment_health_checks 
                WHERE environment_id = ? 
                AND checked_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                ORDER BY checked_at DESC
                LIMIT 1000
            `;
            
            const results = await executeQuery(adminPool, query, [environmentId, hours]);
            return results;
            
        } catch (error) {
            logger.error(`Failed to get health history for ${environmentId}:`, error);
            return [];
        }
    }

    /**
     * Trigger immediate recovery attempt for an environment
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<Object>} Recovery result
     */
    async triggerRecovery(environmentId) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData) {
            throw new Error(`Environment ${environmentId} is not registered for monitoring`);
        }
        
        if (healthData.recoveryInProgress) {
            return { success: false, message: 'Recovery already in progress' };
        }
        
        logger.info(`Triggering manual recovery for ${environmentId}`);
        
        try {
            const result = await this.attemptRecovery(environmentId);
            
            this.emit('recoveryAttempted', {
                environmentId,
                success: result.success,
                manual: true,
                details: result
            });
            
            return result;
            
        } catch (error) {
            logger.error(`Manual recovery failed for ${environmentId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop all health monitoring
     */
    async shutdown() {
        logger.info('Shutting down Health Monitoring System');
        
        // Stop system monitoring
        if (this.systemMonitoringInterval) {
            clearInterval(this.systemMonitoringInterval);
        }
        
        // Stop all environment monitoring
        for (const [environmentId, interval] of this.monitoringIntervals.entries()) {
            clearInterval(interval);
            logger.debug(`Stopped monitoring for ${environmentId}`);
        }
        
        this.monitoringIntervals.clear();
        this.environmentHealth.clear();
        this.alertHistory.clear();
        this.recoveryAttempts.clear();
        
        logger.info('Health Monitoring System shutdown complete');
    }

    // Private methods

    startSystemMonitoring() {
        // Update system health every minute
        this.systemMonitoringInterval = setInterval(() => {
            this.updateSystemHealth();
        }, 60 * 1000);
    }

    startEnvironmentMonitoring(environmentId) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData) return;
        
        const interval = setInterval(async () => {
            try {
                await this.performHealthCheck(environmentId);
            } catch (error) {
                logger.error(`Scheduled health check failed for ${environmentId}:`, error);
            }
        }, healthData.config.healthCheckInterval);
        
        this.monitoringIntervals.set(environmentId, interval);
        
        // Perform initial health check
        setTimeout(() => {
            this.performHealthCheck(environmentId).catch(error => {
                logger.error(`Initial health check failed for ${environmentId}:`, error);
            });
        }, 5000); // Wait 5 seconds before first check
    }

    updateHealthTracking(environmentId, results) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData) return;
        
        const isHealthy = results.overall === 'healthy';
        const currentTime = new Date();
        
        healthData.lastCheck = currentTime;
        healthData.totalChecks++;
        
        if (isHealthy) {
            healthData.consecutiveFailures = 0;
            healthData.consecutiveSuccesses++;
            healthData.lastSuccess = currentTime;
            
            // Check if we should mark as recovered
            if (healthData.status !== 'healthy' && 
                healthData.consecutiveSuccesses >= healthData.config.recoveryThreshold) {
                
                const previousStatus = healthData.status;
                healthData.status = 'healthy';
                
                this.emit('environmentRecovered', {
                    environmentId,
                    previousStatus,
                    currentStatus: 'healthy',
                    consecutiveSuccesses: healthData.consecutiveSuccesses
                });
                
                logger.info(`Environment ${environmentId} recovered (${previousStatus} -> healthy)`);
            }
            
        } else {
            healthData.consecutiveSuccesses = 0;
            healthData.consecutiveFailures++;
            healthData.totalFailures++;
            
            const previousStatus = healthData.status;
            
            // Determine new status based on failure count
            if (healthData.consecutiveFailures >= healthData.config.unhealthyThreshold) {
                healthData.status = 'unhealthy';
            } else if (healthData.consecutiveFailures >= healthData.config.degradedThreshold) {
                healthData.status = 'degraded';
            }
            
            // Emit status change event
            if (previousStatus !== healthData.status) {
                this.emit('environmentStatusChanged', {
                    environmentId,
                    previousStatus,
                    currentStatus: healthData.status,
                    consecutiveFailures: healthData.consecutiveFailures
                });
                
                logger.warn(`Environment ${environmentId} status changed: ${previousStatus} -> ${healthData.status}`);
                
                // Trigger recovery if unhealthy
                if (healthData.status === 'unhealthy') {
                    this.scheduleRecovery(environmentId);
                }
            }
            
            // Send alert if needed
            this.checkAndSendAlert(environmentId, healthData);
        }
    }

    async scheduleRecovery(environmentId) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData || healthData.recoveryInProgress) return;
        
        const attemptCount = this.recoveryAttempts.get(environmentId) || 0;
        if (attemptCount >= healthData.config.maxRecoveryAttempts) {
            logger.warn(`Max recovery attempts reached for ${environmentId}`);
            return;
        }
        
        logger.info(`Scheduling recovery attempt ${attemptCount + 1} for ${environmentId}`);
        
        setTimeout(async () => {
            try {
                await this.attemptRecovery(environmentId);
            } catch (error) {
                logger.error(`Scheduled recovery failed for ${environmentId}:`, error);
            }
        }, healthData.config.recoveryAttemptDelay);
    }

    async attemptRecovery(environmentId) {
        const healthData = this.environmentHealth.get(environmentId);
        if (!healthData) {
            throw new Error(`Environment ${environmentId} not found`);
        }
        
        healthData.recoveryInProgress = true;
        healthData.lastRecoveryAttempt = new Date();
        
        const attemptCount = (this.recoveryAttempts.get(environmentId) || 0) + 1;
        this.recoveryAttempts.set(environmentId, attemptCount);
        
        logger.info(`Starting recovery attempt ${attemptCount} for ${environmentId}`);
        
        try {
            const result = {
                environmentId,
                attemptNumber: attemptCount,
                startTime: new Date(),
                success: false,
                actions: [],
                errors: []
            };
            
            // Attempt SSH connection recovery
            try {
                logger.debug(`Attempting SSH connection recovery for ${environmentId}`);
                await connectionPoolManager.closePool(environmentId);
                
                // Re-initialize would require connection config - this would need to be implemented
                // based on stored environment connection configuration
                result.actions.push('SSH pool reset');
                logger.debug(`SSH pool reset completed for ${environmentId}`);
                
            } catch (error) {
                result.errors.push(`SSH recovery failed: ${error.message}`);
                logger.error(`SSH recovery failed for ${environmentId}:`, error);
            }
            
            // Attempt database connection recovery
            try {
                logger.debug(`Attempting database connection recovery for ${environmentId}`);
                await databaseConnectionManager.closePools(environmentId);
                
                // Re-initialize would require connection config - this would need to be implemented
                // based on stored environment connection configuration
                result.actions.push('Database pools reset');
                logger.debug(`Database pools reset completed for ${environmentId}`);
                
            } catch (error) {
                result.errors.push(`Database recovery failed: ${error.message}`);
                logger.error(`Database recovery failed for ${environmentId}:`, error);
            }
            
            // Test connections after recovery
            try {
                const healthCheck = await this.performHealthCheck(environmentId);
                result.success = healthCheck.overall !== 'unhealthy';
                result.healthCheckResult = healthCheck;
                
            } catch (error) {
                result.errors.push(`Post-recovery health check failed: ${error.message}`);
            }
            
            result.endTime = new Date();
            result.duration = result.endTime.getTime() - result.startTime.getTime();
            
            // Store recovery attempt
            await this.storeRecoveryAttempt(environmentId, result);
            
            if (result.success) {
                logger.info(`Recovery successful for ${environmentId} (attempt ${attemptCount})`);
                this.recoveryAttempts.delete(environmentId); // Reset counter on success
            } else {
                logger.warn(`Recovery attempt ${attemptCount} failed for ${environmentId}`, result.errors);
            }
            
            return result;
            
        } finally {
            healthData.recoveryInProgress = false;
        }
    }

    checkAndSendAlert(environmentId, healthData) {
        const lastAlert = this.alertHistory.get(environmentId);
        const now = Date.now();
        
        if (!lastAlert || (now - lastAlert) >= healthData.config.alertCooldown) {
            this.sendAlert(environmentId, healthData);
            this.alertHistory.set(environmentId, now);
        }
    }

    sendAlert(environmentId, healthData) {
        const alert = {
            environmentId,
            status: healthData.status,
            consecutiveFailures: healthData.consecutiveFailures,
            lastSuccess: healthData.lastSuccess,
            timestamp: new Date(),
            ssh: healthData.ssh,
            database: healthData.database
        };
        
        this.emit('healthAlert', alert);
        logger.warn(`Health alert sent for ${environmentId}:`, alert);
        
        // Store alert in database
        this.storeAlert(alert).catch(error => {
            logger.error(`Failed to store alert for ${environmentId}:`, error);
        });
    }

    updateSystemHealth() {
        const environments = Array.from(this.environmentHealth.values());
        
        this.systemHealth = {
            status: 'healthy',
            lastCheck: new Date(),
            activeEnvironments: environments.length,
            healthyEnvironments: 0,
            degradedEnvironments: 0,
            unhealthyEnvironments: 0
        };
        
        let hasUnhealthy = false;
        let hasDegraded = false;
        
        for (const env of environments) {
            switch (env.status) {
                case 'healthy':
                    this.systemHealth.healthyEnvironments++;
                    break;
                case 'degraded':
                    this.systemHealth.degradedEnvironments++;
                    hasDegraded = true;
                    break;
                case 'unhealthy':
                    this.systemHealth.unhealthyEnvironments++;
                    hasUnhealthy = true;
                    break;
            }
        }
        
        if (hasUnhealthy) {
            this.systemHealth.status = 'unhealthy';
        } else if (hasDegraded) {
            this.systemHealth.status = 'degraded';
        }
    }

    calculateUptime(healthData) {
        if (!healthData.lastSuccess || healthData.totalChecks === 0) {
            return 0;
        }
        
        const successfulChecks = healthData.totalChecks - healthData.totalFailures;
        return Math.round((successfulChecks / healthData.totalChecks) * 100 * 100) / 100;
    }

    async storeHealthCheckResult(environmentId, results) {
        try {
            const query = `
                INSERT INTO environment_health_checks (
                    environment_id, overall_status, ssh_healthy, ssh_response_time,
                    db_healthy, db_read_healthy, db_read_response_time,
                    db_write_healthy, db_write_response_time, check_duration,
                    error_details, checked_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                environmentId,
                results.overall,
                results.ssh.healthy,
                results.ssh.responseTime,
                results.database.healthy,
                results.database.read.healthy,
                results.database.read.responseTime,
                results.database.write.healthy,
                results.database.write.responseTime,
                results.duration,
                JSON.stringify({
                    ssh: results.ssh.error,
                    database: results.database.error
                }),
                results.timestamp
            ];
            
            await executeQuery(adminPool, query, params);
            
        } catch (error) {
            logger.error(`Failed to store health check result for ${environmentId}:`, error);
        }
    }

    async storeRecoveryAttempt(environmentId, result) {
        try {
            const query = `
                INSERT INTO environment_recovery_attempts (
                    environment_id, attempt_number, success, actions_taken,
                    errors_encountered, duration_ms, attempted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                environmentId,
                result.attemptNumber,
                result.success,
                JSON.stringify(result.actions),
                JSON.stringify(result.errors),
                result.duration,
                result.startTime
            ];
            
            await executeQuery(adminPool, query, params);
            
        } catch (error) {
            logger.error(`Failed to store recovery attempt for ${environmentId}:`, error);
        }
    }

    async storeAlert(alert) {
        try {
            const query = `
                INSERT INTO environment_health_alerts (
                    environment_id, alert_status, consecutive_failures,
                    last_success, alert_details, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                alert.environmentId,
                alert.status,
                alert.consecutiveFailures,
                alert.lastSuccess,
                JSON.stringify({
                    ssh: alert.ssh,
                    database: alert.database
                }),
                alert.timestamp
            ];
            
            await executeQuery(adminPool, query, params);
            
        } catch (error) {
            logger.error(`Failed to store alert for ${alert.environmentId}:`, error);
        }
    }
}

// Export singleton instance
module.exports = new HealthMonitoringSystem();