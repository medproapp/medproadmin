// Price Management Component
class PriceManager {
    constructor() {
        this.modal = null;
        this.currentProduct = null;
        this.currentPrices = [];
        this.pendingChanges = [];
    }
    
    showModal(product) {
        console.log('🔍 PriceManager: showModal called');
        console.log('🔍 PriceManager: Product data:', product);
        console.log('🔍 PriceManager: Product name:', product?.name);
        console.log('🔍 PriceManager: Product prices:', product?.prices);
        
        try {
            this.currentProduct = product;
            this.currentPrices = product.prices || [];
            this.pendingChanges = [];
            
            console.log('🔍 PriceManager: Current prices set:', this.currentPrices);
            console.log('🔍 PriceManager: Current prices length:', this.currentPrices.length);
            
            const modalContent = this.renderContent();
            console.log('🔍 PriceManager: Modal content rendered');
            
            this.modal = new adminUtils.Modal({
                title: `Manage Prices - ${product.name}`,
                content: modalContent,
                size: 'xl',
                footer: this.renderFooter()
            });
            
            console.log('🔍 PriceManager: Modal created');
            
            this.modal.on('show', () => {
                console.log('🔍 PriceManager: Modal show event triggered');
                this.setupEventListeners();
                this.renderPricesTable();
            });
            
            console.log('🔍 PriceManager: About to show modal');
            this.modal.show();
            console.log('🔍 PriceManager: Modal show() called');
            
            return this.modal;
        } catch (error) {
            console.error('❌ PriceManager: Error in showModal:', error);
            console.error('❌ PriceManager: Error stack:', error.stack);
            throw error;
        }
    }
    
    renderContent() {
        return `
            <div class="price-manager">
                <div class="row mb-4">
                    <div class="col-md-8">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle"></i>
                            <strong>Price Management</strong>
                            <p class="mb-0">Manage all prices for this product. MedPro uses BRL currency with the following standard periods: Monthly, Semester (6 months), and Annual.</p>
                        </div>
                    </div>
                    <div class="col-md-4 text-end">
                        <button type="button" class="btn btn-primary" onclick="priceManager.showAddPriceForm()">
                            <i class="fas fa-plus"></i> Add New Price
                        </button>
                    </div>
                </div>
                
                <div id="add-price-form" class="mb-4" style="display: none;">
                    ${this.renderAddPriceForm()}
                </div>
                
                <div class="current-prices">
                    <h5 class="mb-3">Current Prices</h5>
                    <div id="prices-table-container">
                        <!-- Prices table will be rendered here -->
                    </div>
                </div>
                
                <div class="price-recommendations mt-4" id="price-recommendations">
                    <!-- Recommendations will be shown here -->
                </div>
                
                <div class="pending-changes mt-4" id="pending-changes" style="display: none;">
                    <h5 class="mb-3">Pending Changes</h5>
                    <div id="changes-list">
                        <!-- Pending changes will be listed here -->
                    </div>
                </div>
            </div>
        `;
    }
    
    renderFooter() {
        return `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" 
                    class="btn btn-primary" 
                    id="save-prices-btn"
                    onclick="priceManager.savePrices()"
                    disabled>
                <i class="fas fa-save"></i> Save Changes
            </button>
        `;
    }
    
