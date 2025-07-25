/**
 * Environment API Service
 * Handles all API calls related to environment management
 */

class EnvironmentApiService {
    constructor() {
        this.baseUrl = '/api/v1/environments';
    }
    
    /**
     * Get all environments
     */
    async getEnvironments() {
        try {
            const response = await authenticatedFetch(this.baseUrl);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch environments');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching environments:', error);
            throw error;
        }
    }
    
    /**
     * Get single environment by ID
     */
    async getEnvironment(id) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}`);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch environment');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching environment:', error);
            throw error;
        }
    }
    
    /**
     * Create new environment
     */
    async createEnvironment(environmentData) {
        try {
            // Validate required fields
            this.validateEnvironmentData(environmentData);
            
            const response = await authenticatedFetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(environmentData)
            });
            
            if (!response.success) {
                if (response.details && Array.isArray(response.details)) {
                    // Validation errors
                    const errorMessage = response.details
                        .map(detail => `${detail.path}: ${detail.msg}`)
                        .join('; ');
                    throw new Error(`Validation failed: ${errorMessage}`);
                }
                throw new Error(response.error || 'Failed to create environment');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error creating environment:', error);
            throw error;
        }
    }
    
    /**
     * Update environment
     */
    async updateEnvironment(id, environmentData) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(environmentData)
            });
            
            if (!response.success) {
                if (response.details && Array.isArray(response.details)) {
                    // Validation errors
                    const errorMessage = response.details
                        .map(detail => `${detail.path}: ${detail.msg}`)
                        .join('; ');
                    throw new Error(`Validation failed: ${errorMessage}`);
                }
                throw new Error(response.error || 'Failed to update environment');
            }
            
            return response;
        } catch (error) {
            console.error('Error updating environment:', error);
            throw error;
        }
    }
    
    /**
     * Delete (deactivate) environment
     */
    async deleteEnvironment(id) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to delete environment');
            }
            
            return response;
        } catch (error) {
            console.error('Error deleting environment:', error);
            throw error;
        }
    }
    
    /**
     * Test environment services (comprehensive testing)
     */
    async testConnection(id) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}/test-connection`, {
                method: 'POST'
            });
            
            // If it's a comprehensive service test response, return it as-is
            if (response.summary && response.test_results) {
                return response;
            }
            
            // For simple responses, format them
            return {
                success: response.success,
                message: response.success ? 'Connection successful' : response.error,
                details: response.details || null
            };
        } catch (error) {
            console.error('Error testing services:', error);
            return {
                success: false,
                message: error.message || 'Service test failed',
                details: null
            };
        }
    }
    
    /**
     * Get environment access log
     */
    async getAccessLog(id, page = 1, limit = 50) {
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString()
            });
            
            const response = await authenticatedFetch(`${this.baseUrl}/${id}/access-log?${params}`);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch access log');
            }
            
            return {
                logs: response.data,
                pagination: response.pagination
            };
        } catch (error) {
            console.error('Error fetching access log:', error);
            throw error;
        }
    }
    
    /**
     * Validate environment data before sending to API
     */
    validateEnvironmentData(data) {
        const errors = [];
        
        // Required fields (db_password is optional for discovery-based environments)
        const requiredFields = {
            env_name: 'Environment name',
            env_type: 'Environment type',
            display_name: 'Display name',
            db_host: 'Database host',
            db_name: 'Database name',
            db_user: 'Database user'
        };
        
        Object.entries(requiredFields).forEach(([field, label]) => {
            if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
                errors.push(`${label} is required`);
            }
        });
        
        // Environment name format validation
        if (data.env_name && !/^[a-zA-Z0-9_-]+$/.test(data.env_name)) {
            errors.push('Environment name must contain only letters, numbers, underscores, and dashes');
        }
        
        // Environment type validation
        const validTypes = ['production', 'test', 'development', 'nqa'];
        if (data.env_type && !validTypes.includes(data.env_type)) {
            errors.push('Invalid environment type');
        }
        
        // Port validation
        if (data.db_port && (data.db_port < 1 || data.db_port > 65535)) {
            errors.push('Database port must be between 1 and 65535');
        }
        
        // URL validation
        if (data.api_base_url && data.api_base_url.trim()) {
            try {
                new URL(data.api_base_url);
            } catch {
                errors.push('API base URL must be a valid URL');
            }
        }
        
        if (errors.length > 0) {
            throw new Error(errors.join('; '));
        }
        
        return true;
    }
    
    /**
     * Format environment data for API
     */
    formatEnvironmentData(formData) {
        const data = {
            env_name: formData.env_name?.trim(),
            env_type: formData.env_type,
            display_name: formData.display_name?.trim(),
            description: formData.description?.trim() || '',
            db_host: formData.db_host?.trim(),
            db_port: parseInt(formData.db_port) || 3306,
            db_name: formData.db_name?.trim(),
            db_user: formData.db_user?.trim(),
            color_theme: formData.color_theme || 'blue',
            icon: formData.icon || 'server',
            is_default: Boolean(formData.is_default)
        };
        
        // Handle db_password - optional for discovered environments
        if (formData.db_password) {
            data.db_password = formData.db_password;
        }
        // No error thrown - backend will handle discovered environments
        
        // Handle api_base_url - only include if not empty
        if (formData.api_base_url?.trim()) {
            data.api_base_url = formData.api_base_url.trim();
        }
        
        // Remove empty optional fields (except description which can be empty)
        Object.keys(data).forEach(key => {
            if (data[key] === '' && key !== 'description') {
                delete data[key];
            }
        });
        
        return data;
    }
    
    /**
     * Handle API errors and format them for display
     */
    formatApiError(error) {
        if (error.response && error.response.status) {
            switch (error.response.status) {
                case 400:
                    return 'Invalid request data. Please check your input.';
                case 401:
                    return 'Authentication required. Please log in again.';
                case 403:
                    return 'You do not have permission to perform this action.';
                case 404:
                    return 'Environment not found.';
                case 409:
                    return 'Environment name already exists.';
                case 500:
                    return 'Server error. Please try again later.';
                default:
                    return error.message || 'An unexpected error occurred.';
            }
        }
        
        return error.message || 'An unexpected error occurred.';
    }
    
    /**
     * Test all services with form data (comprehensive service testing)
     */
    async testFormConnection(connectionData) {
        try {
            console.log('🔗 API: testFormConnection called with:', connectionData);
            console.log('📡 API: Making request to:', `${this.baseUrl}/test-connection`);
            
            const response = await authenticatedFetch(`${this.baseUrl}/test-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(connectionData)
            });
            
            console.log('📥 API: Response received:', response);
            
            if (!response.success) {
                console.log('❌ API: Response indicates failure');
                throw new Error(response.error || 'Service test failed');
            }
            
            console.log('✅ API: Response indicates success');
            return response;
        } catch (error) {
            console.error('💥 API: Error testing services:', error);
            throw error;
        }
    }

    /**
     * Test database connection with form data (legacy method)
     */
    async testConnectionWithData(connectionData) {
        // Redirect to comprehensive service testing
        return await this.testFormConnection(connectionData);
    }
    
    /**
     * Auto-discover environment details from connection
     */
    async autodiscoverEnvironment(connectionData) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/autodiscover`, {
                method: 'POST',
                body: connectionData
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to discover environment details');
            }
            
            return response;
        } catch (error) {
            console.error('Error discovering environment:', error);
            throw error;
        }
    }
    
    /**
     * Sync environment variables from server to database
     */
    async syncFromServer(id) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}/sync-from-server`, {
                method: 'POST'
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to sync from server');
            }
            
            return response;
        } catch (error) {
            console.error('Error syncing from server:', error);
            throw error;
        }
    }
    
    /**
     * Sync environment variables from database to server
     */
    async syncToServer(id) {
        try {
            const response = await authenticatedFetch(`${this.baseUrl}/${id}/sync-to-server`, {
                method: 'POST'
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to sync to server');
            }
            
            return response;
        } catch (error) {
            console.error('Error syncing to server:', error);
            throw error;
        }
    }
}

// Create global instance
window.environmentApi = new EnvironmentApiService();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentApiService;
}