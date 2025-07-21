// V3 Recovery Wizard Component
class V3RecoveryWizard {
    constructor() {
        this.modal = null;
        this.currentStep = 1;
        this.totalSteps = 4;
        this.auditResults = null;
        this.recoveryPlan = null;
        this.executionResults = null;
    }
    
    showModal() {
        const modalContent = this.renderWizardContent();
        
        this.modal = new adminUtils.Modal({
            title: 'V3 Recovery Wizard',
            content: modalContent,
            size: 'xl',
            footer: this.renderWizardFooter(),
            backdrop: 'static',
            keyboard: false
        });
        
        this.modal.on('show', () => {
            this.startAudit();
        });
        
        this.modal.show();
        
        return this.modal;
    }
    
    renderWizardContent() {
        return `
            <div class="recovery-wizard">
                ${this.renderProgressBar()}
                
                <div class="wizard-content" id="wizard-content">
                    <!-- Content will be dynamically loaded based on step -->
                </div>
            </div>
        `;
    }
    
    renderProgressBar() {
        const steps = [
            { number: 1, label: 'Audit', icon: 'search' },
            { number: 2, label: 'Review', icon: 'clipboard-check' },
            { number: 3, label: 'Execute', icon: 'play' },
            { number: 4, label: 'Verify', icon: 'check-circle' }
        ];
        
        return `
            <div class="wizard-progress mb-4">
                ${steps.map(step => `
                    <div class="progress-step ${this.currentStep >= step.number ? 'active' : ''} ${this.currentStep === step.number ? 'current' : ''}">
                        <div class="step-number">
                            <i class="fas fa-${step.icon}"></i>
                        </div>
                        <div class="step-label">${step.label}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    renderWizardFooter() {
        return `
            <button type="button" 
                    class="btn btn-secondary" 
                    id="wizard-back-btn"
                    onclick="recoveryWizard.previousStep()"
                    ${this.currentStep === 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-left"></i> Back
            </button>
            <button type="button" 
                    class="btn btn-secondary" 
                    data-bs-dismiss="modal">
                Cancel
            </button>
            <button type="button" 
                    class="btn btn-primary" 
                    id="wizard-next-btn"
                    onclick="recoveryWizard.nextStep()">
                Next <i class="fas fa-arrow-right"></i>
            </button>
        `;
    }
    
    async startAudit() {
        this.showStepContent('audit');
        
        // In demo mode, simulate audit results
        if (window.app && window.app.demoMode) {
            setTimeout(() => {
                this.auditResults = this.getDemoAuditResults();
                this.showAuditResults();
            }, 2000);
        } else {
            try {
                const response = await productAPI.runV3Audit();
                if (response.success) {
                    this.auditResults = response.data;
                    this.showAuditResults();
                } else {
                    throw new Error(response.error || 'Audit failed');
                }
            } catch (error) {
                console.error('Audit error:', error);
                this.showError('Failed to run audit: ' + error.message);
            }
        }
    }
    
    showStepContent(stepName) {
        const contentDiv = document.getElementById('wizard-content');
        
        switch (stepName) {
            case 'audit':
                contentDiv.innerHTML = this.renderAuditStep();
                break;
            case 'review':
                contentDiv.innerHTML = this.renderReviewStep();
                break;
            case 'execute':
                contentDiv.innerHTML = this.renderExecuteStep();
                break;
            case 'verify':
                contentDiv.innerHTML = this.renderVerifyStep();
                break;
        }
    }
    
    renderAuditStep() {
        return `
            <div class="audit-step">
                <div class="text-center p-5">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <h4>Running V3 Audit</h4>
                    <p class="text-muted">Scanning all products and prices for issues...</p>
                </div>
            </div>
        `;
    }
    
    showAuditResults() {
        const contentDiv = document.getElementById('wizard-content');
        
        contentDiv.innerHTML = `
            <div class="audit-results">
                <h3 class="mb-4">
                    <i class="fas fa-search text-primary"></i> Audit Complete
                </h3>
                
                <div class="audit-summary row mb-4">
                    <div class="col-md-3">
                        <div class="summary-card error">
                            <div class="card-value">${this.auditResults.summary.total_issues}</div>
                            <div class="card-label">Total Issues</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="summary-card warning">
                            <div class="card-value">${this.auditResults.summary.products_affected}</div>
                            <div class="card-label">Products Affected</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="summary-card info">
                            <div class="card-value">${this.auditResults.summary.prices_affected}</div>
                            <div class="card-label">Prices Affected</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="summary-card success">
                            <div class="card-value">${this.auditResults.summary.products_clean}</div>
                            <div class="card-label">Clean Products</div>
                        </div>
                    </div>
                </div>
                
                <div class="issue-breakdown">
                    <h5 class="mb-3">Issues Found:</h5>
                    
                    ${this.auditResults.issues.map(issue => `
                        <div class="issue-category mb-3">
                            <div class="issue-header d-flex align-items-center">
                                <i class="fas fa-${this.getIssueIcon(issue.type)} text-${this.getIssueColor(issue.type)} me-2"></i>
                                <h6 class="mb-0">${issue.title}</h6>
                                <span class="badge bg-${this.getIssueColor(issue.type)} ms-auto">${issue.count}</span>
                            </div>
                            <p class="text-muted mt-1 mb-2">${issue.description}</p>
                            
                            ${issue.examples.length > 0 ? `
                                <div class="issue-examples">
                                    <small class="text-muted">Examples:</small>
                                    <ul class="small">
                                        ${issue.examples.slice(0, 3).map(ex => `<li>${ex}</li>`).join('')}
                                        ${issue.examples.length > 3 ? `<li>...and ${issue.examples.length - 3} more</li>` : ''}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                
                ${this.auditResults.summary.total_issues === 0 ? `
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i>
                        <strong>No issues found!</strong> All products and prices are correctly configured.
                    </div>
                ` : `
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i>
                        <strong>Recovery Plan Available</strong>
                        <p class="mb-0">Click "Next" to review the recovery plan for fixing these issues.</p>
                    </div>
                `}
            </div>
        `;
        
        // Update next button
        const nextBtn = document.getElementById('wizard-next-btn');
        nextBtn.disabled = false;
        
        if (this.auditResults.summary.total_issues === 0) {
            nextBtn.textContent = 'Finish';
            nextBtn.onclick = () => this.finish();
        }
    }
    
    renderReviewStep() {
        this.generateRecoveryPlan();
        
        return `
            <div class="review-step">
                <h3 class="mb-4">
                    <i class="fas fa-clipboard-check text-primary"></i> Recovery Plan
                </h3>
                
                <div class="alert alert-warning mb-4">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Important:</strong> Please review the recovery plan carefully before proceeding. 
                    All changes will be applied to both the local database and Stripe.
                </div>
                
                <div class="recovery-plan">
                    ${this.recoveryPlan.steps.map((step, index) => `
                        <div class="recovery-step mb-4">
                            <div class="step-header">
                                <h5>
                                    <span class="step-number">${index + 1}</span>
                                    ${step.title}
                                </h5>
                                <span class="badge bg-${this.getStepColor(step.type)}">${step.affectedCount} items</span>
                            </div>
                            
                            <p class="text-muted">${step.description}</p>
                            
                            <div class="step-details">
                                <h6>Changes to be made:</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Item</th>
                                                <th>Current</th>
                                                <th>New</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${step.changes.slice(0, 5).map(change => `
                                                <tr>
                                                    <td><small>${change.item}</small></td>
                                                    <td><small class="text-danger">${change.from}</small></td>
                                                    <td><small class="text-success">${change.to}</small></td>
                                                </tr>
                                            `).join('')}
                                            ${step.changes.length > 5 ? `
                                                <tr>
                                                    <td colspan="3" class="text-center">
                                                        <small>...and ${step.changes.length - 5} more changes</small>
                                                    </td>
                                                </tr>
                                            ` : ''}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="recovery-summary mt-4 p-3 bg-light rounded">
                    <h6>Summary:</h6>
                    <ul class="mb-0">
                        <li>Total steps: ${this.recoveryPlan.steps.length}</li>
                        <li>Products to update: ${this.recoveryPlan.totalProducts}</li>
                        <li>Prices to update: ${this.recoveryPlan.totalPrices}</li>
                        <li>Estimated time: ~${this.recoveryPlan.estimatedTime} minutes</li>
                    </ul>
                </div>
                
                <div class="form-check mt-4">
                    <input class="form-check-input" type="checkbox" id="confirm-recovery">
                    <label class="form-check-label" for="confirm-recovery">
                        I understand that these changes will be applied to both the local database and Stripe
                    </label>
                </div>
            </div>
        `;
    }
    
    renderExecuteStep() {
        return `
            <div class="execute-step">
                <h3 class="mb-4">
                    <i class="fas fa-play text-primary"></i> Executing Recovery Plan
                </h3>
                
                <div class="execution-progress mb-4">
                    <div class="progress" style="height: 25px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             id="execution-progress" 
                             role="progressbar" 
                             style="width: 0%">
                            0%
                        </div>
                    </div>
                    <p class="text-center mt-2" id="progress-text">Initializing...</p>
                </div>
                
                <div class="execution-log">
                    <h6>Execution Log:</h6>
                    <div class="log-container" id="execution-log">
                        <!-- Log entries will be added here -->
                    </div>
                </div>
            </div>
        `;
    }
    
    renderVerifyStep() {
        return `
            <div class="verify-step">
                <h3 class="mb-4">
                    <i class="fas fa-check-circle text-success"></i> Recovery Complete
                </h3>
                
                <div class="verification-results">
                    ${this.executionResults ? this.renderVerificationResults() : this.renderVerificationInProgress()}
                </div>
            </div>
        `;
    }
    
    renderVerificationResults() {
        const results = this.executionResults;
        const allSuccess = results.failed === 0;
        
        return `
            <div class="alert alert-${allSuccess ? 'success' : 'warning'} mb-4">
                <h5 class="alert-heading">
                    ${allSuccess ? 
                        '<i class="fas fa-check-circle"></i> All recovery steps completed successfully!' : 
                        '<i class="fas fa-exclamation-triangle"></i> Recovery completed with some issues'}
                </h5>
                <p class="mb-0">
                    Successfully processed: ${results.success} items<br>
                    ${results.failed > 0 ? `Failed: ${results.failed} items` : ''}
                </p>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <h6>Before Recovery:</h6>
                    <ul>
                        <li>Total issues: ${this.auditResults.summary.total_issues}</li>
                        <li>Products with issues: ${this.auditResults.summary.products_affected}</li>
                        <li>Prices with issues: ${this.auditResults.summary.prices_affected}</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6>After Recovery:</h6>
                    <ul>
                        <li>Issues resolved: ${results.resolved}</li>
                        <li>Issues remaining: ${results.remaining}</li>
                        <li>New issues: ${results.new_issues || 0}</li>
                    </ul>
                </div>
            </div>
            
            ${results.failed > 0 ? `
                <div class="failed-items">
                    <h6>Failed Items:</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Action</th>
                                    <th>Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.failures.map(failure => `
                                    <tr>
                                        <td>${failure.item}</td>
                                        <td>${failure.action}</td>
                                        <td class="text-danger">${failure.error}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
            
            <div class="next-steps mt-4">
                <h6>Next Steps:</h6>
                <ul>
                    <li>Review the product catalog to ensure all changes were applied correctly</li>
                    <li>Run a sync with Stripe to ensure consistency</li>
                    ${results.failed > 0 ? '<li class="text-danger">Manually review and fix failed items</li>' : ''}
                    <li>Monitor the system for any issues over the next 24 hours</li>
                </ul>
            </div>
        `;
    }
    
    renderVerificationInProgress() {
        return `
            <div class="text-center p-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h4>Verifying Results</h4>
                <p class="text-muted">Running post-recovery verification...</p>
            </div>
        `;
    }
    
    generateRecoveryPlan() {
        this.recoveryPlan = {
            steps: [],
            totalProducts: 0,
            totalPrices: 0,
            estimatedTime: 0
        };
        
        // Generate steps based on audit results
        this.auditResults.issues.forEach(issue => {
            if (issue.count > 0) {
                const step = {
                    type: issue.type,
                    title: this.getStepTitle(issue.type),
                    description: this.getStepDescription(issue.type),
                    affectedCount: issue.count,
                    changes: []
                };
                
                // Generate example changes
                issue.examples.forEach(example => {
                    step.changes.push(this.generateChange(issue.type, example));
                });
                
                this.recoveryPlan.steps.push(step);
                
                if (issue.type.includes('product')) {
                    this.recoveryPlan.totalProducts += issue.count;
                } else {
                    this.recoveryPlan.totalPrices += issue.count;
                }
            }
        });
        
        // Estimate time (30 seconds per item)
        this.recoveryPlan.estimatedTime = Math.ceil(
            (this.recoveryPlan.totalProducts + this.recoveryPlan.totalPrices) * 0.5
        );
    }
    
    generateChange(issueType, example) {
        switch (issueType) {
            case 'missing_v3_prefix':
                return {
                    item: example,
                    from: example,
                    to: example.replace('MedPro -', 'MedPro v3 -')
                };
            case 'wrong_lookup_key':
                return {
                    item: example,
                    from: example,
                    to: 'v3_' + example
                };
            case 'missing_prices':
                return {
                    item: example,
                    from: 'No price',
                    to: 'Price created'
                };
            default:
                return {
                    item: example,
                    from: 'Issue',
                    to: 'Fixed'
                };
        }
    }
    
    async nextStep() {
        switch (this.currentStep) {
            case 1:
                if (this.auditResults && this.auditResults.summary.total_issues > 0) {
                    this.currentStep = 2;
                    this.updateUI();
                    this.showStepContent('review');
                }
                break;
                
            case 2:
                const confirmed = document.getElementById('confirm-recovery')?.checked;
                if (!confirmed) {
                    adminUtils.showToast('Please confirm that you understand the changes', 'warning');
                    return;
                }
                this.currentStep = 3;
                this.updateUI();
                this.executeRecovery();
                break;
                
            case 3:
                // Execution completes automatically
                break;
                
            case 4:
                this.finish();
                break;
        }
    }
    
    previousStep() {
        if (this.currentStep > 1 && this.currentStep !== 3) { // Can't go back during execution
            this.currentStep--;
            this.updateUI();
            
            switch (this.currentStep) {
                case 1:
                    this.showAuditResults();
                    break;
                case 2:
                    this.showStepContent('review');
                    break;
            }
        }
    }
    
    async executeRecovery() {
        this.showStepContent('execute');
        const logContainer = document.getElementById('execution-log');
        const progressBar = document.getElementById('execution-progress');
        const progressText = document.getElementById('progress-text');
        
        // Disable navigation during execution
        document.getElementById('wizard-back-btn').disabled = true;
        document.getElementById('wizard-next-btn').disabled = true;
        
        // In demo mode, simulate execution
        if (window.app && window.app.demoMode) {
            let progress = 0;
            const totalSteps = this.recoveryPlan.steps.reduce((sum, step) => sum + step.affectedCount, 0);
            let currentItem = 0;
            
            for (const step of this.recoveryPlan.steps) {
                this.addLogEntry(logContainer, `info`, `Starting: ${step.title}`);
                
                for (let i = 0; i < Math.min(step.affectedCount, 3); i++) {
                    currentItem++;
                    progress = Math.round((currentItem / totalSteps) * 100);
                    
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;
                    progressText.textContent = `Processing: ${step.changes[i]?.item || 'Item ' + (i + 1)}`;
                    
                    await this.delay(500);
                    
                    this.addLogEntry(logContainer, 'success', `✓ Fixed: ${step.changes[i]?.item || 'Item ' + (i + 1)}`);
                }
                
                if (step.affectedCount > 3) {
                    currentItem += step.affectedCount - 3;
                    progress = Math.round((currentItem / totalSteps) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;
                    
                    this.addLogEntry(logContainer, 'info', `✓ Processed ${step.affectedCount - 3} more items`);
                    await this.delay(300);
                }
            }
            
            // Complete
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-success');
            progressText.textContent = 'Recovery complete!';
            
            this.executionResults = {
                success: totalSteps,
                failed: 0,
                resolved: this.auditResults.summary.total_issues,
                remaining: 0,
                failures: []
            };
            
            // Move to verify step
            setTimeout(() => {
                this.currentStep = 4;
                this.updateUI();
                this.showStepContent('verify');
            }, 1000);
        }
    }
    
    addLogEntry(container, type, message) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-message">${message}</span>
        `;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }
    
    updateUI() {
        // Update progress bar
        document.querySelector('.wizard-progress').outerHTML = this.renderProgressBar();
        
        // Update buttons
        const backBtn = document.getElementById('wizard-back-btn');
        const nextBtn = document.getElementById('wizard-next-btn');
        
        backBtn.disabled = this.currentStep === 1 || this.currentStep === 3;
        
        if (this.currentStep === 4) {
            nextBtn.textContent = 'Finish';
            nextBtn.onclick = () => this.finish();
            nextBtn.disabled = false;
        } else if (this.currentStep === 3) {
            nextBtn.disabled = true;
        }
    }
    
    finish() {
        this.modal.hide();
        adminUtils.showToast('V3 Recovery completed', 'success');
        
        // Reload products to show updated state
        if (window.app) {
            window.app.loadProducts();
        }
    }
    
    showError(message) {
        const contentDiv = document.getElementById('wizard-content');
        contentDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i>
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
    
    // Helper methods
    getIssueIcon(type) {
        const icons = {
            'missing_v3_prefix': 'tag',
            'wrong_lookup_key': 'key',
            'orphaned_price': 'unlink',
            'missing_prices': 'dollar-sign',
            'missing_metadata': 'database',
            'sync_error': 'sync-alt'
        };
        return icons[type] || 'exclamation-triangle';
    }
    
    getIssueColor(type) {
        const colors = {
            'missing_v3_prefix': 'danger',
            'wrong_lookup_key': 'danger',
            'orphaned_price': 'warning',
            'missing_prices': 'warning',
            'missing_metadata': 'info',
            'sync_error': 'danger'
        };
        return colors[type] || 'secondary';
    }
    
    getStepTitle(type) {
        const titles = {
            'missing_v3_prefix': 'Fix Product Names',
            'wrong_lookup_key': 'Fix Lookup Keys',
            'orphaned_price': 'Clean Orphaned Prices',
            'missing_prices': 'Create Missing Prices',
            'missing_metadata': 'Update Metadata',
            'sync_error': 'Fix Sync Errors'
        };
        return titles[type] || 'Fix Issues';
    }
    
    getStepDescription(type) {
        const descriptions = {
            'missing_v3_prefix': 'Add "v3" prefix to product names for version 3 products',
            'wrong_lookup_key': 'Update lookup keys to include "v3_" prefix',
            'orphaned_price': 'Remove prices that are not linked to any active product',
            'missing_prices': 'Create missing price configurations (monthly, semester, annual)',
            'missing_metadata': 'Add required metadata fields for AI quotas and features',
            'sync_error': 'Resolve synchronization conflicts between local database and Stripe'
        };
        return descriptions[type] || 'Fix detected issues';
    }
    
    getStepColor(type) {
        return this.getIssueColor(type);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Demo data
    getDemoAuditResults() {
        return {
            summary: {
                total_issues: 22,
                products_affected: 15,
                prices_affected: 7,
                products_clean: 30
            },
            issues: [
                {
                    type: 'missing_v3_prefix',
                    title: 'Missing v3 Prefix',
                    description: 'Products without "v3" in their name',
                    count: 15,
                    severity: 'high',
                    examples: [
                        'MedPro - Plano Clínica - 5 usuários',
                        'MedPro - Plano Agendamento - 10 usuários',
                        'MedPro - Plano Clínica - 20 usuários'
                    ]
                },
                {
                    type: 'wrong_lookup_key',
                    title: 'Incorrect Lookup Keys',
                    description: 'Price lookup keys missing "v3_" prefix',
                    count: 7,
                    severity: 'high',
                    examples: [
                        'clinic_5users_monthly',
                        'clinic_10users_semester',
                        'scheduling_20users_annual'
                    ]
                },
                {
                    type: 'orphaned_price',
                    title: 'Orphaned Prices',
                    description: 'Prices linked to deleted or inactive products',
                    count: 3,
                    severity: 'medium',
                    examples: [
                        'price_1ABC123 (old_clinic_plan)',
                        'price_1DEF456 (deleted_product)',
                        'price_1GHI789 (test_product)'
                    ]
                },
                {
                    type: 'missing_prices',
                    title: 'Missing Price Configurations',
                    description: 'Products missing required price periods',
                    count: 5,
                    severity: 'medium',
                    examples: [
                        'prod_v3_clinic_50users (missing semester price)',
                        'prod_v3_scheduling_1user (missing annual price)',
                        'prod_v3_clinic_100users (missing all prices)'
                    ]
                }
            ]
        };
    }
}

// Create global instance
window.recoveryWizard = new V3RecoveryWizard();

// Add wizard-specific CSS
const wizardStyle = document.createElement('style');
wizardStyle.textContent = `
    .recovery-wizard {
        min-height: 500px;
    }
    
    .wizard-progress {
        display: flex;
        justify-content: space-between;
        position: relative;
        margin-bottom: 2rem;
    }
    
    .wizard-progress::before {
        content: '';
        position: absolute;
        top: 25px;
        left: 50px;
        right: 50px;
        height: 2px;
        background: #dee2e6;
        z-index: 0;
    }
    
    .progress-step {
        text-align: center;
        position: relative;
        z-index: 1;
        flex: 1;
    }
    
    .step-number {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: #f8f9fa;
        border: 2px solid #dee2e6;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        color: #6c757d;
        margin-bottom: 0.5rem;
    }
    
    .progress-step.active .step-number {
        background: #0066cc;
        border-color: #0066cc;
        color: white;
    }
    
    .progress-step.current .step-number {
        box-shadow: 0 0 0 4px rgba(0, 102, 204, 0.2);
    }
    
    .step-label {
        font-size: 0.875rem;
        color: #6c757d;
    }
    
    .progress-step.active .step-label {
        color: #212529;
        font-weight: 500;
    }
    
    .summary-card {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 1.5rem;
        text-align: center;
    }
    
    .summary-card.error {
        border-color: #dc3545;
        color: #dc3545;
    }
    
    .summary-card.warning {
        border-color: #ffc107;
        color: #ffc107;
    }
    
    .summary-card.info {
        border-color: #17a2b8;
        color: #17a2b8;
    }
    
    .summary-card.success {
        border-color: #28a745;
        color: #28a745;
    }
    
    .card-value {
        font-size: 2.5rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    
    .card-label {
        font-size: 0.875rem;
        color: #6c757d;
    }
    
    .issue-category {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
    }
    
    .issue-header {
        margin-bottom: 0.5rem;
    }
    
    .issue-examples {
        margin-top: 0.5rem;
    }
    
    .recovery-step {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 1.5rem;
    }
    
    .step-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }
    
    .step-header h5 {
        margin: 0;
    }
    
    .step-number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        background: #0066cc;
        color: white;
        border-radius: 50%;
        margin-right: 0.5rem;
        font-size: 0.875rem;
    }
    
    .step-details {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 4px;
        margin-top: 1rem;
    }
    
    .log-container {
        height: 300px;
        overflow-y: auto;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 1rem;
        font-family: monospace;
        font-size: 0.875rem;
    }
    
    .log-entry {
        margin-bottom: 0.5rem;
        display: flex;
        gap: 1rem;
    }
    
    .log-time {
        color: #6c757d;
        flex-shrink: 0;
    }
    
    .log-message {
        flex: 1;
    }
    
    .log-success .log-message {
        color: #28a745;
    }
    
    .log-error .log-message {
        color: #dc3545;
    }
    
    .log-warning .log-message {
        color: #ffc107;
    }
    
    .log-info .log-message {
        color: #17a2b8;
    }
`;
document.head.appendChild(wizardStyle);