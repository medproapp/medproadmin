/**
 * Customer Management Application
 * Main application logic for customer dashboard
 */
class CustomerApp {
    constructor() {
        this.customerList = null;
        this.filters = {
            search: '',
            status: '',
            date_from: '',
            date_to: ''
        };
        this.syncInProgress = false;

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }

    /**
     * Start the application
     */
    async start() {
        try {
            // Check authentication
            await this.checkAuth();
            
            // Initialize components
            this.initializeComponents();
            
            // Bind events
            this.bindEvents();
            
            // Load initial data
            await this.loadInitialData();
            
            console.log('Customer App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Customer App:', error);
            this.showInitError(error.message);
        }
    }

    /**
     * Check user authentication
     */
    async checkAuth() {
        // Check if admin auth functions are available
        if (typeof checkAdminAuth !== 'function') {
            throw new Error('Admin authentication not available');
        }

        const auth = await checkAdminAuth();
        if (!auth) {
            window.location.href = '/login';
            return;
        }

        // Update user info in header
        const userElement = document.getElementById('admin-email');
        if (userElement && auth.email) {
            userElement.textContent = auth.email;
        }
    }

    /**
     * Initialize components
     */
    initializeComponents() {
        const customersContainer = document.getElementById('customers-container');
        if (customersContainer) {
            this.customerList = new CustomerList(customersContainer);
        } else {
            throw new Error('Customer container not found');
        }
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Search functionality
        this.bindSearchEvents();
        
        // Filter events
        this.bindFilterEvents();
        
        // Sync functionality
        this.bindSyncEvents();
        
        // Other UI events
        this.bindUIEvents();
    }

