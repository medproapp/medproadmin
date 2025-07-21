/**
 * Customer Analytics Application
 * Main application logic for customer analytics dashboard
 */
class CustomerAnalyticsApp {
    constructor() {
        this.analyticsCharts = null;
        this.currentPeriod = '30d';
        this.customDateRange = {
            from: '',
            to: ''
        };
        this.isLoading = false;

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
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
            await this.checkAuth();
            this.initializeComponents();
            this.bindEvents();
            await this.loadInitialData();
            
            console.log('Analytics App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Analytics App:', error);
            this.showError('Failed to initialize analytics dashboard: ' + error.message);
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
        this.analyticsCharts = new AnalyticsCharts();
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Period selector
        const periodSelector = document.getElementById('period-selector');
        if (periodSelector) {
            periodSelector.addEventListener('change', (e) => {
                this.handlePeriodChange(e.target.value);
            });
        }

        // Custom date range
        this.bindCustomDateRangeEvents();

        // Refresh button
        const refreshBtn = document.getElementById('btn-refresh-analytics');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }

        // Retry button
        const retryBtn = document.getElementById('btn-retry-analytics');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.loadInitialData();
            });
        }

        // Logout functionality
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('adminToken');
                window.location.href = '/login';
            });
        }

        // Window resize handler for charts
        window.addEventListener('resize', () => {
            if (this.analyticsCharts) {
                this.analyticsCharts.resizeCharts();
            }
        });

        // Table row click handlers (delegated)
        this.bindTableEvents();
    }

    /**
     * Bind custom date range events
     */
    bindCustomDateRangeEvents() {
        const applyBtn = document.getElementById('btn-apply-custom-range');
        const dateFromInput = document.getElementById('custom-date-from');
        const dateToInput = document.getElementById('custom-date-to');

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyCustomDateRange();
            });
        }

        [dateFromInput, dateToInput].forEach(input => {
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.applyCustomDateRange();
                    }
                });
            }
        });
    }

    /**
     * Bind table events for customer interactions
     */
    bindTableEvents() {
        const tables = ['at-risk-table', 'top-customers-table'];
        
        tables.forEach(tableId => {
            const table = document.getElementById(tableId);
            if (table) {
                table.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    const customerId = e.target.closest('tr')?.dataset.customerId;
                    
                    if (action && customerId) {
                        this.handleTableAction(action, customerId);
                    }
                });
            }
        });
    }

    /**
     * Handle period selection change
     * @param {string} period - Selected period
     */
    handlePeriodChange(period) {
        const customDateRange = document.getElementById('custom-date-range');
        
        if (period === 'custom') {
            if (customDateRange) {
                customDateRange.style.display = 'block';
                this.setDefaultCustomDates();
            }
        } else {
            if (customDateRange) {
                customDateRange.style.display = 'none';
            }
            this.currentPeriod = period;
            this.loadAnalyticsData();
        }
    }

    /**
     * Set default dates for custom range
     */
    setDefaultCustomDates() {
        const dateFromInput = document.getElementById('custom-date-from');
        const dateToInput = document.getElementById('custom-date-to');
        
        if (dateToInput && !dateToInput.value) {
            const today = new Date();
            dateToInput.value = today.toISOString().split('T')[0];
        }
        
        if (dateFromInput && !dateFromInput.value) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
    }

    /**
     * Apply custom date range
     */
    applyCustomDateRange() {
        const dateFromInput = document.getElementById('custom-date-from');
        const dateToInput = document.getElementById('custom-date-to');
        
        if (!dateFromInput?.value || !dateToInput?.value) {
            this.showToast('Please select both from and to dates', 'error');
            return;
        }
        
        const fromDate = new Date(dateFromInput.value);
        const toDate = new Date(dateToInput.value);
        
        if (fromDate > toDate) {
            this.showToast('From date cannot be later than to date', 'error');
            return;
        }
        
        this.currentPeriod = 'custom';
        this.customDateRange = {
            from: dateFromInput.value,
            to: dateToInput.value
        };
        
        this.loadAnalyticsData();
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        await this.loadAnalyticsData();
    }

    /**
     * Load analytics data from API
     */
    async loadAnalyticsData() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            this.showLoading();
            
            const options = this.getDateRangeOptions();
            
            // Load all analytics data in parallel
            const [overviewData, growthData, revenueData, healthData, churnData] = await Promise.all([
                customerAPI.getAnalytics('overview', options),
                customerAPI.getAnalytics('growth', options),
                customerAPI.getAnalytics('revenue', options),
                customerAPI.getAnalytics('health', options),
                customerAPI.getAnalytics('churn', options)
            ]);

            if (overviewData.success && growthData.success && revenueData.success && 
                healthData.success && churnData.success) {
                
                // Process and combine the data
                const analyticsData = this.combineAnalyticsData({
                    overview: overviewData.data,
                    growth: growthData.data,
                    revenue: revenueData.data,
                    health: healthData.data,
                    churn: churnData.data
                });
                
                // Update the UI
                this.updateAnalyticsDisplay(analyticsData);
                this.showContent();
                
            } else {
                throw new Error('Failed to load analytics data');
            }
            
        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showError('Failed to load analytics data: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Get date range options for API calls
     * @returns {Object} Date range options
     */
    getDateRangeOptions() {
        if (this.currentPeriod === 'custom') {
            return {
                date_from: this.customDateRange.from,
                date_to: this.customDateRange.to
            };
        } else {
            return {
                period: this.currentPeriod
            };
        }
    }

    /**
     * Combine analytics data from different endpoints
     * @param {Object} data - Raw analytics data
     * @returns {Object} Combined analytics data
     */
    combineAnalyticsData(data) {
        return {
            // Overview metrics
            overview: data.overview.overview || {},
            
            // Chart data
            customer_growth: data.growth.customer_growth || [],
            revenue_trends: data.revenue.revenue_trends || [],
            subscription_breakdown: data.overview.subscription_breakdown || [],
            health_distribution: data.health.health_distribution || [],
            revenue_by_product: data.revenue.revenue_by_product || [],
            ltv_distribution: data.revenue.ltv_distribution || [],
            
            // Table data
            at_risk_customers: data.health.at_risk_customers || [],
            top_customers: data.health.top_customers || [],
            
            // Additional data
            churn_trends: data.churn.churn_trends || [],
            churn_reasons: data.churn.churn_reasons || []
        };
    }

    /**
     * Update analytics display with new data
     * @param {Object} data - Analytics data
     */
    async updateAnalyticsDisplay(data) {
        // Update overview metrics
        this.updateOverviewMetrics(data.overview);
        
        // Initialize/update charts
        await this.analyticsCharts.initializeCharts(data);
        
        // Update data tables
        this.updateDataTables(data);
    }

    /**
     * Update overview metrics cards
     * @param {Object} overview - Overview data
     */
    updateOverviewMetrics(overview) {
        const metrics = [
            { id: 'total-customers-metric', value: overview.total_customers || 0, format: 'number' },
            { id: 'new-customers-metric', value: overview.new_customers || 0, format: 'number' },
            { id: 'mrr-metric', value: overview.monthly_recurring_revenue || 0, format: 'currency' },
            { id: 'churn-rate-metric', value: overview.churn_rate || 0, format: 'percentage' },
            { id: 'avg-ltv-metric', value: overview.average_lifetime_value || 0, format: 'currency' },
            { id: 'avg-health-metric', value: overview.average_health_score || 0, format: 'number' }
        ];

        metrics.forEach(metric => {
            const element = document.getElementById(metric.id);
            if (element) {
                element.textContent = this.formatMetricValue(metric.value, metric.format);
            }
        });

        // Update change indicators (simplified - would need previous period data)
        this.updateChangeIndicators(overview);
    }

    /**
     * Format metric value for display
     * @param {number} value - Value to format
     * @param {string} format - Format type
     * @returns {string} Formatted value
     */
    formatMetricValue(value, format) {
        switch (format) {
            case 'currency':
                return CustomerUtils.formatCurrency(value * 100); // Convert from dollars to cents
            case 'percentage':
                return `${value.toFixed(1)}%`;
            case 'number':
            default:
                return value.toLocaleString('pt-BR');
        }
    }

    /**
     * Update change indicators (simplified implementation)
     * @param {Object} overview - Overview data
     */
    updateChangeIndicators(overview) {
        const changeElements = [
            'total-customers-change',
            'new-customers-change',
            'mrr-change',
            'churn-rate-change',
            'avg-ltv-change',
            'avg-health-change'
        ];

        changeElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                // For now, hide change indicators since we don't have comparison data
                element.style.display = 'none';
            }
        });
    }

    /**
     * Update data tables
     * @param {Object} data - Analytics data
     */
    updateDataTables(data) {
        // Update at-risk customers table
        this.updateAtRiskTable(data.at_risk_customers || []);
        
        // Update top customers table
        this.updateTopCustomersTable(data.top_customers || []);
    }

    /**
     * Update at-risk customers table
     * @param {Array} customers - At-risk customers data
     */
    updateAtRiskTable(customers) {
        const tableBody = document.querySelector('#at-risk-table tbody');
        const emptyState = document.getElementById('at-risk-empty');
        
        if (!tableBody) return;
        
        if (customers.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        if (emptyState) emptyState.style.display = 'none';
        
        const rows = customers.map(customer => `
            <tr data-customer-id="${customer.customer_id}">
                <td>
                    <div class="table-customer-info">
                        <strong>${CustomerUtils.truncateText(customer.name || 'No name', 20)}</strong>
                    </div>
                </td>
                <td>${CustomerUtils.truncateText(customer.email, 25)}</td>
                <td>
                    <span class="health-indicator ${CustomerUtils.getHealthClass(customer.health_score)}">
                        ${customer.health_score || 0}
                    </span>
                </td>
                <td>
                    <span class="risk-indicator ${CustomerUtils.getChurnRiskClass(customer.churn_risk_score)}">
                        ${(customer.churn_risk_score * 100).toFixed(1)}%
                    </span>
                </td>
                <td>${CustomerUtils.formatCurrency(customer.lifetime_value * 100)}</td>
                <td>${customer.active_subscriptions || 0}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-secondary" data-action="view-details" title="View Details">👤</button>
                        <button class="btn btn-sm btn-secondary" data-action="view-stripe" title="View in Stripe">🔗</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        tableBody.innerHTML = rows;
    }

    /**
     * Update top customers table
     * @param {Array} customers - Top customers data
     */
    updateTopCustomersTable(customers) {
        const tableBody = document.querySelector('#top-customers-table tbody');
        const emptyState = document.getElementById('top-customers-empty');
        
        if (!tableBody) return;
        
        if (customers.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        if (emptyState) emptyState.style.display = 'none';
        
        const rows = customers.map(customer => `
            <tr data-customer-id="${customer.customer_id}">
                <td>
                    <div class="table-customer-info">
                        <strong>${CustomerUtils.truncateText(customer.name || 'No name', 20)}</strong>
                    </div>
                </td>
                <td>${CustomerUtils.truncateText(customer.email, 25)}</td>
                <td>
                    <span class="health-indicator ${CustomerUtils.getHealthClass(customer.health_score)}">
                        ${customer.health_score || 0}
                    </span>
                </td>
                <td>
                    <span class="risk-indicator ${CustomerUtils.getChurnRiskClass(customer.churn_risk_score)}">
                        ${(customer.churn_risk_score * 100).toFixed(1)}%
                    </span>
                </td>
                <td>${CustomerUtils.formatCurrency(customer.lifetime_value * 100)}</td>
                <td>${customer.active_subscriptions || 0}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-secondary" data-action="view-details" title="View Details">👤</button>
                        <button class="btn btn-sm btn-secondary" data-action="view-stripe" title="View in Stripe">🔗</button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        tableBody.innerHTML = rows;
    }

    /**
     * Handle table action clicks
     * @param {string} action - Action type
     * @param {string} customerId - Customer ID
     */
    handleTableAction(action, customerId) {
        switch (action) {
            case 'view-details':
                // Navigate to customer details
                window.location.href = `/medproadmin/customers/?customer=${customerId}`;
                break;
            case 'view-stripe':
                window.open(`https://dashboard.stripe.com/customers/${customerId}`, '_blank');
                break;
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        const loadingEl = document.getElementById('analytics-loading');
        const contentEl = document.getElementById('analytics-content');
        const errorEl = document.getElementById('analytics-error');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
    }

    /**
     * Show content
     */
    showContent() {
        const loadingEl = document.getElementById('analytics-loading');
        const contentEl = document.getElementById('analytics-content');
        const errorEl = document.getElementById('analytics-error');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        if (errorEl) errorEl.style.display = 'none';
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const loadingEl = document.getElementById('analytics-loading');
        const contentEl = document.getElementById('analytics-content');
        const errorEl = document.getElementById('analytics-error');
        const errorMessage = document.getElementById('analytics-error-message');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'block';
        if (errorMessage) errorMessage.textContent = message;
    }

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type
     */
    showToast(message, type = 'info') {
        if (window.adminUtils && window.adminUtils.showToast) {
            window.adminUtils.showToast(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }

    /**
     * Refresh analytics data
     */
    async refreshData() {
        await this.loadAnalyticsData();
        this.showToast('Analytics data refreshed', 'success');
    }
}

// Additional CSS for analytics-specific styling
const customerAnalyticsStyles = document.createElement('style');
customerAnalyticsStyles.textContent = `
    .analytics-overview {
        margin-bottom: 40px;
    }

    .analytics-overview h3 {
        margin: 0 0 20px 0;
        color: #2c3e50;
        font-size: 22px;
        border-bottom: 2px solid #007bff;
        padding-bottom: 10px;
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
    }

    .metric-card {
        background: white;
        padding: 25px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        text-align: center;
        transition: transform 0.3s ease;
    }

    .metric-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    }

    .metric-icon {
        font-size: 32px;
        margin-bottom: 15px;
        display: block;
    }

    .charts-section {
        margin-bottom: 40px;
    }

    .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 30px;
        margin-bottom: 30px;
    }

    .chart-container {
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    .chart-header {
        margin-bottom: 20px;
    }

    .chart-header h4 {
        margin: 0 0 5px 0;
        color: #2c3e50;
        font-size: 18px;
    }

    .chart-header p {
        margin: 0;
        color: #6c757d;
        font-size: 14px;
    }

    .chart-wrapper {
        position: relative;
        height: 300px;
    }

    .data-tables-section {
        display: flex;
        flex-direction: column;
        gap: 30px;
    }

    .data-table-container {
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        overflow: hidden;
    }

    .table-header {
        padding: 20px 25px;
        border-bottom: 1px solid #e9ecef;
        background: #f8f9fa;
    }

    .table-header h4 {
        margin: 0 0 5px 0;
        color: #2c3e50;
        font-size: 18px;
    }

    .table-header p {
        margin: 0;
        color: #6c757d;
        font-size: 14px;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }

    .data-table th,
    .data-table td {
        padding: 15px;
        text-align: left;
        border-bottom: 1px solid #e9ecef;
    }

    .data-table th {
        background: #f8f9fa;
        font-weight: 600;
        color: #495057;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .data-table tbody tr:hover {
        background: #f8f9fa;
    }

    .table-customer-info strong {
        color: #2c3e50;
        font-weight: 600;
    }

    .health-indicator,
    .risk-indicator {
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
    }

    .health-indicator.health-excellent {
        background: #d4edda;
        color: #155724;
    }

    .health-indicator.health-good {
        background: #d1ecf1;
        color: #0c5460;
    }

    .health-indicator.health-warning {
        background: #fff3cd;
        color: #856404;
    }

    .health-indicator.health-poor {
        background: #fdebd0;
        color: #8a4a00;
    }

    .health-indicator.health-critical {
        background: #f8d7da;
        color: #721c24;
    }

    .risk-indicator.risk-minimal,
    .risk-indicator.risk-low {
        background: #d4edda;
        color: #155724;
    }

    .risk-indicator.risk-medium {
        background: #fff3cd;
        color: #856404;
    }

    .risk-indicator.risk-high,
    .risk-indicator.risk-critical {
        background: #f8d7da;
        color: #721c24;
    }

    .table-actions {
        display: flex;
        gap: 5px;
    }

    .table-empty-state {
        padding: 40px;
        text-align: center;
        color: #6c757d;
        background: #f8f9fa;
    }

    @media (max-width: 768px) {
        .charts-grid {
            grid-template-columns: 1fr;
        }
        
        .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
        }
        
        .data-table {
            font-size: 12px;
        }
        
        .data-table th,
        .data-table td {
            padding: 10px 8px;
        }
    }

    @media (max-width: 480px) {
        .metrics-grid {
            grid-template-columns: 1fr;
        }
    }
`;
document.head.appendChild(customerAnalyticsStyles);

// Initialize the application
new CustomerAnalyticsApp();