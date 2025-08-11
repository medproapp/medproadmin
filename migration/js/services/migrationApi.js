/**
 * Migration API Service
 * Handles all API calls for migration management
 */

class MigrationAPI {
    constructor() {
        this.baseUrl = '/api/v1';
    }

    // Migration Sources API
    async getSources() {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-sources`);
    }

    async getSource(id) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-sources/${id}`);
    }

    async createSource(sourceData) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-sources`, {
            method: 'POST',
            body: sourceData
        });
    }

    async updateSource(id, sourceData) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-sources/${id}`, {
            method: 'PUT',
            body: sourceData
        });
    }

    async deleteSource(id) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-sources/${id}`, {
            method: 'DELETE'
        });
    }

    // Migration Jobs API
    async getJobs() {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-jobs`);
    }

    async getJob(id) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-jobs/${id}`);
    }

    async createJob(jobData) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-jobs`, {
            method: 'POST',
            body: jobData
        });
    }

    async updateJob(id, jobData) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-jobs/${id}`, {
            method: 'PUT',
            body: jobData
        });
    }

    async deleteJob(id) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-jobs/${id}`, {
            method: 'DELETE'
        });
    }

    async executeJob(id, data = {}) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-executions/jobs/${id}/execute`, {
            method: 'POST',
            body: data
        });
    }

    // Migration Executions API
    async getExecution(id) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-executions/${id}`);
    }

    async getExecutionLogs(id, limit = 100) {
        return await adminAuth.authenticatedFetch(`${this.baseUrl}/migration-executions/${id}/logs?limit=${limit}`);
    }

    async getExecutions(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.append(key, value);
            }
        });
        
        const url = params.toString() ? 
            `${this.baseUrl}/migration-executions?${params.toString()}` : 
            `${this.baseUrl}/migration-executions`;
            
        return await adminAuth.authenticatedFetch(url);
    }
}

// Create global instance
const migrationAPI = new MigrationAPI(); 