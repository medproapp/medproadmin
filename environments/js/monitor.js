/**
 * Monitor Page Controller
 * Coordinates all monitoring components and handles page-level functionality
 */

class MonitorController {
    constructor() {
        this.currentEnvironmentId = null;
        this.components = {};
        this.autoRefreshEnabled = false;
        this.autoRefreshInterval = null;
        this.refreshFrequency = 30000; // 30 seconds
        
        this.init();
    }
    
    /**
     * Initialize the monitor controller
     */
    async init() {
        // Wait for environment context to be ready
        await this.waitForEnvironmentContext();
        
        this.extractEnvironmentId();
        this.setupComponents();
        this.attachEventListeners();
        this.updateEnvironmentIndicator();
        this.updateEnvironmentStatus();
        this.updateLastUpdateTime();
        
        // Set up auto-refresh if enabled by default
        this.setupAutoRefresh();
    }
    
    /**
     * Wait for environment context to be available
     */
    async waitForEnvironmentContext() {
        return new Promise((resolve) => {
            const checkContext = () => {
                if (window.environmentContext) {
                    resolve();
                } else {
                    setTimeout(checkContext, 100);
                }
            };
            checkContext();
        });
    }
    
    /**
     * Extract environment ID from URL parameters
     */
    extractEnvironmentId() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentEnvironmentId = urlParams.get('env');
        
        if (!this.currentEnvironmentId) {
            console.warn('No environment ID provided in URL');
            this.showError('No environment specified for monitoring');
            return;
        }
        
        // Convert to integer
        this.currentEnvironmentId = parseInt(this.currentEnvironmentId);
        
        // Set environment in monitor API
        if (window.monitorApi) {
            window.monitorApi.setEnvironment(this.currentEnvironmentId);
        }
        
