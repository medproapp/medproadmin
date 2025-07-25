/**
 * Environment Management Application
 * Main application entry point that initializes all components
 */

class EnvironmentApp {
    constructor() {
        this.initialized = false;
        this.components = {};
        
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
            
            // Initialize components
            this.initializeComponents();
            
            // Set up global event listeners
            this.setupGlobalEventListeners();
            
            // Load initial data
            await this.loadInitialData(auth);
            
            this.initialized = true;
            console.log('Environment Management App initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Environment Management App:', error);
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
     * Initialize all components
     */
    initializeComponents() {
        // Initialize environment list
        const environmentsContainer = document.getElementById('environments-container');
        if (environmentsContainer) {
            this.components.environmentList = new EnvironmentList(environmentsContainer);
            window.environmentListInstance = this.components.environmentList;
        }
        
        // Initialize environment editor
        this.components.environmentEditor = new EnvironmentEditor();
        window.environmentEditor = this.components.environmentEditor;
        
        // Initialize environment selector (creates its own instance)
        // Note: Environment selector auto-initializes via its script
        
        // Initialize connection test
        this.components.connectionTest = new ConnectionTest();
        window.connectionTest = this.components.connectionTest;
    }
    
    /**
     * Set up global event listeners
     */
    setupGlobalEventListeners() {
        // Create environment button
        const createBtn = document.getElementById('create-environment-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.components.environmentEditor.showCreateModal();
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshEnvironments();
            });
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.logout();
            });
        }
        
        // Retry load button
        const retryBtn = document.getElementById('retry-load-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.components.environmentList?.loadEnvironments();
            });
        }
        
        // Handle authentication changes
        document.addEventListener('authenticationChanged', (e) => {
            if (!e.detail.authenticated) {
                window.location.href = '/medproadmin/login.html';
            }
        });
        
        // Handle environment changes for page updates
        document.addEventListener('environmentChanged', (e) => {
            this.updatePageForEnvironment(e.detail.environment);
        });
        
        // Handle window beforeunload for unsaved changes
        window.addEventListener('beforeunload', (e) => {
            // Could check for unsaved changes in environment editor
        });
    }
    
    /**
     * Load initial data
     */
    async loadInitialData(auth) {
        try {
            // Load user information
            this.loadUserInfo(auth);
            
            // Update navigation
            this.updateNavigation();
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
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
     * Update navigation based on permissions
     */
    updateNavigation() {
        // Show/hide user management nav based on environment selection
        const userManagementNav = document.getElementById('user-management-nav');
        if (userManagementNav) {
            const currentEnv = window.environmentContext?.getCurrentEnvironment();
            if (currentEnv) {
                userManagementNav.style.display = 'block';
                userManagementNav.href = `/medproadmin/users/?env=${currentEnv.id}`;
            } else {
                userManagementNav.style.display = 'none';
            }
        }
    }
    
    /**
     * Handle environment context events
     */
    handleEnvironmentContextEvent(event, data) {
        switch (event) {
            case 'environmentChanged':
                this.updateNavigation();
                this.updatePageForEnvironment(data.current);
                break;
            case 'error':
                console.error('Environment context error:', data);
                showToast('Environment management error: ' + data.message, 'error');
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
        body.className = body.className.replace(/\benvirononment-\w+\b/g, '');
        body.classList.add(`environment-${environment.env_type}`);
        
        // Update any environment-specific UI elements
        this.updateEnvironmentContext(environment);
    }
    
    /**
     * Update environment context display
     */
    updateEnvironmentContext(environment) {
        // This could update a context bar or other UI elements
        // that show information about the current environment
        console.log('Current environment context:', environment);
    }
    
    /**
     * Refresh environments
     */
    async refreshEnvironments() {
        const refreshBtn = document.getElementById('refresh-btn');
        const originalHtml = refreshBtn ? refreshBtn.innerHTML : '';
        
        try {
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                refreshBtn.disabled = true;
            }
            
            if (window.environmentContext) {
                await window.environmentContext.refresh();
            }
            
            showToast('Environments refreshed successfully', 'success');
            
        } catch (error) {
            console.error('Failed to refresh environments:', error);
            showToast('Failed to refresh environments', 'error');
        } finally {
            if (refreshBtn) {
                refreshBtn.innerHTML = originalHtml;
                refreshBtn.disabled = false;
            }
        }
    }
    
    /**
     * Show initialization error
     */
    showInitializationError(error) {
        const container = document.getElementById('environments-container') || 
                         document.querySelector('.admin-content');
        
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <h4 class="alert-heading">
                        <i class="fas fa-exclamation-triangle"></i> 
                        Initialization Error
                    </h4>
                    <p>Failed to initialize the Environment Management application.</p>
                    <hr>
                    <p class="mb-0">
                        <strong>Error:</strong> ${error.message || 'Unknown error'}
                    </p>
                    <div class="mt-3">
                        <button class="btn btn-outline-danger" id="error-retry-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                        <a href="/medproadmin/" class="btn btn-outline-secondary ms-2">
                            <i class="fas fa-home"></i> Back to Dashboard
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
     * Get component instance
     */
    getComponent(name) {
        return this.components[name];
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
    window.environmentApp = new EnvironmentApp();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.environmentApp && window.environmentApp.isInitialized()) {
        // Refresh data when page becomes visible again
        setTimeout(() => {
            if (window.environmentContext) {
                window.environmentContext.refresh().catch(console.error);
            }
        }, 1000);
    }
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentApp;
}