/**
 * Database Health Component
 * Handles database health monitoring and display
 */

class DatabaseHealth {
    constructor() {
        this.container = document.getElementById('database-health-content');
        this.refreshButton = document.getElementById('refresh-db-btn');
        this.updateInterval = null;
        this.autoRefreshEnabled = false;
        
        this.init();
    }
    
    /**
     * Initialize the database health component
     */
    init() {
        this.attachEventListeners();
        this.loadDatabaseHealth();
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', () => {
                this.refreshDatabaseHealth();
            });
        }
    }
    
    /**
     * Load database health data
     */
    async loadDatabaseHealth() {
        if (!this.container) return;
        
        try {
            this.showLoading();
            
            // Get real database health data
            const healthData = await window.monitorApi.getDatabaseHealth();
            
            // Check if environment is not configured and stop auto-refresh
            if (healthData && healthData.database_health && healthData.database_health.message === 'Environment not configured') {
                this.disableAutoRefresh();
                this.showMessage('No environment selected for monitoring', 'info');
                return;
            }
            
            this.renderDatabaseHealth(healthData);
        } catch (error) {
            console.error('Error loading database health:', error);
            this.showError('Failed to load database health data: ' + error.message);
            // Stop auto-refresh on error to prevent spam
            this.disableAutoRefresh();
        }
    }
    
    /**
     * Refresh database health data
     */
    async refreshDatabaseHealth() {
        try {
            this.setButtonLoading(this.refreshButton, true);
            await this.loadDatabaseHealth();
        } finally {
            this.setButtonLoading(this.refreshButton, false);
        }
    }
    
    /**
     * Show loading state
     */
    showLoading() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-success" role="status">
                    <span class="visually-hidden">Loading database health...</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Show error state
     */
    showError(message) {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Error:</strong> ${this.escapeHtml(message)}
            </div>
        `;
    }
    
    /**
     * Render database health data
     */
    renderDatabaseHealth(data) {
        if (!this.container) return;
        
        const statusClass = data.status === 'connected' ? 'healthy' : 'critical';
        const statusIcon = data.status === 'connected' ? 'check-circle' : 'exclamation-triangle';
        const replicationStatusClass = data.replication.status === 'running' ? 'healthy' : 'warning';
        
        this.container.innerHTML = `
            <div class="health-overview mb-3">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <span class="connection-indicator ${data.status === 'connected' ? 'connected' : 'disconnected'}"></span>
                        <h6 class="mb-0">Database Status</h6>
                    </div>
                    <span class="health-status ${statusClass}">
                        <i class="fas fa-${statusIcon}"></i>
                        ${data.status.toUpperCase()}
                    </span>
                </div>
            </div>
            
            <div class="health-metrics">
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-tag text-primary"></i>
                        Version
                    </span>
                    <span class="health-metric-value">${data.version}</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-clock text-info"></i>
                        Uptime
                    </span>
                    <span class="health-metric-value">${this.formatUptime(data.uptime)}</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-tachometer-alt text-warning"></i>
                        Query Rate
                    </span>
                    <span class="health-metric-value">${data.queries.perSecond}/sec</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-stopwatch text-success"></i>
                        Avg Query Time
                    </span>
                    <span class="health-metric-value">${data.queries.averageTime}</span>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="connection-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-plug text-success"></i>
                    Connection Pool
                </h6>
                
                <div class="resource-usage">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="resource-label">
                            <i class="fas fa-link text-primary"></i>
                            Active Connections
                        </span>
                        <span class="fw-bold">${data.connections.active} / ${data.connections.max}</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${this.getProgressBarClass(data.connections.percentage)}" 
                             style="width: ${data.connections.percentage}%"
                             title="${data.connections.percentage}%">
                        </div>
                    </div>
                    <small class="text-muted">${data.connections.percentage}% pool utilization</small>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="storage-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-hdd text-info"></i>
                    Storage Information
                </h6>
                
                <div class="row text-center">
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-primary">${this.formatBytes(data.storage.dataSize * 1024 * 1024)}</div>
                            <div class="metric-label">Data Size</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-warning">${this.formatBytes(data.storage.indexSize * 1024 * 1024)}</div>
                            <div class="metric-label">Index Size</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-info">${this.formatBytes(data.storage.totalSize * 1024 * 1024)}</div>
                            <div class="metric-label">Total Size</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="performance-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-chart-line text-warning"></i>
                    Performance Indicators
                </h6>
                
                <div class="health-metrics">
                    <div class="health-metric">
                        <span class="health-metric-label">
                            <i class="fas fa-exclamation-triangle text-danger"></i>
                            Slow Queries
                        </span>
                        <span class="health-metric-value ${data.performance.slowQueries > 5 ? 'text-danger' : 'text-success'}">
                            ${data.performance.slowQueries}
                        </span>
                    </div>
                    
                    <div class="health-metric">
                        <span class="health-metric-label">
                            <i class="fas fa-lock text-warning"></i>
                            Locked Queries
                        </span>
                        <span class="health-metric-value ${data.performance.lockedQueries > 2 ? 'text-warning' : 'text-success'}">
                            ${data.performance.lockedQueries}
                        </span>
                    </div>
                    
                    <div class="health-metric">
                        <span class="health-metric-label">
                            <i class="fas fa-memory text-info"></i>
                            Buffer Pool Hit Ratio
                        </span>
                        <span class="health-metric-value ${parseFloat(data.performance.bufferPoolHitRatio) < 90 ? 'text-warning' : 'text-success'}">
                            ${data.performance.bufferPoolHitRatio}
                        </span>
                    </div>
                    
                    <div class="health-metric">
                        <span class="health-metric-label">
                            <i class="fas fa-calculator text-primary"></i>
                            Total Queries
                        </span>
                        <span class="health-metric-value">
                            ${data.queries.total.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="replication-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-copy text-secondary"></i>
                    Replication Status
                </h6>
                
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <span class="connection-indicator ${data.replication.status === 'running' ? 'connected' : 'warning'}"></span>
                        <span class="health-metric-label">Replication</span>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <span class="health-status ${replicationStatusClass}">
                            ${data.replication.status.toUpperCase()}
                        </span>
                        <small class="text-muted">Lag: ${data.replication.lag}</small>
                    </div>
                </div>
            </div>
            
            <div class="text-muted small mt-3">
                <i class="fas fa-sync"></i>
                Data refreshed every 30 seconds
            </div>
        `;
    }
    
    /**
     * Get progress bar class based on percentage
     */
    getProgressBarClass(percentage) {
        if (percentage >= 90) return 'bg-danger';
        if (percentage >= 75) return 'bg-warning';
        if (percentage >= 50) return 'bg-info';
        return 'bg-success';
    }
    
    /**
     * Format bytes to human readable format
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    /**
     * Format uptime in seconds to human readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    /**
     * Set button loading state
     */
    setButtonLoading(button, isLoading) {
        if (!button) return;
        
        const icon = button.querySelector('i');
        if (isLoading) {
            button.disabled = true;
            button.classList.add('refreshing');
            if (icon) icon.classList.add('fa-spin');
        } else {
            button.disabled = false;
            button.classList.remove('refreshing');
            if (icon) icon.classList.remove('fa-spin');
        }
    }
    
    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Enable auto refresh
     */
    enableAutoRefresh(interval = 30000) {
        this.disableAutoRefresh();
        this.autoRefreshEnabled = true;
        this.updateInterval = setInterval(() => {
            this.loadDatabaseHealth();
        }, interval);
    }
    
    /**
     * Disable auto refresh
     */
    disableAutoRefresh() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.autoRefreshEnabled = false;
    }
    
    /**
     * Destroy component
     */
    destroy() {
        this.disableAutoRefresh();
    }
}

// Manual initialization - called by monitor controller
window.initDatabaseHealth = function() {
    if (!window.databaseHealth) {
        window.databaseHealth = new DatabaseHealth();
    }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseHealth;
}