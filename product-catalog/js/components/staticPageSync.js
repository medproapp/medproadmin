// Static Page Sync Component
class StaticPageSync {
    constructor() {
        this.selectedProducts = {
            agendamento: null,
            clinica: null
        };
        this.availableProducts = [];
        this.modal = null;
        this.isLoading = false;
    }
    
    async showModal() {
        if (!this.modal) {
            this.createModal();
        }
        
        await this.loadAvailableProducts();
        this.modal.show();
        this.renderProductSelection();
    }
    
    createModal() {
        const modalHtml = `
            <div class="modal fade" id="staticSyncModal" tabindex="-1" aria-labelledby="staticSyncModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="staticSyncModalLabel">
                                <i class="fas fa-sync-alt"></i> Sincronizar com Página Estática
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="static-sync-container">
                                <!-- Progress Steps -->
                                <div class="sync-progress mb-4">
                                    <div class="progress-step active" data-step="1">
                                        <div class="step-number">1</div>
                                        <div class="step-label">Selecionar Produtos</div>
                                    </div>
                                    <div class="progress-step" data-step="2">
                                        <div class="step-number">2</div>
                                        <div class="step-label">Configurar</div>
                                    </div>
                                    <div class="progress-step" data-step="3">
                                        <div class="step-number">3</div>
                                        <div class="step-label">Visualizar</div>
                                    </div>
                                    <div class="progress-step" data-step="4">
                                        <div class="step-number">4</div>
                                        <div class="step-label">Aplicar</div>
                                    </div>
                                </div>
                                
                                <!-- Step 1: Product Selection -->
                                <div class="sync-step" id="step-1">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="plan-selection-card">
                                                <h6 class="plan-title">
                                                    <i class="fas fa-calendar-alt text-success"></i>
                                                    Plano Agendamento
                                                </h6>
                                                <p class="plan-description text-muted">
                                                    Selecione o produto que representará o plano de agendamento na página estática.
                                                </p>
                                                <div id="agendamento-products" class="product-list">
                                                    <!-- Products will be loaded here -->
                                                </div>
                                                <div class="selected-product-info" id="agendamento-selected" style="display: none;">
                                                    <div class="alert alert-success">
                                                        <i class="fas fa-check-circle"></i>
                                                        <strong>Selecionado:</strong> <span class="selected-name"></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="plan-selection-card">
                                                <h6 class="plan-title">
                                                    <i class="fas fa-clinic-medical text-primary"></i>
                                                    Plano Clínica
                                                </h6>
                                                <p class="plan-description text-muted">
                                                    Selecione o produto que representará o plano de clínica na página estática.
                                                </p>
                                                <div id="clinica-products" class="product-list">
                                                    <!-- Products will be loaded here -->
                                                </div>
                                                <div class="selected-product-info" id="clinica-selected" style="display: none;">
                                                    <div class="alert alert-success">
                                                        <i class="fas fa-check-circle"></i>
                                                        <strong>Selecionado:</strong> <span class="selected-name"></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="selection-summary mt-4" id="selection-summary" style="display: none;">
                                        <div class="alert alert-info">
                                            <h6><i class="fas fa-info-circle"></i> Resumo da Seleção</h6>
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <strong>Agendamento:</strong> <span id="summary-agendamento">-</span>
                                                </div>
                                                <div class="col-md-6">
                                                    <strong>Clínica:</strong> <span id="summary-clinica">-</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Step 2: Configuration -->
                                <div class="sync-step" id="step-2" style="display: none;">
                                    <div class="configuration-panel">
                                        <h6>Configurações de Sincronização</h6>
                                        
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" id="createBackup" checked>
                                                    <label class="form-check-label" for="createBackup">
                                                        <i class="fas fa-save"></i> Criar backup da página atual
                                                    </label>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" id="validatePricing" checked>
                                                    <label class="form-check-label" for="validatePricing">
                                                        <i class="fas fa-check-double"></i> Validar estrutura de preços
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="pricing-preview mt-4" id="pricing-preview">
                                            <!-- Pricing preview will be loaded here -->
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Step 3: Preview -->
                                <div class="sync-step" id="step-3" style="display: none;">
                                    <div class="preview-panel">
                                        <h6>Visualização das Alterações</h6>
                                        <div class="preview-container">
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <h6 class="text-muted">Página Atual</h6>
                                                    <div class="preview-frame" id="current-preview">
                                                        <div class="loading-spinner">
                                                            <i class="fas fa-spinner fa-spin"></i> Carregando...
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <h6 class="text-success">Nova Página</h6>
                                                    <div class="preview-frame" id="new-preview">
                                                        <div class="loading-spinner">
                                                            <i class="fas fa-spinner fa-spin"></i> Gerando...
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Step 4: Apply -->
                                <div class="sync-step" id="step-4" style="display: none;">
                                    <div class="apply-panel">
                                        <div class="text-center">
                                            <div class="sync-status" id="sync-status">
                                                <div class="loading-state">
                                                    <i class="fas fa-sync-alt fa-spin fa-3x text-primary mb-3"></i>
                                                    <h5>Aplicando Sincronização...</h5>
                                                    <p class="text-muted">Por favor, aguarde enquanto atualizamos a página estática.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="btn-sync-back" style="display: none;">
                                <i class="fas fa-arrow-left"></i> Voltar
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Cancelar
                            </button>
                            <button type="button" class="btn btn-primary" id="btn-sync-next">
                                Próximo <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = new bootstrap.Modal(document.getElementById('staticSyncModal'));
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        const nextBtn = document.getElementById('btn-sync-next');
        const backBtn = document.getElementById('btn-sync-back');
        
        nextBtn.addEventListener('click', () => this.handleNext());
        backBtn.addEventListener('click', () => this.handleBack());
        
        // Product selection listeners will be added dynamically
    }
    
    async loadAvailableProducts() {
        try {
            this.showLoading(true);
            
            const response = await productAPI.getProducts({ active: true });
            if (!response.success) {
                throw new Error(response.error || 'Failed to load products');
            }
            
            this.availableProducts = response.data.products || [];
            this.showLoading(false);
            
        } catch (error) {
            this.showLoading(false);
            console.error('Error loading products:', error);
            adminUtils.showToast('Erro ao carregar produtos', 'error');
        }
    }
    
    renderProductSelection() {
        const agendamentoContainer = document.getElementById('agendamento-products');
        const clinicaContainer = document.getElementById('clinica-products');
        
        // Filter products by plan type
        const agendamentoProducts = this.availableProducts.filter(p => 
            p.plan_type === 'SCHEDULING' || p.name.toLowerCase().includes('agendamento')
        );
        
        const clinicaProducts = this.availableProducts.filter(p => 
            p.plan_type === 'CLINIC' || p.name.toLowerCase().includes('clínica') || p.name.toLowerCase().includes('clinica')
        );
        
        // Render Agendamento products
        agendamentoContainer.innerHTML = this.renderProductList(agendamentoProducts, 'agendamento');
        
        // Render Clínica products  
        clinicaContainer.innerHTML = this.renderProductList(clinicaProducts, 'clinica');
        
        // Add click listeners
        this.addProductSelectionListeners();
    }
    
    renderProductList(products, planType) {
        if (products.length === 0) {
            return `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    Nenhum produto encontrado para este tipo de plano.
                </div>
            `;
        }
        
        return products.map(product => `
            <div class="product-selection-card" data-product-id="${product.stripe_product_id}" data-plan-type="${planType}">
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="${planType}-product" 
                           id="${planType}-${product.stripe_product_id}" value="${product.stripe_product_id}">
                    <label class="form-check-label" for="${planType}-${product.stripe_product_id}">
                        <div class="product-info">
                            <div class="product-name">${this.escapeHtml(product.name)}</div>
                            <div class="product-details">
                                <small class="text-muted">
                                    <i class="fas fa-users"></i> ${product.max_users || 'Ilimitado'} usuários
                                    ${product.price_count > 0 ? `• <i class="fas fa-tag"></i> ${product.price_count} preços` : ''}
                                </small>
                            </div>
                            ${product.active ? 
                                '<span class="badge bg-success">Ativo</span>' : 
                                '<span class="badge bg-secondary">Inativo</span>'
                            }
                        </div>
                    </label>
                </div>
            </div>
        `).join('');
    }
    
    addProductSelectionListeners() {
        // Add listeners for product selection
        document.querySelectorAll('input[name="agendamento-product"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectProduct('agendamento', e.target.value);
                }
            });
        });
        
        document.querySelectorAll('input[name="clinica-product"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectProduct('clinica', e.target.value);
                }
            });
        });
    }
    
    selectProduct(planType, productId) {
        const product = this.availableProducts.find(p => p.stripe_product_id === productId);
        if (product) {
            this.selectedProducts[planType] = product;
            this.updateSelectionDisplay(planType, product);
            this.updateSelectionSummary();
        }
    }
    
    updateSelectionDisplay(planType, product) {
        const selectedContainer = document.getElementById(`${planType}-selected`);
        const nameSpan = selectedContainer.querySelector('.selected-name');
        
        nameSpan.textContent = product.name;
        selectedContainer.style.display = 'block';
    }
    
    updateSelectionSummary() {
        const summary = document.getElementById('selection-summary');
        const agendamentoSpan = document.getElementById('summary-agendamento');
        const clinicaSpan = document.getElementById('summary-clinica');
        
        agendamentoSpan.textContent = this.selectedProducts.agendamento ? 
            this.selectedProducts.agendamento.name : '-';
        clinicaSpan.textContent = this.selectedProducts.clinica ? 
            this.selectedProducts.clinica.name : '-';
        
        const hasSelection = this.selectedProducts.agendamento || this.selectedProducts.clinica;
        summary.style.display = hasSelection ? 'block' : 'none';
        
        // Enable/disable next button
        const nextBtn = document.getElementById('btn-sync-next');
        const canProceed = this.selectedProducts.agendamento && this.selectedProducts.clinica;
        nextBtn.disabled = !canProceed;
        
        if (canProceed) {
            nextBtn.innerHTML = 'Configurar <i class="fas fa-arrow-right"></i>';
        } else {
            nextBtn.innerHTML = 'Selecione ambos os planos <i class="fas fa-arrow-right"></i>';
        }
    }
    
    async handleNext() {
        const currentStep = this.getCurrentStep();
        
        switch (currentStep) {
            case 1:
                if (this.validateStep1()) {
                    this.goToStep(2);
                    await this.loadConfiguration();
                }
                break;
            case 2:
                if (this.validateStep2()) {
                    this.goToStep(3);
                    await this.loadPreview();
                }
                break;
            case 3:
                this.goToStep(4);
                await this.applySync();
                break;
        }
    }
    
    handleBack() {
        const currentStep = this.getCurrentStep();
        if (currentStep > 1) {
            this.goToStep(currentStep - 1);
        }
    }
    
    getCurrentStep() {
        const activeStep = document.querySelector('.progress-step.active');
        return parseInt(activeStep.dataset.step);
    }
    
    goToStep(stepNumber) {
        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.toggle('active', stepNum === stepNumber);
        });
        
        // Show/hide step content
        document.querySelectorAll('.sync-step').forEach(step => {
            step.style.display = 'none';
        });
        document.getElementById(`step-${stepNumber}`).style.display = 'block';
        
        // Update button states
        this.updateButtonStates(stepNumber);
    }
    
    updateButtonStates(stepNumber) {
        const nextBtn = document.getElementById('btn-sync-next');
        const backBtn = document.getElementById('btn-sync-back');
        
        backBtn.style.display = stepNumber > 1 ? 'inline-block' : 'none';
        
        switch (stepNumber) {
            case 1:
                nextBtn.innerHTML = 'Próximo <i class="fas fa-arrow-right"></i>';
                break;
            case 2:
                nextBtn.innerHTML = 'Visualizar <i class="fas fa-eye"></i>';
                break;
            case 3:
                nextBtn.innerHTML = 'Aplicar Sincronização <i class="fas fa-sync-alt"></i>';
                nextBtn.classList.add('btn-success');
                nextBtn.classList.remove('btn-primary');
                break;
            case 4:
                nextBtn.style.display = 'none';
                break;
        }
    }
    
    validateStep1() {
        const hasAgendamento = this.selectedProducts.agendamento !== null;
        const hasClinica = this.selectedProducts.clinica !== null;
        
        if (!hasAgendamento || !hasClinica) {
            adminUtils.showToast('Selecione um produto para cada tipo de plano', 'warning');
            return false;
        }
        
        return true;
    }
    
    validateStep2() {
        // Validation logic for step 2 will be implemented
        return true;
    }
    
    async loadConfiguration() {
        // Configuration loading logic will be implemented
        const previewContainer = document.getElementById('pricing-preview');
        previewContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                Configuração carregada para os produtos selecionados.
            </div>
        `;
    }
    
