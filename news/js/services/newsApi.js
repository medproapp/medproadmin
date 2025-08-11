/**
 * News API Service
 * Handles all API communication for news management
 */

class NewsApiService {
    constructor() {
        this.baseUrl = '/api/v1/news';
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Get authentication headers with JWT token
     * @returns {Object} Headers object with Authorization
     */
    getAuthHeaders() {
        const token = localStorage.getItem('adminToken');
        return {
            ...this.defaultHeaders,
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Handle API response and check for errors
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Parsed JSON response
     */
    async handleResponse(response) {
        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.error || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.details = data.details;
            throw error;
        }
        
        return data;
    }

    /**
     * List news articles with optional filtering and pagination
     * @param {Object} params - Query parameters
     * @param {number} params.page - Page number (default: 1)
     * @param {number} params.limit - Items per page (default: 20)
     * @param {string} params.category - Filter by category
     * @param {string} params.type - Filter by type
     * @param {string} params.status - Filter by status (active/inactive)
     * @param {string} params.target_audience - Filter by target audience
     * @param {string} params.search - Search term
     * @param {string} params.sort_by - Sort field
     * @param {string} params.sort_order - Sort order (ASC/DESC)
     * @returns {Promise<Object>} API response with articles and pagination
     */
    async getArticles(params = {}) {
        try {
            const queryParams = new URLSearchParams();
            
            // Add all provided parameters to query string
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    queryParams.append(key, value);
                }
            });

            const url = `${this.baseUrl}?${queryParams.toString()}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error fetching articles:', error);
            throw error;
        }
    }

    /**
     * Get single news article by ID
     * @param {number} id - Article ID
     * @returns {Promise<Object>} API response with article data
     */
    async getArticle(id) {
        try {
            const response = await fetch(`${this.baseUrl}/${id}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error fetching article:', error);
            throw error;
        }
    }

    /**
     * Create new news article
     * @param {Object} articleData - Article data
     * @param {string} articleData.title - Article title
     * @param {string} articleData.summary - Article summary
     * @param {string} articleData.content - Article content
     * @param {string} articleData.category - Article category
     * @param {string} articleData.type - Article type
     * @param {boolean} articleData.featured - Whether article is featured
     * @param {boolean} articleData.active - Whether article is active
     * @param {string} articleData.target_audience - Target audience
     * @param {string} articleData.link_url - External link URL
     * @param {string} articleData.link_text - External link text
     * @param {string} articleData.image_url - Image URL
     * @param {string} articleData.publish_date - Publish date (ISO format)
     * @param {string} articleData.expiry_date - Expiry date (ISO format)
     * @returns {Promise<Object>} API response with created article ID
     */
    async createArticle(articleData) {
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(articleData)
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error creating article:', error);
            throw error;
        }
    }

    /**
     * Update existing news article
     * @param {number} id - Article ID
     * @param {Object} articleData - Updated article data
     * @returns {Promise<Object>} API response
     */
    async updateArticle(id, articleData) {
        try {
            const response = await fetch(`${this.baseUrl}/${id}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(articleData)
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error updating article:', error);
            throw error;
        }
    }

    /**
     * Delete news article
     * @param {number} id - Article ID
     * @returns {Promise<Object>} API response
     */
    async deleteArticle(id) {
        try {
            const response = await fetch(`${this.baseUrl}/${id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error deleting article:', error);
            throw error;
        }
    }

    /**
     * Publish or unpublish news article
     * @param {number} id - Article ID
     * @param {boolean} published - Whether to publish or unpublish
     * @returns {Promise<Object>} API response
     */
    async togglePublishStatus(id, published) {
        try {
            const response = await fetch(`${this.baseUrl}/${id}/publish`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ published })
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error changing publish status:', error);
            throw error;
        }
    }

    /**
     * Get available categories for filter dropdown
     * @returns {Promise<Object>} API response with categories list
     */
    async getCategories() {
        try {
            const response = await fetch(`${this.baseUrl}/meta/categories`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error fetching categories:', error);
            throw error;
        }
    }

    /**
     * Batch operations for multiple articles
     * @param {Array<number>} articleIds - Array of article IDs
     * @param {string} action - Action to perform (publish/unpublish/delete)
     * @returns {Promise<Array>} Array of API responses
     */
    async batchOperation(articleIds, action) {
        const results = [];
        
        for (const id of articleIds) {
            try {
                let result;
                
                switch (action) {
                    case 'publish':
                        result = await this.togglePublishStatus(id, true);
                        break;
                    case 'unpublish':
                        result = await this.togglePublishStatus(id, false);
                        break;
                    case 'delete':
                        result = await this.deleteArticle(id);
                        break;
                    default:
                        throw new Error(`Invalid action: ${action}`);
                }
                
                results.push({ id, success: true, result });
            } catch (error) {
                results.push({ id, success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Upload image for article
     * @param {File} file - Image file
     * @returns {Promise<Object>} API response with image URL
     */
    async uploadImage(file) {
        try {
            const formData = new FormData();
            formData.append('image', file);

            const token = localStorage.getItem('adminToken');
            const response = await fetch('/api/v1/upload/image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            return await this.handleResponse(response);
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    /**
     * Validate article data before submission
     * @param {Object} articleData - Article data to validate
     * @returns {Object} Validation result with errors array
     */
    validateArticleData(articleData) {
        const errors = [];
        
        // Required fields validation
        if (!articleData.title || articleData.title.trim().length === 0) {
            errors.push('Title is required');
        } else if (articleData.title.length > 255) {
            errors.push('Title must be less than 255 characters');
        }
        
        if (articleData.summary && articleData.summary.length > 1000) {
            errors.push('Summary must be less than 1000 characters');
        }
        
        if (articleData.category && articleData.category.length > 100) {
            errors.push('Category must be less than 100 characters');
        }
        
        if (articleData.link_text && articleData.link_text.length > 100) {
            errors.push('Link text must be less than 100 characters');
        }
        
        // Enum validations
        const validTypes = ['feature', 'update', 'fix', 'security', 'maintenance'];
        if (articleData.type && !validTypes.includes(articleData.type)) {
            errors.push('Invalid article type');
        }
        
        const validAudiences = ['all', 'practitioners', 'patients'];
        if (articleData.target_audience && !validAudiences.includes(articleData.target_audience)) {
            errors.push('Invalid target audience');
        }
        
        // URL validations
        if (articleData.link_url && !this.isValidUrl(articleData.link_url)) {
            errors.push('Link URL must be a valid URL');
        }
        
        if (articleData.image_url && !this.isValidUrl(articleData.image_url)) {
            errors.push('Image URL must be a valid URL');
        }
        
        // Date validations
        if (articleData.publish_date && !this.isValidDate(articleData.publish_date)) {
            errors.push('Publish date must be a valid date');
        }
        
        if (articleData.expiry_date && !this.isValidDate(articleData.expiry_date)) {
            errors.push('Expiry date must be a valid date');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Helper method to validate URLs
     * @param {string} url - URL to validate
     * @returns {boolean} Whether URL is valid
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Helper method to validate dates
     * @param {string} dateString - Date string to validate
     * @returns {boolean} Whether date is valid
     */
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Get type icon for article type
     * @param {string} type - Article type
     * @returns {string} Font Awesome icon class
     */
    getTypeIcon(type) {
        const icons = {
            feature: 'fas fa-rocket',
            update: 'fas fa-bolt',
            fix: 'fas fa-wrench',
            security: 'fas fa-shield-alt',
            maintenance: 'fas fa-tools'
        };
        return icons[type] || 'fas fa-bullhorn';
    }

    /**
     * Get audience icon for target audience
     * @param {string} audience - Target audience
     * @returns {string} Font Awesome icon class
     */
    getAudienceIcon(audience) {
        const icons = {
            all: 'fas fa-globe',
            practitioners: 'fas fa-user-md',
            patients: 'fas fa-users'
        };
        return icons[audience] || 'fas fa-users';
    }
}

// Export singleton instance
window.newsApiService = new NewsApiService();