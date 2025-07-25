/**
 * User API Service
 * Handles all API calls related to user management
 */

class UserApiService {
    constructor() {
        this.baseUrl = '/api/v1/users';
    }
    
    /**
     * Get users from selected environment
     */
    async getUsers(environmentId, options = {}) {
        try {
            const params = new URLSearchParams({
                environment_id: environmentId,
                ...options
            });
            
            const response = await authenticatedFetch(`${this.baseUrl}?${params}`);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch users');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    }
    
    /**
     * Get single user by email
     */
    async getUserDetails(email, environmentId) {
        try {
            const params = new URLSearchParams({
                environment_id: environmentId
            });
            
            const response = await authenticatedFetch(`${this.baseUrl}/${encodeURIComponent(email)}?${params}`);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch user details');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching user details:', error);
            throw error;
        }
    }
    
    /**
     * Get user statistics from selected environment
     */
    async getUserStatistics(environmentId) {
        try {
            const params = new URLSearchParams({
                environment_id: environmentId
            });
            
            const response = await authenticatedFetch(`${this.baseUrl}/stats?${params}`);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch user statistics');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching user statistics:', error);
            throw error;
        }
    }
    
    /**
     * Search users with filters
     */
    async searchUsers(environmentId, filters = {}) {
        try {
            const searchOptions = {
                role: filters.role || 'all',
                status: filters.status || 'active',
                search: filters.search || '',
                page: filters.page || 1,
                limit: filters.limit || 20,
                sort_field: filters.sort_field || 'fullname',
                sort_direction: filters.sort_direction || 'asc'
            };
            
            return await this.getUsers(environmentId, searchOptions);
        } catch (error) {
            console.error('Error searching users:', error);
            throw error;
        }
    }
    
    /**
     * Update user status (enable/disable/lock)
     */
    async updateUserStatus(email, environmentId, status, reason = '') {
        try {
            const params = new URLSearchParams({
                environment_id: environmentId
            });
            
            const response = await authenticatedFetch(`${this.baseUrl}/${encodeURIComponent(email)}/status?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: status,
                    reason: reason
                })
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to update user status');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error updating user status:', error);
            throw error;
        }
    }
    
    /**
     * Reset user password
     */
    async resetUserPassword(email, environmentId, options = {}) {
        try {
            const params = new URLSearchParams({
                environment_id: environmentId
            });
            
            const requestBody = {
                send_email: options.send_email !== false, // default true
                force_change: options.force_change !== false // default true
            };
            
            // Include custom password if provided
            if (options.new_password) {
                requestBody.new_password = options.new_password;
            }
            
            const response = await authenticatedFetch(`${this.baseUrl}/${encodeURIComponent(email)}/reset-password?${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to reset password');
            }
            
            return response.data;
        } catch (error) {
            console.error('Error resetting password:', error);
            throw error;
        }
    }
}

// Create global instance
const userApi = new UserApiService();