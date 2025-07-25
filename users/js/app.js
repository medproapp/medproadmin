/**
 * User Management Application Controller
 * Initializes and coordinates all user management components
 */

class UserApp {
    constructor() {
        this.initialized = false;
        this.currentEnvironmentId = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initializeApp());
            } else {
                this.initializeApp();
            }
        } catch (error) {
            console.error('Error initializing user management app:', error);
        }
    }
    
    async initializeApp() {
        try {
            // Initialize authentication check
            await this.checkAuthentication();
            
            // Initialize environment selector
            await this.initializeEnvironmentSelector();
            
            // Initialize all components
            this.initializeComponents();
            
            // Bind global events
            this.bindGlobalEvents();
            
            // Check for selected environment
            await this.loadSelectedEnvironment();
            
            this.initialized = true;
            
        } catch (error) {
            console.error('Error initializing user management application:', error);
            this.showGlobalError('Failed to initialize application: ' + error.message);
        }
    }
    
    async checkAuthentication() {
        // Check if user is authenticated
        const token = localStorage.getItem('authToken') || localStorage.getItem('adminToken');
        if (!token) {
            window.location.href = '/medproadmin/login.html';
            return;
        }
        
        // Verify token is still valid by making a test request
        try {
            const response = await fetch('/api/v1/environments', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('adminToken');
                window.location.href = '/medproadmin/login.html';
                return;
            }
        } catch (error) {
            console.warn('Auth check failed:', error);
        }
    }
    
    async initializeEnvironmentSelector() {
        // The environment selector is now handled by the shared environmentSelector.js
        // Just listen for environment changes from the global context
        if (window.environmentContext) {
            window.environmentContext.addEventListener((event, data) => {
                if (event === 'environmentChanged') {
                    this.currentEnvironmentId = data.current ? data.current.id : null;
                    this.notifyEnvironmentChange(this.currentEnvironmentId);
                }
            });
        }
    }
    
    
    notifyEnvironmentChange(environmentId) {
        const event = new CustomEvent('environmentChanged', {
            detail: { environmentId }
        });
        document.dispatchEvent(event);
    }
    
    initializeComponents() {
        // Components are already initialized by their respective scripts
        // This method can be used for additional setup if needed
    }
    
    bindGlobalEvents() {
        // Handle logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
        
        // Handle page navigation
        window.addEventListener('beforeunload', () => {
            // Clear any pending requests or intervals
        });
        
        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+R or F5 to refresh
            if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
                e.preventDefault();
                this.refreshData();
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.modal.show');
                openModals.forEach(modal => {
                    const modalInstance = bootstrap.Modal.getInstance(modal);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                });
            }
        });
        
        // Handle offline/online status
        window.addEventListener('online', () => {
            console.log('🌐 Connection restored');
            this.showNotification('Connection restored', 'success');
        });
        
        window.addEventListener('offline', () => {
            console.log('❌ Connection lost');
            this.showNotification('Connection lost. Some features may not work.', 'warning');
        });
    }
    
    async loadSelectedEnvironment() {
        // Environment loading is now handled by the global environmentContext
        // Just get the current environment if it exists
        if (window.environmentContext) {
            const currentEnv = window.environmentContext.getCurrentEnvironment();
            if (currentEnv) {
                this.currentEnvironmentId = currentEnv.id;
                this.notifyEnvironmentChange(this.currentEnvironmentId);
            } else {
                this.showEnvironmentSelectionPrompt();
            }
        }
    }
    
    showEnvironmentSelectionPrompt() {
        // Show a notification about how to select an environment
        this.showNotification('Click on the "MedPro Env" badge in the header to select an environment', 'info');
    }
    
    refreshData() {
        if (!this.currentEnvironmentId) {
            console.warn('No environment selected for refresh');
            return;
        }
        
        // Refresh all components
        if (window.userList) {
            window.userList.refresh();
        }
        
        if (window.userStats) {
            window.userStats.refresh();
        }
        
        this.showNotification('Data refreshed', 'success');
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
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
    
    showGlobalError(message) {
        const errorContainer = document.getElementById('global-error-container');
        const errorMessage = document.getElementById('global-error-message');
        
        if (errorContainer && errorMessage) {
            errorMessage.textContent = message;
            errorContainer.classList.remove('d-none');
        } else {
            // Fallback to alert
            alert('Application Error: ' + message);
        }
    }
    
    // Public API methods
    getCurrentEnvironment() {
        return this.currentEnvironmentId;
    }
    
    isInitialized() {
        return this.initialized;
    }
    
    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('adminToken');
        window.location.href = '/medproadmin/login.html';
    }
}

// Initialize the application
const userApp = new UserApp();

// Make it globally available
window.userApp = userApp;