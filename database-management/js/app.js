/**
 * Database Management Application
 * Main controller for database management functionality
 */

class DatabaseManagementApp {
    constructor() {
        this.currentEnvironment = null;
        this.availableProcedures = [];
        this.selectedProcedure = null;
        this.isInitialized = false;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.checkEnvironment = this.checkEnvironment.bind(this);
        this.loadStatistics = this.loadStatistics.bind(this);
        this.loadProcedures = this.loadProcedures.bind(this);
        this.onProcedureSelect = this.onProcedureSelect.bind(this);
        this.onExecuteProcedure = this.onExecuteProcedure.bind(this);
        this.showConfirmDialog = this.showConfirmDialog.bind(this);
        this.executeProcedure = this.executeProcedure.bind(this);
    }
    
    /**
     * Initialize the application
     */
    async init() {
        if (this.isInitialized) return;
        
        console.log('Initializing Database Management App...');
        
        this.setupEventListeners();
        this.checkEnvironment();
        
        // Listen for environment changes
        if (window.environmentContext) {
            window.environmentContext.addEventListener('environmentChanged', () => {
                this.checkEnvironment();
            });
        }
        
        this.isInitialized = true;
        console.log('Database Management App initialized');
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.currentEnvironment) {
                    this.loadStatistics();
                }
            });
        }
        
        // Procedure selector
        const procedureSelect = document.getElementById('procedure-select');
        if (procedureSelect) {
            procedureSelect.addEventListener('change', this.onProcedureSelect);
        }
        
        // Execute button
        const executeBtn = document.getElementById('btn-execute');
        if (executeBtn) {
            executeBtn.addEventListener('click', this.onExecuteProcedure);
        }
        
        // Reset button
        const resetBtn = document.getElementById('btn-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetForm();
            });
        }
        
        // Confirm execute button in modal
        const confirmExecuteBtn = document.getElementById('confirm-execute');
        if (confirmExecuteBtn) {
            confirmExecuteBtn.addEventListener('click', () => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
                if (modal) modal.hide();
                this.executeProcedure();
            });
        }
    }
    
    /**
     * Check current environment and update UI accordingly
     */
    checkEnvironment() {
        const currentEnv = window.environmentContext?.getCurrentEnvironment();
        
        if (currentEnv && currentEnv.id) {
            this.currentEnvironment = currentEnv;
            this.showDatabaseContent();
            this.updateTargetEnvironment();
            this.loadStatistics();
            this.loadProcedures();
        } else {
            this.currentEnvironment = null;
            this.showEnvironmentMessage();
        }
    }
    
    /**
     * Show environment selection message
     */
    showEnvironmentMessage() {
        document.getElementById('no-environment').style.display = 'block';
        document.getElementById('database-content').style.display = 'none';
    }
    
    /**
     * Show database content when environment is selected
     */
    showDatabaseContent() {
        document.getElementById('no-environment').style.display = 'none';
        document.getElementById('database-content').style.display = 'block';
    }
    
    /**
     * Update target environment display
     */
    updateTargetEnvironment() {
        const targetEnvSpan = document.getElementById('target-env');
        if (targetEnvSpan && this.currentEnvironment) {
            targetEnvSpan.textContent = this.currentEnvironment.display_name;
            targetEnvSpan.className = `badge bg-${this.getEnvironmentBadgeClass(this.currentEnvironment.env_type)}`;
        }
    }
    
    /**
     * Get Bootstrap badge class for environment type
     */
    getEnvironmentBadgeClass(envType) {
        const typeMap = {
            'production': 'danger',
            'test': 'warning', 
            'development': 'success',
            'nqa': 'info'
        };
        return typeMap[envType] || 'secondary';
    }
    
    /**
     * Load database statistics
     */
    async loadStatistics() {
        if (!this.currentEnvironment) return;
        
        console.log('Loading database statistics for environment:', this.currentEnvironment.id);
        
        // Show loading state
        this.setStatsLoading(true);
        
        try {
            const response = await authenticatedFetch(`/api/v1/database/stats?environment_id=${this.currentEnvironment.id}`);
            
            if (response.success) {
                this.displayStatistics(response.data);
            } else {
                throw new Error(response.error || 'Failed to load statistics');
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
            this.displayStatsError(error.message);
            showToast('Failed to load database statistics', 'error');
        } finally {
            this.setStatsLoading(false);
        }
    }
    
    /**
     * Display statistics in dashboard cards
     */
    displayStatistics(stats) {
        const allStats = [
            'users', 'practitioners', 'patients', 'organizations',
            'activeSubscriptions', 'appointments', 'encounters', 'clinicalRecords',
            'medicationRecords', 'locations', 'schedules', 'invoices',
            'attachments', 'carePlans', 'patientLeads', 'communications'
        ];
        allStats.forEach(key => {
            const element = document.getElementById(`${key}-count`);
            if (element) {
                element.textContent = stats[key]?.toLocaleString() || '0';
            }
        });
    }
    
    /**
     * Display error in stats cards
     */
    displayStatsError(errorMessage) {
        const allStats = [
            'users', 'practitioners', 'patients', 'organizations',
            'activeSubscriptions', 'appointments', 'encounters', 'clinicalRecords',
            'medicationRecords', 'locations', 'schedules', 'invoices',
            'attachments', 'carePlans', 'patientLeads', 'communications'
        ];
        const errorText = 'Error';
        allStats.forEach(key => {
            const element = document.getElementById(`${key}-count`);
            if (element) {
                element.textContent = errorText;
            }
        });
    }
    
    /**
     * Set loading state for statistics
     */
    setStatsLoading(loading) {
        const allStats = [
            'users', 'practitioners', 'patients', 'organizations',
            'activeSubscriptions', 'appointments', 'encounters', 'clinicalRecords',
            'medicationRecords', 'locations', 'schedules', 'invoices',
            'attachments', 'carePlans', 'patientLeads', 'communications'
        ];
        const loadingText = loading ? '...' : '-';
        if (loading) {
            allStats.forEach(key => {
                const element = document.getElementById(`${key}-count`);
                if (element) {
                    element.textContent = loadingText;
                }
            });
        }
    }
    
    /**
     * Load available stored procedures
     */
    async loadProcedures() {
        if (!this.currentEnvironment) return;
        
        console.log('Loading stored procedures for environment:', this.currentEnvironment.id);
        
        // Show loading state
        document.getElementById('procedures-loading').style.display = 'block';
        document.getElementById('procedure-selector').style.display = 'none';
        
        try {
            const response = await authenticatedFetch(`/api/v1/database/procedures?environment_id=${this.currentEnvironment.id}`);
            
            if (response.success) {
                this.availableProcedures = response.data || [];
                this.displayProcedures();
            } else {
                throw new Error(response.error || 'Failed to load procedures');
            }
        } catch (error) {
            console.error('Error loading procedures:', error);
            showToast('Failed to load stored procedures', 'error');
            this.displayProceduresError();
        } finally {
            document.getElementById('procedures-loading').style.display = 'none';
        }
    }
    
    /**
     * Display available procedures in selector
     */
    displayProcedures() {
        const select = document.getElementById('procedure-select');
        if (!select) return;
        
        // Clear existing options (except first)
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }
        
        // Add procedure options
        this.availableProcedures.forEach(procedure => {
            const option = document.createElement('option');
            option.value = procedure.name;
            option.textContent = procedure.displayName || procedure.name;
            select.appendChild(option);
        });
        
        document.getElementById('procedure-selector').style.display = 'block';
    }
    
    /**
     * Display error for procedures loading
     */
    displayProceduresError() {
        document.getElementById('procedure-selector').style.display = 'block';
        // You could show an error message here
    }
    
    /**
     * Handle procedure selection
     */
    onProcedureSelect(event) {
        const selectedName = event.target.value;
        
        if (!selectedName) {
            this.selectedProcedure = null;
            document.getElementById('parameter-form').style.display = 'none';
            document.getElementById('btn-execute').disabled = true;
            return;
        }
        
        this.selectedProcedure = this.availableProcedures.find(p => p.name === selectedName);
        
        if (this.selectedProcedure) {
            this.displayParameterForm();
            document.getElementById('btn-execute').disabled = false;
        }
    }
    
    /**
     * Display parameter form for selected procedure
     */
    displayParameterForm() {
        if (!this.selectedProcedure) return;
        
        const container = document.getElementById('parameters-container');
        if (!container) return;
        
        // Clear existing parameters
        container.innerHTML = '';
        
        // Add parameters
        if (this.selectedProcedure.parameters && Object.keys(this.selectedProcedure.parameters).length > 0) {
            Object.entries(this.selectedProcedure.parameters).forEach(([paramName, paramConfig]) => {
                const paramDiv = this.createParameterInput(paramName, paramConfig);
                container.appendChild(paramDiv);
            });
        } else {
            container.innerHTML = '<p class="text-muted">No parameters required</p>';
        }
        
        document.getElementById('parameter-form').style.display = 'block';
    }
    
    /**
     * Create parameter input element
     */
    createParameterInput(name, config) {
        const div = document.createElement('div');
        div.className = 'parameter-group';
        
        const label = document.createElement('label');
        label.textContent = config.label || name;
        label.className = 'form-label';
        if (config.required) label.textContent += ' *';
        
        let input;
        switch (config.type) {
            case 'boolean':
                input = document.createElement('select');
                input.className = 'form-select';
                input.innerHTML = '<option value="true">True</option><option value="false">False</option>';
                input.value = config.default?.toString() || 'false';
                break;
            case 'confirm-checkbox':
                input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'form-check-input';
                input.checked = config.default || false;
                
                // Set properties first
                input.id = `param-${name}`;
                input.name = name;
                if (config.required) input.required = true;
                
                // Create the form-check wrapper inside the red warning box
                const checkWrapper = document.createElement('div');
                checkWrapper.className = 'form-check';
                
                // Update label to be clickable and add it to the form-check wrapper
                label.className = 'form-check-label';
                label.setAttribute('for', `param-${name}`);
                
                // Add input and label to the form-check wrapper
                checkWrapper.appendChild(input);
                checkWrapper.appendChild(label);
                
                // Add warning styling to the main container
                div.classList.add('confirm-checkbox-wrapper');
                
                // Add the form-check wrapper to the main div
                div.appendChild(checkWrapper);
                
                if (config.description) {
                    const help = document.createElement('div');
                    help.className = 'parameter-help text-danger';
                    help.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${config.description}`;
                    div.appendChild(help);
                }
                
                return div;
            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.className = 'form-control';
                input.value = config.default || '';
                break;
            default:
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                input.value = config.default || '';
        }
        
        input.id = `param-${name}`;
        input.name = name;
        if (config.required) input.required = true;
        if (config.placeholder) input.placeholder = config.placeholder;
        
        div.appendChild(label);
        div.appendChild(input);
        
        if (config.description) {
            const help = document.createElement('div');
            help.className = 'parameter-help';
            help.textContent = config.description;
            div.appendChild(help);
        }
        
        return div;
    }
    
    /**
     * Handle execute procedure button click
     */
    onExecuteProcedure() {
        if (!this.selectedProcedure || !this.currentEnvironment) return;
        
        // Validate parameters
        const parameters = this.getParameterValues();
        if (!this.validateParameters(parameters)) {
            return;
        }
        
        this.showConfirmDialog(parameters);
    }
    
    /**
     * Get current parameter values from form
     */
    getParameterValues() {
        const parameters = {};
        const paramInputs = document.querySelectorAll('#parameters-container input, #parameters-container select');
        
        paramInputs.forEach(input => {
            const name = input.name;
            let value;
            
            // Get value based on input type
            if (input.type === 'checkbox') {
                const config = this.selectedProcedure.parameters?.[name];
                if (config && config.type === 'confirm-checkbox') {
                    // For confirm checkboxes, send the confirmValue if checked, otherwise it should not be sent
                    if (input.checked) {
                        if (config.confirmValue) {
                           parameters[name] = config.confirmValue;
                        } else {
                           parameters[name] = true;
                        }
                    }
                } else {
                    value = input.checked;
                    parameters[name] = value;
                }
            } else {
                value = input.value;
                // Convert types for non-checkbox inputs
                const config = this.selectedProcedure.parameters?.[name];
                if (config) {
                    switch (config.type) {
                        case 'number':
                            parameters[name] = value ? Number(value) : null;
                            break;
                        case 'boolean':
                            parameters[name] = value === 'true';
                            break;
                        default:
                            parameters[name] = value;
                    }
                } else {
                     parameters[name] = value;
                }
            }
        });
        
        return parameters;
    }
    
    /**
     * Validate parameter values
     */
    validateParameters(parameters) {
        if (!this.selectedProcedure.parameters) return true;
        
        for (const [name, config] of Object.entries(this.selectedProcedure.parameters)) {
            const value = parameters[name];
            
            // Special handling for confirm checkboxes
            if (config.type === 'confirm-checkbox') {
                if (config.required && (!value || value !== config.confirmValue)) {
                    showToast(`You must confirm the action by checking the confirmation box for "${config.label || name}"`, 'error');
                    return false;
                }
                continue;
            }
            
            // Check required fields for other types
            if (config.required && (value === null || value === '')) {
                showToast(`Parameter "${config.label || name}" is required`, 'error');
                return false;
            }
            
            // Check validation pattern if specified
            if (config.validation && config.validation.pattern && value) {
                const regex = new RegExp(config.validation.pattern);
                if (!regex.test(value)) {
                    const message = config.validation.message || `Invalid format for "${config.label || name}"`;
                    showToast(message, 'error');
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Show confirmation dialog
     */
    showConfirmDialog(parameters) {
        document.getElementById('confirm-procedure-name').textContent = this.selectedProcedure.displayName || this.selectedProcedure.name;
        document.getElementById('confirm-environment').textContent = this.currentEnvironment.display_name;
        
        // Display parameters
        const paramContainer = document.getElementById('confirm-parameters');
        paramContainer.innerHTML = '';
        
        if (Object.keys(parameters).length > 0) {
            Object.entries(parameters).forEach(([name, value]) => {
                const paramDiv = document.createElement('div');
                paramDiv.className = 'parameter-item';
                paramDiv.innerHTML = `
                    <span class="parameter-name">${name}:</span>
                    <span class="parameter-value">${value}</span>
                `;
                paramContainer.appendChild(paramDiv);
            });
        } else {
            paramContainer.innerHTML = '<p class="text-muted">No parameters</p>';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        modal.show();
    }
    
    /**
     * Execute the stored procedure
     */
    async executeProcedure() {
        if (!this.selectedProcedure || !this.currentEnvironment) return;
        
        const parameters = this.getParameterValues();
        const executeBtn = document.getElementById('btn-execute');
        
        // Show executing state
        executeBtn.disabled = true;
        executeBtn.classList.add('executing');
        executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing...';
        
        try {
            console.log('Executing procedure:', this.selectedProcedure.name, 'with parameters:', parameters);
            
            const response = await authenticatedFetch('/api/v1/database/execute-procedure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    environmentId: this.currentEnvironment.id,
                    procedureName: this.selectedProcedure.name,
                    parameters: parameters
                })
            });
            
            if (response.success) {
                this.displayExecutionResults(response.data, true);
                showToast('Procedure executed successfully', 'success');
            } else {
                throw new Error(response.error || 'Procedure execution failed');
            }
        } catch (error) {
            console.error('Error executing procedure:', error);
            this.displayExecutionResults(error.message, false);
            showToast('Failed to execute procedure', 'error');
        } finally {
            // Reset button state
            executeBtn.disabled = false;
            executeBtn.classList.remove('executing');
            executeBtn.innerHTML = '<i class="fas fa-play"></i> Execute Procedure';
        }
    }
    
    /**
     * Display execution results
     */
    displayExecutionResults(results, success) {
        const resultsDiv = document.getElementById('execution-results');
        const resultsContent = document.getElementById('results-content');
        
        if (resultsContent) {
            resultsContent.textContent = typeof results === 'string' ? results : JSON.stringify(results, null, 2);
            resultsContent.className = success ? 'results-success' : 'results-error';
        }
        
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    /**
     * Reset the procedure form
     */
    resetForm() {
        document.getElementById('procedure-select').value = '';
        document.getElementById('parameter-form').style.display = 'none';
        document.getElementById('execution-results').style.display = 'none';
        document.getElementById('btn-execute').disabled = true;
        this.selectedProcedure = null;
    }
}

// Create global instance
window.DatabaseManagementApp = new DatabaseManagementApp();