// Product List Component
class ProductList {
    constructor(container, options = {}) {
        this.container = container;
        this.products = [];
        this.selectedProducts = new Set();
        this.options = {
            onProductSelect: () => {},
            onProductEdit: () => {},
            onProductDelete: () => {},
            ...options
        };
        
        // Set up event delegation for product actions
        this.setupEventDelegation();
        
        this.init();
    }
    
    init() {
        this.bindEvents();
    }
    
    setupEventDelegation() {
        // Use event delegation to handle all button clicks
        this.container.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.dataset.action;
            const productId = button.dataset.productId;
            
            if (!productId) return;
            
            // Ensure app is available before calling methods
            if (!window.app) {
                console.error('App not initialized yet');
                return;
            }
            
            // Call the appropriate app method
            switch (action) {
                case 'edit':
                    window.app.editProduct(productId);
                    break;
                case 'manage-prices':
                    window.app.managePrices(productId);
                    break;
                case 'view-metadata':
                    window.app.viewMetadata(productId);
                    break;
                case 'clone':
                    window.app.cloneProduct(productId);
                    break;
                case 'activate':
                    window.app.activateProduct(productId);
                    break;
                case 'deactivate':
                    window.app.deactivateProduct(productId);
                    break;
            }
        });
    }
    
    bindEvents() {
        // Handle checkbox changes for bulk selection
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('product-checkbox')) {
                this.handleProductSelection(e.target);
            }
        });
        
        // Handle product card clicks
        this.container.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card && !e.target.closest('.product-actions') && !e.target.closest('.product-checkbox')) {
                this.options.onProductSelect(card.dataset.productId);
            }
        });
    }
    
    render(products) {
        this.products = products;
        
        if (!products || products.length === 0) {
            this.showEmptyState();
            return;
        }
        
        const html = products.map(product => this.renderProductCard(product)).join('');
        this.container.innerHTML = html;
        
        // Update selection state
        this.updateSelectionUI();
    }
    
    renderProductCard(product) {
        const issues = productValidator.detectProductIssues(product);
        const hasIssues = issues.length > 0;
        const isActive = product.active;
        const metadata = product.metadata || {};
        
        const cardClasses = [
            'product-card',
            !isActive && 'inactive',
            hasIssues && 'has-issues',
            this.selectedProducts.has(product.stripe_product_id) && 'selected'
        ].filter(Boolean).join(' ');
        
        return `
            <div class="${cardClasses}" data-product-id="${product.stripe_product_id}">
                <input type="checkbox" 
                       class="product-checkbox" 
                       value="${product.stripe_product_id}"
                       ${this.selectedProducts.has(product.stripe_product_id) ? 'checked' : ''}>
                
                <div class="product-header">
                    <h4 class="product-title">${this.escapeHtml(product.name)}</h4>
                    <div class="product-badges">
                        ${isActive ? 
                            '<span class="badge bg-success">Ativo</span>' : 
                            '<span class="badge bg-secondary">Inativo</span>'}
                        ${hasIssues ? 
                            `<span class="badge bg-warning" title="${issues.length} problemas encontrados">
                                <i class="fas fa-exclamation-triangle"></i> ${issues.length}
                            </span>` : ''}
                        ${product.sync_status === 'error' ?
                            '<span class="badge bg-danger">Erro de Sync</span>' : ''}
                    </div>
                </div>
                
                <div class="product-metadata">
                    ${this.renderMetadataRow('Tipo', productFormatter.formatPlanType(metadata.classification?.plan_type || ''))}
                    ${this.renderMetadataRow('Usuários', productFormatter.formatUserTier(metadata.classification?.user_tier || ''))}
                    ${this.renderMetadataRow('Pacientes', productFormatter.formatNumber(metadata.subscription_limits?.patients?.max_patients || 0))}
                    ${this.renderMetadataRow('AI Tokens', productFormatter.formatNumber(metadata.ai_quotas?.tokens?.monthly_limit || 0) + '/mês')}
                </div>
                
                <div class="product-prices">
                    <h5>Preços (${product.prices?.length || 0})</h5>
                    <div class="price-list">
                        ${this.renderPrices(product.prices)}
                    </div>
                </div>
                
                ${hasIssues ? this.renderIssues(issues) : ''}
                
                <div class="product-actions">
                    <button class="btn btn-sm btn-primary" 
                            data-action="edit"
                            data-product-id="${product.stripe_product_id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-success" 
                            data-action="manage-prices"
                            data-product-id="${product.stripe_product_id}">
                        <i class="fas fa-dollar-sign"></i> Preços
                    </button>
                    <button class="btn btn-sm btn-info" 
                            data-action="view-metadata"
                            data-product-id="${product.stripe_product_id}">
                        <i class="fas fa-code"></i> Metadata
                    </button>
                    <button class="btn btn-sm btn-secondary" 
                            data-action="clone"
                            data-product-id="${product.stripe_product_id}">
                        <i class="fas fa-copy"></i> Clonar
                    </button>
                    ${!isActive ? 
                        `<button class="btn btn-sm btn-success" 
                                data-action="activate"
                                data-product-id="${product.stripe_product_id}">
                            <i class="fas fa-check"></i> Ativar
                        </button>` :
                        `<button class="btn btn-sm btn-warning" 
                                data-action="deactivate"
                                data-product-id="${product.stripe_product_id}">
                            <i class="fas fa-ban"></i> Desativar
                        </button>`}
                </div>
            </div>
        `;
    }
    
    renderMetadataRow(label, value) {
        return `
            <div class="metadata-row">
                <span class="metadata-label">${label}:</span>
                <span class="metadata-value">${value || 'N/A'}</span>
            </div>
        `;
    }
    
    renderPrices(prices) {
        if (!prices || prices.length === 0) {
            return '<span class="text-muted">Sem preços definidos</span>';
        }
        
        // Sort prices by amount
        const sortedPrices = [...prices].sort((a, b) => a.unit_amount - b.unit_amount);
        
        // Show first 3 prices
        return sortedPrices.slice(0, 3).map(price => `
            <div class="price-item">
                <span class="price-amount">${productFormatter.formatCurrency(price.unit_amount)}</span>
                <span class="price-period">/${productFormatter.formatBillingPeriod(price.billing_period)}</span>
                ${!price.active ? '<span class="badge bg-warning">Inativo</span>' : ''}
            </div>
        `).join('');
    }
    
    renderIssues(issues) {
        return `
            <div class="product-issues">
                <h5>Problemas Detectados:</h5>
                <ul class="issue-list">
                    ${issues.slice(0, 3).map(issue => `
                        <li class="issue-item issue-${issue.severity}">
                            ${issue.message}
                        </li>
                    `).join('')}
                    ${issues.length > 3 ? `
                        <li class="issue-item">
                            e mais ${issues.length - 3} problema${issues.length - 3 > 1 ? 's' : ''}...
                        </li>
                    ` : ''}
                </ul>
            </div>
        `;
    }
    
    handleProductSelection(checkbox) {
        const productId = checkbox.value;
        const card = checkbox.closest('.product-card');
        
        if (checkbox.checked) {
            this.selectedProducts.add(productId);
            card.classList.add('selected');
        } else {
            this.selectedProducts.delete(productId);
            card.classList.remove('selected');
        }
        
        this.updateBulkActionsBar();
    }
    
    updateBulkActionsBar() {
        const bulkBar = document.getElementById('bulk-actions-bar');
        const bulkCount = document.getElementById('bulk-count');
        
        if (this.selectedProducts.size > 0) {
            bulkBar.style.display = 'flex';
            bulkCount.textContent = this.selectedProducts.size;
        } else {
            bulkBar.style.display = 'none';
        }
    }
    
    selectAll() {
        this.products.forEach(product => {
            this.selectedProducts.add(product.stripe_product_id);
        });
        this.updateSelectionUI();
    }
    
    deselectAll() {
        this.selectedProducts.clear();
        this.updateSelectionUI();
    }
    
    updateSelectionUI() {
        // Update checkboxes
        this.container.querySelectorAll('.product-checkbox').forEach(checkbox => {
            const isSelected = this.selectedProducts.has(checkbox.value);
            checkbox.checked = isSelected;
            
            const card = checkbox.closest('.product-card');
            if (isSelected) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        
        this.updateBulkActionsBar();
    }
    
    getSelectedProducts() {
        return Array.from(this.selectedProducts);
    }
    
    showEmptyState() {
        document.getElementById('products-container').style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
    }
    
    hideEmptyState() {
        document.getElementById('products-container').style.display = 'grid';
        document.getElementById('empty-state').style.display = 'none';
    }
    
    showLoading() {
        this.container.innerHTML = `
            <div class="loading-placeholder">
                <div class="loading"></div>
                <p>Carregando produtos...</p>
            </div>
        `;
    }
    
    updateStats(products) {
        const stats = {
            total: products.length,
            active: products.filter(p => p.active).length,
            issues: products.filter(p => productValidator.detectProductIssues(p).length > 0).length,
            synced: products.filter(p => p.sync_status === 'synced').length
        };
        
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-active').textContent = stats.active;
        document.getElementById('stat-issues').textContent = stats.issues;
        document.getElementById('stat-synced').textContent = stats.synced;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}