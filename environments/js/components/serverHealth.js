/**
 * Server Health Component
 * Handles server health monitoring and display
 */

class ServerHealth {
    constructor() {
        this.container = document.getElementById('server-health-content');
        this.refreshButton = document.getElementById('refresh-server-btn');
        this.updateInterval = null;
        this.autoRefreshEnabled = false;
        
        this.init();
    }
    
    /**
     * Initialize the server health component
     */
    init() {
        this.attachEventListeners();
        this.loadServerHealth();
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', () => {
                this.refreshServerHealth();
            });
        }
    }
    
    /**
     * Load server health data
     */
    async loadServerHealth() {
        if (!this.container) return;
        
        try {
            this.showLoading();
            
            // Get real server health data
            const healthData = await window.monitorApi.getServerHealth();
            
            // Check if environment is not configured and stop auto-refresh
            if (healthData && healthData.server_health && healthData.server_health.message === 'Environment not configured') {
                this.disableAutoRefresh();
                this.showMessage('No environment selected for monitoring', 'info');
                return;
            }
            
            this.renderServerHealth(healthData);
        } catch (error) {
            console.error('Error loading server health:', error);
            this.showError('Failed to load server health data: ' + error.message);
            // Stop auto-refresh on error to prevent spam
            this.disableAutoRefresh();
        }
    }
    
    /**
     * Refresh server health data
     */
    async refreshServerHealth() {
        try {
            this.setButtonLoading(this.refreshButton, true);
            await this.loadServerHealth();
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
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading server health...</span>
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
     * Render server health data
     */
    renderServerHealth(data) {
        if (!this.container) return;
        
        const statusClass = data.status === 'online' ? 'healthy' : 'critical';
        const statusIcon = data.status === 'online' ? 'check-circle' : 'exclamation-triangle';
        
        this.container.innerHTML = `
            <div class="health-overview mb-3">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <span class="connection-indicator ${data.status === 'online' ? 'connected' : 'disconnected'}"></span>
                        <h6 class="mb-0">Server Status</h6>
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
                        <i class="fas fa-clock text-info"></i>
                        Uptime
                    </span>
                    <span class="health-metric-value">${data.uptime}</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-tag text-primary"></i>
                        Version
                    </span>
                    <span class="health-metric-value">${data.version}</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fas fa-microchip text-warning"></i>
                        Process ID
                    </span>
                    <span class="health-metric-value">${data.processId}</span>
                </div>
                
                <div class="health-metric">
                    <span class="health-metric-label">
                        <i class="fab fa-node-js text-success"></i>
                        Node Version
                    </span>
                    <span class="health-metric-value">${data.nodeVersion}</span>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="resource-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-chart-pie text-info"></i>
                    Resource Usage
                </h6>
                
                <!-- Memory Usage -->
                <div class="resource-usage">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="resource-label">
                            <i class="fas fa-memory text-primary"></i>
                            Memory
                        </span>
                        <span class="fw-bold">${data.memory.used}MB / ${data.memory.total}MB</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${this.getProgressBarClass(data.memory.percentage)}" 
                             style="width: ${data.memory.percentage}%"
                             title="${data.memory.percentage}%">
                        </div>
                    </div>
                    <small class="text-muted">${data.memory.percentage}% used</small>
                </div>
                
                <!-- CPU Usage -->
                <div class="resource-usage">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="resource-label">
                            <i class="fas fa-microchip text-warning"></i>
                            CPU Usage
                        </span>
                        <span class="fw-bold">${data.cpu.usage}%</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${this.getProgressBarClass(data.cpu.usage)}" 
                             style="width: ${data.cpu.usage}%"
                             title="${data.cpu.usage}%">
                        </div>
                    </div>
                    <small class="text-muted">Load avg: ${Array.isArray(data.cpu.loadAverage) ? data.cpu.loadAverage.join(', ') : (data.cpu.loadAverage || 'N/A')}</small>
                </div>
                
                <!-- Disk Usage -->
                <div class="resource-usage">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="resource-label">
                            <i class="fas fa-hdd text-danger"></i>
                            Disk Usage
                        </span>
                        <span class="fw-bold">${data.disk.used}GB / ${data.disk.total}GB</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${this.getProgressBarClass(data.disk.percentage)}" 
                             style="width: ${data.disk.percentage}%"
                             title="${data.disk.percentage}%">
                        </div>
                    </div>
                    <small class="text-muted">${data.disk.percentage}% used</small>
                </div>
            </div>
            
            <hr class="my-3">
            
            <div class="network-metrics">
                <h6 class="mb-3">
                    <i class="fas fa-network-wired text-success"></i>
                    Network Statistics
                </h6>
                
                <div class="row text-center">
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-primary">${this.formatBytes(data.network.bytesReceived)}</div>
                            <div class="metric-label">Received</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-success">${this.formatBytes(data.network.bytesSent)}</div>
                            <div class="metric-label">Sent</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="metric-box">
                            <div class="metric-value text-info">${data.network.connectionsActive}</div>
                            <div class="metric-label">Active Connections</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="text-muted small mt-3">
                <i class="fas fa-clock"></i>
                Last restart: ${this.formatDate(data.lastRestart)}
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
     * Format date
     */
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleString();
        } catch (error) {
            return 'Unknown';
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
            this.loadServerHealth();
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
window.initServerHealth = function() {
    if (!window.serverHealth) {
        window.serverHealth = new ServerHealth();
    }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerHealth;
}