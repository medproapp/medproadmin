/**
 * Server Logs Component
 * Handles server logs display and management
 */

class ServerLogs {
    constructor() {
        this.container = document.getElementById('log-container');
        this.refreshButton = document.getElementById('refresh-logs-btn');
        this.clearButton = document.getElementById('clear-logs-btn');
        this.autoScrollButton = document.getElementById('auto-scroll-toggle');
        this.levelFilter = document.getElementById('log-level-filter');
        
        this.logs = [];
        this.filteredLogs = [];
        this.maxLogs = 1000;
        this.autoScroll = true;
        this.autoRefreshEnabled = false;
        this.updateInterval = null;
        this.currentFilter = '';
        
        this.init();
    }
    
    /**
     * Initialize the server logs component
     */
    init() {
        this.attachEventListeners();
        this.loadServerLogs();
        this.startAutoRefresh();
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', () => {
                this.refreshLogs();
            });
        }
        
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearLogs();
            });
        }
        
        if (this.autoScrollButton) {
            this.autoScrollButton.addEventListener('click', () => {
                this.toggleAutoScroll();
            });
        }
        
        if (this.levelFilter) {
            this.levelFilter.addEventListener('change', (e) => {
                this.setLevelFilter(e.target.value);
            });
        }
        
        // Manual scroll detection
        if (this.container) {
            this.container.addEventListener('scroll', () => {
                this.checkScrollPosition();
            });
        }
    }
    
    /**
     * Load server logs
     */
    async loadServerLogs() {
        if (!this.container) return;
        
        try {
            // Get real server logs data
            const logResponse = await window.monitorApi.getServerLogs(null, { lines: 50 });
            
            // Check if environment is not configured and stop auto-refresh
            if (logResponse && logResponse.message === 'Environment not configured') {
                this.stopAutoRefresh();
                this.showMessage('No environment selected for monitoring', 'info');
                return;
            }
            
            // Add new logs to existing logs
            this.logs = [...logResponse, ...this.logs].slice(0, this.maxLogs);
            
            this.applyFilter();
            this.renderLogs();
            
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('Error loading server logs:', error);
            this.showError('Failed to load server logs: ' + error.message);
            // Stop auto-refresh on error to prevent spam
            this.stopAutoRefresh();
        }
    }
    
    /**
     * Refresh logs manually
     */
    async refreshLogs() {
        try {
            this.setButtonLoading(this.refreshButton, true);
            await this.loadServerLogs();
        } finally {
            this.setButtonLoading(this.refreshButton, false);
        }
    }
    
    /**
     * Clear all logs
     */
    clearLogs() {
        if (confirm('Are you sure you want to clear all logs?')) {
            this.logs = [];
            this.filteredLogs = [];
            this.renderLogs();
        }
    }
    
    /**
     * Toggle auto scroll
     */
    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        
        if (this.autoScrollButton) {
            const icon = this.autoScrollButton.querySelector('i');
            if (this.autoScroll) {
                this.autoScrollButton.classList.add('btn-success');
                this.autoScrollButton.classList.remove('btn-outline-success');
                if (icon) icon.classList.add('fa-arrow-down');
                this.scrollToBottom();
            } else {
                this.autoScrollButton.classList.remove('btn-success');
                this.autoScrollButton.classList.add('btn-outline-success');
                if (icon) icon.classList.remove('fa-arrow-down');
            }
        }
    }
    
    /**
     * Set log level filter
     */
    setLevelFilter(level) {
        this.currentFilter = level;
        this.applyFilter();
        this.renderLogs();
        
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }
    
    /**
     * Apply current filter to logs
     */
    applyFilter() {
        if (!this.currentFilter) {
            this.filteredLogs = [...this.logs];
        } else {
            this.filteredLogs = this.logs.filter(log => log.level === this.currentFilter);
        }
    }
    
    /**
     * Check scroll position to determine if auto-scroll should be enabled
     */
    checkScrollPosition() {
        if (!this.container) return;
        
        const isAtBottom = this.container.scrollTop + this.container.clientHeight >= 
                          this.container.scrollHeight - 50; // 50px tolerance
        
        if (!isAtBottom && this.autoScroll) {
            // User scrolled up, disable auto-scroll
            this.autoScroll = false;
            if (this.autoScrollButton) {
                this.autoScrollButton.classList.remove('btn-success');
                this.autoScrollButton.classList.add('btn-outline-success');
            }
        }
    }
    
    /**
     * Scroll to bottom of log container
     */
    scrollToBottom() {
        if (this.container) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }
    
    /**
     * Show error state
     */
    showError(message) {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="log-entry error">
                <span class="log-timestamp">${new Date().toISOString()}</span>
                <span class="log-level error">ERROR</span>
                <span class="log-message">${this.escapeHtml(message)}</span>
            </div>
        `;
    }
    
    /**
     * Render logs in the container
     */
    renderLogs() {
        if (!this.container) return;
        
        if (this.filteredLogs.length === 0) {
            this.container.innerHTML = `
                <div class="log-entry info">
                    <span class="log-timestamp">${new Date().toISOString()}</span>
                    <span class="log-level info">INFO</span>
                    <span class="log-message">No logs available${this.currentFilter ? ` for level: ${this.currentFilter}` : ''}</span>
                </div>
            `;
            return;
        }
        
        const logsHtml = this.filteredLogs.map(log => this.renderLogEntry(log)).join('');
        this.container.innerHTML = logsHtml;
    }
    
    /**
     * Render individual log entry
     */
    renderLogEntry(log) {
        const timestamp = new Date(log.timestamp);
        const timeString = timestamp.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const dateString = timestamp.toLocaleDateString('en-US', { 
            month: '2-digit', 
            day: '2-digit' 
        });
        
        return `
            <div class="log-entry ${log.level}" data-level="${log.level}">
                <span class="log-timestamp">${dateString} ${timeString}</span>
                <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                <span class="log-component text-muted">[${log.component}]</span>
                ${log.requestId ? `<span class="log-request-id text-muted">(${log.requestId})</span>` : ''}
                ${log.userId ? `<span class="log-user-id text-info">{user: ${log.userId}}</span>` : ''}
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `;
    }
    
    /**
     * Start auto refresh
     */
    startAutoRefresh(interval = 5000) {
        this.stopAutoRefresh();
        this.autoRefreshEnabled = true;
        this.updateInterval = setInterval(() => {
            this.loadServerLogs();
        }, interval);
    }
    
    /**
     * Stop auto refresh
     */
    stopAutoRefresh() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.autoRefreshEnabled = false;
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
     * Export logs as text file
     */
    exportLogs() {
        const logText = this.filteredLogs.map(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            return `[${timestamp}] ${log.level.toUpperCase()} [${log.component}] ${log.message}`;
        }).join('\n');
        
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `server-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Search logs
     */
    searchLogs(query) {
        if (!query) {
            this.applyFilter();
        } else {
            const searchResults = this.logs.filter(log => 
                log.message.toLowerCase().includes(query.toLowerCase()) ||
                log.component.toLowerCase().includes(query.toLowerCase()) ||
                (log.requestId && log.requestId.toLowerCase().includes(query.toLowerCase()))
            );
            
            this.filteredLogs = this.currentFilter ? 
                searchResults.filter(log => log.level === this.currentFilter) : 
                searchResults;
        }
        
        this.renderLogs();
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }
    
    /**
     * Get log statistics
     */
    getLogStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {}
        };
        
        this.logs.forEach(log => {
            if (!stats.byLevel[log.level]) {
                stats.byLevel[log.level] = 0;
            }
            stats.byLevel[log.level]++;
        });
        
        return stats;
    }
    
    /**
     * Destroy component
     */
    destroy() {
        this.stopAutoRefresh();
    }
}

// Manual initialization - called by monitor controller
window.initServerLogs = function() {
    if (!window.serverLogs) {
        window.serverLogs = new ServerLogs();
    }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerLogs;
}