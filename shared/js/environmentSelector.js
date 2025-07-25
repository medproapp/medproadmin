/**
 * Environment Selector Component
 * Provides a dropdown interface for changing the current MedPro environment
 */

class EnvironmentSelector {
    constructor() {
        this.isOpen = false;
        this.dropdown = null;
        this.environmentContext = window.environmentContext;
        
        this.init();
    }
    
    init() {
        // Try to setup immediately in case everything is ready
        this.trySetupSelector();
        
        // Also listen for environment context events
        if (this.environmentContext) {
            this.environmentContext.addEventListener((event) => {
                if (event === 'initialized' || event === 'environmentsLoaded') {
                    this.trySetupSelector();
                }
                if (event === 'environmentChanged') {
                    this.updateDisplay();
                }
            });
        }
        
        // Bind global click handler to close dropdown
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.environment-context-display')) {
                this.closeDropdown();
            }
        });
        
        // Fallback: try again after a short delay in case DOM is still loading
        setTimeout(() => {
            this.trySetupSelector();
        }, 100);
    }
    
    trySetupSelector() {
        const medproEnvBadge = document.getElementById('medpro-env-display');
        
        // Only setup if we have the badge and haven't setup yet
        if (medproEnvBadge && !medproEnvBadge.classList.contains('clickable')) {
            this.setupSelector();
        }
    }
    
    setupSelector() {
        const medproEnvBadge = document.getElementById('medpro-env-display');
        
        if (medproEnvBadge) {
            // Make the badge clickable
            medproEnvBadge.classList.add('clickable');
            medproEnvBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
            
            // Create dropdown
            this.createDropdown();
            
            // Update initial display
            this.updateDisplay();
        }
    }
    
    createDropdown() {
        const contextDisplay = document.querySelector('.environment-context-display');
        
        if (!contextDisplay) {
            return;
        }
        
        // Create dropdown container
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'environment-selector-dropdown';
        this.dropdown.id = 'environment-selector-dropdown';
        
        contextDisplay.appendChild(this.dropdown);
        
        this.renderDropdownContent();
    }
    
    renderDropdownContent() {
        if (!this.dropdown || !this.environmentContext) return;
        
        const environments = this.environmentContext.getEnvironments();
        const currentEnv = this.environmentContext.getCurrentEnvironment();
        
        this.dropdown.innerHTML = '';
        
        if (environments.length === 0) {
            this.dropdown.innerHTML = `
                <div class="p-3 text-center text-muted">
                    <i class="fas fa-info-circle mb-2"></i>
                    <p class="mb-0">No environments available</p>
                </div>
            `;
            return;
        }
        
        // Add header
        const header = document.createElement('div');
        header.className = 'p-2 border-bottom bg-light';
        header.innerHTML = `
            <small class="text-muted text-uppercase fw-bold">
                <i class="fas fa-server me-1"></i>
                Select MedPro Environment
            </small>
        `;
        this.dropdown.appendChild(header);
        
        // Add environments
        environments.forEach(env => {
            const option = this.createEnvironmentOption(env, currentEnv);
            this.dropdown.appendChild(option);
        });
        
        // Add footer with manage link
        const footer = document.createElement('div');
        footer.className = 'p-2 border-top bg-light';
        footer.innerHTML = `
            <a href="/medproadmin/environments/" class="btn btn-sm btn-outline-primary w-100">
                <i class="fas fa-cog me-1"></i>
                Manage Environments
            </a>
        `;
        this.dropdown.appendChild(footer);
    }
    
    createEnvironmentOption(env, currentEnv) {
        const option = document.createElement('div');
        option.className = `environment-option${currentEnv && currentEnv.id === env.id ? ' active' : ''}`;
        option.dataset.environmentId = env.id;
        
        // Get icon and theme classes
        const iconClass = `fa-${env.icon || 'server'}`;
        const themeClass = env.color_theme || 'blue';
        
        option.innerHTML = `
            <div class="environment-option-icon ${themeClass}" style="background: ${this.getThemeGradient(themeClass)}">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="environment-option-info">
                <div class="environment-option-name">${env.display_name}</div>
                <div class="environment-option-type">${env.env_type}</div>
            </div>
            ${env.is_default ? '<div class="environment-option-status default">Default</div>' : ''}
        `;
        
        // Add click handler
        option.addEventListener('click', () => {
            this.selectEnvironment(env.id);
        });
        
        return option;
    }
    
    getThemeGradient(theme) {
        const gradients = {
            'red': 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
            'yellow': 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)',
            'green': 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
            'blue': 'linear-gradient(135deg, #0d6efd 0%, #0056b3 100%)',
            'purple': 'linear-gradient(135deg, #6f42c1 0%, #5a2d91 100%)',
            'gray': 'linear-gradient(135deg, #6c757d 0%, #545b62 100%)'
        };
        
        return gradients[theme] || gradients.blue;
    }
    
    selectEnvironment(environmentId) {
        if (this.environmentContext) {
            const success = this.environmentContext.setCurrentEnvironment(environmentId);
            
            if (success) {
                this.closeDropdown();
                this.showNotification('Environment changed successfully', 'success');
            } else {
                this.showNotification('Failed to change environment', 'error');
            }
        }
    }
    
    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }
    
    openDropdown() {
        if (!this.dropdown) return;
        
        // Refresh dropdown content
        this.renderDropdownContent();
        
        this.dropdown.classList.add('show');
        this.isOpen = true;
        
        // Add escape key handler
        document.addEventListener('keydown', this.handleEscapeKey.bind(this));
    }
    
    closeDropdown() {
        if (!this.dropdown) return;
        
        this.dropdown.classList.remove('show');
        this.isOpen = false;
        
        // Remove escape key handler
        document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
    }
    
    handleEscapeKey(e) {
        if (e.key === 'Escape') {
            this.closeDropdown();
        }
    }
    
    updateDisplay() {
        const medproEnvName = document.getElementById('medpro-env-name');
        const medproEnvDisplay = document.getElementById('medpro-env-display');
        
        if (!medproEnvName || !medproEnvDisplay || !this.environmentContext) return;
        
        const currentEnv = this.environmentContext.getCurrentEnvironment();
        
        if (currentEnv) {
            medproEnvName.textContent = currentEnv.display_name;
            
            // Update badge style based on environment type
            medproEnvDisplay.className = `environment-badge medpro-env clickable ${currentEnv.env_type}`;
        } else {
            medproEnvName.textContent = 'No Environment';
            medproEnvDisplay.className = 'environment-badge medpro-env clickable';
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 80px; right: 20px; z-index: 10000; min-width: 300px;';
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    // Refresh environments (useful after creating/updating environments)
    async refresh() {
        if (this.environmentContext) {
            try {
                await this.environmentContext.refresh();
                this.renderDropdownContent();
                this.updateDisplay();
            } catch (error) {
                console.error('Failed to refresh environments:', error);
                this.showNotification('Failed to refresh environments', 'error');
            }
        }
    }
}

// Initialize environment selector when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load
    setTimeout(() => {
        window.environmentSelector = new EnvironmentSelector();
    }, 200);
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentSelector;
}