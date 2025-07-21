// Product Editor Component
class ProductEditor {
    constructor() {
        this.modal = null;
        this.isEditMode = false;
        this.currentProduct = null;
        this.formData = {
            name: '',
            description: '',
            plan_type: '',
            user_tier: '',
            active: true,
            metadata: {},
            prices: []
        };
    }
    
    showCreateModal() {
        this.isEditMode = false;
        this.currentProduct = null;
        this.resetFormData();
        
        return this.showModal('Create New Product');
    }
    
    showEditModal(product) {
        this.isEditMode = true;
        this.currentProduct = product;
        this.loadProductData(product);
        
        return this.showModal(`Edit Product: ${product.name}`);
    }
    
    showModal(title) {
        const modalContent = this.renderModalContent();
        
        this.modal = new adminUtils.Modal({
            title: title,
            content: modalContent,
            size: 'lg',
            footer: this.renderModalFooter(),
            backdrop: 'static'
        });
        
        this.modal.on('show', () => {
            this.initializeForm();
            this.bindFormEvents();
        });
        
        this.modal.show();
        
        return this.modal;
    }
    
    renderModalContent() {
        return `
            <form id="product-form" novalidate>
                <div class="nav nav-tabs mb-3" role="tablist">
                    <button class="nav-link active" type="button" data-tab="basic">
                        Basic Information
                    </button>
                    <button class="nav-link" type="button" data-tab="metadata">
                        Metadata & Features
                    </button>
                    <button class="nav-link" type="button" data-tab="pricing">
                        Pricing
                    </button>
                    ${this.isEditMode ? `
                        <button class="nav-link" type="button" data-tab="audit">
                            History
                        </button>
                    ` : ''}
                </div>
                
                <div class="tab-content">
                    <!-- Basic Information Tab -->
                    <div class="tab-pane active" id="tab-basic">
                        ${this.renderBasicInfoTab()}
                    </div>
                    
                    <!-- Metadata Tab -->
                    <div class="tab-pane" id="tab-metadata">
                        ${this.renderMetadataTab()}
                    </div>
                    
                    <!-- Pricing Tab -->
                    <div class="tab-pane" id="tab-pricing">
                        ${this.renderPricingTab()}
                    </div>
                    
                    ${this.isEditMode ? `
                        <!-- Audit History Tab -->
                        <div class="tab-pane" id="tab-audit">
                            ${this.renderAuditTab()}
                        </div>
                    ` : ''}
                </div>
                
                <div id="form-errors" class="alert alert-danger mt-3" style="display: none;">
                    <ul class="mb-0"></ul>
                </div>
            </form>
        `;
    }
    
