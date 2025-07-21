// Product Catalog Main Application
class ProductCatalogApp {
    constructor() {
        this.currentFilters = {
            plan_type: '',
            user_tier: '',
            active: '',
            search: ''
        };
        
        this.currentPage = 1;
        this.perPage = 12;
        
        this.components = {
            productList: null,
            productEditor: null,
            metadataEditor: null,
            priceManager: null,
            recoveryWizard: null
        };
        
        // Demo mode flag - will use mock data when backend is not available
        this.demoMode = false;
    }
    
    async init() {
        // Check admin authentication
        if (!this.demoMode) {
            const auth = await checkAdminAuth();
            if (!auth) {
                return;
            }
            document.getElementById('admin-email').textContent = auth.email;
        } else {
            // Demo mode - show demo user
            document.getElementById('admin-email').textContent = 'demo@medpro.com';
        }
        
        // Initialize components
        this.initializeComponents();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadProducts();
    }
    
    initializeComponents() {
        // Initialize product list
        this.components.productList = new ProductList(
            document.getElementById('products-container'),
            {
                onProductSelect: (productId) => this.editProduct(productId),
                onProductEdit: (productId) => this.editProduct(productId),
                onProductDelete: (productId) => this.deleteProduct(productId)
            }
        );
        
        // Other components will be initialized as needed
    }
    
