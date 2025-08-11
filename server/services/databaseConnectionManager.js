const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class DatabaseConnectionManager {
    constructor() {
        // Connection pools by environment_id and database type (read/write)
        this.connectionPools = new Map();
        this.poolConfigs = new Map();
        this.healthCheckIntervals = new Map();
        this.connectionStats = new Map();
        
        // Default pool configuration
        this.defaultPoolConfig = {
            read: {
                connectionLimit: 10,
                queueLimit: 0,
                acquireTimeout: 30000,
                idleTimeout: 600000,
                keepAlive: true,
                keepAliveInitialDelay: 0
            },
            write: {
                connectionLimit: 5,
                queueLimit: 0,
                acquireTimeout: 30000,
                idleTimeout: 300000,
                keepAlive: true,
                keepAliveInitialDelay: 0
            }
        };
        
        // Start health monitoring
        this.startHealthMonitoring();
    }

    /**
     * Initialize database connection pools for an environment
     * @param {string} environmentId - Environment identifier
     * @param {Object} databaseConfig - Database configuration with read/write pools
     * @param {Object} poolConfig - Pool-specific configuration overrides
     */
    async initializePools(environmentId, databaseConfig, poolConfig = {}) {
        try {
            logger.info(`Initializing database connection pools for environment: ${environmentId}`);
            
            // Validate configuration
            this.validateDatabaseConfig(databaseConfig);
            
            // Merge configurations
            const finalPoolConfig = this.mergePoolConfig(poolConfig);
            
            // Store configuration
            this.poolConfigs.set(environmentId, {
                environmentId,
                databaseConfig,
                poolConfig: finalPoolConfig,
                createdAt: new Date(),
                lastHealthCheck: null,
                healthStatus: 'unknown'
            });
            
            // Initialize connection pools
            const pools = {};
            
            // Create read pool if configured
            if (databaseConfig.read) {
                pools.read = await this.createPool(environmentId, 'read', databaseConfig.read, finalPoolConfig.read);
                logger.info(`Read pool created for ${environmentId}`);
            }
            
            // Create write pool if configured
            if (databaseConfig.write) {
                pools.write = await this.createPool(environmentId, 'write', databaseConfig.write, finalPoolConfig.write);
                logger.info(`Write pool created for ${environmentId}`);
            }
            
            this.connectionPools.set(environmentId, pools);
            this.initializeStats(environmentId);
            
            // Test connections
            await this.testAllConnections(environmentId);
            
            logger.info(`Database connection pools initialized for ${environmentId}`);
            
        } catch (error) {
            logger.error(`Failed to initialize database pools for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Execute a read query on the environment's database
     * @param {string} environmentId - Environment identifier
     * @param {string} query - SQL query to execute
     * @param {Array} params - Query parameters
     * @param {Object} options - Execution options
     * @returns {Promise<Array>} Query results
     */
    async executeReadQuery(environmentId, query, params = [], options = {}) {
        const startTime = Date.now();
        
        try {
            const pools = this.connectionPools.get(environmentId);
            if (!pools || !pools.read) {
                throw new Error(`No read pool configured for environment: ${environmentId}`);
            }
            
            logger.debug(`Executing read query on ${environmentId}:`, { query: query.substring(0, 100) });
            
            const [results] = await pools.read.execute(query, params);
            
            const executionTime = Date.now() - startTime;
            this.updateStats(environmentId, 'readQuery', executionTime);
            
            logger.debug(`Read query completed on ${environmentId} in ${executionTime}ms`);
            
            return results;
            
        } catch (error) {
            this.updateStats(environmentId, 'readError');
            logger.error(`Read query failed on ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Execute a write query on the environment's database
     * @param {string} environmentId - Environment identifier
     * @param {string} query - SQL query to execute
     * @param {Array} params - Query parameters
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Query results with metadata
     */
    async executeWriteQuery(environmentId, query, params = [], options = {}) {
        const startTime = Date.now();
        
        try {
            const pools = this.connectionPools.get(environmentId);
            if (!pools || !pools.write) {
                throw new Error(`No write pool configured for environment: ${environmentId}`);
            }
            
            logger.debug(`Executing write query on ${environmentId}:`, { query: query.substring(0, 100) });
            
            const [results] = await pools.write.execute(query, params);
            
            const executionTime = Date.now() - startTime;
            this.updateStats(environmentId, 'writeQuery', executionTime);
            
            logger.debug(`Write query completed on ${environmentId} in ${executionTime}ms`);
            
            return {
                results,
                insertId: results.insertId,
                affectedRows: results.affectedRows,
                changedRows: results.changedRows,
                executionTime
            };
            
        } catch (error) {
            this.updateStats(environmentId, 'writeError');
            logger.error(`Write query failed on ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Execute a transaction on the environment's write database
     * @param {string} environmentId - Environment identifier
     * @param {Function} callback - Transaction callback function
     * @param {Object} options - Transaction options
     * @returns {Promise<*>} Transaction result
     */
    async executeTransaction(environmentId, callback, options = {}) {
        const startTime = Date.now();
        let connection = null;
        
        try {
            const pools = this.connectionPools.get(environmentId);
            if (!pools || !pools.write) {
                throw new Error(`No write pool configured for environment: ${environmentId}`);
            }
            
            logger.debug(`Starting transaction on ${environmentId}`);
            
            connection = await pools.write.getConnection();
            await connection.beginTransaction();
            
            // Execute transaction callback
            const result = await callback(connection);
            
            await connection.commit();
            
            const executionTime = Date.now() - startTime;
            this.updateStats(environmentId, 'transaction', executionTime);
            
            logger.debug(`Transaction completed on ${environmentId} in ${executionTime}ms`);
            
            return result;
            
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                    logger.debug(`Transaction rolled back on ${environmentId}`);
                } catch (rollbackError) {
                    logger.error(`Transaction rollback failed on ${environmentId}:`, rollbackError);
                }
            }
            
            this.updateStats(environmentId, 'transactionError');
            logger.error(`Transaction failed on ${environmentId}:`, error);
            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Get a direct connection from the pool
     * @param {string} environmentId - Environment identifier
     * @param {string} type - Connection type ('read' or 'write')
     * @returns {Promise<Object>} Connection wrapper
     */
    async getConnection(environmentId, type = 'read') {
        try {
            const pools = this.connectionPools.get(environmentId);
            if (!pools || !pools[type]) {
                throw new Error(`No ${type} pool configured for environment: ${environmentId}`);
            }
            
            const connection = await pools[type].getConnection();
            
            this.updateStats(environmentId, 'connectionAcquired');
            
            return {
                connection,
                environmentId,
                type,
                release: () => {
                    connection.release();
                    this.updateStats(environmentId, 'connectionReleased');
                }
            };
            
        } catch (error) {
            this.updateStats(environmentId, 'connectionError');
            logger.error(`Failed to get ${type} connection for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Test database connections for an environment
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<Object>} Health check results
     */
    async testConnections(environmentId) {
        const startTime = Date.now();
        const results = {
            environmentId,
            timestamp: new Date(),
            read: null,
            write: null,
            overall: 'unknown'
        };
        
        const pools = this.connectionPools.get(environmentId);
        if (!pools) {
            results.overall = 'no_pools';
            return results;
        }
        
        // Test read pool
        if (pools.read) {
            try {
                const readStartTime = Date.now();
                const readConn = await pools.read.getConnection();
                await readConn.ping();
                readConn.release();
                
                results.read = {
                    healthy: true,
                    responseTime: Date.now() - readStartTime
                };
            } catch (error) {
                results.read = {
                    healthy: false,
                    error: error.message
                };
            }
        }
        
        // Test write pool
        if (pools.write) {
            try {
                const writeStartTime = Date.now();
                const writeConn = await pools.write.getConnection();
                await writeConn.ping();
                writeConn.release();
                
                results.write = {
                    healthy: true,
                    responseTime: Date.now() - writeStartTime
                };
            } catch (error) {
                results.write = {
                    healthy: false,
                    error: error.message
                };
            }
        }
        
        // Determine overall health
        const readHealthy = !results.read || results.read.healthy;
        const writeHealthy = !results.write || results.write.healthy;
        
        if (readHealthy && writeHealthy) {
            results.overall = 'healthy';
        } else if (readHealthy || writeHealthy) {
            results.overall = 'degraded';
        } else {
            results.overall = 'unhealthy';
        }
        
        results.totalResponseTime = Date.now() - startTime;
        
        // Update pool configuration with health status
        const poolConfig = this.poolConfigs.get(environmentId);
        if (poolConfig) {
            poolConfig.lastHealthCheck = new Date();
            poolConfig.healthStatus = results.overall;
        }
        
        this.updateStats(environmentId, 'healthCheck', results.totalResponseTime);
        
        return results;
    }

    /**
     * Get connection pool statistics
     * @param {string} environmentId - Environment identifier
     * @returns {Object} Pool statistics
     */
    getPoolStats(environmentId) {
        const pools = this.connectionPools.get(environmentId);
        const config = this.poolConfigs.get(environmentId);
        const stats = this.connectionStats.get(environmentId);
        
        if (!pools || !config || !stats) {
            return null;
        }
        
        const poolStats = {
            environmentId,
            healthStatus: config.healthStatus,
            lastHealthCheck: config.lastHealthCheck,
            createdAt: config.createdAt,
            pools: {},
            statistics: {
                ...stats,
                averageReadTime: stats.totalReadTime > 0 ? 
                    Math.round(stats.totalReadTime / stats.readQueries) : 0,
                averageWriteTime: stats.totalWriteTime > 0 ? 
                    Math.round(stats.totalWriteTime / stats.writeQueries) : 0,
                readSuccessRate: stats.readQueries > 0 ? 
                    Math.round(((stats.readQueries - stats.readErrors) / stats.readQueries) * 100) : 0,
                writeSuccessRate: stats.writeQueries > 0 ? 
                    Math.round(((stats.writeQueries - stats.writeErrors) / stats.writeQueries) * 100) : 0
            }
        };
        
        // Add pool-specific statistics
        if (pools.read) {
            poolStats.pools.read = {
                threadId: pools.read.threadId,
                acquiredConnections: pools.read._acquiredConnections?.length || 0,
                freeConnections: pools.read._freeConnections?.length || 0,
                connectionLimit: pools.read.config.connectionLimit,
                queuedCallbacks: pools.read._connectionQueue?.length || 0
            };
        }
        
        if (pools.write) {
            poolStats.pools.write = {
                threadId: pools.write.threadId,
                acquiredConnections: pools.write._acquiredConnections?.length || 0,
                freeConnections: pools.write._freeConnections?.length || 0,
                connectionLimit: pools.write.config.connectionLimit,
                queuedCallbacks: pools.write._connectionQueue?.length || 0
            };
        }
        
        return poolStats;
    }

    /**
     * Close all database pools for an environment
     * @param {string} environmentId - Environment identifier
     */
    async closePools(environmentId) {
        try {
            logger.info(`Closing database pools for ${environmentId}`);
            
            const pools = this.connectionPools.get(environmentId);
            if (pools) {
                // Close read pool
                if (pools.read) {
                    await pools.read.end();
                    logger.debug(`Read pool closed for ${environmentId}`);
                }
                
                // Close write pool
                if (pools.write) {
                    await pools.write.end();
                    logger.debug(`Write pool closed for ${environmentId}`);
                }
            }
            
            // Clean up data structures
            this.connectionPools.delete(environmentId);
            this.poolConfigs.delete(environmentId);
            this.connectionStats.delete(environmentId);
            
            // Clear health check interval
            const interval = this.healthCheckIntervals.get(environmentId);
            if (interval) {
                clearInterval(interval);
                this.healthCheckIntervals.delete(environmentId);
            }
            
            logger.info(`Database pools closed for ${environmentId}`);
            
        } catch (error) {
            logger.error(`Error closing database pools for ${environmentId}:`, error);
        }
    }

    /**
     * Close all database pools
     */
    async closeAllPools() {
        logger.info('Closing all database connection pools');
        
        const environments = Array.from(this.connectionPools.keys());
        await Promise.all(environments.map(env => this.closePools(env)));
        
        // Clear main health monitoring interval
        if (this.healthMonitoringInterval) {
            clearInterval(this.healthMonitoringInterval);
        }
        
        logger.info('All database connection pools closed');
    }

    // Private helper methods

    validateDatabaseConfig(config) {
        if (!config.read && !config.write) {
            throw new Error('At least one database configuration (read or write) is required');
        }
        
        const validatePoolConfig = (poolConfig, type) => {
            if (!poolConfig.host || !poolConfig.database) {
                throw new Error(`Invalid ${type} database configuration: host and database are required`);
            }
            
            if (!poolConfig.username) {
                throw new Error(`Invalid ${type} database configuration: username is required`);
            }
        };
        
        if (config.read) {
            validatePoolConfig(config.read, 'read');
        }
        
        if (config.write) {
            validatePoolConfig(config.write, 'write');
        }
    }

    mergePoolConfig(customConfig) {
        return {
            read: { ...this.defaultPoolConfig.read, ...customConfig.read },
            write: { ...this.defaultPoolConfig.write, ...customConfig.write }
        };
    }

    async createPool(environmentId, type, dbConfig, poolConfig) {
        const connectionConfig = {
            host: dbConfig.host,
            port: dbConfig.port || 3306,
            user: dbConfig.username,
            password: dbConfig.password,
            database: dbConfig.database,
            ...poolConfig
        };
        
        // Add SSL configuration if provided
        if (dbConfig.ssl) {
            connectionConfig.ssl = dbConfig.ssl;
        }
        
        // Create and test pool
        const pool = mysql.createPool(connectionConfig);
        
        // Test the pool with a simple query
        try {
            const connection = await pool.getConnection();
            await connection.ping();
            connection.release();
            logger.debug(`${type} pool test successful for ${environmentId}`);
        } catch (error) {
            await pool.end();
            throw new Error(`Failed to create ${type} pool for ${environmentId}: ${error.message}`);
        }
        
        return pool;
    }

    async testAllConnections(environmentId) {
        const testResult = await this.testConnections(environmentId);
        
        if (testResult.overall === 'unhealthy') {
            throw new Error(`Database health check failed for ${environmentId}`);
        }
        
        if (testResult.overall === 'degraded') {
            logger.warn(`Database health check shows degraded performance for ${environmentId}`, testResult);
        }
        
        return testResult;
    }

    initializeStats(environmentId) {
        this.connectionStats.set(environmentId, {
            readQueries: 0,
            writeQueries: 0,
            transactions: 0,
            readErrors: 0,
            writeErrors: 0,
            transactionErrors: 0,
            connectionsAcquired: 0,
            connectionsReleased: 0,
            connectionErrors: 0,
            healthChecks: 0,
            totalReadTime: 0,
            totalWriteTime: 0,
            totalTransactionTime: 0,
            lastReset: new Date()
        });
    }

    updateStats(environmentId, event, value = 1) {
        const stats = this.connectionStats.get(environmentId);
        if (!stats) return;
        
        switch (event) {
            case 'readQuery':
                stats.readQueries++;
                if (typeof value === 'number') {
                    stats.totalReadTime += value;
                }
                break;
            case 'writeQuery':
                stats.writeQueries++;
                if (typeof value === 'number') {
                    stats.totalWriteTime += value;
                }
                break;
            case 'transaction':
                stats.transactions++;
                if (typeof value === 'number') {
                    stats.totalTransactionTime += value;
                }
                break;
            case 'readError':
                stats.readErrors++;
                break;
            case 'writeError':
                stats.writeErrors++;
                break;
            case 'transactionError':
                stats.transactionErrors++;
                break;
            case 'connectionAcquired':
                stats.connectionsAcquired++;
                break;
            case 'connectionReleased':
                stats.connectionsReleased++;
                break;
            case 'connectionError':
                stats.connectionErrors++;
                break;
            case 'healthCheck':
                stats.healthChecks++;
                break;
        }
    }

    startHealthMonitoring() {
        // Run health checks every 2 minutes
        this.healthMonitoringInterval = setInterval(async () => {
            for (const environmentId of this.connectionPools.keys()) {
                try {
                    await this.testConnections(environmentId);
                } catch (error) {
                    logger.error(`Health check failed for ${environmentId}:`, error);
                }
            }
        }, 2 * 60 * 1000);
    }
}

// Export singleton instance
module.exports = new DatabaseConnectionManager();