        // Set environment in context
        if (window.environmentContext) {
            window.environmentContext.setCurrentEnvironment(this.currentEnvironmentId);
        }
    }
    
    /**
     * Setup all monitoring components
     */
    setupComponents() {
        // Now that environment ID is set, manually initialize all components
        if (typeof window.initServerHealth === 'function') {
            window.initServerHealth();
        }
        
        if (typeof window.initDatabaseHealth === 'function') {
            window.initDatabaseHealth();
        }
        
        if (typeof window.initServerLogs === 'function') {
            window.initServerLogs();
        }
        
        if (typeof window.initRealtimeAnalytics === 'function') {
            window.initRealtimeAnalytics();
        }
        
        // Store references for coordination
        this.components = {
            serverHealth: window.serverHealth,
            databaseHealth: window.databaseHealth,
            serverLogs: window.serverLogs,
            realtimeAnalytics: window.realtimeAnalytics
        };
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Refresh All button
        const refreshAllBtn = document.getElementById('refresh-all-btn');
        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', () => {
                this.refreshAllComponents();
            });
        }
        
        // Auto Refresh toggle
        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('click', () => {
                this.toggleAutoRefresh();
            });
        }
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
        
        // Handle browser tab close/refresh
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    /**
     * Update environment indicator (in header)
     */
    async updateEnvironmentIndicator() {
        const envName = document.getElementById('current-env-name');
        if (!envName || !this.currentEnvironmentId) return;
        
        try {
            // Get environment details from context
            const environment = window.environmentContext?.getEnvironmentById(this.currentEnvironmentId);
            if (environment) {
                envName.textContent = environment.display_name;
            } else {
                envName.textContent = `Environment ${this.currentEnvironmentId}`;
            }
        } catch (error) {
            envName.textContent = 'Unknown Environment';
        }
    }
    
    /**
     * Update environment status bar
     */
    async updateEnvironmentStatus() {
        const statusText = document.getElementById('environment-status-text');
        if (!statusText || !this.currentEnvironmentId) return;
        
        try {
            // Get environment details from context
            const environment = window.environmentContext?.getEnvironmentById(this.currentEnvironmentId);
            if (environment) {
                statusText.innerHTML = `
                    Monitoring <strong>${environment.display_name}</strong> 
                    (${environment.env_type.toUpperCase()}) - 
                    ${environment.db_host}:${environment.db_port}/${environment.db_name}
                `;
            } else {
                statusText.innerHTML = `Monitoring environment ID: <strong>${this.currentEnvironmentId}</strong>`;
            }
        } catch (error) {
            statusText.innerHTML = `<span class="text-danger">Failed to load environment information</span>`;
        }
    }
    
    /**
     * Update last update time
     */
    updateLastUpdateTime() {
        const lastUpdateElement = document.getElementById('last-update-time');
        if (lastUpdateElement) {
            const now = new Date();
            lastUpdateElement.textContent = now.toLocaleTimeString();
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const alertContainer = document.getElementById('alert-container');
        if (!alertContainer) return;
        
        const alertHtml = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Error:</strong> ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        alertContainer.innerHTML = alertHtml;
    }
    
    /**
     * Show success message
     */
    showSuccess(message) {
        const alertContainer = document.getElementById('alert-container');
        if (!alertContainer) return;
        
        const alertHtml = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="fas fa-check-circle"></i>
                ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        alertContainer.innerHTML = alertHtml;
        
        // Auto dismiss after 3 seconds
        setTimeout(() => {
            const alert = alertContainer.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 3000);
    }
    
    /**
     * Refresh all components
     */
    async refreshAllComponents() {
        const refreshAllBtn = document.getElementById('refresh-all-btn');
        
        try {
            this.setButtonLoading(refreshAllBtn, true);
            
            // Refresh all components in parallel
            const refreshPromises = [];
            
            if (this.components.serverHealth && this.components.serverHealth.loadServerHealth) {
                refreshPromises.push(this.components.serverHealth.loadServerHealth());
            }
            
            if (this.components.databaseHealth && this.components.databaseHealth.loadDatabaseHealth) {
                refreshPromises.push(this.components.databaseHealth.loadDatabaseHealth());
            }
            
            if (this.components.serverLogs && this.components.serverLogs.loadServerLogs) {
                refreshPromises.push(this.components.serverLogs.loadServerLogs());
            }
            
            if (this.components.realtimeAnalytics && this.components.realtimeAnalytics.loadInitialData) {
                refreshPromises.push(this.components.realtimeAnalytics.loadInitialData());
            }
            
            await Promise.allSettled(refreshPromises);
            
            this.updateLastUpdateTime();
            this.showSuccess('All monitoring data refreshed successfully');
            
        } catch (error) {
            console.error('Error refreshing components:', error);
            this.showError('Failed to refresh monitoring data');
        } finally {
            this.setButtonLoading(refreshAllBtn, false);
        }
    }
    
    /**
     * Toggle auto refresh
     */
    toggleAutoRefresh() {
        const autoRefreshBtn = document.getElementById('auto-refresh-toggle');
        
        if (this.autoRefreshEnabled) {
            this.disableAutoRefresh();
            if (autoRefreshBtn) {
                autoRefreshBtn.innerHTML = '<i class="fas fa-play"></i> Auto Refresh';
                autoRefreshBtn.classList.remove('btn-success');
                autoRefreshBtn.classList.add('btn-outline-secondary');
            }
        } else {
            this.enableAutoRefresh();
            if (autoRefreshBtn) {
                autoRefreshBtn.innerHTML = '<i class="fas fa-pause"></i> Auto Refresh';
                autoRefreshBtn.classList.remove('btn-outline-secondary');
                autoRefreshBtn.classList.add('btn-success');
            }
        }
    }
    
    /**
     * Enable auto refresh
     */
    enableAutoRefresh() {
        this.disableAutoRefresh(); // Clear any existing interval
        
        this.autoRefreshEnabled = true;
        this.autoRefreshInterval = setInterval(() => {
            this.refreshAllComponents();
        }, this.refreshFrequency);
        
        console.log('Auto refresh enabled');
    }
    
    /**
     * Disable auto refresh
     */
    disableAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        this.autoRefreshEnabled = false;
        
        console.log('Auto refresh disabled');
    }
    
    /**
     * Setup auto refresh based on user preference or default
     */
    setupAutoRefresh() {
        // Check if auto refresh should be enabled by default
        const shouldAutoRefresh = this.getAutoRefreshPreference();
        
        if (shouldAutoRefresh) {
            this.enableAutoRefresh();
            const autoRefreshBtn = document.getElementById('auto-refresh-toggle');
            if (autoRefreshBtn) {
                autoRefreshBtn.innerHTML = '<i class="fas fa-pause"></i> Auto Refresh';
                autoRefreshBtn.classList.remove('btn-outline-secondary');
                autoRefreshBtn.classList.add('btn-success');
            }
        }
    }
    
    /**
     * Get auto refresh preference from localStorage
     */
    getAutoRefreshPreference() {
        try {
            const preference = localStorage.getItem('monitor-auto-refresh');
            return preference === 'true';
        } catch (error) {
            return false; // Default to disabled
        }
    }
    
    /**
     * Save auto refresh preference to localStorage
     */
    saveAutoRefreshPreference(enabled) {
        try {
            localStorage.setItem('monitor-auto-refresh', enabled.toString());
        } catch (error) {
            console.warn('Could not save auto refresh preference:', error);
        }
    }
    
    /**
     * Handle page visibility changes
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden, pause auto refresh to save resources
            if (this.autoRefreshEnabled) {
                this.disableAutoRefresh();
                this.wasAutoRefreshEnabled = true;
            }
        } else {
            // Page is visible again, resume auto refresh if it was enabled
            if (this.wasAutoRefreshEnabled) {
                this.enableAutoRefresh();
                this.wasAutoRefreshEnabled = false;
                // Refresh immediately when coming back
                this.refreshAllComponents();
            }
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
     * Get current environment ID
     */
    getCurrentEnvironmentId() {
        return this.currentEnvironmentId;
    }
    
    /**
     * Update environment
     */
    setEnvironment(environmentId) {
        this.currentEnvironmentId = environmentId;
        
        if (window.monitorApi) {
            window.monitorApi.setEnvironment(environmentId);
        }
        
        this.updateEnvironmentIndicator();
        this.refreshAllComponents();
    }
    
    /**
     * Export all monitoring data
     */
    async exportMonitoringData() {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                environmentId: this.currentEnvironmentId,
                serverHealth: window.monitorApi.getMockServerHealth(),
                databaseHealth: window.monitorApi.getMockDatabaseHealth(),
                logs: window.monitorApi.getMockServerLogs(100)
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `monitoring-data-${this.currentEnvironmentId}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showSuccess('Monitoring data exported successfully');
        } catch (error) {
            console.error('Error exporting monitoring data:', error);
            this.showError('Failed to export monitoring data');
        }
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        this.disableAutoRefresh();
        
        // Save current auto refresh preference
        this.saveAutoRefreshPreference(this.autoRefreshEnabled);
        
        // Cleanup components
        Object.values(this.components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });
    }
}

// Initialize monitor controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.monitorController = new MonitorController();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.monitorController) {
        window.monitorController.cleanup();
    }
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonitorController;
}