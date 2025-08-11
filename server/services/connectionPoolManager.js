const { NodeSSH } = require('node-ssh');
const logger = require('../utils/logger');
const { executeQuery } = require('../config/database');

class ConnectionPoolManager {
    constructor() {
        // Connection pools by environment_id
        this.sshPools = new Map();
        this.poolConfigs = new Map();
        this.healthCheckIntervals = new Map();
        this.connectionStats = new Map();
        
        // Default pool configuration
        this.defaultPoolConfig = {
            min: 2,
            max: 10,
            acquireTimeout: 30000,
            idleTimeout: 300000,
            evictionRunInterval: 60000,
            validateOnBorrow: true,
            validateOnReturn: false
        };
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Initialize connection pool for an environment
     * @param {string} environmentId - Environment identifier
     * @param {Object} connectionConfig - SSH connection configuration
     * @param {Object} poolConfig - Pool-specific configuration
     */
    async initializePool(environmentId, connectionConfig, poolConfig = {}) {
        try {
            logger.info(`Initializing SSH connection pool for environment: ${environmentId}`);
            
            // Merge with default pool configuration
            const finalPoolConfig = { ...this.defaultPoolConfig, ...poolConfig };
            
            // Validate connection configuration
            this.validateConnectionConfig(connectionConfig);
            
            // Create pool configuration
            const poolData = {
                environmentId,
                connectionConfig,
                poolConfig: finalPoolConfig,
                connections: [],
                activeConnections: 0,
                availableConnections: 0,
                totalConnections: 0,
                createdAt: new Date(),
                lastHealthCheck: null,
                healthStatus: 'unknown'
            };
            
            this.poolConfigs.set(environmentId, poolData);
            this.sshPools.set(environmentId, []);
            this.initializeStats(environmentId);
            
            // Pre-create minimum connections
            await this.createMinimumConnections(environmentId);
            
            // Start health monitoring
            this.startHealthMonitoring(environmentId);
            
            logger.info(`SSH connection pool initialized for ${environmentId} with min:${finalPoolConfig.min}, max:${finalPoolConfig.max}`);
            
        } catch (error) {
            logger.error(`Failed to initialize SSH pool for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Get a connection from the pool
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<Object>} Connection wrapper with SSH instance and metadata
     */
    async getConnection(environmentId) {
        const startTime = Date.now();
        
        try {
            if (!this.poolConfigs.has(environmentId)) {
                throw new Error(`No connection pool configured for environment: ${environmentId}`);
            }
            
            const poolData = this.poolConfigs.get(environmentId);
            const pool = this.sshPools.get(environmentId);
            
            // Try to get available connection
            let connection = this.getAvailableConnection(pool);
            
            if (!connection) {
                // Create new connection if under max limit
                if (poolData.totalConnections < poolData.poolConfig.max) {
                    connection = await this.createConnection(environmentId);
                } else {
                    // Wait for connection to become available
                    connection = await this.waitForConnection(environmentId);
                }
            }
            
            if (!connection) {
                throw new Error(`Unable to acquire connection for environment: ${environmentId}`);
            }
            
            // Mark as in use
            connection.inUse = true;
            connection.lastUsed = new Date();
            poolData.activeConnections++;
            poolData.availableConnections--;
            
            // Update stats
            this.updateStats(environmentId, 'connectionAcquired', Date.now() - startTime);
            
            logger.debug(`Connection acquired for ${environmentId} (active: ${poolData.activeConnections})`);
            
            return {
                ssh: connection.ssh,
                connectionId: connection.id,
                environmentId: environmentId,
                release: () => this.releaseConnection(environmentId, connection.id)
            };
            
        } catch (error) {
            this.updateStats(environmentId, 'connectionError');
            logger.error(`Failed to get connection for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Release a connection back to the pool
     * @param {string} environmentId - Environment identifier
     * @param {string} connectionId - Connection identifier
     */
    releaseConnection(environmentId, connectionId) {
        try {
            const poolData = this.poolConfigs.get(environmentId);
            const pool = this.sshPools.get(environmentId);
            
            if (!poolData || !pool) {
                logger.warn(`Cannot release connection: pool not found for ${environmentId}`);
                return;
            }
            
            const connection = pool.find(conn => conn.id === connectionId);
            if (!connection) {
                logger.warn(`Connection ${connectionId} not found in pool for ${environmentId}`);
                return;
            }
            
            if (!connection.inUse) {
                logger.warn(`Connection ${connectionId} was not marked as in use`);
                return;
            }
            
            // Mark as available
            connection.inUse = false;
            connection.lastReleased = new Date();
            poolData.activeConnections--;
            poolData.availableConnections++;
            
            logger.debug(`Connection released for ${environmentId} (active: ${poolData.activeConnections})`);
            
        } catch (error) {
            logger.error(`Error releasing connection ${connectionId}:`, error);
        }
    }

    /**
     * Execute command on environment via SSH
     * @param {string} environmentId - Environment identifier
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution result
     */
    async executeCommand(environmentId, command, options = {}) {
        const startTime = Date.now();
        let connection = null;
        
        try {
            // Get connection from pool
            connection = await this.getConnection(environmentId);
            
            logger.info(`Executing command on ${environmentId}: ${command}`);
            
            // Execute command with timeout
            const result = await Promise.race([
                connection.ssh.execCommand(command, {
                    cwd: options.workingDirectory,
                    ...options
                }),
                this.createTimeoutPromise(options.timeout || 30000)
            ]);
            
            const executionTime = Date.now() - startTime;
            
            // Update stats
            this.updateStats(environmentId, 'commandExecuted', executionTime);
            
            if (result.code !== 0) {
                this.updateStats(environmentId, 'commandError');
                logger.warn(`Command failed on ${environmentId} (code ${result.code}): ${result.stderr}`);
            } else {
                logger.debug(`Command completed on ${environmentId} in ${executionTime}ms`);
            }
            
            return {
                success: result.code === 0,
                code: result.code,
                stdout: result.stdout,
                stderr: result.stderr,
                executionTime: executionTime
            };
            
        } catch (error) {
            this.updateStats(environmentId, 'commandError');
            logger.error(`Command execution failed on ${environmentId}:`, error);
            throw error;
        } finally {
            // Always release connection
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Upload file to environment via SSH
     * @param {string} environmentId - Environment identifier
     * @param {string} localPath - Local file path
     * @param {string} remotePath - Remote file path
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    async uploadFile(environmentId, localPath, remotePath, options = {}) {
        let connection = null;
        
        try {
            connection = await this.getConnection(environmentId);
            
            logger.info(`Uploading file to ${environmentId}: ${localPath} -> ${remotePath}`);
            
            await connection.ssh.putFile(localPath, remotePath, null, options);
            
            this.updateStats(environmentId, 'fileUploaded');
            
            return { success: true, localPath, remotePath };
            
        } catch (error) {
            this.updateStats(environmentId, 'uploadError');
            logger.error(`File upload failed to ${environmentId}:`, error);
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Download file from environment via SSH
     * @param {string} environmentId - Environment identifier
     * @param {string} remotePath - Remote file path
     * @param {string} localPath - Local file path
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Download result
     */
    async downloadFile(environmentId, remotePath, localPath, options = {}) {
        let connection = null;
        
        try {
            connection = await this.getConnection(environmentId);
            
            logger.info(`Downloading file from ${environmentId}: ${remotePath} -> ${localPath}`);
            
            await connection.ssh.getFile(localPath, remotePath, null, options);
            
            this.updateStats(environmentId, 'fileDownloaded');
            
            return { success: true, remotePath, localPath };
            
        } catch (error) {
            this.updateStats(environmentId, 'downloadError');  
            logger.error(`File download failed from ${environmentId}:`, error);
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Test connection to environment
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<Object>} Health check result
     */
    async testConnection(environmentId) {
        const startTime = Date.now();
        let connection = null;
        
        try {
            connection = await this.getConnection(environmentId);
            
            // Simple health check command
            const result = await connection.ssh.execCommand('echo "health_check" && date');
            
            const responseTime = Date.now() - startTime;
            const isHealthy = result.code === 0;
            
            const healthResult = {
                environmentId,
                healthy: isHealthy,
                responseTime,
                timestamp: new Date(),
                details: {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    code: result.code
                }
            };
            
            // Update pool health status
            const poolData = this.poolConfigs.get(environmentId);
            if (poolData) {
                poolData.lastHealthCheck = new Date();
                poolData.healthStatus = isHealthy ? 'healthy' : 'unhealthy';
            }
            
            this.updateStats(environmentId, 'healthCheck', responseTime);
            
            return healthResult;
            
        } catch (error) {
            const healthResult = {
                environmentId,
                healthy: false,
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                error: error.message
            };
            
            // Update pool health status
            const poolData = this.poolConfigs.get(environmentId);
            if (poolData) {
                poolData.lastHealthCheck = new Date();
                poolData.healthStatus = 'unhealthy';
            }
            
            this.updateStats(environmentId, 'healthCheckError');
            
            return healthResult;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Get pool statistics
     * @param {string} environmentId - Environment identifier
     * @returns {Object} Pool statistics
     */
    getPoolStats(environmentId) {
        const poolData = this.poolConfigs.get(environmentId);
        const stats = this.connectionStats.get(environmentId);
        
        if (!poolData || !stats) {
            return null;
        }
        
        return {
            environmentId,
            totalConnections: poolData.totalConnections,
            activeConnections: poolData.activeConnections,
            availableConnections: poolData.availableConnections,
            healthStatus: poolData.healthStatus,
            lastHealthCheck: poolData.lastHealthCheck,
            createdAt: poolData.createdAt,
            statistics: {
                ...stats,
                averageResponseTime: stats.totalResponseTime > 0 ? 
                    Math.round(stats.totalResponseTime / stats.healthChecks) : 0
            }
        };
    }

    /**
     * Close all connections for an environment
     * @param {string} environmentId - Environment identifier
     */
    async closePool(environmentId) {
        try {
            logger.info(`Closing connection pool for ${environmentId}`);
            
            const pool = this.sshPools.get(environmentId);
            if (pool) {
                // Close all connections
                for (const connection of pool) {
                    try {
                        if (connection.ssh && connection.ssh.connection) {
                            connection.ssh.connection.end();
                        }
                    } catch (error) {
                        logger.warn(`Error closing connection ${connection.id}:`, error);
                    }
                }
            }
            
            // Clear health monitoring
            const interval = this.healthCheckIntervals.get(environmentId);
            if (interval) {
                clearInterval(interval);
                this.healthCheckIntervals.delete(environmentId);
            }
            
            // Clean up data structures
            this.sshPools.delete(environmentId);
            this.poolConfigs.delete(environmentId);
            this.connectionStats.delete(environmentId);
            
            logger.info(`Connection pool closed for ${environmentId}`);
            
        } catch (error) {
            logger.error(`Error closing pool for ${environmentId}:`, error);
        }
    }

    /**
     * Close all connection pools
     */
    async closeAllPools() {
        logger.info('Closing all connection pools');
        
        const environments = Array.from(this.poolConfigs.keys());
        await Promise.all(environments.map(env => this.closePool(env)));
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        logger.info('All connection pools closed');
    }

    // Private helper methods

    validateConnectionConfig(config) {
        if (!config.ssh || !config.ssh.host || !config.ssh.username) {
            throw new Error('Invalid SSH configuration: host and username are required');
        }
        
        if (!config.ssh.auth_method || !['key', 'password'].includes(config.ssh.auth_method)) {
            throw new Error('Invalid SSH auth method: must be "key" or "password"');
        }
        
        if (config.ssh.auth_method === 'key' && !config.ssh.key_path) {
            throw new Error('SSH key path is required when using key authentication');
        }
    }

    async createConnection(environmentId) {
        const poolData = this.poolConfigs.get(environmentId);
        const pool = this.sshPools.get(environmentId);
        const config = poolData.connectionConfig.ssh;
        
        const ssh = new NodeSSH();
        const connectionId = `${environmentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            // Prepare connection options
            const connectOptions = {
                host: config.host,
                port: config.port || 22,
                username: config.username,
                ...config.connection_options
            };
            
            // Add authentication
            if (config.auth_method === 'key') {
                connectOptions.privateKey = config.key_path;
            } else if (config.auth_method === 'password') {
                connectOptions.password = config.password;
            }
            
            // Handle jump host if configured
            if (config.jump_host && config.jump_host.enabled) {
                // Note: node-ssh doesn't directly support jump hosts
                // This would need to be implemented with SSH tunneling
                logger.warn(`Jump host configuration detected but not yet implemented for ${environmentId}`);
            }
            
            await ssh.connect(connectOptions);
            
            const connection = {
                id: connectionId,
                ssh: ssh,
                environmentId: environmentId,
                createdAt: new Date(),
                lastUsed: null,
                lastReleased: null,
                inUse: false,
                useCount: 0
            };
            
            pool.push(connection);
            poolData.totalConnections++;
            poolData.availableConnections++;
            
            logger.debug(`Created new SSH connection ${connectionId} for ${environmentId}`);
            
            return connection;
            
        } catch (error) {
            logger.error(`Failed to create SSH connection for ${environmentId}:`, error);
            throw error;
        }
    }

    async createMinimumConnections(environmentId) {
        const poolData = this.poolConfigs.get(environmentId);
        const minConnections = poolData.poolConfig.min;
        
        const createPromises = [];
        for (let i = 0; i < minConnections; i++) {
            createPromises.push(this.createConnection(environmentId));
        }
        
        try {
            await Promise.all(createPromises);
            logger.info(`Created ${minConnections} minimum connections for ${environmentId}`);
        } catch (error) {
            logger.error(`Failed to create minimum connections for ${environmentId}:`, error);
        }
    }

    getAvailableConnection(pool) {
        return pool.find(conn => !conn.inUse && conn.ssh && conn.ssh.connection);
    }

    async waitForConnection(environmentId, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const pool = this.sshPools.get(environmentId);
            const available = this.getAvailableConnection(pool);
            
            if (available) {
                return available;
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error(`Timeout waiting for connection to ${environmentId}`);
    }

    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Command timeout after ${timeout}ms`)), timeout);
        });
    }

    initializeStats(environmentId) {
        this.connectionStats.set(environmentId, {
            connectionsCreated: 0,
            connectionsDestroyed: 0,
            connectionsAcquired: 0,
            connectionErrors: 0,
            commandsExecuted: 0,
            commandErrors: 0,
            filesUploaded: 0,
            filesDownloaded: 0,
            uploadErrors: 0,
            downloadErrors: 0,
            healthChecks: 0,
            healthCheckErrors: 0,
            totalResponseTime: 0,
            lastReset: new Date()
        });
    }

    updateStats(environmentId, event, value = 1) {
        const stats = this.connectionStats.get(environmentId);
        if (!stats) return;
        
        switch (event) {
            case 'connectionAcquired':
                stats.connectionsAcquired++;
                if (typeof value === 'number') {
                    stats.totalResponseTime += value;
                }
                break;
            case 'connectionError':
                stats.connectionErrors++;
                break;
            case 'commandExecuted':
                stats.commandsExecuted++;
                break;
            case 'commandError':
                stats.commandErrors++;
                break;
            case 'fileUploaded':
                stats.filesUploaded++;
                break;
            case 'fileDownloaded':
                stats.filesDownloaded++;
                break;
            case 'uploadError':
                stats.uploadErrors++;
                break;
            case 'downloadError':
                stats.downloadErrors++;
                break;
            case 'healthCheck':
                stats.healthChecks++;
                if (typeof value === 'number') {
                    stats.totalResponseTime += value;
                }
                break;
            case 'healthCheckError':
                stats.healthCheckErrors++;
                break;
        }
    }

    startHealthMonitoring(environmentId) {
        const poolData = this.poolConfigs.get(environmentId);
        if (!poolData) return;
        
        // Health check every 5 minutes
        const interval = setInterval(async () => {
            try {
                await this.testConnection(environmentId);
            } catch (error) {
                logger.error(`Health check failed for ${environmentId}:`, error);
            }
        }, 5 * 60 * 1000);
        
        this.healthCheckIntervals.set(environmentId, interval);
    }

    startCleanupInterval() {
        // Run cleanup every 10 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, 10 * 60 * 1000);
    }

    cleanupIdleConnections() {
        for (const [environmentId, pool] of this.sshPools.entries()) {
            const poolData = this.poolConfigs.get(environmentId);
            if (!poolData) continue;
            
            const idleTimeout = poolData.poolConfig.idleTimeout;
            const minConnections = poolData.poolConfig.min;
            
            const now = Date.now();
            let connectionsToRemove = [];
            
            for (const connection of pool) {
                if (!connection.inUse && connection.lastReleased) {
                    const idleTime = now - connection.lastReleased.getTime();
                    
                    if (idleTime > idleTimeout && pool.length > minConnections) {
                        connectionsToRemove.push(connection);
                    }
                }
            }
            
            // Remove idle connections
            for (const connection of connectionsToRemove) {
                try {
                    connection.ssh.connection.end();
                    const index = pool.indexOf(connection);
                    if (index > -1) {
                        pool.splice(index, 1);
                        poolData.totalConnections--;
                        poolData.availableConnections--;
                    }
                    logger.debug(`Removed idle connection ${connection.id} from ${environmentId}`);
                } catch (error) {
                    logger.warn(`Error removing idle connection:`, error);
                }
            }
        }
    }
}

// Export singleton instance
module.exports = new ConnectionPoolManager();