/**
 * Segment API Service
 * Handles API calls for customer segmentation
 */
class SegmentAPI {
    constructor() {
        this.baseUrl = '/api/v1/segments';
    }

    /**
     * Get all segments
     * @param {Object} filters - Filter parameters
     * @returns {Promise<Object>} API response
     */
    async getSegments(filters = {}) {
        try {
            const params = new URLSearchParams();
            Object.keys(filters).forEach(key => {
                if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
                    params.append(key, filters[key]);
                }
            });

            const url = params.toString() ? `${this.baseUrl}?${params}` : this.baseUrl;
            return await authenticatedFetch(url);
        } catch (error) {
            console.error('Error fetching segments:', error);
            throw error;
        }
    }

    /**
     * Get single segment with details
     * @param {string} segmentId - Segment ID
     * @returns {Promise<Object>} API response
     */
    async getSegment(segmentId) {
        try {
            return await authenticatedFetch(`${this.baseUrl}/${segmentId}`);
        } catch (error) {
            console.error('Error fetching segment:', error);
            throw error;
        }
    }

    /**
     * Get customers in a segment
     * @param {string} segmentId - Segment ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} API response
     */
    async getSegmentCustomers(segmentId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.page) params.append('page', options.page);
            if (options.limit) params.append('limit', options.limit);

            const url = params.toString() 
                ? `${this.baseUrl}/${segmentId}/customers?${params}`
                : `${this.baseUrl}/${segmentId}/customers`;
            
            return await authenticatedFetch(url);
        } catch (error) {
            console.error('Error fetching segment customers:', error);
            throw error;
        }
    }

    /**
     * Get segment analytics
     * @param {string} segmentId - Segment ID
     * @param {Object} options - Date range options
     * @returns {Promise<Object>} API response
     */
    async getSegmentAnalytics(segmentId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.date_from) params.append('date_from', options.date_from);
            if (options.date_to) params.append('date_to', options.date_to);

            const url = params.toString()
                ? `${this.baseUrl}/${segmentId}/analytics?${params}`
                : `${this.baseUrl}/${segmentId}/analytics`;
            
            return await authenticatedFetch(url);
        } catch (error) {
            console.error('Error fetching segment analytics:', error);
            throw error;
        }
    }

    /**
     * Create new segment
     * @param {Object} segmentData - Segment data
     * @returns {Promise<Object>} API response
     */
    async createSegment(segmentData) {
        try {
            return await authenticatedFetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(segmentData)
            });
        } catch (error) {
            console.error('Error creating segment:', error);
            throw error;
        }
    }

    /**
     * Update existing segment
     * @param {string} segmentId - Segment ID
     * @param {Object} segmentData - Updated segment data
     * @returns {Promise<Object>} API response
     */
    async updateSegment(segmentId, segmentData) {
        try {
            return await authenticatedFetch(`${this.baseUrl}/${segmentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(segmentData)
            });
        } catch (error) {
            console.error('Error updating segment:', error);
            throw error;
        }
    }

    /**
     * Delete segment
     * @param {string} segmentId - Segment ID
     * @returns {Promise<Object>} API response
     */
    async deleteSegment(segmentId) {
        try {
            return await authenticatedFetch(`${this.baseUrl}/${segmentId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Error deleting segment:', error);
            throw error;
        }
    }

    /**
     * Refresh segment assignments
     * @param {string} segmentId - Segment ID
     * @returns {Promise<Object>} API response
     */
    async refreshSegment(segmentId) {
        try {
            return await authenticatedFetch(`${this.baseUrl}/${segmentId}/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            console.error('Error refreshing segment:', error);
            throw error;
        }
    }

    /**
     * Refresh all segment assignments
     * @returns {Promise<Object>} API response
     */
    async refreshAllSegments() {
        try {
            return await authenticatedFetch(`${this.baseUrl}/refresh-all`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            console.error('Error refreshing all segments:', error);
            throw error;
        }
    }

    /**
     * Preview customers for segment criteria (mock implementation)
     * This would typically hit an endpoint that returns customers matching criteria
     * @param {Object} criteria - Segment criteria
     * @returns {Promise<Object>} Preview results
     */
    async previewSegment(criteria) {
        try {
            // For now, we'll use the customer API to get a preview
            // In a real implementation, you'd have a dedicated preview endpoint
            const customerAPI = window.customerAPI;
            if (!customerAPI) {
                throw new Error('Customer API not available');
            }

            // Convert segment criteria to customer filters
            const filters = this.criteriaToFilters(criteria);
            
            // Get customers with these filters (limited preview)
            const response = await customerAPI.getCustomers({
                ...filters,
                limit: 10 // Preview limit
            });

            return {
                success: true,
                data: {
                    preview_customers: response.data?.customers || [],
                    estimated_count: response.data?.pagination?.total || 0,
                    criteria: criteria
                }
            };
        } catch (error) {
            console.error('Error previewing segment:', error);
            throw error;
        }
    }

    /**
     * Convert segment criteria to customer API filters
     * @param {Object} criteria - Segment criteria
     * @returns {Object} Customer filters
     */
    criteriaToFilters(criteria) {
        const filters = {};

        if (criteria.status) {
            filters.status = criteria.status;
        }

        // Note: LTV, health score, etc. filtering would need to be handled
        // by the backend or approximated here
        return filters;
    }
}

// Make SegmentAPI available globally
window.segmentAPI = new SegmentAPI();