    renderAddPriceForm() {
        return `
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">Add New Price</h6>
                </div>
                <div class="card-body">
                    <form id="new-price-form" onsubmit="return false;">
                        <div class="row">
                            <div class="col-md-3">
                                <div class="mb-3">
                                    <label class="form-label">Billing Period</label>
                                    <select class="form-select" id="new-price-period" required>
                                        <option value="">Select period...</option>
                                        <option value="month">Monthly</option>
                                        <option value="semester">Semester (6 months)</option>
                                        <option value="year">Annual</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="mb-3">
                                    <label class="form-label">Amount (BRL)</label>
                                    <div class="input-group">
                                        <span class="input-group-text">R$</span>
                                        <input type="number" 
                                               class="form-control" 
                                               id="new-price-amount" 
                                               placeholder="0.00"
                                               step="0.01"
                                               min="0"
                                               required>
                                    </div>
                                    <small class="form-text text-muted">Enter amount in Reais (e.g., 531.25)</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="mb-3">
                                    <label class="form-label">Lookup Key</label>
                                    <input type="text" 
                                           class="form-control" 
                                           id="new-price-lookup-key" 
                                           placeholder="Auto-generated"
                                           readonly>
                                    <small class="form-text text-muted">Generated based on product and period</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="mb-3">
                                    <label class="form-label">Trial Days</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="new-price-trial-days" 
                                           placeholder="0"
                                           min="0"
                                           max="90"
                                           value="0">
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <div class="form-check mb-3">
                                    <input class="form-check-input" type="checkbox" id="new-price-active" checked>
                                    <label class="form-check-label" for="new-price-active">
                                        Active (available for new subscriptions)
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="text-end">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="priceManager.hideAddPriceForm()">
                                Cancel
                            </button>
                            <button type="button" class="btn btn-primary btn-sm" onclick="priceManager.addPrice()">
                                <i class="fas fa-plus"></i> Add Price
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }
    
    renderPricesTable() {
        console.log('🔍 PriceManager: renderPricesTable called');
        console.log('🔍 PriceManager: Current prices to render:', this.currentPrices);
        
        try {
            const container = document.getElementById('prices-table-container');
            console.log('🔍 PriceManager: Container found:', !!container);
            
            if (!container) {
                console.error('❌ PriceManager: prices-table-container not found');
                return;
            }
            
            if (this.currentPrices.length === 0) {
                console.log('🔍 PriceManager: No prices found, showing warning');
                container.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        No prices configured for this product. Add at least one price to make the product available for purchase.
                    </div>
                `;
                this.showRecommendations();
                return;
            }
            
            // Sort prices by period order
            const periodOrder = { 'month': 1, 'semester': 2, 'year': 3 };
            const sortedPrices = [...this.currentPrices].sort((a, b) => 
                (periodOrder[a.billing_period] || 99) - (periodOrder[b.billing_period] || 99)
            );
            
            console.log('🔍 PriceManager: Sorted prices:', sortedPrices);
            console.log('🔍 PriceManager: About to render', sortedPrices.length, 'price rows');
            
            const priceRows = sortedPrices.map((price, index) => {
                console.log('🔍 PriceManager: Rendering price row for:', price);
                try {
                    return this.renderPriceRow(price, index);
                } catch (error) {
                    console.error('❌ PriceManager: Error rendering price row:', error, price);
                    return `<tr><td colspan="7" class="text-danger">Error rendering price: ${error.message}</td></tr>`;
                }
            }).join('');
            
            const tableHTML = `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Amount</th>
                                <th>Per Month</th>
                                <th>Discount</th>
                                <th>Lookup Key</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${priceRows}
                        </tbody>
                    </table>
                </div>
            `;
            
            console.log('🔍 PriceManager: Setting container innerHTML');
            container.innerHTML = tableHTML;
            console.log('🔍 PriceManager: Table HTML set successfully');
            
