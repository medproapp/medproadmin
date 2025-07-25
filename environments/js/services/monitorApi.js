/**
 * Monitor API Service
 * Handles all API calls related to environment monitoring
 */

class MonitorApiService {
    constructor() {
        this.baseUrl = '/api/v1/environments';
        this.currentEnvironmentId = null;
    }
    
    /**
     * Set current environment for monitoring
     */
    setEnvironment(environmentId) {
        this.currentEnvironmentId = environmentId;
    }
    
    /**
     * Get server health statistics
     */
    async getServerHealth(environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) {
            throw new Error('No environment selected for monitoring');
        }
        
        const response = await authenticatedFetch(`${this.baseUrl}/${envId}/monitor/server`);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to fetch server health');
        }
        
        return response.data;
    }
    
    /**
     * Get database health statistics
     */
    async getDatabaseHealth(environmentId = null) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) {
            throw new Error('No environment selected for monitoring');
        }
        
        const response = await authenticatedFetch(`${this.baseUrl}/${envId}/monitor/database`);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to fetch database health');
        }
        
        return response.data;
    }
    
    /**
     * Get server logs
     */
    async getServerLogs(environmentId = null, options = {}) {
        const envId = environmentId || this.currentEnvironmentId;
        if (!envId) {
            throw new Error('No environment selected for monitoring');
        }
        
        const params = new URLSearchParams({
            lines: options.lines || 100,
            level: options.level || '',
            since: options.since || ''
        });
        
        const response = await authenticatedFetch(`${this.baseUrl}/${envId}/monitor/logs?${params}`);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to fetch server logs');
        }
        
        return response.data;
    }
    
    /**
     * Get comprehensive monitoring data
     */
    async getMonitoringOverview(environmentId = null) {
        try {
            const envId = environmentId || this.currentEnvironmentId;
            if (!envId) {
                throw new Error('No environment selected for monitoring');
            }
            
            // Fetch all monitoring data in parallel
            const [serverHealth, databaseHealth, logs] = await Promise.allSettled([
                this.getServerHealth(envId),
                this.getDatabaseHealth(envId),
                this.getServerLogs(envId, { lines: 50 })
            ]);
            
            return {
                serverHealth: serverHealth.status === 'fulfilled' ? serverHealth.value : null,
                databaseHealth: databaseHealth.status === 'fulfilled' ? databaseHealth.value : null,
                logs: logs.status === 'fulfilled' ? logs.value : null,
                errors: {
                    serverHealth: serverHealth.status === 'rejected' ? serverHealth.reason : null,
                    databaseHealth: databaseHealth.status === 'rejected' ? databaseHealth.reason : null,
                    logs: logs.status === 'rejected' ? logs.reason : null
                }
            };
        } catch (error) {
            console.error('Error fetching monitoring overview:', error);
            throw error;
        }
    }
    
    /**
     * Mock server health data (for development)
     */
    getMockServerHealth() {
        const now = new Date();
        const uptimeHours = Math.floor(Math.random() * 240) + 12; // 12-252 hours
        const uptimeDays = Math.floor(uptimeHours / 24);
        const remainingHours = uptimeHours % 24;
        
        return {
            status: Math.random() > 0.1 ? 'online' : 'offline',
            uptime: `${uptimeDays} days, ${remainingHours} hours`,
            version: 'v3.0.0',
            lastRestart: new Date(now.getTime() - (uptimeHours * 60 * 60 * 1000)).toISOString(),
            processId: Math.floor(Math.random() * 10000) + 1000,
            nodeVersion: 'v18.17.0',
            memory: {
                used: Math.floor(Math.random() * 500) + 200, // MB
                total: 1024,
                percentage: Math.floor(Math.random() * 60) + 20
            },
            cpu: {
                usage: Math.floor(Math.random() * 80) + 5,
                loadAverage: [
                    (Math.random() * 2).toFixed(2),
                    (Math.random() * 2).toFixed(2),
                    (Math.random() * 2).toFixed(2)
                ]
            },
            disk: {
                used: Math.floor(Math.random() * 200) + 50, // GB
                total: 500,
                percentage: Math.floor(Math.random() * 70) + 10
            },
            network: {
                bytesReceived: Math.floor(Math.random() * 1000000) + 100000,
                bytesSent: Math.floor(Math.random() * 800000) + 80000,
                connectionsActive: Math.floor(Math.random() * 50) + 5
            }
        };
    }
    
    /**
     * Mock database health data (for development)
     */
    getMockDatabaseHealth() {
        return {
            status: Math.random() > 0.05 ? 'connected' : 'disconnected',
            version: '8.0.34',
            uptime: Math.floor(Math.random() * 1000000) + 100000, // seconds
            connections: {
                active: Math.floor(Math.random() * 50) + 5,
                max: 151,
                percentage: Math.floor(Math.random() * 60) + 10
            },
            queries: {
                total: Math.floor(Math.random() * 1000000) + 50000,
                perSecond: Math.floor(Math.random() * 100) + 10,
                averageTime: (Math.random() * 100 + 10).toFixed(2) + 'ms'
            },
            storage: {
                dataSize: Math.floor(Math.random() * 5000) + 1000, // MB
                indexSize: Math.floor(Math.random() * 1000) + 200, // MB
                totalSize: Math.floor(Math.random() * 6000) + 1500 // MB
            },
            performance: {
                slowQueries: Math.floor(Math.random() * 10),
                lockedQueries: Math.floor(Math.random() * 3),
                bufferPoolHitRatio: (Math.random() * 20 + 80).toFixed(1) + '%'
            },
            replication: {
                status: Math.random() > 0.1 ? 'running' : 'stopped',
                lag: Math.floor(Math.random() * 5) + 'ms'
            }
        };
    }
    
    /**
     * Mock server logs data (for development)
     */
    getMockServerLogs(count = 50) {
        const levels = ['info', 'warn', 'error', 'debug'];
        const components = ['api', 'auth', 'database', 'email', 'storage', 'payment'];
        const messages = [
            'Request processed successfully',
            'User authentication completed',
            'Database query executed',
            'Email notification sent',
            'File uploaded to storage',
            'Payment processed',
            'Cache refreshed',
            'Session created',
            'API rate limit checked',
            'Background task completed',
            'Connection established',
            'Data validation passed',
            'Security check completed',
            'Backup operation finished',
            'Service health check passed'
        ];
        
        const errorMessages = [
            'Failed to connect to database',
            'Authentication token expired',
            'Invalid request parameters',
            'Email delivery failed',
            'Storage quota exceeded',
            'Payment gateway timeout',
            'Service unavailable',
            'Rate limit exceeded',
            'Validation error occurred',
            'Connection timeout'
        ];
        
        const logs = [];
        const now = Date.now();
        
        for (let i = 0; i < count; i++) {
            const level = levels[Math.floor(Math.random() * levels.length)];
            const component = components[Math.floor(Math.random() * components.length)];
            const timestamp = new Date(now - (i * 1000 * Math.random() * 60));
            
            let message;
            if (level === 'error') {
                message = errorMessages[Math.floor(Math.random() * errorMessages.length)];
            } else {
                message = messages[Math.floor(Math.random() * messages.length)];
            }
            
            logs.unshift({
                timestamp: timestamp.toISOString(),
                level: level,
                component: component,
                message: message,
                requestId: 'req_' + Math.random().toString(36).substr(2, 9),
                userId: Math.random() > 0.3 ? 'user_' + Math.floor(Math.random() * 1000) : null
            });
        }
        
        return logs;
    }
}

// Create global instance
window.monitorApi = new MonitorApiService();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonitorApiService;
}