    renderBasicInfoTab() {
        return `
            <div class="row">
                <div class="col-12">
                    <div class="form-group mb-3">
                        <label class="form-label required">Product Name</label>
                        <input type="text" 
                               class="form-control" 
                               id="product-name" 
                               value="${this.escapeHtml(this.formData.name)}"
                               placeholder="e.g., MedPro v3 - Plano Clínica - 10 usuários"
                               required>
                        <small class="form-text text-muted">
                            Include "v3" in the name for version 3 products
                        </small>
                    </div>
                </div>
                
                <div class="col-12">
                    <div class="form-group mb-3">
                        <label class="form-label">Description</label>
                        <textarea class="form-control" 
                                  id="product-description" 
                                  rows="3"
                                  placeholder="Describe the product features and benefits">${this.escapeHtml(this.formData.description)}</textarea>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="form-group mb-3">
                        <label class="form-label required">Plan Type</label>
                        <select class="form-control" id="product-plan-type" required>
                            <option value="">Select plan type</option>
                            <option value="CLINIC" ${this.formData.plan_type === 'CLINIC' ? 'selected' : ''}>
                                Clinic (Complete System)
                            </option>
                            <option value="SCHEDULING" ${this.formData.plan_type === 'SCHEDULING' ? 'selected' : ''}>
                                Scheduling Only
                            </option>
                        </select>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="form-group mb-3">
                        <label class="form-label required">User Tier</label>
                        <select class="form-control" id="product-user-tier" required>
                            <option value="">Select user tier</option>
                            <option value="1" ${this.formData.user_tier == 1 ? 'selected' : ''}>1 User</option>
                            <option value="5" ${this.formData.user_tier == 5 ? 'selected' : ''}>5 Users</option>
                            <option value="10" ${this.formData.user_tier == 10 ? 'selected' : ''}>10 Users</option>
                            <option value="20" ${this.formData.user_tier == 20 ? 'selected' : ''}>20 Users</option>
                            <option value="50" ${this.formData.user_tier == 50 ? 'selected' : ''}>50 Users</option>
                        </select>
                    </div>
                </div>
                
                <div class="col-12">
                    <div class="form-group mb-3">
                        <div class="form-check form-switch">
                            <input class="form-check-input" 
                                   type="checkbox" 
                                   id="product-active" 
                                   ${this.formData.active ? 'checked' : ''}>
                            <label class="form-check-label" for="product-active">
                                Active Product
                            </label>
                        </div>
                        <small class="form-text text-muted">
                            Inactive products won't be available for new subscriptions
                        </small>
                    </div>
                </div>
                
                ${this.isEditMode ? `
                    <div class="col-12">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle"></i>
                            <strong>Stripe Product ID:</strong> ${this.currentProduct.stripe_product_id}
                            <button type="button" 
                                    class="btn btn-sm btn-outline-info float-end"
                                    onclick="adminUtils.copyToClipboard('${this.currentProduct.stripe_product_id}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    renderMetadataTab() {
        return `
            <div class="metadata-editor">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="productEditor.loadTemplate()">
                            <i class="fas fa-file-import"></i> Load Template
                        </button>
                    </div>
                    <div class="col-md-6 text-end">
                        <button type="button" class="btn btn-sm btn-info" onclick="productEditor.toggleJsonView()">
                            <i class="fas fa-code"></i> JSON View
                        </button>
                    </div>
                </div>
                
                <div id="metadata-visual-editor">
                    <!-- Subscription Limits Section -->
                    <div class="metadata-section">
                        <h5>Subscription Limits</h5>
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Max Patients</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-max-patients"
                                           min="0"
                                           value="${this.getMetadataValue('subscription_limits.patients.max_patients', 1000)}">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Max Locations</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-max-locations"
                                           min="1"
                                           value="${this.getMetadataValue('subscription_limits.locations.max_locations', 1)}">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Storage (GB)</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-storage-gb"
                                           min="0"
                                           value="${this.getMetadataValue('subscription_limits.storage.documents_gb', 10)}">
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Practitioners</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-practitioners"
                                           min="0"
                                           value="${this.getMetadataValue('subscription_limits.users.practitioners', 10)}">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Assistants</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-assistants"
                                           min="0"
                                           value="${this.getMetadataValue('subscription_limits.users.assistants', 5)}">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Admins</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-admins"
                                           min="0"
                                           value="${this.getMetadataValue('subscription_limits.users.admins', 2)}">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- AI Configuration Section -->
                    <div class="metadata-section">
                        <h5>AI Configuration</h5>
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Monthly Tokens</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-ai-monthly-tokens"
                                           min="0"
                                           value="${this.getMetadataValue('ai_quotas.tokens.monthly_limit', 500000)}">
                                    <small class="form-text text-muted">
                                        Recommended: 250k-500k for small, 1M+ for large
                                    </small>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Daily Tokens</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-ai-daily-tokens"
                                           min="0"
                                           value="${this.getMetadataValue('ai_quotas.tokens.daily_limit', 20000)}">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group mb-3">
                                    <label class="form-label">Audio Minutes/Month</label>
                                    <input type="number" 
                                           class="form-control" 
                                           id="meta-ai-audio-minutes"
                                           min="0"
                                           value="${this.getMetadataValue('ai_quotas.audio.monthly_minutes', 600)}">
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-12">
                                <label class="form-label">AI Models Access</label>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="ai-model-gpt4o" checked>
                                    <label class="form-check-label" for="ai-model-gpt4o">GPT-4o</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="ai-model-gpt4o-mini" checked>
                                    <label class="form-check-label" for="ai-model-gpt4o-mini">GPT-4o-mini</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="ai-model-whisper" checked>
                                    <label class="form-check-label" for="ai-model-whisper">Whisper-1</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Features Section -->
                    <div class="metadata-section">
                        <h5>Features</h5>
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Clinical Features</h6>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-prescriptions" checked>
                                    <label class="form-check-label" for="feat-prescriptions">Electronic Prescriptions</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-lab" checked>
                                    <label class="form-check-label" for="feat-lab">Lab Integrations</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-imaging" checked>
                                    <label class="form-check-label" for="feat-imaging">Imaging Viewer</label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6>Scheduling Features</h6>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-online-booking" checked>
                                    <label class="form-check-label" for="feat-online-booking">Online Booking</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-sms" checked>
                                    <label class="form-check-label" for="feat-sms">SMS Reminders</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="feat-whatsapp" checked>
                                    <label class="form-check-label" for="feat-whatsapp">WhatsApp Integration</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="metadata-json-editor" style="display: none;">
                    <div class="form-group">
                        <label class="form-label">Metadata JSON</label>
                        <textarea class="form-control font-monospace" 
                                  id="metadata-json" 
                                  rows="20">${JSON.stringify(this.formData.metadata, null, 2)}</textarea>
                        <button type="button" 
                                class="btn btn-sm btn-secondary mt-2"
                                onclick="productEditor.formatJson()">
                            Format JSON
                        </button>
                        <button type="button" 
                                class="btn btn-sm btn-info mt-2"
                                onclick="productEditor.validateJson()">
                            Validate JSON
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderPricingTab() {
        return `
            <div class="pricing-section">
                <div class="mb-3">
                    <button type="button" class="btn btn-sm btn-primary" onclick="productEditor.addPrice()">
                        <i class="fas fa-plus"></i> Add Price
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="productEditor.generateDefaultPrices()">
                        <i class="fas fa-magic"></i> Generate Default Prices
                    </button>
                </div>
                
                <div id="prices-list">
                    ${this.renderPricesList()}
                </div>
                
                <div class="mt-3">
                    <h6>Price Calculator</h6>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label">Base Monthly Price (R$)</label>
                                <input type="number" 
                                       class="form-control" 
                                       id="base-price"
                                       min="0"
                                       step="0.01"
                                       onchange="productEditor.calculatePrices()">
                            </div>
                        </div>
                        <div class="col-md-8">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Discount</th>
                                        <th>Final Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Monthly</td>
                                        <td>0%</td>
                                        <td id="calc-monthly">R$ 0,00</td>
                                    </tr>
                                    <tr>
                                        <td>Semester (6 months)</td>
                                        <td>10%</td>
                                        <td id="calc-semester">R$ 0,00</td>
                                    </tr>
                                    <tr>
                                        <td>Annual (12 months)</td>
                                        <td>20%</td>
                                        <td id="calc-annual">R$ 0,00</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderAuditTab() {
        return `
            <div class="audit-section">
                <div id="audit-loading">
                    <div class="text-center">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p>Loading audit history...</p>
                    </div>
                </div>
                <div id="audit-timeline" style="display: none;">
                    <!-- Audit entries will be loaded here -->
                </div>
            </div>
        `;
    }
    
    renderPricesList() {
        if (!this.formData.prices || this.formData.prices.length === 0) {
            return `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    No prices configured. Add at least one price for the product.
                </div>
            `;
        }
        
        return `
            <table class="table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Trial Days</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.formData.prices.map((price, index) => `
                        <tr>
                            <td>${productFormatter.formatBillingPeriod(price.billing_period)}</td>
                            <td>${productFormatter.formatCurrency(price.unit_amount, price.currency)}</td>
                            <td>${price.currency}</td>
                            <td>${price.trial_period_days || 0}</td>
                            <td>
                                ${price.active ? 
                                    '<span class="badge bg-success">Active</span>' : 
                                    '<span class="badge bg-secondary">Inactive</span>'}
                            </td>
                            <td>
                                <button type="button" 
                                        class="btn btn-sm btn-info"
                                        onclick="productEditor.editPrice(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button type="button" 
                                        class="btn btn-sm btn-danger"
                                        onclick="productEditor.removePrice(${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    renderModalFooter() {
        return `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
            </button>
            <button type="button" class="btn btn-primary" onclick="productEditor.saveProduct()">
                <i class="fas fa-save"></i> ${this.isEditMode ? 'Update' : 'Create'} Product
            </button>
        `;
    }
    
    initializeForm() {
        // Initialize tab switching
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Load audit history if in edit mode
        if (this.isEditMode) {
            this.loadAuditHistory();
        }
        
        // Initialize tooltips
        const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltips.forEach(el => new bootstrap.Tooltip(el));
    }
    
    bindFormEvents() {
        // Auto-generate product name
        const planType = document.getElementById('product-plan-type');
        const userTier = document.getElementById('product-user-tier');
        
        const updateProductName = () => {
            if (!this.isEditMode && planType.value && userTier.value) {
                const planTypeName = productFormatter.formatPlanType(planType.value);
                const userTierName = productFormatter.formatUserTier(userTier.value);
                const suggestedName = `MedPro v3 - Plano ${planTypeName} - ${userTierName}`;
                
                const nameField = document.getElementById('product-name');
                if (!nameField.value || nameField.value === '') {
                    nameField.value = suggestedName;
                }
            }
        };
        
        planType.addEventListener('change', updateProductName);
        userTier.addEventListener('change', updateProductName);
        
        // Update user limits based on tier
        userTier.addEventListener('change', (e) => {
            const tier = parseInt(e.target.value);
            if (tier) {
                document.getElementById('meta-practitioners').value = tier;
                document.getElementById('meta-assistants').value = Math.ceil(tier / 2);
                document.getElementById('meta-max-patients').value = tier * 100;
            }
        });
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabName}`);
        });
    }
    
    resetFormData() {
        this.formData = {
            name: '',
            description: '',
            plan_type: '',
            user_tier: '',
            active: true,
            metadata: {
                classification: {
                    plan_type: '',
                    user_tier: ''
                },
                subscription_limits: {
                    patients: { max_patients: 1000 },
                    users: { practitioners: 10, assistants: 5, admins: 2 },
                    locations: { max_locations: 1 },
                    storage: { documents_gb: 10, images_gb: 5 }
                },
                ai_quotas: {
                    tokens: { monthly_limit: 500000, daily_limit: 20000 },
                    audio: { monthly_minutes: 600 },
                    models: { text_models: ['gpt-4o', 'gpt-4o-mini'], audio_models: ['whisper-1'] }
                },
                features: {
                    clinical: {
                        electronic_prescriptions: true,
                        lab_integrations: true,
                        imaging_viewer: true
                    },
                    scheduling: {
                        online_booking: true,
                        sms_reminders: true,
                        whatsapp_integration: true
                    }
                }
            },
            prices: []
        };
    }
    
    loadProductData(product) {
        this.formData = {
            name: product.name || '',
            description: product.description || '',
            plan_type: product.metadata?.classification?.plan_type || '',
            user_tier: product.metadata?.classification?.user_tier || '',
            active: product.active !== false,
            metadata: product.metadata || {},
            prices: product.prices || []
        };
    }
    
    getMetadataValue(path, defaultValue = '') {
        const keys = path.split('.');
        let value = this.formData.metadata;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value !== undefined ? value : defaultValue;
    }
    
    collectFormData() {
        // Basic info
        this.formData.name = document.getElementById('product-name').value.trim();
        this.formData.description = document.getElementById('product-description').value.trim();
        this.formData.plan_type = document.getElementById('product-plan-type').value;
        this.formData.user_tier = parseInt(document.getElementById('product-user-tier').value);
        this.formData.active = document.getElementById('product-active').checked;
        
        // Metadata - check if in JSON view
        const jsonEditor = document.getElementById('metadata-json');
        if (jsonEditor && jsonEditor.style.display !== 'none') {
            try {
                this.formData.metadata = JSON.parse(jsonEditor.value);
            } catch (e) {
                throw new Error('Invalid JSON in metadata editor');
            }
        } else {
            // Collect from visual editor
            this.collectMetadataFromVisualEditor();
        }
        
        // Ensure classification is updated
        this.formData.metadata.classification = {
            plan_type: this.formData.plan_type,
            user_tier: this.formData.user_tier
        };
        
        return this.formData;
    }
    
    collectMetadataFromVisualEditor() {
        // Subscription limits
        this.formData.metadata.subscription_limits = {
            patients: {
                max_patients: parseInt(document.getElementById('meta-max-patients').value) || 0
            },
            users: {
                practitioners: parseInt(document.getElementById('meta-practitioners').value) || 0,
                assistants: parseInt(document.getElementById('meta-assistants').value) || 0,
                admins: parseInt(document.getElementById('meta-admins').value) || 0
            },
            locations: {
                max_locations: parseInt(document.getElementById('meta-max-locations').value) || 1
            },
            storage: {
                documents_gb: parseInt(document.getElementById('meta-storage-gb').value) || 0
            }
        };
        
        // AI quotas
        this.formData.metadata.ai_quotas = {
            tokens: {
                monthly_limit: parseInt(document.getElementById('meta-ai-monthly-tokens').value) || 0,
                daily_limit: parseInt(document.getElementById('meta-ai-daily-tokens').value) || 0
            },
            audio: {
                monthly_minutes: parseInt(document.getElementById('meta-ai-audio-minutes').value) || 0
            },
            models: {
                text_models: [],
                audio_models: []
            }
        };
        
        // AI models
        if (document.getElementById('ai-model-gpt4o').checked) {
            this.formData.metadata.ai_quotas.models.text_models.push('gpt-4o');
        }
        if (document.getElementById('ai-model-gpt4o-mini').checked) {
            this.formData.metadata.ai_quotas.models.text_models.push('gpt-4o-mini');
        }
        if (document.getElementById('ai-model-whisper').checked) {
            this.formData.metadata.ai_quotas.models.audio_models.push('whisper-1');
        }
        
        // Features
        this.formData.metadata.features = {
            clinical: {
                electronic_prescriptions: document.getElementById('feat-prescriptions').checked,
                lab_integrations: document.getElementById('feat-lab').checked,
                imaging_viewer: document.getElementById('feat-imaging').checked
            },
            scheduling: {
                online_booking: document.getElementById('feat-online-booking').checked,
                sms_reminders: document.getElementById('feat-sms').checked,
                whatsapp_integration: document.getElementById('feat-whatsapp').checked
            }
        };
    }
    
    async saveProduct() {
        try {
            // Collect form data
            const data = this.collectFormData();
            
            // Validate
            const validation = productValidator.validateProduct(data);
            if (!validation.valid) {
                this.showErrors(validation.errors);
                return;
            }
            
            // Validate metadata
            const metaValidation = productValidator.validateMetadata(data.metadata);
            if (!metaValidation.valid) {
                this.showErrors(metaValidation.errors);
                return;
            }
            
            // Show warnings if any
            if (metaValidation.warnings && metaValidation.warnings.length > 0) {
                const proceed = await adminUtils.confirmDialog(
                    `Warnings found:\n${metaValidation.warnings.join('\n')}\n\nContinue anyway?`
                );
                if (!proceed) return;
            }
            
            adminUtils.showLoading(this.isEditMode ? 'Updating product...' : 'Creating product...');
            
            // In demo mode, simulate success
            setTimeout(() => {
                adminUtils.hideLoading();
                adminUtils.showToast(
                    this.isEditMode ? 'Product updated successfully' : 'Product created successfully',
                    'success'
                );
                this.modal.hide();
                
                // Reload products
                if (window.app) {
                    window.app.loadProducts();
                }
            }, 1000);
            
        } catch (error) {
            adminUtils.hideLoading();
            console.error('Save product error:', error);
            adminUtils.showToast(error.message || 'Error saving product', 'error');
        }
    }
    
    showErrors(errors) {
        const errorContainer = document.getElementById('form-errors');
        const errorList = errorContainer.querySelector('ul');
        
        errorList.innerHTML = Object.entries(errors).map(([field, error]) => {
            const errorText = Array.isArray(error) ? error.join(', ') : error;
            return `<li><strong>${field}:</strong> ${errorText}</li>`;
        }).join('');
        
        errorContainer.style.display = 'block';
        
        // Switch to basic tab if errors are there
        this.switchTab('basic');
    }
    
    // Price management methods
    addPrice() {
        const priceModal = new adminUtils.Modal({
            title: 'Add Price',
            content: this.renderPriceForm(),
            footer: `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="productEditor.savePriceForm()">Add Price</button>
            `
        });
        
        priceModal.show();
        this.currentPriceModal = priceModal;
    }
    
    renderPriceForm(price = null) {
        const isEdit = price !== null;
        
        return `
            <form id="price-form">
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group mb-3">
                            <label class="form-label required">Billing Period</label>
                            <select class="form-control" id="price-billing-period" required>
                                <option value="month" ${price?.billing_period === 'month' ? 'selected' : ''}>Monthly</option>
                                <option value="semester" ${price?.billing_period === 'semester' ? 'selected' : ''}>Semester (6 months)</option>
                                <option value="year" ${price?.billing_period === 'year' ? 'selected' : ''}>Annual</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group mb-3">
                            <label class="form-label required">Currency</label>
                            <select class="form-control" id="price-currency" required>
                                <option value="BRL" ${price?.currency === 'BRL' ? 'selected' : ''}>BRL (R$)</option>
                                <option value="USD" ${price?.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="form-group mb-3">
                    <label class="form-label required">Amount</label>
                    <div class="input-group">
                        <span class="input-group-text">R$</span>
                        <input type="number" 
                               class="form-control" 
                               id="price-amount"
                               min="1"
                               step="0.01"
                               value="${price ? (price.unit_amount / 100).toFixed(2) : ''}"
                               required>
                    </div>
                    <small class="form-text text-muted">Enter the amount in reais (e.g., 531.25)</small>
                </div>
                
                <div class="form-group mb-3">
                    <label class="form-label">Trial Period (days)</label>
                    <input type="number" 
                           class="form-control" 
                           id="price-trial-days"
                           min="0"
                           max="90"
                           value="${price?.trial_period_days || 15}">
                </div>
                
                <div class="form-check">
                    <input class="form-check-input" 
                           type="checkbox" 
                           id="price-active"
                           ${price?.active !== false ? 'checked' : ''}>
                    <label class="form-check-label" for="price-active">
                        Active Price
                    </label>
                </div>
            </form>
        `;
    }
    
    savePriceForm() {
        const priceData = {
            billing_period: document.getElementById('price-billing-period').value,
            currency: document.getElementById('price-currency').value,
            unit_amount: Math.round(parseFloat(document.getElementById('price-amount').value) * 100),
            trial_period_days: parseInt(document.getElementById('price-trial-days').value) || 0,
            active: document.getElementById('price-active').checked
        };
        
        // Validate price
        const validation = productValidator.validatePrice(priceData);
        if (!validation.valid) {
            adminUtils.showToast(Object.values(validation.errors).join(', '), 'error');
            return;
        }
        
        // Add to prices array
        this.formData.prices.push(priceData);
        
        // Update UI
        document.getElementById('prices-list').innerHTML = this.renderPricesList();
        
        // Close modal
        this.currentPriceModal.hide();
        
        adminUtils.showToast('Price added successfully', 'success');
    }
    
    editPrice(index) {
        // TODO: Implement price editing
        adminUtils.showToast('Price editing - Coming soon', 'info');
    }
    
    removePrice(index) {
        this.formData.prices.splice(index, 1);
        document.getElementById('prices-list').innerHTML = this.renderPricesList();
        adminUtils.showToast('Price removed', 'success');
    }
    
    generateDefaultPrices() {
        const basePrice = prompt('Enter base monthly price in R$:', '500.00');
        if (!basePrice) return;
        
        const basePriceCents = Math.round(parseFloat(basePrice) * 100);
        
        this.formData.prices = [
            {
                billing_period: 'month',
                currency: 'BRL',
                unit_amount: basePriceCents,
                trial_period_days: 15,
                active: true
            },
            {
                billing_period: 'semester',
                currency: 'BRL',
                unit_amount: Math.round(basePriceCents * 6 * 0.9), // 10% discount
                trial_period_days: 15,
                active: true
            },
            {
                billing_period: 'year',
                currency: 'BRL',
                unit_amount: Math.round(basePriceCents * 12 * 0.8), // 20% discount
                trial_period_days: 15,
                active: true
            }
        ];
        
        document.getElementById('prices-list').innerHTML = this.renderPricesList();
        adminUtils.showToast('Default prices generated', 'success');
    }
    
    calculatePrices() {
        const basePrice = parseFloat(document.getElementById('base-price').value) || 0;
        
        document.getElementById('calc-monthly').textContent = productFormatter.formatCurrency(basePrice * 100);
        document.getElementById('calc-semester').textContent = productFormatter.formatCurrency(basePrice * 6 * 0.9 * 100);
        document.getElementById('calc-annual').textContent = productFormatter.formatCurrency(basePrice * 12 * 0.8 * 100);
    }
    
    // Metadata editor methods
    toggleJsonView() {
        const visualEditor = document.getElementById('metadata-visual-editor');
        const jsonEditor = document.getElementById('metadata-json-editor');
        
        if (visualEditor.style.display === 'none') {
            // Switch to visual
            visualEditor.style.display = 'block';
            jsonEditor.style.display = 'none';
        } else {
            // Switch to JSON - collect current data first
            this.collectMetadataFromVisualEditor();
            document.getElementById('metadata-json').value = JSON.stringify(this.formData.metadata, null, 2);
            visualEditor.style.display = 'none';
            jsonEditor.style.display = 'block';
        }
    }
    
    formatJson() {
        const jsonTextarea = document.getElementById('metadata-json');
        try {
            const parsed = JSON.parse(jsonTextarea.value);
            jsonTextarea.value = JSON.stringify(parsed, null, 2);
            adminUtils.showToast('JSON formatted', 'success');
        } catch (e) {
            adminUtils.showToast('Invalid JSON: ' + e.message, 'error');
        }
    }
    
    validateJson() {
        const jsonTextarea = document.getElementById('metadata-json');
        try {
            const parsed = JSON.parse(jsonTextarea.value);
            const validation = productValidator.validateMetadata(parsed);
            
            if (validation.valid) {
                adminUtils.showToast('JSON is valid', 'success');
            } else {
                adminUtils.showToast('Validation errors: ' + Object.values(validation.errors).join(', '), 'error');
            }
            
            if (validation.warnings && validation.warnings.length > 0) {
                adminUtils.showToast('Warnings: ' + validation.warnings.join(', '), 'warning');
            }
        } catch (e) {
            adminUtils.showToast('Invalid JSON: ' + e.message, 'error');
        }
    }
    
    async loadTemplate() {
        // In demo mode, show sample templates
        const templates = [
            { id: 1, name: 'Clinic Plan - Basic', category: 'subscription' },
            { id: 2, name: 'Scheduling Plan - Basic', category: 'subscription' },
            { id: 3, name: 'AI Professional Add-on', category: 'ai_addon' }
        ];
        
        const modal = new adminUtils.Modal({
            title: 'Load Template',
            content: `
                <div class="list-group">
                    ${templates.map(t => `
                        <button type="button" 
                                class="list-group-item list-group-item-action"
                                onclick="productEditor.applyTemplate(${t.id})">
                            <div class="d-flex w-100 justify-content-between">
                                <h6 class="mb-1">${t.name}</h6>
                                <small>${t.category}</small>
                            </div>
                        </button>
                    `).join('')}
                </div>
            `,
            size: 'md'
        });
        
        modal.show();
        this.templateModal = modal;
    }
    
    applyTemplate(templateId) {
        // Apply template based on ID
        adminUtils.showToast('Template applied', 'success');
        this.templateModal.hide();
        
        // Update form fields based on template
        // This would load actual template data in production
    }
    
    async loadAuditHistory() {
        // In demo mode, show sample audit data
        const auditData = [
            {
                date: new Date().toISOString(),
                user: 'admin@medpro.com',
                action: 'Product created',
                changes: { created: true }
            },
            {
                date: new Date(Date.now() - 86400000).toISOString(),
                user: 'admin@medpro.com',
                action: 'Metadata updated',
                changes: { ai_monthly_tokens: { from: 250000, to: 500000 } }
            }
        ];
        
        const auditTimeline = document.getElementById('audit-timeline');
        const auditLoading = document.getElementById('audit-loading');
        
        setTimeout(() => {
            auditLoading.style.display = 'none';
            auditTimeline.style.display = 'block';
            
            auditTimeline.innerHTML = `
                <div class="timeline">
                    ${auditData.map(entry => `
                        <div class="timeline-item">
                            <div class="timeline-marker"></div>
                            <div class="timeline-content">
                                <h6>${entry.action}</h6>
                                <p class="text-muted">
                                    <small>
                                        <i class="fas fa-user"></i> ${entry.user} • 
                                        <i class="fas fa-clock"></i> ${productFormatter.formatDateRelative(entry.date)}
                                    </small>
                                </p>
                                ${entry.changes ? `
                                    <pre class="mb-0"><code>${JSON.stringify(entry.changes, null, 2)}</code></pre>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }, 500);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
window.productEditor = new ProductEditor();

// Add CSS for timeline
(function() {
    const style = document.createElement('style');
    style.textContent = `
    .metadata-section {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    
    .metadata-section h5 {
        margin-bottom: 1rem;
        color: #495057;
    }
    
    .timeline {
        position: relative;
        padding-left: 30px;
    }
    
    .timeline::before {
        content: '';
        position: absolute;
        left: 10px;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #dee2e6;
    }
    
    .timeline-item {
        position: relative;
        margin-bottom: 1.5rem;
    }
    
    .timeline-marker {
        position: absolute;
        left: -25px;
        top: 5px;
        width: 12px;
        height: 12px;
        background: #0066cc;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 2px #dee2e6;
    }
    
    .timeline-content {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #dee2e6;
    }
    
    .timeline-content h6 {
        margin-bottom: 0.5rem;
    }
    
    .required::after {
        content: ' *';
        color: #dc3545;
    }
`;
    document.head.appendChild(style);
})();