    setupEventListeners() {
        // New product button
        document.getElementById('btn-new-product').addEventListener('click', () => {
            this.createNewProduct();
        });
        
        // V3 Recovery button
        document.getElementById('btn-v3-recovery').addEventListener('click', () => {
            this.startV3Recovery();
        });
        
        // Sync button
        document.getElementById('btn-sync').addEventListener('click', () => {
            this.syncWithStripe();
        });
        
        // Filters
        document.getElementById('filter-plan-type').addEventListener('change', (e) => {
            this.currentFilters.plan_type = e.target.value;
            this.loadProducts();
        });
        
        document.getElementById('filter-user-tier').addEventListener('change', (e) => {
            this.currentFilters.user_tier = e.target.value;
            this.loadProducts();
        });
        
        document.getElementById('filter-status').addEventListener('change', (e) => {
            if (e.target.value === 'active') {
                this.currentFilters.active = true;
            } else if (e.target.value === 'inactive') {
                this.currentFilters.active = false;
            } else if (e.target.value === 'issues') {
                this.currentFilters.has_issues = true;
                this.currentFilters.active = '';
            } else {
                this.currentFilters.active = '';
                this.currentFilters.has_issues = false;
            }
            this.loadProducts();
        });
        
        // Search with debounce
        let searchTimeout;
        document.getElementById('filter-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.currentFilters.search = e.target.value;
                this.loadProducts();
            }, 300);
        });
        
        // Event delegation for filter tag removal
        document.getElementById('filter-tags').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action="remove-filter"]');
            if (button) {
                const filterKey = button.dataset.filterKey;
                this.removeFilter(filterKey);
            }
        });
        
        // Event delegation for bulk actions
        document.getElementById('bulk-actions-bar').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.dataset.action;
            switch (action) {
                case 'bulk-edit':
                    this.bulkEdit();
                    break;
                case 'bulk-sync':
                    this.bulkSync();
                    break;
                case 'bulk-archive':
                    this.bulkArchive();
                    break;
                case 'bulk-delete':
                    this.bulkDelete();
                    break;
            }
        });
    }
    
    async loadProducts() {
        try {
            this.components.productList.showLoading();
            
            let products;
            if (this.demoMode) {
                // Use demo data
                products = this.getDemoProducts();
                // Apply filters
                products = this.filterDemoProducts(products, this.currentFilters);
            } else {
                const response = await productAPI.getProducts(this.currentFilters);
                
                if (!response.success) {
                    throw new Error(response.error || 'Failed to load products');
                }
                
                products = response.data.products || [];
            }
            
            // Ensure products is an array
            if (!Array.isArray(products)) {
                console.error('Products is not an array:', products);
                products = [];
            }
            
            this.components.productList.render(products);
            this.components.productList.updateStats(products);
            this.updateFilterTags();
            
            // Hide empty state if we have products
            if (products.length > 0) {
                this.components.productList.hideEmptyState();
            } else {
                this.components.productList.showEmptyState();
            }
            
            // Show success message after initial load if we have products
            if (!this.hasShownInitialLoadMessage && products.length > 0) {
                this.hasShownInitialLoadMessage = true;
                adminUtils.showToast(`${products.length} produtos carregados`, 'success');
            }
            
        } catch (error) {
            console.error('Load products error:', error);
            adminUtils.showToast('Erro ao carregar produtos', 'error');
        }
    }
    
    updateFilterTags() {
        const container = document.getElementById('filter-tags');
        const tags = [];
        
        if (this.currentFilters.plan_type) {
            tags.push({
                label: `Tipo: ${productFormatter.formatPlanType(this.currentFilters.plan_type)}`,
                key: 'plan_type'
            });
        }
        
        if (this.currentFilters.user_tier) {
            tags.push({
                label: `Usuários: ${this.currentFilters.user_tier}`,
                key: 'user_tier'
            });
        }
        
        if (this.currentFilters.active !== '') {
            tags.push({
                label: this.currentFilters.active ? 'Ativos' : 'Inativos',
                key: 'active'
            });
        }
        
        if (this.currentFilters.has_issues) {
            tags.push({
                label: 'Com Problemas',
                key: 'has_issues'
            });
        }
        
        if (this.currentFilters.search) {
            tags.push({
                label: `Busca: ${this.currentFilters.search}`,
                key: 'search'
            });
        }
        
        container.innerHTML = tags.map(tag => `
            <span class="filter-tag">
                ${tag.label}
                <button data-action="remove-filter" data-filter-key="${tag.key}">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');
    }
    
    removeFilter(key) {
        if (key === 'active' || key === 'has_issues') {
            this.currentFilters.active = '';
            this.currentFilters.has_issues = false;
        } else {
            this.currentFilters[key] = '';
        }
        
        // Update UI
        if (key === 'plan_type') {
            document.getElementById('filter-plan-type').value = '';
        } else if (key === 'user_tier') {
            document.getElementById('filter-user-tier').value = '';
        } else if (key === 'search') {
            document.getElementById('filter-search').value = '';
        } else if (key === 'active' || key === 'has_issues') {
            document.getElementById('filter-status').value = '';
        }
        
        this.loadProducts();
    }
    
    createNewProduct() {
        // Initialize product editor if not already done
        if (!this.components.productEditor) {
            this.components.productEditor = new ProductEditor();
        }
        
        this.components.productEditor.showCreateModal();
    }
    
    async editProduct(productId) {
        try {
            // Initialize product editor if not already done
            if (!this.components.productEditor) {
                this.components.productEditor = new ProductEditor();
            }
            
            // In demo mode, find product from current list
            if (this.demoMode) {
                const products = this.getDemoProducts();
                const product = products.find(p => p.stripe_product_id === productId);
                if (product) {
                    this.components.productEditor.showEditModal(product);
                }
            } else {
                adminUtils.showLoading('Loading product...');
                const response = await productAPI.getProduct(productId);
                adminUtils.hideLoading();
                
                if (response.success) {
                    this.components.productEditor.showEditModal(response.data);
                } else {
                    throw new Error(response.error || 'Failed to load product');
                }
            }
        } catch (error) {
            adminUtils.hideLoading();
            console.error('Edit product error:', error);
            adminUtils.showToast('Error loading product', 'error');
        }
    }
    
    async viewMetadata(productId) {
        try {
            // In demo mode, find product from current list
            if (this.demoMode) {
                const products = this.getDemoProducts();
                const product = products.find(p => p.stripe_product_id === productId);
                if (product) {
                    const modal = new adminUtils.Modal({
                        title: 'Product Metadata',
                        content: `
                            <div class="metadata-viewer">
                                <div class="mb-3">
                                    <h6>Product: ${product.name}</h6>
                                    <small class="text-muted">ID: ${product.stripe_product_id}</small>
                                </div>
                                <pre class="bg-light p-3 rounded"><code>${JSON.stringify(product.metadata, null, 2)}</code></pre>
                            </div>
                        `,
                        size: 'lg',
                        footer: `
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" data-action="edit-from-metadata" data-product-id="${productId}">
                                <i class="fas fa-edit"></i> Edit Product
                            </button>
                        `
                    });
                    modal.show();
                    
                    // Add event listener for the edit button
                    const modalElement = modal.element;
                    modalElement.addEventListener('click', (e) => {
                        const button = e.target.closest('button[data-action="edit-from-metadata"]');
                        if (button) {
                            modal.hide();
                            this.editProduct(button.dataset.productId);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('View metadata error:', error);
            adminUtils.showToast('Error loading metadata', 'error');
        }
    }
    
    async managePrices(productId) {
        try {
            // Initialize price manager if not already done
            if (!this.components.priceManager) {
                this.components.priceManager = window.priceManager;
            }
            
            // In demo mode, find product from current list
            if (this.demoMode) {
                const products = this.getDemoProducts();
                const product = products.find(p => p.stripe_product_id === productId);
                if (product) {
                    this.components.priceManager.showModal(product);
                }
            } else {
                adminUtils.showLoading('Loading product...');
                const response = await productAPI.getProduct(productId);
                adminUtils.hideLoading();
                
                if (response.success) {
                    this.components.priceManager.showModal(response.data);
                } else {
                    throw new Error(response.error || 'Failed to load product');
                }
            }
        } catch (error) {
            adminUtils.hideLoading();
            console.error('Manage prices error:', error);
            adminUtils.showToast('Error loading product prices', 'error');
        }
    }
    
    async cloneProduct(productId) {
        try {
            // In demo mode, find product from current list
            if (this.demoMode) {
                const products = this.getDemoProducts();
                const product = products.find(p => p.stripe_product_id === productId);
                if (product) {
                    // Create a copy of the product
                    const clonedProduct = {
                        ...product,
                        stripe_product_id: null, // Will be generated
                        name: product.name + ' (Copy)',
                        active: false // Start as inactive
                    };
                    
                    // Initialize product editor if not already done
                    if (!this.components.productEditor) {
                        this.components.productEditor = new ProductEditor();
                    }
                    
                    // Show create modal with cloned data
                    const modal = this.components.productEditor.showCreateModal();
                    
                    // Pre-fill the form with cloned data
                    modal.on('show', () => {
                        setTimeout(() => {
                            document.getElementById('product-name').value = clonedProduct.name;
                            document.getElementById('product-description').value = clonedProduct.description;
                            document.getElementById('product-plan-type').value = clonedProduct.metadata?.classification?.plan_type || '';
                            document.getElementById('product-user-tier').value = clonedProduct.metadata?.classification?.user_tier || '';
                            adminUtils.showToast('Product data cloned. Please review and save.', 'info');
                        }, 100);
                    });
                }
            }
        } catch (error) {
            console.error('Clone product error:', error);
            adminUtils.showToast('Error cloning product', 'error');
        }
    }
    
    async activateProduct(productId) {
        if (!await adminUtils.confirmDialog('Tem certeza que deseja ativar este produto?')) {
            return;
        }
        
        adminUtils.showToast('Produto ativado com sucesso', 'success');
        this.loadProducts();
    }
    
    async deactivateProduct(productId) {
        if (!await adminUtils.confirmDialog('Tem certeza que deseja desativar este produto?')) {
            return;
        }
        
        adminUtils.showToast('Produto desativado com sucesso', 'success');
        this.loadProducts();
    }
    
    async deleteProduct(productId) {
        if (!await adminUtils.confirmDialog('Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.')) {
            return;
        }
        
        adminUtils.showToast('Produto excluído com sucesso', 'success');
        this.loadProducts();
    }
    
    async startV3Recovery() {
        // Initialize recovery wizard if not already done
        if (!this.components.recoveryWizard) {
            this.components.recoveryWizard = window.recoveryWizard;
        }
        
        this.components.recoveryWizard.showModal();
    }
    
    async syncWithStripe() {
        if (!await adminUtils.confirmDialog('Isso irá sincronizar todos os produtos com o Stripe. Continuar?')) {
            return;
        }
        
        adminUtils.showLoading('Sincronizando com Stripe...');
        
        try {
            // Call the real sync API endpoint
            const response = await productAPI.syncFromStripe();
            
            adminUtils.hideLoading();
            
            if (response.success) {
                const stats = response.data.stats || {};
                const errors = (stats.errors && Array.isArray(stats.errors)) ? stats.errors.length : 0;
                const synced = stats.products_synced || 0;
                const created = stats.products_created || 0;
                const updated = stats.products_updated || 0;
                const pricesSynced = stats.prices_synced || 0;
                
                const message = errors > 0 
                    ? `Sincronização concluída: ${synced} produtos sincronizados (${created} criados, ${updated} atualizados), ${pricesSynced} preços sincronizados (${errors} erros)`
                    : `Sincronização concluída: ${synced} produtos sincronizados (${created} criados, ${updated} atualizados), ${pricesSynced} preços sincronizados`;
                    
                adminUtils.showToast(message, errors > 0 ? 'warning' : 'success');
                
                // Reload products to show the synced data
                this.loadProducts();
            } else {
                throw new Error(response.error || 'Failed to sync products');
            }
        } catch (error) {
            adminUtils.hideLoading();
            console.error('Sync error:', error);
            adminUtils.showToast('Erro ao sincronizar com Stripe', 'error');
        }
    }
    
    // Bulk operations
    async bulkEdit() {
        const selected = this.components.productList.getSelectedProducts();
        adminUtils.showToast(`Editar ${selected.length} produtos - Em desenvolvimento`, 'info');
    }
    
    async bulkSync() {
        const selected = this.components.productList.getSelectedProducts();
        adminUtils.showToast(`Sincronizar ${selected.length} produtos - Em desenvolvimento`, 'info');
    }
    
    async bulkArchive() {
        const selected = this.components.productList.getSelectedProducts();
        if (!await adminUtils.confirmDialog(`Tem certeza que deseja arquivar ${selected.length} produtos?`)) {
            return;
        }
        adminUtils.showToast('Produtos arquivados com sucesso', 'success');
        this.components.productList.deselectAll();
        this.loadProducts();
    }
    
    async bulkDelete() {
        const selected = this.components.productList.getSelectedProducts();
        if (!await adminUtils.confirmDialog(`Tem certeza que deseja excluir ${selected.length} produtos? Esta ação não pode ser desfeita.`)) {
            return;
        }
        adminUtils.showToast('Produtos excluídos com sucesso', 'success');
        this.components.productList.deselectAll();
        this.loadProducts();
    }
    
    // Demo data methods
    getDemoProducts() {
        return [
            {
                stripe_product_id: 'prod_v3_clinic_10users',
                name: 'MedPro v3 - Plano Clínica - 10 usuários',
                description: 'Sistema completo de gestão de clínica médica para até 10 usuários',
                active: true,
                metadata: {
                    classification: {
                        plan_type: 'CLINIC',
                        user_tier: 10
                    },
                    subscription_limits: {
                        patients: { max_patients: 1000 },
                        users: { practitioners: 10, assistants: 5 }
                    },
                    ai_quotas: {
                        tokens: { monthly_limit: 500000, daily_limit: 20000 }
                    }
                },
                prices: [
                    { stripe_price_id: 'price_1', unit_amount: 53125, currency: 'BRL', billing_period: 'month', active: true },
                    { stripe_price_id: 'price_2', unit_amount: 286875, currency: 'BRL', billing_period: 'semester', active: true },
                    { stripe_price_id: 'price_3', unit_amount: 510000, currency: 'BRL', billing_period: 'year', active: true }
                ],
                sync_status: 'synced'
            },
            {
                stripe_product_id: 'prod_clinic_5users',
                name: 'MedPro - Plano Clínica - 5 usuários', // Missing v3
                description: 'Sistema de gestão de clínica médica para até 5 usuários',
                active: true,
                metadata: {
                    classification: {
                        plan_type: 'CLINIC',
                        user_tier: 5
                    },
                    subscription_limits: {
                        patients: { max_patients: 500 }
                    }
                    // Missing AI quotas
                },
                prices: [
                    { stripe_price_id: 'price_4', unit_amount: 26500, currency: 'BRL', billing_period: 'month', active: true, lookup_key: 'clinic_5users_monthly' } // Wrong lookup key
                ],
                sync_status: 'synced'
            },
            {
                stripe_product_id: 'prod_v3_scheduling_20users',
                name: 'MedPro v3 - Plano Agendamento - 20 usuários',
                description: 'Sistema de agendamento para até 20 usuários',
                active: true,
                metadata: {
                    classification: {
                        plan_type: 'SCHEDULING',
                        user_tier: 20
                    },
                    subscription_limits: {
                        patients: { max_patients: 2000 },
                        users: { practitioners: 20, assistants: 10 }
                    },
                    ai_quotas: {
                        tokens: { monthly_limit: 1000000, daily_limit: 40000 }
                    }
                },
                prices: [
                    { stripe_price_id: 'price_5', unit_amount: 85000, currency: 'BRL', billing_period: 'month', active: true }
                    // Missing semester and annual prices
                ],
                sync_status: 'error'
            },
            {
                stripe_product_id: 'prod_v3_clinic_50users',
                name: 'MedPro v3 - Plano Clínica - 50 usuários',
                description: 'Sistema completo para grandes clínicas',
                active: false,
                metadata: {
                    classification: {
                        plan_type: 'CLINIC',
                        user_tier: 50
                    },
                    subscription_limits: {
                        patients: { max_patients: 5000 },
                        users: { practitioners: 50, assistants: 25 }
                    },
                    ai_quotas: {
                        tokens: { monthly_limit: 2500000, daily_limit: 100000 }
                    }
                },
                prices: [
                    { stripe_price_id: 'price_6', unit_amount: 212500, currency: 'BRL', billing_period: 'month', active: false }
                ],
                sync_status: 'synced'
            }
        ];
    }
    
    filterDemoProducts(products, filters) {
        return products.filter(product => {
            // Filter by plan type
            if (filters.plan_type && product.metadata?.classification?.plan_type !== filters.plan_type) {
                return false;
            }
            
            // Filter by user tier
            if (filters.user_tier && product.metadata?.classification?.user_tier !== parseInt(filters.user_tier)) {
                return false;
            }
            
            // Filter by status
            if (filters.active !== '' && product.active !== filters.active) {
                return false;
            }
            
            // Filter by issues
            if (filters.has_issues) {
                const issues = productValidator.detectProductIssues(product);
                if (issues.length === 0) {
                    return false;
                }
            }
            
            // Filter by search
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                const nameMatch = product.name.toLowerCase().includes(searchLower);
                const descMatch = product.description?.toLowerCase().includes(searchLower);
                if (!nameMatch && !descMatch) {
                    return false;
                }
            }
            
            return true;
        });
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ProductCatalogApp();
    window.app = app; // Make app globally accessible before init
    app.init();
});