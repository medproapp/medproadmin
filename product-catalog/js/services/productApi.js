// Product Catalog API Service
class ProductCatalogAPI {
    constructor() {
        this.baseUrl = '/api/v1';
    }
    
    // Products
    async getProducts(filters = {}) {
        const params = new URLSearchParams();
        
        // Add filters to params
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== undefined && filters[key] !== null) {
                params.append(key, filters[key]);
            }
        });
        
        return await authenticatedFetch(`${this.baseUrl}/products?${params}`);
    }
    
    async getProduct(productId) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}`);
    }
    
    async createProduct(productData) {
        return await authenticatedFetch(`${this.baseUrl}/products`, {
            method: 'POST',
            body: productData
        });
    }
    
    async updateProduct(productId, updates) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}`, {
            method: 'PUT',
            body: updates
        });
    }
    
    async deleteProduct(productId) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}`, {
            method: 'DELETE'
        });
    }
    
    async cloneProduct(productId, newData) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}/clone`, {
            method: 'POST',
            body: newData
        });
    }
    
    // Prices
    async getPrices(productId) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}/prices`);
    }
    
    async createPrice(productId, priceData) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}/prices`, {
            method: 'POST',
            body: priceData
        });
    }
    
    async updatePrice(priceId, updates) {
        return await authenticatedFetch(`${this.baseUrl}/prices/${priceId}`, {
            method: 'PUT',
            body: updates
        });
    }
    
    async deletePrice(priceId) {
        return await authenticatedFetch(`${this.baseUrl}/prices/${priceId}`, {
            method: 'DELETE'
        });
    }
    
    // Metadata
    async getMetadata(productId) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}/metadata`);
    }
    
    async updateMetadata(productId, metadata) {
        return await authenticatedFetch(`${this.baseUrl}/products/${productId}/metadata`, {
            method: 'PUT',
            body: { metadata }
        });
    }
    
    async validateMetadata(metadata) {
        return await authenticatedFetch(`${this.baseUrl}/products/validate-metadata`, {
            method: 'POST',
            body: { metadata }
        });
    }
    
    async getMetadataTemplates() {
        return await authenticatedFetch(`${this.baseUrl}/metadata/templates`);
    }
    
    async createMetadataTemplate(template) {
        return await authenticatedFetch(`${this.baseUrl}/metadata/templates`, {
            method: 'POST',
            body: template
        });
    }
    
    // Bulk Operations
    async bulkUpdate(productIds, updates) {
        return await authenticatedFetch(`${this.baseUrl}/products/bulk-update`, {
            method: 'POST',
            body: { productIds, updates }
        });
    }
    
    async bulkActivate(productIds) {
        return await authenticatedFetch(`${this.baseUrl}/products/bulk-activate`, {
            method: 'POST',
            body: { productIds }
        });
    }
    
    async bulkDeactivate(productIds) {
        return await authenticatedFetch(`${this.baseUrl}/products/bulk-deactivate`, {
            method: 'POST',
            body: { productIds }
        });
    }
    
    async bulkDelete(productIds) {
        return await authenticatedFetch(`${this.baseUrl}/products/bulk-delete`, {
            method: 'DELETE',
            body: { productIds }
        });
    }
    
    // V3 Recovery
    async runV3Audit() {
        return await authenticatedFetch(`${this.baseUrl}/products/v3-audit`);
    }
    
    async executeV3Recovery(steps) {
        return await authenticatedFetch(`${this.baseUrl}/products/v3-recovery`, {
            method: 'POST',
            body: { steps }
        });
    }
    
    async fixLookupKeys(priceIds) {
        return await authenticatedFetch(`${this.baseUrl}/products/fix-lookup-keys`, {
            method: 'POST',
            body: { priceIds }
        });
    }
    
    async cleanupOrphaned() {
        return await authenticatedFetch(`${this.baseUrl}/products/cleanup-orphaned`, {
            method: 'POST'
        });
    }
    
    // Sync
    async syncFromStripe() {
        return await authenticatedFetch(`${this.baseUrl}/sync/stripe/full`, {
            method: 'POST'
        });
    }
    
    async syncToStripe() {
        return await authenticatedFetch(`${this.baseUrl}/sync/local-to-stripe`, {
            method: 'POST'
        });
    }
    
    async getSyncStatus() {
        return await authenticatedFetch(`${this.baseUrl}/sync/status`);
    }
    
    async verifySync() {
        return await authenticatedFetch(`${this.baseUrl}/sync/verify`, {
            method: 'POST'
        });
    }
    
    // Audit
    async getProductAudit(productId) {
        return await authenticatedFetch(`${this.baseUrl}/audit/products/${productId}`);
    }
    
    async getRecentAudit(limit = 50) {
        return await authenticatedFetch(`${this.baseUrl}/audit/recent?limit=${limit}`);
    }
    
    async getUserAudit(userId) {
        return await authenticatedFetch(`${this.baseUrl}/audit/user/${userId}`);
    }
}

// Create global instance
window.productAPI = new ProductCatalogAPI();