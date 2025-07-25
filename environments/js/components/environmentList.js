/**
 * Environment List Component
 * Manages the display and interactions of the environment list
 */

class EnvironmentList {
    constructor(container) {
        this.container = container;
        this.environments = [];
        this.loading = false;
        
        this.init();
    }
    
    init() {
        this.loadEnvironments();
        this.setupEventListeners();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Listen for environment context changes
        if (window.environmentContext) {
            window.environmentContext.addEventListener((event, data) => {
                switch (event) {
                    case 'environmentAdded':
                        this.addEnvironmentToList(data);
                        break;
                    case 'environmentUpdated':
                        this.updateEnvironmentInList(data);
                        break;
                    case 'environmentRemoved':
                        this.removeEnvironmentFromList(data);
                        break;
                    case 'refreshed':
                        this.loadEnvironments();
                        break;
                }
            });
        }
        
        // Event delegation for environment action buttons
        this.container.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            const envId = e.target.closest('[data-env-id]')?.dataset.envId;
            
            if (!action) return;
            
            switch (action) {
                case 'test-connection':
                    if (envId && window.connectionTest) {
                        window.connectionTest.testEnvironment(parseInt(envId));
                    }
                    break;
                case 'monitor-environment':
                    if (envId) {
                        this.showEnvironmentMonitoring(parseInt(envId));
                    }
                    break;
                case 'edit-environment':
                    if (envId && window.environmentEditor) {
                        window.environmentEditor.showEditModal(parseInt(envId));
                    }
                    break;
                case 'set-default':
                    if (envId) {
                        this.setDefaultEnvironment(parseInt(envId));
                    }
                    break;
                case 'delete-environment':
                    if (envId) {
                        this.deleteEnvironment(parseInt(envId));
                    }
                    break;
            }
        });
    }
    
    /**
     * Load environments from API
     */
    async loadEnvironments() {
        this.setLoading(true);
        
        try {
            this.environments = await environmentApi.getEnvironments();
            this.render();
            this.hideError();
        } catch (error) {
            console.error('Failed to load environments:', error);
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    /**
     * Set loading state
     */
    setLoading(loading) {
        this.loading = loading;
        const loadingContainer = document.getElementById('loading-container');
        const errorContainer = document.getElementById('error-container');
        
        if (loading) {
            loadingContainer.classList.remove('d-none');
            errorContainer.classList.add('d-none');
            this.container.innerHTML = '';
        } else {
            loadingContainer.classList.add('d-none');
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        
        errorMessage.textContent = message;
        errorContainer.classList.remove('d-none');
        this.container.innerHTML = '';
    }
    
    /**
     * Hide error message
     */
    hideError() {
        const errorContainer = document.getElementById('error-container');
        errorContainer.classList.add('d-none');
    }
    
    /**
     * Render the environment list
     */
    render() {
        if (this.environments.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        this.container.innerHTML = this.environments
            .map(env => this.renderEnvironmentCard(env))
            .join('');
        
        this.attachEventListeners();
    }
    
    /**
     * Render empty state
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-server"></i>
                <h5>No Environments Found</h5>
                <p>Get started by creating your first environment.</p>
                <button class="btn btn-primary" data-action="create-environment">
                    <i class="fas fa-plus"></i> Create Environment
                </button>
            </div>
        `;
        
        // Add event listener for create button
        const createBtn = this.container.querySelector('[data-action="create-environment"]');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                if (window.environmentEditor) {
                    window.environmentEditor.showCreateModal();
                }
            });
        }
    }
    
    /**
     * Render individual environment card
     */
    renderEnvironmentCard(env) {
        const isDefault = env.is_default;
        const cardClass = isDefault ? 'environment-card default-environment' : 'environment-card';
        
        return `
            <div class="${cardClass}" data-environment-id="${env.id}">
                <div class="card-header ${isDefault ? '' : 'bg-light'}">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <div class="d-flex align-items-center">
                                <div class="environment-icon ${env.color_theme || 'blue'}">
                                    <i class="fas fa-${env.icon || 'server'}"></i>
                                </div>
                                <div>
                                    <h6 class="mb-1 ${isDefault ? 'text-white' : ''}">
                                        ${this.escapeHtml(env.display_name)}
                                        ${isDefault ? '<span class="default-indicator">DEFAULT</span>' : ''}
                                    </h6>
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="environment-type-badge badge ${env.env_type}">
                                            ${env.env_type.toUpperCase()}
                                        </span>
                                        <span class="status-indicator ${env.is_active ? 'active' : 'inactive'}"></span>
                                        <small class="${isDefault ? 'text-white-50' : 'text-muted'}">
                                            ${this.escapeHtml(env.env_name)}
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 text-end">
                            <div class="environment-actions">
                                <button class="btn btn-sm btn-outline-${isDefault ? 'light' : 'primary'}" 
                                        data-action="test-connection" data-env-id="${env.id}"
                                        title="Test Connection">
                                    <i class="fas fa-plug"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-${isDefault ? 'light' : 'info'}" 
                                        data-action="monitor-environment" data-env-id="${env.id}"
                                        title="Monitor Environment">
                                    <i class="fas fa-chart-line"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-${isDefault ? 'light' : 'secondary'}" 
                                        data-action="edit-environment" data-env-id="${env.id}"
                                        title="Edit Environment">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ${!isDefault ? `
                                    <button class="btn btn-sm btn-outline-warning" 
                                            data-action="set-default" data-env-id="${env.id}"
                                            title="Set as Default Environment">
                                        <i class="fas fa-star"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" 
                                            data-action="delete-environment" data-env-id="${env.id}"
                                            title="Delete Environment">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="environment-meta">
                                <div class="mb-2">
                                    <i class="fas fa-info-circle"></i>
                                    <strong>Description:</strong>
                                    <span>${this.escapeHtml(env.description) || 'No description'}</span>
                                </div>
                                <div class="mb-2">
                                    <i class="fas fa-database"></i>
                                    <strong>Database:</strong>
                                    <span>${this.escapeHtml(env.db_name)} @ ${this.escapeHtml(env.db_host)}:${env.db_port}</span>
                                </div>
                                <div class="mb-2">
                                    <i class="fas fa-user"></i>
                                    <strong>User:</strong>
                                    <span>${this.escapeHtml(env.db_user)}</span>
                                </div>
                                <div class="mb-2">
                                    <i class="fas fa-server"></i>
                                    <strong>Server:</strong>
                                    <span>${this.escapeHtml(env.server_host || env.db_host || 'Unknown')}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="environment-meta">
                                ${env.api_base_url ? `
                                    <div class="mb-2">
                                        <i class="fas fa-network-wired"></i>
                                        <strong>API URL:</strong>
                                        <span>${this.escapeHtml(env.api_base_url)}</span>
                                    </div>
                                ` : ''}
                                <div class="mb-2">
                                    <i class="fas fa-calendar"></i>
                                    <strong>Created:</strong>
                                    <span>${this.formatDate(env.created_at)}</span>
                                </div>
                                <div class="mb-2">
                                    <i class="fas fa-clock"></i>
                                    <strong>Updated:</strong>
                                    <span>${this.formatDate(env.updated_at)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Connection Status -->
                    <div class="mt-3">
                        <div class="connection-status-container" id="connection-status-${env.id}">
                            <!-- Connection status will be displayed here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Attach event listeners to rendered elements
     */
    attachEventListeners() {
        // Event listeners are handled by global functions for simplicity
        // In a more complex app, you might want to use proper event delegation
    }
    
    /**
     * Add environment to list
     */
    addEnvironmentToList(environment) {
        this.environments.push(environment);
        this.render();
    }
    
    /**
     * Update environment in list
     */
    updateEnvironmentInList(environment) {
        const index = this.environments.findIndex(env => env.id === environment.id);
        if (index !== -1) {
            this.environments[index] = environment;
            this.render();
        }
    }
    
    /**
     * Remove environment from list
     */
    removeEnvironmentFromList(environment) {
        this.environments = this.environments.filter(env => env.id !== environment.id);
        this.render();
    }
    
    /**
     * Refresh the environment list
     */
    async refresh() {
        await this.loadEnvironments();
    }
    
    /**
     * Delete environment with confirmation
     */
    async deleteEnvironment(environmentId) {
        const environment = this.environments.find(env => env.id === environmentId);
        if (!environment) return;
        
        if (!confirm(`Are you sure you want to delete the environment "${environment.display_name}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            await environmentApi.deleteEnvironment(environmentId);
            this.removeEnvironmentFromList(environment);
            
            // Notify environment context
            if (window.environmentContext) {
                window.environmentContext.handleEnvironmentRemoved(environment);
            }
            
            if (window.showToast) {
                window.showToast('Environment deleted successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to delete environment:', error);
            if (window.showToast) {
                window.showToast('Failed to delete environment: ' + error.message, 'error');
            }
        }
    }
    
    /**
     * Set environment as default
     */
    async setDefaultEnvironment(environmentId) {
        try {
            // Find the environment
            const environment = this.environments.find(env => env.id === environmentId);
            if (!environment) {
                throw new Error('Environment not found');
            }
            
            // Confirm action
            const confirmMessage = `Set "${environment.display_name}" as the default environment?`;
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // Update only the is_default field
            const updateData = {
                is_default: true
            };
            
            // Call API to update
            await environmentApi.updateEnvironment(environmentId, updateData);
            
            // Update all environments in list (set others to non-default)
            this.environments.forEach(env => {
                env.is_default = (env.id === environmentId);
            });
            
            // Re-render the list
            this.render();
            
            // Update environment context if available
            if (window.environmentContext) {
                window.environmentContext.setDefaultEnvironment(environmentId);
            }
            
            if (window.showToast) {
                window.showToast(`"${environment.display_name}" is now the default environment`, 'success');
            }
        } catch (error) {
            console.error('Failed to set default environment:', error);
            if (window.showToast) {
                window.showToast('Failed to set default environment: ' + error.message, 'error');
            }
        }
    }
    
    /**
     * Show environment monitoring interface
     */
    async showEnvironmentMonitoring(environmentId) {
        try {
            // Find the environment
            const environment = this.environments.find(env => env.id === environmentId);
            if (!environment) {
                throw new Error('Environment not found');
            }
            
            // Redirect to the dedicated monitoring page
            window.location.href = `monitor.html?env=${environmentId}`;
            
        } catch (error) {
            console.error('Failed to show environment monitoring:', error);
            if (window.showToast) {
                window.showToast('Failed to load monitoring: ' + error.message, 'error');
            }
        }
    }
    
    /**
     * Create monitoring modal
     */
    createMonitoringModal(environment) {
        // Remove existing modal if any
        const existingModal = document.getElementById('environment-monitoring-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal fade" id="environment-monitoring-modal" tabindex="-1" aria-labelledby="monitoringModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="monitoringModalLabel">
                                <i class="fas fa-chart-line"></i> 
                                Environment Monitoring - ${this.escapeHtml(environment.display_name)}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="monitoring-content">
                                <div class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading monitoring data...</span>
                                    </div>
                                    <p class="mt-2">Loading monitoring data...</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" onclick="window.environmentList.refreshMonitoringData(${environment.id})">
                                <i class="fas fa-sync"></i> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Return Bootstrap modal instance
        const modalElement = document.getElementById('environment-monitoring-modal');
        return new bootstrap.Modal(modalElement);
    }
    
    /**
     * Load monitoring data for environment
     */
    async loadMonitoringData(environment) {
        try {
            const contentContainer = document.getElementById('monitoring-content');
            if (!contentContainer) return;
            
            // Show loading state
            contentContainer.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2">Collecting monitoring data...</p>
                </div>
            `;
            
            // Simulate API call to get monitoring data
            // In reality, this would call a monitoring endpoint
            const monitoringData = await this.fetchMonitoringData(environment);
            
            // Display monitoring data
            this.renderMonitoringData(monitoringData, environment);
            
        } catch (error) {
            console.error('Failed to load monitoring data:', error);
            const contentContainer = document.getElementById('monitoring-content');
            if (contentContainer) {
                contentContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Error loading monitoring data:</strong> ${this.escapeHtml(error.message)}
                    </div>
                `;
            }
        }
    }
    
    /**
     * Fetch monitoring data from API
     */
    async fetchMonitoringData(environment) {
        // For now, return mock data
        // Later this would call actual monitoring endpoints
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
        
        return {
            serverInfo: {
                status: 'online',
                uptime: '5 days, 12 hours',
                version: environment.server_host === 'localhost' ? 'v3.0.0-dev' : 'v3.0.0',
                lastCheck: new Date().toISOString()
            },
            database: {
                status: 'connected',
                connections: Math.floor(Math.random() * 50) + 10,
                queryTime: Math.floor(Math.random() * 50) + 10 + 'ms'
            },
            services: {
                api: { status: 'healthy', responseTime: Math.floor(Math.random() * 100) + 50 + 'ms' },
                email: { status: 'healthy', lastSent: '2 minutes ago' },
                storage: { status: 'healthy', usage: Math.floor(Math.random() * 30) + 20 + '%' }
            },
            metrics: {
                cpu: Math.floor(Math.random() * 40) + 10,
                memory: Math.floor(Math.random() * 60) + 20,
                disk: Math.floor(Math.random() * 50) + 25
            }
        };
    }
    
    /**
     * Render monitoring data in the modal
     */
    renderMonitoringData(data, environment) {
        const contentContainer = document.getElementById('monitoring-content');
        if (!contentContainer) return;
        
        contentContainer.innerHTML = `
            <div class="row">
                <!-- Server Status -->
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-server"></i> Server Status
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-between mb-2">
                                <span>Status:</span>
                                <span class="badge bg-success">${data.serverInfo.status.toUpperCase()}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-2">
                                <span>Uptime:</span>
                                <span>${data.serverInfo.uptime}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-2">
                                <span>Version:</span>
                                <span>${data.serverInfo.version}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Last Check:</span>
                                <span class="small">${new Date(data.serverInfo.lastCheck).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Database Status -->
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-database"></i> Database
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-between mb-2">
                                <span>Status:</span>
                                <span class="badge bg-success">${data.database.status.toUpperCase()}</span>
                            </div>
                            <div class="d-flex justify-content-between mb-2">
                                <span>Connections:</span>
                                <span>${data.database.connections}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Avg Query Time:</span>
                                <span>${data.database.queryTime}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Services -->
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-cogs"></i> Services
                            </h6>
                        </div>
                        <div class="card-body">
                            ${Object.entries(data.services).map(([service, info]) => `
                                <div class="d-flex justify-content-between mb-2">
                                    <span>${service.toUpperCase()}:</span>
                                    <span class="badge bg-success">${info.status.toUpperCase()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <!-- Resource Usage -->
                <div class="col-md-6 mb-4">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="fas fa-chart-pie"></i> Resource Usage
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span>CPU:</span>
                                    <span>${data.metrics.cpu}%</span>
                                </div>
                                <div class="progress">
                                    <div class="progress-bar ${data.metrics.cpu > 80 ? 'bg-danger' : data.metrics.cpu > 60 ? 'bg-warning' : 'bg-success'}" 
                                         style="width: ${data.metrics.cpu}%"></div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span>Memory:</span>
                                    <span>${data.metrics.memory}%</span>
                                </div>
                                <div class="progress">
                                    <div class="progress-bar ${data.metrics.memory > 80 ? 'bg-danger' : data.metrics.memory > 60 ? 'bg-warning' : 'bg-success'}" 
                                         style="width: ${data.metrics.memory}%"></div>
                                </div>
                            </div>
                            <div class="mb-2">
                                <div class="d-flex justify-content-between mb-1">
                                    <span>Disk:</span>
                                    <span>${data.metrics.disk}%</span>
                                </div>
                                <div class="progress">
                                    <div class="progress-bar ${data.metrics.disk > 80 ? 'bg-danger' : data.metrics.disk > 60 ? 'bg-warning' : 'bg-success'}" 
                                         style="width: ${data.metrics.disk}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <strong>Environment:</strong> ${this.escapeHtml(environment.display_name)} 
                (${this.escapeHtml(environment.server_host || environment.db_host)})
            </div>
        `;
    }
    
    /**
     * Refresh monitoring data
     */
    async refreshMonitoringData(environmentId) {
        const environment = this.environments.find(env => env.id === environmentId);
        if (environment) {
            await this.loadMonitoringData(environment);
        }
    }
    
    /**
     * Show connection status for an environment
     */
    showConnectionStatus(environmentId, status) {
        const container = document.getElementById(`connection-status-${environmentId}`);
        if (!container) return;
        
        const statusClass = status.success ? 'success' : 'error';
        const icon = status.success ? 'fa-check-circle' : 'fa-exclamation-circle';
        
        container.innerHTML = `
            <div class="connection-status ${statusClass}">
                <i class="fas ${icon}"></i>
                ${status.message}
            </div>
        `;
        
        // Clear status after 5 seconds
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }
    
    /**
     * Show connection testing status
     */
    showConnectionTesting(environmentId) {
        const container = document.getElementById(`connection-status-${environmentId}`);
        if (!container) return;
        
        container.innerHTML = `
            <div class="connection-status testing">
                <i class="fas fa-spinner fa-spin"></i>
                Testing connection...
            </div>
        `;
    }
    
    /**
     * Utility function to escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Utility function to format dates
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'Invalid date';
        }
    }
}

// Global functions for event handling
window.testEnvironmentConnection = async function(environmentId) {
    const environmentList = window.environmentListInstance;
    if (!environmentList) return;
    
    environmentList.showConnectionTesting(environmentId);
    
    try {
        const result = await environmentApi.testConnection(environmentId);
        environmentList.showConnectionStatus(environmentId, result);
    } catch (error) {
        environmentList.showConnectionStatus(environmentId, {
            success: false,
            message: error.message || 'Connection test failed'
        });
    }
};

window.editEnvironment = function(environmentId) {
    if (window.environmentEditor) {
        window.environmentEditor.editEnvironment(environmentId);
    }
};

window.deleteEnvironment = async function(environmentId) {
    const environment = window.environmentContext?.getEnvironmentById(environmentId);
    if (!environment) return;
    
    const confirmed = confirm(
        `Are you sure you want to delete the environment "${environment.display_name}"?\n\n` +
        'This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    try {
        await environmentApi.deleteEnvironment(environmentId);
        
        // Update context
        if (window.environmentContext) {
            window.environmentContext.removeEnvironment(environmentId);
        }
        
        showToast('Environment deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete environment:', error);
        showToast(error.message || 'Failed to delete environment', 'error');
    }
};

window.loadEnvironments = function() {
    if (window.environmentListInstance) {
        window.environmentListInstance.refresh();
    }
};

// Export class for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentList;
}