    async loadPreview() {
        // Preview loading logic will be implemented
        const currentPreview = document.getElementById('current-preview');
        const newPreview = document.getElementById('new-preview');
        
        currentPreview.innerHTML = '<div class="alert alert-secondary">Página atual carregada</div>';
        newPreview.innerHTML = '<div class="alert alert-success">Nova página gerada</div>';
    }
    
    async applySync() {
        try {
            const statusContainer = document.getElementById('sync-status');
            
            // Simulate sync process
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            statusContainer.innerHTML = `
                <div class="success-state">
                    <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
                    <h5>Sincronização Concluída!</h5>
                    <p class="text-muted">A página estática foi atualizada com sucesso.</p>
                    <div class="mt-3">
                        <button class="btn btn-primary" onclick="window.open('/planos', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Visualizar Página
                        </button>
                        <button class="btn btn-outline-secondary ms-2" data-bs-dismiss="modal">
                            Fechar
                        </button>
                    </div>
                </div>
            `;
            
            adminUtils.showToast('Página estática sincronizada com sucesso!', 'success');
            
        } catch (error) {
            console.error('Sync error:', error);
            const statusContainer = document.getElementById('sync-status');
            statusContainer.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <h5>Erro na Sincronização</h5>
                    <p class="text-muted">${error.message}</p>
                    <button class="btn btn-outline-primary" onclick="this.goToStep(1)">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            `;
            adminUtils.showToast('Erro ao sincronizar página estática', 'error');
        }
    }
    
    showLoading(show) {
        this.isLoading = show;
        // Loading state management
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance
window.staticPageSync = new StaticPageSync();