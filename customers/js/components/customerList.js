/**
 * Customer List Component
 * Handles the display and management of customer cards
 */
class CustomerList {
    constructor(container) {
        this.container = container;
        this.customers = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalResults = 0;
        this.limit = 20;
        this.currentFilters = {};
        this.isLoading = false;

        this.bindEvents();
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Pagination events
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousPage());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextPage());
        }

        // Customer card click events (delegated)
        this.container.addEventListener('click', (e) => {
            const customerCard = e.target.closest('.customer-card');
            if (customerCard) {
                const customerId = customerCard.dataset.customerId;
                const action = e.target.dataset.action;
                
                switch (action) {
                    case 'view-details':
                        this.showCustomerDetails(customerId);
                        break;
                    case 'view-subscriptions':
                        this.showCustomerSubscriptions(customerId);
                        break;
                    default:
                        if (!action) { // Card itself clicked
                            this.showCustomerDetails(customerId);
                        }
                        break;
                }
            }
        });
    }

    /**
     * Load customers with current filters
     * @param {Object} filters - Filter options
     */
    async loadCustomers(filters = {}) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.currentFilters = { ...filters };
        
        try {
            this.showLoading();
            
            const options = {
                ...filters,
                page: this.currentPage,
                limit: this.limit,
                sort_by: filters.sort_by || 'stripe_created_at',
                sort_order: filters.sort_order || 'desc'
            };

            console.log('🔍 CustomerList: Making API call with options:', options);
            
            const response = await customerAPI.getCustomers(options);
            
            console.log('🔍 CustomerList: Full API response:', response);
            console.log('🔍 CustomerList: Response success:', response.success);
            console.log('🔍 CustomerList: Response data:', response.data);
            console.log('🔍 CustomerList: Response pagination:', response.data?.pagination);
            console.log('🔍 CustomerList: Response meta:', response.meta);
            
            if (response.success && response.data) {
                this.customers = response.data.customers || [];
                this.totalPages = response.data.pagination?.totalPages || 1;
                this.totalResults = response.data.pagination?.total || 0;
                
                console.log('🔍 CustomerList: Parsed customers count:', this.customers.length);
                console.log('🔍 CustomerList: Total pages:', this.totalPages);
                console.log('🔍 CustomerList: Total results:', this.totalResults);
                
                this.render();
                this.updatePagination();
                this.updateStats(response.meta);
            } else {
                console.error('❌ CustomerList: API call failed:', response);
                throw new Error(response.message || 'Failed to load customers');
            }
        } catch (error) {
            console.error('Error loading customers:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Render customer list
     */
    render() {
        console.log('🔍 CustomerList: render() called with', this.customers.length, 'customers');
        
        // Hide loading spinner and show content
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
            console.log('🔍 CustomerList: Hiding loading spinner');
        }
        if (errorState) errorState.style.display = 'none';
        
        if (this.customers.length === 0) {
            this.showEmptyState();
            return;
        }

        const html = this.customers.map(customer => 
            this.renderCustomerCard(customer)
        ).join('');
        
        this.container.innerHTML = html;
        console.log('🔍 CustomerList: Set container innerHTML with customer cards');
        
        // Show pagination
        const paginationSection = document.getElementById('pagination-section');
        if (paginationSection) {
            paginationSection.style.display = this.totalPages > 1 ? 'flex' : 'none';
            console.log('🔍 CustomerList: Pagination visibility:', this.totalPages > 1 ? 'visible' : 'hidden');
        }
    }

    /**
     * Render a single customer card
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderCustomerCard(customer) {
        const healthClass = CustomerUtils.getHealthClass(customer.health_score);
        const churnRiskClass = CustomerUtils.getChurnRiskClass(customer.churn_risk_score);
        const subscriptionText = this.getSubscriptionText(customer);
        const customerSince = CustomerUtils.formatRelativeTime(customer.stripe_created_at);
        const initials = CustomerUtils.getInitials(customer.name, customer.email);
        const avatarColor = CustomerUtils.getAvatarColor(customer.name || customer.email);

        return `
            <div class="customer-card ${healthClass} ${churnRiskClass}" data-customer-id="${customer.stripe_customer_id}">
                <div class="customer-header">
                    <div class="customer-avatar" style="background-color: ${avatarColor}">
                        ${initials}
                    </div>
                    <div class="customer-info">
                        <h4 class="customer-name">${CustomerUtils.truncateText(customer.name || 'No name', 25)}</h4>
                        <p class="customer-email">${CustomerUtils.truncateText(customer.email, 30)}</p>
                    </div>
                    <div class="customer-badges">
                        ${this.renderHealthBadge(customer)}
                        ${this.renderChurnRiskBadge(customer)}
                    </div>
                </div>

                <div class="customer-stats">
                    <div class="stat-item">
                        <span class="stat-label">Subscriptions</span>
                        <span class="stat-value">${subscriptionText}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">LTV</span>
                        <span class="stat-value">${CustomerUtils.formatCurrency(customer.lifetime_value || 0)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Revenue</span>
                        <span class="stat-value">${CustomerUtils.formatCurrency(customer.total_revenue || 0)}</span>
                    </div>
                </div>

                <div class="customer-meta">
                    <span class="customer-since">Customer ${customerSince}</span>
                    ${customer.delinquent ? '<span class="delinquent-badge">Delinquent</span>' : ''}
                    ${customer.deleted ? '<span class="deleted-badge">Deleted</span>' : ''}
                </div>

                <div class="customer-actions">
                    <button class="btn btn-secondary btn-sm" data-action="view-details" title="View Details">
                        👤 Details
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="view-subscriptions" title="View Subscriptions">
                        📋 Subscriptions
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="view-stripe" title="View in Stripe" onclick="window.open('https://dashboard.stripe.com/customers/${customer.stripe_customer_id}', '_blank')">
                        🔗 Stripe
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render health score badge
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderHealthBadge(customer) {
        const healthClass = CustomerUtils.getHealthClass(customer.health_score);
        const healthText = CustomerUtils.getHealthText(customer.health_score);
        const score = customer.health_score || 0;
        
        return `
            <div class="health-badge ${healthClass}" title="Health Score: ${score}/100">
                <span class="badge-label">Health</span>
                <span class="badge-value">${healthText}</span>
            </div>
        `;
    }

    /**
     * Render churn risk badge
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderChurnRiskBadge(customer) {
        const riskClass = CustomerUtils.getChurnRiskClass(customer.churn_risk_score);
        const riskText = CustomerUtils.getChurnRiskText(customer.churn_risk_score);
        const riskPercent = Math.round((customer.churn_risk_score || 0) * 100);
        
        return `
            <div class="risk-badge ${riskClass}" title="Churn Risk: ${riskPercent}%">
                <span class="badge-label">Risk</span>
                <span class="badge-value">${riskText.replace(' Risk', '')}</span>
            </div>
        `;
    }

    /**
     * Get subscription text for display
     * @param {Object} customer - Customer data
     * @returns {string} Subscription text
     */
    getSubscriptionText(customer) {
        const total = customer.total_subscriptions || 0;
        const active = customer.active_subscriptions || 0;
        
        if (total === 0) {
            return 'No subscriptions';
        } else if (active === total) {
            return `${active} active`;
        } else {
            return `${active}/${total} active`;
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        const paginationSection = document.getElementById('pagination-section');
        
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
        if (paginationSection) paginationSection.style.display = 'none';
        
        this.container.innerHTML = '';
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const errorMessage = document.getElementById('error-message');
        const emptyState = document.getElementById('empty-state');
        const paginationSection = document.getElementById('pagination-section');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorState) {
            errorState.style.display = 'block';
            if (errorMessage) errorMessage.textContent = message;
        }
        if (emptyState) emptyState.style.display = 'none';
        if (paginationSection) paginationSection.style.display = 'none';
        
        this.container.innerHTML = '';
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        const paginationSection = document.getElementById('pagination-section');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (paginationSection) paginationSection.style.display = 'none';
        
        this.container.innerHTML = '';
    }

    /**
     * Update pagination controls
     */
    updatePagination() {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const pageInfo = document.getElementById('page-info');
        const showingFrom = document.getElementById('showing-from');
        const showingTo = document.getElementById('showing-to');
        const totalResultsEl = document.getElementById('total-results');
        
        // Update pagination buttons
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }
        
        // Update page info
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        }
        
        // Update showing info
        const from = ((this.currentPage - 1) * this.limit) + 1;
        const to = Math.min(this.currentPage * this.limit, this.totalResults);
        
        if (showingFrom) showingFrom.textContent = from;
        if (showingTo) showingTo.textContent = to;
        if (totalResultsEl) totalResultsEl.textContent = this.totalResults;
    }

    /**
     * Update stats cards
     * @param {Object} meta - Response metadata
     */
    updateStats(meta) {
        console.log('🔍 CustomerList: updateStats called');
        console.log('🔍 CustomerList: meta parameter:', meta);
        console.log('🔍 CustomerList: meta.stats:', meta?.stats);
        
        if (meta && meta.stats) {
            const totalCustomersEl = document.getElementById('total-customers');
            const activeCustomersEl = document.getElementById('active-customers');
            const totalSubscriptionsEl = document.getElementById('total-subscriptions');
            const atRiskCustomersEl = document.getElementById('at-risk-customers');
            
            const stats = meta.stats;
            
            console.log('🔍 CustomerList: Using backend stats:', stats);
            
            // Use backend-calculated stats instead of page-based calculations
            if (totalCustomersEl) totalCustomersEl.textContent = stats.total_customers || 0;
            if (activeCustomersEl) activeCustomersEl.textContent = stats.active_customers || 0;
            if (totalSubscriptionsEl) totalSubscriptionsEl.textContent = stats.total_subscriptions || 0;
            if (atRiskCustomersEl) atRiskCustomersEl.textContent = stats.at_risk_customers || 0;
            
            console.log('🔍 CustomerList: Updated stats cards with backend data');
        } else {
            console.warn('🔍 CustomerList: No stats in meta, falling back to page-based calculation');
            
            // Fallback to old calculation if stats not available
            if (meta) {
                const totalCustomersEl = document.getElementById('total-customers');
                if (totalCustomersEl) totalCustomersEl.textContent = this.totalResults || 0;
            }
        }
    }

    /**
     * Go to previous page
     */
    goToPreviousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadCustomers(this.currentFilters);
        }
    }

    /**
     * Go to next page
     */
    goToNextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.loadCustomers(this.currentFilters);
        }
    }

    /**
     * Show customer details modal
     * @param {string} customerId - Customer ID
     */
    showCustomerDetails(customerId) {
        if (window.customerDetail) {
            window.customerDetail.showDetails(customerId);
        }
    }

    /**
     * Show customer subscriptions
     * @param {string} customerId - Customer ID
     */
    showCustomerSubscriptions(customerId) {
        if (window.customerDetail) {
            window.customerDetail.showSubscriptions(customerId);
        }
    }

    /**
     * Refresh current page
     */
    refresh() {
        this.loadCustomers(this.currentFilters);
    }

    /**
     * Reset to first page and apply new filters
     * @param {Object} filters - New filter options
     */
    applyFilters(filters) {
        this.currentPage = 1;
        this.loadCustomers(filters);
    }
}

// Make CustomerList available globally
window.CustomerList = CustomerList;