    /**
     * Bind search events
     */
    bindSearchEvents() {
        const searchInput = document.getElementById('search-customers');
        const searchBtn = document.getElementById('btn-search');
        
        if (searchInput) {
            // Debounced search on input
            const debouncedSearch = CustomerUtils.debounce(() => {
                this.applyFilters();
            }, 500);
            
            searchInput.addEventListener('input', debouncedSearch);
            
            // Search on enter key
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.applyFilters();
                }
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }
    }

    /**
     * Bind filter events
     */
    bindFilterEvents() {
        const statusFilter = document.getElementById('filter-status');
        const dateFromFilter = document.getElementById('filter-date-from');
        const dateToFilter = document.getElementById('filter-date-to');
        const clearFiltersBtn = document.getElementById('btn-clear-filters');
        
        [statusFilter, dateFromFilter, dateToFilter].forEach(element => {
            if (element) {
                element.addEventListener('change', () => {
                    this.applyFilters();
                });
            }
        });
        
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                this.clearFilters();
            });
        }
    }

    /**
     * Bind sync events
     */
    bindSyncEvents() {
        const syncBtn = document.getElementById('btn-sync-customers');
        const syncNowBtn = document.getElementById('btn-sync-now');
        
        [syncBtn, syncNowBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.triggerSync();
                });
            }
        });
    }

    /**
     * Bind other UI events
     */
    bindUIEvents() {
        // Logout functionality
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('adminToken');
                window.location.href = '/login';
            });
        }

        // Retry button in error state
        const retryBtn = document.getElementById('btn-retry');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.loadInitialData();
            });
        }

        // Refresh on visibility change (when user comes back to tab)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.customerList) {
                // Refresh data if tab was hidden for more than 5 minutes
                const lastRefresh = localStorage.getItem('lastCustomerRefresh');
                const now = Date.now();
                if (!lastRefresh || (now - parseInt(lastRefresh)) > 5 * 60 * 1000) {
                    this.refreshData();
                }
            }
        });
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        try {
            // Set default date range (last 30 days)
            this.setDefaultDateRange();
            
            // Load customers with current filters
            await this.loadCustomers();
            
            // Load sync status
            await this.loadSyncStatus();
            
            // Mark last refresh
            localStorage.setItem('lastCustomerRefresh', Date.now().toString());
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load customer data: ' + error.message);
        }
    }

    /**
     * Set default date range for filters
     */
    setDefaultDateRange() {
        // Don't set default date range - show ALL customers by default
        console.log('🔍 App: setDefaultDateRange called - keeping filters empty to show all customers');
        
        // Leave date inputs empty so no date filtering is applied
        const dateToInput = document.getElementById('filter-date-to');
        const dateFromInput = document.getElementById('filter-date-from');
        
        if (dateToInput) dateToInput.value = '';
        if (dateFromInput) dateFromInput.value = '';
    }

    /**
     * Load customers with current filters
     */
    async loadCustomers() {
        if (!this.customerList) return;
        
        const filters = this.getCurrentFilters();
        await this.customerList.loadCustomers(filters);
    }

    /**
     * Get current filter values
     * @returns {Object} Filter object
     */
    getCurrentFilters() {
        const searchInput = document.getElementById('search-customers');
        const statusInput = document.getElementById('filter-status');
        const dateFromInput = document.getElementById('filter-date-from');
        const dateToInput = document.getElementById('filter-date-to');
        
        return {
            search: searchInput?.value?.trim() || '',
            status: statusInput?.value || '',
            date_from: dateFromInput?.value || '',
            date_to: dateToInput?.value || ''
        };
    }

    /**
     * Apply current filters
     */
    async applyFilters() {
        const filters = this.getCurrentFilters();
        this.filters = { ...filters };
        
        if (this.customerList) {
            await this.customerList.applyFilters(filters);
        }
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        const searchInput = document.getElementById('search-customers');
        const statusInput = document.getElementById('filter-status');
        const dateFromInput = document.getElementById('filter-date-from');
        const dateToInput = document.getElementById('filter-date-to');
        
        if (searchInput) searchInput.value = '';
        if (statusInput) statusInput.value = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        
        // Reset to default date range
        this.setDefaultDateRange();
        
        // Apply cleared filters
        this.applyFilters();
    }

    /**
     * Trigger customer sync
     */
    async triggerSync() {
        if (this.syncInProgress) {
            console.log('Sync already in progress');
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            this.showSyncToast('Starting customer sync...');
            this.updateSyncButton(true);
            
            const response = await customerAPI.syncCustomers();
            
            if (response.success) {
                const stats = response.data;
                const message = `Sync completed! Processed: ${stats.customers?.processed || 0}, Created: ${stats.customers?.created || 0}, Updated: ${stats.customers?.updated || 0}`;
                
                this.showSyncToast(message, 'success');
                
                // Refresh customer list after successful sync
                setTimeout(() => {
                    this.refreshData();
                }, 2000);
                
            } else {
                throw new Error(response.message || 'Sync failed');
            }
            
        } catch (error) {
            console.error('Sync error:', error);
            this.showSyncToast('Sync failed: ' + error.message, 'error');
            
            if (window.adminUtils && window.adminUtils.showToast) {
                window.adminUtils.showToast('Customer sync failed', 'error');
            }
        } finally {
            this.syncInProgress = false;
            this.updateSyncButton(false);
            
            // Hide sync toast after 5 seconds
            setTimeout(() => {
                this.hideSyncToast();
            }, 5000);
        }
    }

    /**
     * Load sync status
     */
    async loadSyncStatus() {
        try {
            const response = await customerAPI.getSyncStatus();
            if (response.success) {
                this.updateSyncStatus(response.data);
            }
        } catch (error) {
            console.warn('Failed to load sync status:', error);
        }
    }

    /**
     * Update sync status display
     * @param {Object} status - Sync status data
     */
    updateSyncStatus(status) {
        // You could add sync status indicators to the UI here
        console.log('Sync status:', status);
    }

    /**
     * Show sync toast
     * @param {string} message - Toast message
     * @param {string} type - Toast type (info, success, error)
     */
    showSyncToast(message, type = 'info') {
        const toast = document.getElementById('sync-toast');
        const messageEl = document.getElementById('toast-message');
        const progressBar = document.getElementById('sync-progress');
        
        if (toast && messageEl) {
            messageEl.textContent = message;
            toast.className = `toast toast-${type}`;
            toast.style.display = 'block';
            
            // Animate progress bar for info type
            if (type === 'info' && progressBar) {
                progressBar.style.width = '0%';
                progressBar.style.animation = 'progress 3s ease-in-out infinite';
            }
        }
    }

    /**
     * Hide sync toast
     */
    hideSyncToast() {
        const toast = document.getElementById('sync-toast');
        if (toast) {
            toast.style.display = 'none';
        }
    }

    /**
     * Update sync button state
     * @param {boolean} syncing - Whether sync is in progress
     */
    updateSyncButton(syncing) {
        const syncBtns = [
            document.getElementById('btn-sync-customers'),
            document.getElementById('btn-sync-now')
        ];
        
        syncBtns.forEach(btn => {
            if (btn) {
                btn.disabled = syncing;
                const icon = btn.querySelector('.sync-icon');
                if (icon) {
                    icon.style.animation = syncing ? 'spin 1s linear infinite' : '';
                }
                
                const originalText = btn.dataset.originalText || btn.textContent;
                if (!btn.dataset.originalText) {
                    btn.dataset.originalText = originalText;
                }
                
                btn.textContent = syncing ? 'Syncing...' : originalText;
            }
        });
    }

    /**
     * Refresh data
     */
    async refreshData() {
        await this.loadCustomers();
        await this.loadSyncStatus();
        localStorage.setItem('lastCustomerRefresh', Date.now().toString());
    }

    /**
     * Show initialization error
     * @param {string} message - Error message
     */
    showInitError(message) {
        const container = document.querySelector('.admin-content');
        if (container) {
            container.innerHTML = `
                <div class="init-error">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to Initialize</h2>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Reload Page</button>
                </div>
            `;
        }
    }

    /**
     * Show general error
     * @param {string} message - Error message
     */
    showError(message) {
        if (window.adminUtils && window.adminUtils.showToast) {
            window.adminUtils.showToast(message, 'error');
        } else {
            alert(message); // Fallback
        }
    }
}

// Add CSS animations
const customerAppStyles = document.createElement('style');
customerAppStyles.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    @keyframes progress {
        0% { width: 0%; }
        50% { width: 70%; }
        100% { width: 100%; }
    }
`;
document.head.appendChild(customerAppStyles);

// Initialize the application
new CustomerApp();