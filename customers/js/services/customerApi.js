/**
 * Customer API Service
 * Handles all API calls related to customer management
 */
class CustomerAPI {
    constructor() {
        this.baseUrl = '/api/v1';
    }

    /**
     * Get customers with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} API response
     */
    async getCustomers(options = {}) {
        console.log('🔍 CustomerAPI: getCustomers called with options:', options);
        console.log('🔍 CustomerAPI: subscription_filter value:', options.subscription_filter);
        console.log('🔍 CustomerAPI: subscription_filter type:', typeof options.subscription_filter);
        
        const params = new URLSearchParams();
        
        // Add pagination
        if (options.page) params.append('page', options.page);
        if (options.limit) params.append('limit', options.limit);
        
        // Add filters
        if (options.search && options.search.trim()) {
            params.append('search', options.search.trim());
        }
        if (options.status) params.append('status', options.status);
        if (options.subscription_filter) {
            console.log('🔍 CustomerAPI: Adding subscription_filter to params:', options.subscription_filter);
            params.append('subscription_filter', options.subscription_filter);
        } else {
            console.log('🔍 CustomerAPI: subscription_filter not added - value is falsy:', options.subscription_filter);
        }
        if (options.date_from) params.append('date_from', options.date_from);
        if (options.date_to) params.append('date_to', options.date_to);
        if (options.sort_by) params.append('sort_by', options.sort_by);
        if (options.sort_order) params.append('sort_order', options.sort_order);

        console.log('🔍 CustomerAPI: Final params object:', params);
        console.log('🔍 CustomerAPI: Params toString:', params.toString());
        
        const url = `${this.baseUrl}/customers${params.toString() ? '?' + params.toString() : ''}`;
        console.log('🔍 CustomerAPI: Fetching URL:', url);
        
        const response = await this._authenticatedFetch(url);
        console.log('🔍 CustomerAPI: Raw response:', response);
        
        return response;
    }

    /**
     * Get single customer details
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Customer details
     */
    async getCustomer(customerId) {
        const url = `${this.baseUrl}/customers/${customerId}`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Get customer subscriptions
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Customer subscriptions
     */
    async getCustomerSubscriptions(customerId) {
        const url = `${this.baseUrl}/customers/${customerId}/subscriptions`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Get customer activity timeline
     * @param {string} customerId - Stripe customer ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Customer activity
     */
    async getCustomerActivity(customerId, options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        const url = `${this.baseUrl}/customers/${customerId}/activity${params.toString() ? '?' + params.toString() : ''}`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Get customer invoices
     * @param {string} customerId - Stripe customer ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Customer invoices
     */
    async getCustomerInvoices(customerId, options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.starting_after) params.append('starting_after', options.starting_after);

        const url = `${this.baseUrl}/customers/${customerId}/invoices${params.toString() ? '?' + params.toString() : ''}`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Trigger customer sync from Stripe
     * @param {Object} options - Sync options
     * @returns {Promise<Object>} Sync results
     */
    async syncCustomers(options = {}) {
        const url = `${this.baseUrl}/customers/sync`;
        return await this._authenticatedFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
    }

    /**
     * Get sync status
     * @returns {Promise<Object>} Sync status
     */
    async getSyncStatus() {
        const url = `${this.baseUrl}/customers/sync/status`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Recalculate customer metrics
     * @param {string} customerId - Stripe customer ID
     * @returns {Promise<Object>} Updated metrics
     */
    async recalculateMetrics(customerId) {
        const url = `${this.baseUrl}/customers/${customerId}/recalculate-metrics`;
        return await this._authenticatedFetch(url, {
            method: 'POST'
        });
    }

    /**
     * Get customer analytics overview
     * @param {Object} options - Date range and filters
     * @returns {Promise<Object>} Analytics data
     */
    async getAnalytics(endpoint, options = {}) {
        const params = new URLSearchParams();
        if (options.date_from) params.append('date_from', options.date_from);
        if (options.date_to) params.append('date_to', options.date_to);
        if (options.period) params.append('period', options.period);

        const url = `${this.baseUrl}/analytics/customers/${endpoint}${params.toString() ? '?' + params.toString() : ''}`;
        return await this._authenticatedFetch(url);
    }

    /**
     * Private method to make authenticated API calls
     * @param {string} url - API endpoint URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} API response
     * @private
     */
    async _authenticatedFetch(url, options = {}) {
        try {
            const token = localStorage.getItem('adminToken');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const fetchOptions = {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const response = await fetch(url, fetchOptions);

            // Handle non-JSON responses
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`Expected JSON response, got ${contentType}`);
            }

            const data = await response.json();

            // Handle HTTP errors
            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    localStorage.removeItem('adminToken');
                    window.location.href = '/medproadmin/login.html';
                    return;
                }
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }
}

// Create global instance
window.customerAPI = new CustomerAPI();