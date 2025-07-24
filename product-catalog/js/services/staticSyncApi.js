// Static Sync API Service
class StaticSyncAPI {
    constructor() {
        this.baseUrl = '/api/v1/static-sync';
    }
    
    async configure(selectedProducts, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/configure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedProducts,
                    tierMapping: {
                        agendamento: selectedProducts.agendamento?.stripe_product_id,
                        clinica: selectedProducts.clinica?.stripe_product_id
                    },
                    backupCurrent: options.createBackup !== false,
                    validatePricing: options.validatePricing !== false,
                    ...options
                })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Configure sync error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async apply(configurationId, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    configurationId,
                    confirmApply: true,
                    ...options
                })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Apply sync error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async preview(configurationId) {
        try {
            const response = await fetch(`${this.baseUrl}/preview/${configurationId}`);
            return await response.text(); // Return HTML content
        } catch (error) {
            console.error('Preview sync error:', error);
            throw error;
        }
    }
    
    async validateProducts(products) {
        try {
            const response = await fetch(`${this.baseUrl}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ products })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Validate products error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getBackups() {
        try {
            const response = await fetch(`${this.baseUrl}/backups`);
            return await response.json();
        } catch (error) {
            console.error('Get backups error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async restoreBackup(backupId) {
        try {
            const response = await fetch(`${this.baseUrl}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ backupId })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Restore backup error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getSyncHistory() {
        try {
            const response = await fetch(`${this.baseUrl}/history`);
            return await response.json();
        } catch (error) {
            console.error('Get sync history error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Global instance
window.staticSyncAPI = new StaticSyncAPI();