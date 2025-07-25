/**
 * Monitor Application
 * Initializes environment context and monitor page components
 */

class MonitorApp {
    constructor() {
        this.initialized = false;
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            // Check authentication
            const auth = await checkAdminAuth();
            if (!auth) {
                window.location.href = '/medproadmin/login.html';
                return;
            }
            
            // Initialize environment context first
            await this.initializeEnvironmentContext();
            
            // Load user information
            this.loadUserInfo(auth);
            
            // Initialize environment selector
            this.initializeEnvironmentSelector();
            
            // Set up global event listeners
            this.setupGlobalEventListeners();
            
            this.initialized = true;
            console.log('Monitor App initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Monitor App:', error);
            this.showInitializationError(error);
        }
    }
    
    /**
     * Initialize environment context
     */
    async initializeEnvironmentContext() {
        if (window.environmentContext) {
            await window.environmentContext.init();
            
            // Listen for context events
            window.environmentContext.addEventListener((event, data) => {
                this.handleEnvironmentContextEvent(event, data);
            });
        }
    }
    
    /**
     * Initialize environment selector
     */
    initializeEnvironmentSelector() {
        // Environment selector auto-initializes via its script
        // and automatically connects to window.environmentContext
        // No manual setup needed
    }
    
    /**
     * Load user information
     */
    loadUserInfo(auth) {
        try {
            if (auth && auth.email) {
                const adminEmailElement = document.getElementById('admin-email');
                if (adminEmailElement) {
                    adminEmailElement.textContent = auth.email;
                }
            }
        } catch (error) {
            console.warn('Failed to load user info:', error);
        }
    }
    
    /**
     * Set up global event listeners
     */
    setupGlobalEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.logout();
            });
        }
        
        // Handle authentication changes
        document.addEventListener('authenticationChanged', (e) => {
            if (!e.detail.authenticated) {
                window.location.href = '/medproadmin/login.html';
            }
        });
        
        // Handle environment changes
        document.addEventListener('environmentChanged', (e) => {
            this.updatePageForEnvironment(e.detail.environment);
        });
    }
    
    /**
     * Handle environment context events
     */
    handleEnvironmentContextEvent(event, data) {
        switch (event) {
            case 'environmentChanged':
                this.updatePageForEnvironment(data.current);
                break;
            case 'error':
                console.error('Environment context error:', data);
                if (window.showToast) {
                    window.showToast('Environment management error: ' + data.message, 'error');
                }
                break;
        }
    }
    
    /**
     * Update page based on selected environment
     */
    updatePageForEnvironment(environment) {
        if (!environment) return;
        
        // Update page styling based on environment type
        const body = document.body;
        body.className = body.className.replace(/\benvironment-\w+\b/g, '');
        body.classList.add(`environment-${environment.env_type}`);
        
        // Update monitor controller if available
        if (window.monitorController) {
            window.monitorController.setEnvironment(environment.id);
        }
    }
    
    /**
     * Show initialization error
     */
    showInitializationError(error) {
        const container = document.querySelector('.admin-content');
        
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <h4 class="alert-heading">
                        <i class="fas fa-exclamation-triangle"></i> 
                        Initialization Error
                    </h4>
                    <p>Failed to initialize the Monitor application.</p>
                    <hr>
                    <p class="mb-0">
                        <strong>Error:</strong> ${error.message || 'Unknown error'}
                    </p>
                    <div class="mt-3">
                        <button class="btn btn-outline-danger" id="error-retry-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                        <a href="/medproadmin/environments/" class="btn btn-outline-secondary ms-2">
                            <i class="fas fa-arrow-left"></i> Back to Environments
                        </a>
                    </div>
                </div>
            `;
            
            // Add event listener for error retry button
            const errorRetryBtn = container.querySelector('#error-retry-btn');
            if (errorRetryBtn) {
                errorRetryBtn.addEventListener('click', () => {
                    location.reload();
                });
            }
        }
    }
    
    /**
     * Check if app is initialized
     */
    isInitialized() {
        return this.initialized;
    }
}

// Global logout function
window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear environment context
        if (window.environmentContext) {
            window.environmentContext.clearStorage();
        }
        
        // Use the global logout function from adminAuth.js
        if (typeof globalLogout === 'function') {
            globalLogout();
        } else {
            // Fallback logout
            localStorage.removeItem('adminToken');
            window.location.href = '/medproadmin/login.html';
        }
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.monitorApp = new MonitorApp();
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonitorApp;
}