            this.checkPriceCompleteness();
            console.log('🔍 PriceManager: Price completeness check completed');
            
        } catch (error) {
            console.error('❌ PriceManager: Error in renderPricesTable:', error);
            console.error('❌ PriceManager: Error stack:', error.stack);
        }
    }
    
    renderPriceRow(price, index) {
        console.log('🔍 PriceManager: renderPriceRow called for price:', price);
        console.log('🔍 PriceManager: Full price object keys:', Object.keys(price));
        console.log('🔍 PriceManager: billing_period value:', price.billing_period);
        console.log('🔍 PriceManager: billing_period type:', typeof price.billing_period);
        console.log('🔍 PriceManager: lookup_key value:', price.lookup_key);
        console.log('🔍 PriceManager: unit_amount:', price.unit_amount);
        console.log('🔍 PriceManager: currency:', price.currency);
        
        try {
            const monthlyAmount = this.calculateMonthlyAmount(price);
            console.log('🔍 PriceManager: Monthly amount calculated:', monthlyAmount);
            
            const discount = this.calculateDiscount(price);
            console.log('🔍 PriceManager: Discount calculated:', discount);
            
            const isModified = this.pendingChanges.some(change => 
                change.priceId === price.stripe_price_id && change.action !== 'delete'
            );
            const isDeleted = this.pendingChanges.some(change => 
                change.priceId === price.stripe_price_id && change.action === 'delete'
            );
            
            console.log('🔍 PriceManager: Price states - modified:', isModified, 'deleted:', isDeleted);
            
            // Check if productFormatter is available
            if (!window.productFormatter) {
                console.error('❌ PriceManager: productFormatter not available globally');
                throw new Error('productFormatter not available');
            }
            
            const formattedPrice = productFormatter.formatPrice(price.unit_amount);
            const formattedMonthlyAmount = productFormatter.formatPrice(monthlyAmount);
            console.log('🔍 PriceManager: Formatted prices - main:', formattedPrice, 'monthly:', formattedMonthlyAmount);
            
            const rowHTML = `
                <tr class="${isDeleted ? 'table-danger text-decoration-line-through' : ''} ${isModified ? 'table-warning' : ''}">
                    <td>
                        <strong>${this.formatPeriod(price.billing_period)}</strong>
                        ${price.trial_period_days > 0 ? `<br><small class="text-muted">${price.trial_period_days} day trial</small>` : ''}
                    </td>
                    <td>
                        ${formattedPrice}
                    </td>
                    <td>
                        <small class="text-muted">${formattedMonthlyAmount}/month</small>
                    </td>
                    <td>
                        ${discount > 0 ? `<span class="badge bg-success">${discount}% off</span>` : '-'}
                    </td>
                    <td>
                        <code class="small">${price.lookup_key || 'N/A'}</code>
                        ${this.isLookupKeyInvalid(price.lookup_key) ? '<br><span class="badge bg-danger">Invalid</span>' : ''}
                    </td>
                    <td>
                        ${price.active ? 
                            '<span class="badge bg-success">Active</span>' : 
                            '<span class="badge bg-secondary">Inactive</span>'}
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button type="button" 
                                    class="btn btn-outline-primary" 
                                    onclick="priceManager.editPrice('${price.stripe_price_id}')"
                                    ${isDeleted ? 'disabled' : ''}
                                    title="Edit price">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" 
                                    class="btn btn-outline-danger" 
                                    onclick="priceManager.deletePrice('${price.stripe_price_id}')"
                                    ${isDeleted ? 'disabled' : ''}
                                    title="Delete price">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            
            console.log('🔍 PriceManager: Row HTML generated successfully');
            return rowHTML;
            
        } catch (error) {
            console.error('❌ PriceManager: Error in renderPriceRow:', error);
            console.error('❌ PriceManager: Price data:', price);
            throw error;
        }
    }
    
    showAddPriceForm() {
        console.log('🔍 PriceManager: showAddPriceForm called');
        
        try {
            const form = document.getElementById('add-price-form');
            console.log('🔍 PriceManager: Add price form found:', !!form);
            
            if (!form) {
                console.error('❌ PriceManager: add-price-form element not found');
                return;
            }
            
            form.style.display = 'block';
            console.log('🔍 PriceManager: Form displayed');
            
            // Update lookup key preview when period changes
            const periodSelect = document.getElementById('new-price-period');
            console.log('🔍 PriceManager: Period select found:', !!periodSelect);
            
            if (periodSelect) {
                periodSelect.addEventListener('change', (e) => {
                    console.log('🔍 PriceManager: Period changed to:', e.target.value);
                    this.updateLookupKeyPreview();
                });
                
                // Focus on period select
                periodSelect.focus();
                console.log('🔍 PriceManager: Focus set on period select');
            }
            
        } catch (error) {
            console.error('❌ PriceManager: Error in showAddPriceForm:', error);
            console.error('❌ PriceManager: Error stack:', error.stack);
        }
    }
    
    hideAddPriceForm() {
        const form = document.getElementById('add-price-form');
        form.style.display = 'none';
        
        // Reset form
        document.getElementById('new-price-form').reset();
        document.getElementById('new-price-lookup-key').value = '';
    }
    
    updateLookupKeyPreview() {
        const period = document.getElementById('new-price-period').value;
        const lookupKeyInput = document.getElementById('new-price-lookup-key');
        
        if (period && this.currentProduct) {
            // Extract plan type and user tier from product metadata
            const planType = this.currentProduct.metadata?.classification?.plan_type?.toLowerCase() || 'unknown';
            const userTier = this.currentProduct.metadata?.classification?.user_tier || '0';
            
            // Generate lookup key: v3_{plan_type}_{user_tier}users_{period}
            const lookupKey = `v3_${planType}_${userTier}users_${period === 'semester' ? 'semester' : period + 'ly'}`;
            lookupKeyInput.value = lookupKey;
        } else {
            lookupKeyInput.value = '';
        }
    }
    
    async addPrice() {
        const period = document.getElementById('new-price-period').value;
        const amount = parseFloat(document.getElementById('new-price-amount').value);
        const lookupKey = document.getElementById('new-price-lookup-key').value;
        const trialDays = parseInt(document.getElementById('new-price-trial-days').value) || 0;
        const active = document.getElementById('new-price-active').checked;
        
        // Validation
        if (!period || !amount || amount <= 0) {
            adminUtils.showToast('Please fill all required fields', 'error');
            return;
        }
        
        // Check if price for this period already exists
        const existingPrice = this.currentPrices.find(p => p.billing_period === period);
        if (existingPrice && !this.pendingChanges.some(c => c.priceId === existingPrice.stripe_price_id && c.action === 'delete')) {
            adminUtils.showToast('A price for this period already exists', 'error');
            return;
        }
        
        // Create new price object
        const newPrice = {
            stripe_price_id: `temp_${Date.now()}`, // Temporary ID
            stripe_product_id: this.currentProduct.stripe_product_id,
            unit_amount: Math.round(amount * 100), // Convert to cents
            currency: 'BRL',
            billing_period: period,
            lookup_key: lookupKey,
            active: active,
            trial_period_days: trialDays,
            _isNew: true
        };
        
        // Add to pending changes
        this.pendingChanges.push({
            action: 'create',
            priceId: newPrice.stripe_price_id,
            data: newPrice
        });
        
        // Add to current prices for display
        this.currentPrices.push(newPrice);
        
        // Update UI
        this.renderPricesTable();
        this.updatePendingChanges();
        this.hideAddPriceForm();
        
        adminUtils.showToast('Price added to pending changes', 'success');
    }
    
    editPrice(priceId) {
        const price = this.currentPrices.find(p => p.stripe_price_id === priceId);
        if (!price) return;
        
        // Create edit form in a modal
        const editModal = new adminUtils.Modal({
            title: `Edit Price - ${this.formatPeriod(price.billing_period)}`,
            content: this.renderEditPriceForm(price),
            size: 'md',
            footer: `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="priceManager.saveEditPrice('${priceId}')">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            `
        });
        
        editModal.show();
    }
    
    renderEditPriceForm(price) {
        return `
            <form id="edit-price-form">
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    Note: You cannot change the amount of an existing price. To change the price, you must create a new price and deactivate the old one.
                </div>
                
                <div class="mb-3">
                    <label class="form-label">Current Amount</label>
                    <div class="input-group">
                        <span class="input-group-text">R$</span>
                        <input type="text" class="form-control" value="${(price.unit_amount / 100).toFixed(2)}" disabled>
                    </div>
                </div>
                
                <div class="mb-3">
                    <label class="form-label">Lookup Key</label>
                    <input type="text" 
                           class="form-control" 
                           id="edit-price-lookup-key" 
                           value="${price.lookup_key || ''}"
                           placeholder="e.g., v3_clinic_10users_monthly">
                    <small class="form-text text-muted">Used for API-based price lookups</small>
                </div>
                
                <div class="mb-3">
                    <label class="form-label">Trial Period Days</label>
                    <input type="number" 
                           class="form-control" 
                           id="edit-price-trial-days" 
                           value="${price.trial_period_days || 0}"
                           min="0"
                           max="90">
                </div>
                
                <div class="form-check">
                    <input class="form-check-input" 
                           type="checkbox" 
                           id="edit-price-active" 
                           ${price.active ? 'checked' : ''}>
                    <label class="form-check-label" for="edit-price-active">
                        Active (available for new subscriptions)
                    </label>
                </div>
            </form>
        `;
    }
    
    saveEditPrice(priceId) {
        const lookupKey = document.getElementById('edit-price-lookup-key').value;
        const trialDays = parseInt(document.getElementById('edit-price-trial-days').value) || 0;
        const active = document.getElementById('edit-price-active').checked;
        
        // Find the price
        const price = this.currentPrices.find(p => p.stripe_price_id === priceId);
        if (!price) return;
        
        // Check if anything changed
        const hasChanges = 
            (lookupKey !== (price.lookup_key || '')) ||
            (trialDays !== (price.trial_period_days || 0)) ||
            (active !== price.active);
        
        if (!hasChanges) {
            adminUtils.showToast('No changes detected', 'info');
            adminUtils.Modal.hideAll();
            return;
        }
        
        // Update price object
        price.lookup_key = lookupKey;
        price.trial_period_days = trialDays;
        price.active = active;
        
        // Add to pending changes if not already there
        const existingChange = this.pendingChanges.find(c => c.priceId === priceId);
        if (existingChange) {
            existingChange.data = { ...price };
        } else {
            this.pendingChanges.push({
                action: 'update',
                priceId: priceId,
                data: { ...price }
            });
        }
        
        // Update UI
        this.renderPricesTable();
        this.updatePendingChanges();
        
        adminUtils.showToast('Price updated in pending changes', 'success');
        adminUtils.Modal.hideAll();
    }
    
    async deletePrice(priceId) {
        const price = this.currentPrices.find(p => p.stripe_price_id === priceId);
        if (!price) return;
        
        const confirmed = await adminUtils.confirmDialog(
            `Are you sure you want to delete the ${this.formatPeriod(price.billing_period)} price? This action cannot be undone.`
        );
        
        if (!confirmed) return;
        
        // Add to pending changes
        this.pendingChanges.push({
            action: 'delete',
            priceId: priceId,
            data: price
        });
        
        // Update UI
        this.renderPricesTable();
        this.updatePendingChanges();
        
        adminUtils.showToast('Price marked for deletion', 'warning');
    }
    
    checkPriceCompleteness() {
        console.log('🔍 PriceManager: checkPriceCompleteness called');
        console.log('🔍 PriceManager: Current prices billing periods:', this.currentPrices.map(p => p.billing_period));
        
        const recommendations = [];
        
        // Map of possible period values to standardized names
        const periodMappings = {
            // Monthly variations
            'month': 'monthly',
            'monthly': 'monthly', 
            '1': 'monthly',
            // Semester variations
            'semester': 'semester',
            'semiannual': 'semester',
            '6': 'semester',
            // Annual variations  
            'year': 'annual',
            'annual': 'annual',
            'annually': 'annual',
            '12': 'annual'
        };
        
        const requiredPeriods = ['monthly', 'semester', 'annual'];
        const standardizedPeriods = this.currentPrices.map(p => periodMappings[p.billing_period]).filter(Boolean);
        console.log('🔍 PriceManager: Standardized periods found:', standardizedPeriods);
        
        requiredPeriods.forEach(requiredPeriod => {
            const hasPrice = standardizedPeriods.includes(requiredPeriod) && 
                !this.pendingChanges.some(c => c.action === 'delete');
            
            console.log('🔍 PriceManager: Checking', requiredPeriod, 'found:', hasPrice);
            
            if (!hasPrice) {
                const displayName = requiredPeriod === 'monthly' ? 'Monthly' : 
                                  requiredPeriod === 'semester' ? 'Semester (6 months)' : 'Annual';
                recommendations.push({
                    type: 'missing_period',
                    period: requiredPeriod,
                    message: `Missing ${displayName} price`
                });
            }
        });
        
        // Check for invalid lookup keys
        this.currentPrices.forEach(price => {
            if (this.isLookupKeyInvalid(price.lookup_key)) {
                recommendations.push({
                    type: 'invalid_lookup_key',
                    priceId: price.stripe_price_id,
                    message: `Invalid lookup key for ${this.formatPeriod(price.billing_period)} price`
                });
            }
        });
        
        this.showRecommendations(recommendations);
    }
    
    showRecommendations(customRecommendations = null) {
        const container = document.getElementById('price-recommendations');
        const recommendations = customRecommendations || [];
        
        if (this.currentPrices.length === 0) {
            // Show quick setup for empty products
            container.innerHTML = `
                <div class="card border-primary">
                    <div class="card-header bg-primary text-white">
                        <h6 class="mb-0"><i class="fas fa-magic"></i> Quick Price Setup</h6>
                    </div>
                    <div class="card-body">
                        <p>This product has no prices configured. Would you like to generate standard MedPro prices?</p>
                        <button type="button" class="btn btn-primary" onclick="priceManager.generateStandardPrices()">
                            <i class="fas fa-wand-magic-sparkles"></i> Generate Standard Prices
                        </button>
                        <small class="d-block mt-2 text-muted">
                            This will create monthly, semester, and annual prices with standard MedPro discounts.
                        </small>
                    </div>
                </div>
            `;
        } else if (recommendations.length > 0) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    <h6 class="alert-heading"><i class="fas fa-lightbulb"></i> Recommendations</h6>
                    <ul class="mb-0">
                        ${recommendations.map(rec => `<li>${rec.message}</li>`).join('')}
                    </ul>
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    }
    
    generateStandardPrices() {
        // Prompt for base monthly price
        const modal = new adminUtils.Modal({
            title: 'Generate Standard Prices',
            content: `
                <form id="generate-prices-form">
                    <div class="mb-3">
                        <label class="form-label">Base Monthly Price (BRL)</label>
                        <div class="input-group">
                            <span class="input-group-text">R$</span>
                            <input type="number" 
                                   class="form-control" 
                                   id="base-monthly-price" 
                                   placeholder="0.00"
                                   step="0.01"
                                   min="0"
                                   required>
                        </div>
                        <small class="form-text text-muted">
                            Enter the monthly price. Semester and annual prices will be calculated with standard discounts.
                        </small>
                    </div>
                    
                    <div class="alert alert-info">
                        <strong>Standard MedPro Pricing:</strong>
                        <ul class="mb-0">
                            <li>Monthly: Base price</li>
                            <li>Semester: 10% discount (5.4x monthly)</li>
                            <li>Annual: 20% discount (9.6x monthly)</li>
                        </ul>
                    </div>
                </form>
            `,
            footer: `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="priceManager.createStandardPrices()">
                    <i class="fas fa-check"></i> Generate Prices
                </button>
            `
        });
        
        modal.show();
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('base-monthly-price').focus();
        }, 300);
    }
    
    createStandardPrices() {
        const basePrice = parseFloat(document.getElementById('base-monthly-price').value);
        
        if (!basePrice || basePrice <= 0) {
            adminUtils.showToast('Please enter a valid base price', 'error');
            return;
        }
        
        // Calculate prices with standard discounts
        const prices = [
            {
                period: 'month',
                amount: basePrice,
                multiplier: 1,
                discount: 0
            },
            {
                period: 'semester',
                amount: basePrice * 5.4, // 10% discount
                multiplier: 5.4,
                discount: 10
            },
            {
                period: 'year',
                amount: basePrice * 9.6, // 20% discount
                multiplier: 9.6,
                discount: 20
            }
        ];
        
        // Create price objects
        prices.forEach(({ period, amount }) => {
            const newPrice = {
                stripe_price_id: `temp_${Date.now()}_${period}`,
                stripe_product_id: this.currentProduct.stripe_product_id,
                unit_amount: Math.round(amount * 100), // Convert to cents
                currency: 'BRL',
                billing_period: period,
                lookup_key: this.generateLookupKey(period),
                active: true,
                trial_period_days: 0,
                _isNew: true
            };
            
            this.pendingChanges.push({
                action: 'create',
                priceId: newPrice.stripe_price_id,
                data: newPrice
            });
            
            this.currentPrices.push(newPrice);
        });
        
        // Update UI
        this.renderPricesTable();
        this.updatePendingChanges();
        
        adminUtils.Modal.hideAll();
        adminUtils.showToast('Standard prices generated successfully', 'success');
    }
    
    generateLookupKey(period) {
        if (!this.currentProduct) return '';
        
        const planType = this.currentProduct.metadata?.classification?.plan_type?.toLowerCase() || 'unknown';
        const userTier = this.currentProduct.metadata?.classification?.user_tier || '0';
        
        const periodSuffix = period === 'semester' ? 'semester' : period + 'ly';
        return `v3_${planType}_${userTier}users_${periodSuffix}`;
    }
    
    updatePendingChanges() {
        const container = document.getElementById('pending-changes');
        const changesList = document.getElementById('changes-list');
        const saveBtn = document.getElementById('save-prices-btn');
        
        if (this.pendingChanges.length === 0) {
            container.style.display = 'none';
            saveBtn.disabled = true;
            return;
        }
        
        container.style.display = 'block';
        saveBtn.disabled = false;
        
        changesList.innerHTML = `
            <div class="list-group">
                ${this.pendingChanges.map(change => this.renderPendingChange(change)).join('')}
            </div>
            <div class="mt-3">
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="priceManager.clearPendingChanges()">
                    <i class="fas fa-times"></i> Clear All Changes
                </button>
            </div>
        `;
    }
    
    renderPendingChange(change) {
        let icon, text, className;
        
        switch (change.action) {
            case 'create':
                icon = 'plus';
                className = 'list-group-item-success';
                text = `Create new ${this.formatPeriod(change.data.billing_period)} price: ${productFormatter.formatPrice(change.data.unit_amount)}`;
                break;
            case 'update':
                icon = 'edit';
                className = 'list-group-item-warning';
                text = `Update ${this.formatPeriod(change.data.billing_period)} price`;
                break;
            case 'delete':
                icon = 'trash';
                className = 'list-group-item-danger';
                text = `Delete ${this.formatPeriod(change.data.billing_period)} price`;
                break;
        }
        
        return `
            <div class="list-group-item ${className}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <i class="fas fa-${icon}"></i> ${text}
                    </div>
                    <button type="button" 
                            class="btn btn-sm btn-outline-secondary" 
                            onclick="priceManager.removePendingChange('${change.priceId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    removePendingChange(priceId) {
        // Remove from pending changes
        const changeIndex = this.pendingChanges.findIndex(c => c.priceId === priceId);
        if (changeIndex === -1) return;
        
        const change = this.pendingChanges[changeIndex];
        this.pendingChanges.splice(changeIndex, 1);
        
        // Handle UI updates based on action type
        if (change.action === 'create') {
            // Remove from current prices if it was a new price
            this.currentPrices = this.currentPrices.filter(p => p.stripe_price_id !== priceId);
        }
        
        // Re-render
        this.renderPricesTable();
        this.updatePendingChanges();
    }
    
    clearPendingChanges() {
        // Remove any newly created prices from current prices
        this.currentPrices = this.currentPrices.filter(p => !p._isNew);
        
        // Clear all pending changes
        this.pendingChanges = [];
        
        // Re-render
        this.renderPricesTable();
        this.updatePendingChanges();
        
        adminUtils.showToast('All pending changes cleared', 'info');
    }
    
    async savePrices() {
        if (this.pendingChanges.length === 0) return;
        
        const confirmed = await adminUtils.confirmDialog(
            `You have ${this.pendingChanges.length} pending price changes. Do you want to apply these changes?`
        );
        
        if (!confirmed) return;
        
        // In demo mode, just simulate success
        if (window.app && window.app.demoMode) {
            adminUtils.showLoading('Saving price changes...');
            
            setTimeout(() => {
                adminUtils.hideLoading();
                adminUtils.showToast(`Successfully applied ${this.pendingChanges.length} price changes`, 'success');
                this.modal.hide();
                
                // Refresh product list
                if (window.app) {
                    window.app.loadProducts();
                }
            }, 1500);
        } else {
            // Real implementation would call the API
            try {
                adminUtils.showLoading('Saving price changes...');
                
                for (const change of this.pendingChanges) {
                    // Call appropriate API based on action
                    switch (change.action) {
                        case 'create':
                            await productAPI.createPrice(change.data);
                            break;
                        case 'update':
                            await productAPI.updatePrice(change.priceId, change.data);
                            break;
                        case 'delete':
                            await productAPI.deletePrice(change.priceId);
                            break;
                    }
                }
                
                adminUtils.hideLoading();
                adminUtils.showToast('All price changes saved successfully', 'success');
                this.modal.hide();
                
                // Refresh product list
                if (window.app) {
                    window.app.loadProducts();
                }
            } catch (error) {
                adminUtils.hideLoading();
                console.error('Save prices error:', error);
                adminUtils.showToast('Error saving price changes: ' + error.message, 'error');
            }
        }
    }
    
    // Helper methods
    calculateMonthlyAmount(price) {
        console.log('🔍 PriceManager: calculateMonthlyAmount for period:', price.billing_period);
        
        const periods = {
            // Standard values
            'month': 1,
            'semester': 6,
            'year': 12,
            'one_time': 1,
            // Alternative formats
            'monthly': 1,
            'quarterly': 3,
            'semiannual': 6,
            'annual': 12,
            'annually': 12,
            // Numeric values
            '1': 1,
            '3': 3,
            '6': 6,
            '12': 12
        };
        
        const monthCount = periods[price.billing_period] || 1;
        const monthlyAmount = Math.round(price.unit_amount / monthCount);
        
        console.log('🔍 PriceManager: Period:', price.billing_period, 'Months:', monthCount, 'Monthly amount:', monthlyAmount);
        return monthlyAmount;
    }
    
    calculateDiscount(price) {
        console.log('🔍 PriceManager: calculateDiscount for period:', price.billing_period);
        
        // Check if this is a monthly price (no discount)
        const monthlyPeriods = ['month', 'monthly', '1'];
        if (monthlyPeriods.includes(price.billing_period)) {
            console.log('🔍 PriceManager: Monthly period, no discount');
            return 0;
        }
        
        // Find monthly price for comparison
        const monthlyPrice = this.currentPrices.find(p => monthlyPeriods.includes(p.billing_period));
        if (!monthlyPrice) {
            console.log('🔍 PriceManager: No monthly price found for comparison');
            return 0;
        }
        
        const monthlyAmount = monthlyPrice.unit_amount;
        console.log('🔍 PriceManager: Monthly base price:', monthlyAmount);
        
        const periods = {
            // Standard values
            'semester': 6,
            'year': 12,
            'one_time': 1,
            // Alternative formats
            'quarterly': 3,
            'semiannual': 6,
            'annual': 12,
            'annually': 12,
            // Numeric values
            '3': 3,
            '6': 6,
            '12': 12
        };
        
        const monthCount = periods[price.billing_period] || 1;
        const expectedAmount = monthlyAmount * monthCount;
        const actualAmount = price.unit_amount;
        
        console.log('🔍 PriceManager: Expected amount:', expectedAmount, 'Actual amount:', actualAmount);
        
        if (expectedAmount <= actualAmount) {
            console.log('🔍 PriceManager: No discount (actual >= expected)');
            return 0;
        }
        
        const discount = Math.round(((expectedAmount - actualAmount) / expectedAmount) * 100);
        const finalDiscount = Math.max(0, discount);
        
        console.log('🔍 PriceManager: Calculated discount:', finalDiscount, '%');
        return finalDiscount;
    }
    
    formatPeriod(period) {
        console.log('🔍 PriceManager: formatPeriod called with:', period, 'type:', typeof period);
        
        // Handle undefined/null periods
        if (!period || period === 'undefined' || period === undefined) {
            console.log('🔍 PriceManager: Period is undefined, returning "Unknown Period"');
            return 'Unknown Period';
        }
        
        const formats = {
            // Database billing_period values (primary)
            'month': 'Monthly',
            'semester': 'Semester (6 months)',
            'year': 'Annual',
            'one_time': 'One-time',
            // Legacy Stripe values for backward compatibility
            'week': 'Weekly',
            'day': 'Daily',
            // Alternative formats
            'monthly': 'Monthly',
            'quarterly': 'Quarterly',
            'semiannual': 'Semester (6 months)',
            'annually': 'Annual',
            'annual': 'Annual',
            // Numeric values (if stored as numbers)
            '1': 'Monthly',
            '6': 'Semester (6 months)',
            '12': 'Annual'
        };
        
        const result = formats[period] || period;
        console.log('🔍 PriceManager: formatPeriod result:', result);
        return result;
    }
    
    isLookupKeyInvalid(lookupKey) {
        if (!lookupKey) return true;
        
        // Check if it follows v3 pattern
        return !lookupKey.startsWith('v3_');
    }
    
    setupEventListeners() {
        console.log('🔍 PriceManager: setupEventListeners called');
        
        try {
            // Check if modal DOM elements are available
            const modal = document.querySelector('.modal.show');
            console.log('🔍 PriceManager: Modal DOM element found:', !!modal);
            
            const addPriceForm = document.getElementById('add-price-form');
            console.log('🔍 PriceManager: Add price form found:', !!addPriceForm);
            
            const pricesTableContainer = document.getElementById('prices-table-container');
            console.log('🔍 PriceManager: Prices table container found:', !!pricesTableContainer);
            
            const pendingChanges = document.getElementById('pending-changes');
            console.log('🔍 PriceManager: Pending changes container found:', !!pendingChanges);
            
            const saveBtn = document.getElementById('save-prices-btn');
            console.log('🔍 PriceManager: Save button found:', !!saveBtn);
            
            console.log('🔍 PriceManager: All modal elements checked');
            
        } catch (error) {
            console.error('❌ PriceManager: Error in setupEventListeners:', error);
            console.error('❌ PriceManager: Error stack:', error.stack);
        }
    }
}

// Create global instance
window.priceManager = new PriceManager();