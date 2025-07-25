/**
 * Environment Selector Component
 * Dropdown component for switching between environments in the header
 */

class EnvironmentSelector {
    constructor() {
        this.dropdown = null;
        this.currentEnvDisplay = null;
        this.dropdownMenu = null;
        this.environments = [];
        this.currentEnvironment = null;
        
        this.init();
    }
    
    init() {
        this.dropdown = document.getElementById('environmentSelector');
        this.currentEnvDisplay = document.getElementById('current-env-name');
        this.dropdownMenu = document.getElementById('environment-dropdown');
        
        if (!this.dropdown || !this.currentEnvDisplay || !this.dropdownMenu) {
            console.warn('Environment selector elements not found');
            return;
        }
        
        this.setupEventListeners();
        this.loadEnvironments();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Listen for environment context changes
        if (window.environmentContext) {
            window.environmentContext.addEventListener((event, data) => {
                switch (event) {
                    case 'environmentsLoaded':
                        this.environments = data;
                        this.render();
                        break;
                    case 'environmentChanged':
                        this.currentEnvironment = data.current;
                        this.updateCurrentDisplay();
                        break;
                    case 'environmentAdded':
                        this.addEnvironmentToDropdown(data);
                        break;
                    case 'environmentUpdated':
                        this.updateEnvironmentInDropdown(data);
                        break;
                    case 'environmentRemoved':
                        this.removeEnvironmentFromDropdown(data);
                        break;
                }
            });
        }
        
        // Handle dropdown item clicks through event delegation
        this.dropdownMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.environment-item');
            if (item && !item.classList.contains('active')) {
                const environmentId = parseInt(item.dataset.environmentId);
                this.selectEnvironment(environmentId);
            }
        });
    }
    
    /**
     * Load environments
     */
    async loadEnvironments() {
        try {
            if (window.environmentContext) {
                await window.environmentContext.init();
                this.environments = window.environmentContext.getEnvironments();
                this.currentEnvironment = window.environmentContext.getCurrentEnvironment();
                this.render();
            }
        } catch (error) {
            console.error('Failed to load environments for selector:', error);
            this.showError();
        }
    }
    
    /**
     * Render the environment dropdown
     */
    render() {
        if (this.environments.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        this.dropdownMenu.innerHTML = this.environments
            .map(env => this.renderEnvironmentItem(env))
            .join('');
        
        this.updateCurrentDisplay();
    }
    
    /**
     * Render empty state
     */
    renderEmptyState() {
        this.dropdownMenu.innerHTML = `
            <li><span class="dropdown-item-text text-muted">No environments available</span></li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <a class="dropdown-item" href="/medproadmin/environments/">
                    <i class="fas fa-plus"></i> Manage Environments
                </a>
            </li>
        `;
        
        this.currentEnvDisplay.textContent = 'No Environment';
    }
    
    /**
     * Render individual environment item
     */
    renderEnvironmentItem(env) {
        const isActive = this.currentEnvironment && this.currentEnvironment.id === env.id;
        const activeClass = isActive ? 'active' : '';
        
        return `
            <li>
                <a class="dropdown-item environment-item ${activeClass}" 
                   href="#" 
                   data-environment-id="${env.id}">
                    <div class="environment-icon ${env.color_theme || 'blue'}">
                        <i class="fas fa-${env.icon || 'server'}"></i>
                    </div>
                    <div class="environment-info">
                        <div class="environment-name">
                            ${this.escapeHtml(env.display_name)}
                            ${env.is_default ? '<span class="default-indicator">DEFAULT</span>' : ''}
                        </div>
                        <div class="environment-type">${env.env_type.toUpperCase()}</div>
                    </div>
                    ${isActive ? '<i class="fas fa-check text-primary ms-auto"></i>' : ''}
                </a>
            </li>
        `;
    }
    
    /**
     * Update current environment display
     */
    updateCurrentDisplay() {
        if (!this.currentEnvironment) {
            this.currentEnvDisplay.textContent = 'No Environment';
            this.dropdown.className = 'btn btn-sm btn-outline-light dropdown-toggle';
            return;
        }
        
        const env = this.currentEnvironment;
        this.currentEnvDisplay.textContent = env.display_name;
        
        // Update button style based on environment type
        const themeClass = this.getEnvironmentThemeClass(env.env_type);
        this.dropdown.className = `btn btn-sm ${themeClass} dropdown-toggle`;
        
        // Update icon in the dropdown button if needed
        const icon = this.dropdown.querySelector('i');
        if (icon) {
            icon.className = `fas fa-${env.icon || 'server'}`;
        }
    }
    
    /**
     * Get theme class for environment type
     */
    getEnvironmentThemeClass(envType) {
        const themes = {
            production: 'btn-danger',
            test: 'btn-warning',
            development: 'btn-success',
            nqa: 'btn-info'
        };
        
        return themes[envType] || 'btn-outline-light';
    }
    
    /**
     * Select environment
     */
    async selectEnvironment(environmentId) {
        try {
            if (window.environmentContext) {
                const success = window.environmentContext.setCurrentEnvironment(environmentId);
                
                if (success) {
                    // Log environment switch
                    this.logEnvironmentSwitch(environmentId);
                    
                    // Show success message
                    const env = window.environmentContext.getEnvironmentById(environmentId);
                    showToast(`Switched to ${env.display_name}`, 'success');
                    
                    // Update other components if needed
                    this.notifyEnvironmentChange(env);
                } else {
                    showToast('Failed to switch environment', 'error');
                }
            }
        } catch (error) {
            console.error('Failed to select environment:', error);
            showToast('Failed to switch environment', 'error');
        }
    }
    
    /**
     * Log environment switch for audit
     */
    async logEnvironmentSwitch(environmentId) {
        try {
            // This could be enhanced to send an API call to log the environment switch
            console.log(`Environment switched to ID: ${environmentId}`);
        } catch (error) {
            console.warn('Failed to log environment switch:', error);
        }
    }
    
    /**
     * Notify other components of environment change
     */
    notifyEnvironmentChange(environment) {
        // Dispatch custom event for other components to listen to
        const event = new CustomEvent('environmentChanged', {
            detail: { environment }
        });
        document.dispatchEvent(event);
        
        // Update page title or other UI elements if needed
        this.updatePageContext(environment);
    }
    
    /**
     * Update page context based on selected environment
     */
    updatePageContext(environment) {
        // Update page title
        const originalTitle = document.title.replace(/ - .*$/, '');
        document.title = `${originalTitle} - ${environment.display_name}`;
        
        // Add environment indicator to body class
        document.body.className = document.body.className.replace(/\benvironment-\w+\b/g, '');
        document.body.classList.add(`environment-${environment.env_type}`);
    }
    
    /**
     * Add environment to dropdown
     */
    addEnvironmentToDropdown(environment) {
        this.environments.push(environment);
        this.render();
    }
    
    /**
     * Update environment in dropdown
     */
    updateEnvironmentInDropdown(environment) {
        const index = this.environments.findIndex(env => env.id === environment.id);
        if (index !== -1) {
            this.environments[index] = environment;
            this.render();
        }
    }
    
    /**
     * Remove environment from dropdown
     */
    removeEnvironmentFromDropdown(environment) {
        this.environments = this.environments.filter(env => env.id !== environment.id);
        this.render();
    }
    
    /**
     * Show error state
     */
    showError() {
        this.dropdownMenu.innerHTML = `
            <li><span class="dropdown-item-text text-danger">Failed to load environments</span></li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <a class="dropdown-item" href="#" onclick="location.reload()">
                    <i class="fas fa-refresh"></i> Retry
                </a>
            </li>
        `;
        
        this.currentEnvDisplay.textContent = 'Error';
    }
    
    /**
     * Refresh environments
     */
    async refresh() {
        try {
            if (window.environmentContext) {
                await window.environmentContext.refresh();
            }
        } catch (error) {
            console.error('Failed to refresh environments:', error);
            this.showError();
        }
    }
    
    /**
     * Get current environment info for other components
     */
    getCurrentEnvironment() {
        return this.currentEnvironment;
    }
    
    /**
     * Check if environment selector is available
     */
    isAvailable() {
        return this.dropdown && this.environments.length > 0;
    }
    
    /**
     * Show/hide environment selector
     */
    setVisible(visible) {
        const container = this.dropdown.closest('.environment-selector-container');
        if (container) {
            container.style.display = visible ? 'inline-block' : 'none';
        }
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
}

// Initialize environment selector when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the selector elements exist
    const selectorElement = document.getElementById('environmentSelector');
    if (selectorElement) {
        window.environmentSelector = new EnvironmentSelector();
    }
});

// Export class for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentSelector;
}