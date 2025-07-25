/**
 * Environment Editor Component
 * Handles creating and editing environments through a modal interface
 */

class EnvironmentEditor {
    constructor() {
        this.modal = null;
        this.form = null;
        this.currentEnvironment = null;
        this.isEditing = false;
        
        this.init();
    }
    
    init() {
        this.modal = new bootstrap.Modal(document.getElementById('environmentModal'));
        this.form = document.getElementById('environment-form');
        
        this.setupEventListeners();
        this.setupFormValidation();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
        
        // Password toggle (only if elements exist)
        const togglePasswordBtn = document.getElementById('toggle-password');
        const passwordInput = document.getElementById('db-password');
        
        if (togglePasswordBtn && passwordInput) {
            togglePasswordBtn.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                const icon = togglePasswordBtn.querySelector('i');
                icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
            });
        }
        
        // Test connection button
        document.getElementById('test-connection-btn').addEventListener('click', () => {
            this.testConnection();
        });
        
        // Autodiscovery button
        const autodiscoveryBtn = document.getElementById('autodiscovery-btn');
        if (autodiscoveryBtn) {
            autodiscoveryBtn.addEventListener('click', () => {
                this.performAutodiscovery();
            });
        }
        
        // Toggle between quick and advanced mode
        const toggleQuickModeBtn = document.getElementById('toggle-quick-mode');
        if (toggleQuickModeBtn) {
            toggleQuickModeBtn.addEventListener('click', () => {
                this.toggleQuickMode();
            });
        }
        
        // Modal events
        document.getElementById('environmentModal').addEventListener('hidden.bs.modal', () => {
            this.resetForm();
        });
        
        // Environment type change
        document.getElementById('env-type').addEventListener('change', (e) => {
            this.updateFormDefaults(e.target.value);
        });
        
        // Environment name input
        document.getElementById('env-name').addEventListener('input', (e) => {
            this.validateEnvironmentName(e.target.value);
        });
    }
    
    /**
     * Set up form validation
     */
    setupFormValidation() {
        const form = this.form;
        
        // Real-time validation
        const inputs = form.querySelectorAll('input[required], select[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
            
            input.addEventListener('input', () => {
                if (input.classList.contains('is-invalid')) {
                    this.validateField(input);
                }
            });
        });
    }
    
    /**
     * Show create environment modal
     */
    showCreateModal() {
        this.isEditing = false;
        this.currentEnvironment = null;
        
        document.getElementById('modal-title').textContent = 'New Environment';
        document.getElementById('save-environment-btn').innerHTML = '<i class="fas fa-save"></i> Create Environment';
        
        this.resetForm();
        
        // Reset modal to initial state
        document.getElementById('discovery-section').classList.remove('d-none');
        document.getElementById('discovery-results').classList.add('d-none');
        document.getElementById('environment-form-section').classList.add('d-none');
        document.getElementById('test-connection-btn').classList.add('d-none');
        document.getElementById('save-environment-btn').classList.add('d-none');
        
        this.modal.show();
    }
    
    /**
     * Show edit environment modal
     */
    async editEnvironment(environmentId) {
        this.isEditing = true;
        
        try {
            this.currentEnvironment = await environmentApi.getEnvironment(environmentId);
            
            document.getElementById('modal-title').textContent = 'Edit Environment';
            document.getElementById('save-environment-btn').innerHTML = '<i class="fas fa-save"></i> Update Environment';
            
            this.populateForm(this.currentEnvironment);
            this.modal.show();
        } catch (error) {
            console.error('Failed to load environment for editing:', error);
            showToast(error.message || 'Failed to load environment', 'error');
        }
    }
    
    /**
     * Populate form with environment data
     */
    populateForm(environment) {
        // Populate fields only if they exist
        const fields = {
            'env-name': environment.env_name || '',
            'env-type': environment.env_type || '',
            'display-name': environment.display_name || '',
            'description': environment.description || '',
            'db-host': environment.db_host || '',
            'db-port': environment.db_port || 3306,
            'db-name': environment.db_name || '',
            'db-user': environment.db_user || '',
            'api-base-url': environment.api_base_url || '',
            'color-theme': environment.color_theme || 'blue',
            'icon': environment.icon || 'server'
        };
        
        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = value;
                } else {
                    field.value = value;
                }
            }
        });
        
        // Handle checkbox separately
        const isDefaultField = document.getElementById('is-default');
        if (isDefaultField) {
            isDefaultField.checked = environment.is_default || false;
        }
        
        // Don't populate password for security reasons
        const passwordField = document.getElementById('db-password');
        if (passwordField) {
            passwordField.value = '';
            passwordField.placeholder = 'Leave empty to keep current password';
            passwordField.required = false;
        }
    }
    
    /**
     * Reset form to initial state
     */
    resetForm() {
        this.form.reset();
        
        // Reset validation states
        const inputs = this.form.querySelectorAll('.is-invalid, .is-valid');
        inputs.forEach(input => {
            input.classList.remove('is-invalid', 'is-valid');
        });
        
        // Reset server host input
        const serverHostInput = document.getElementById('server-host');
        if (serverHostInput) {
            serverHostInput.value = '';
        }
        
        // Reset hidden fields
        const hiddenFields = ['db-host', 'db-port', 'db-name', 'db-user', 'db-password', 'api-base-url', 'color-theme', 'icon'];
        hiddenFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = fieldId === 'db-port' ? '3306' : 
                           fieldId === 'color-theme' ? 'blue' : 
                           fieldId === 'icon' ? 'server' : '';
            }
        });
    }
    
    /**
     * Handle form submission
     */
    async handleFormSubmit() {
        if (!this.validateForm()) {
            return;
        }
        
        const saveBtn = document.getElementById('save-environment-btn');
        const originalText = saveBtn.innerHTML;
        
        try {
            // Show loading state
            saveBtn.classList.add('loading');
            saveBtn.disabled = true;
            
            const formData = this.getFormData();
            const environmentData = environmentApi.formatEnvironmentData(formData);
            
            // Add all discovered environment variables if available
            if (this.discoveredEnvVariables) {
                environmentData.all_env_variables = this.discoveredEnvVariables;
                environmentData.server_host = this.serverHost;
            }
            
            let result;
            if (this.isEditing) {
                // Remove password if not changed
                if (!environmentData.db_password) {
                    delete environmentData.db_password;
                }
                
                result = await environmentApi.updateEnvironment(this.currentEnvironment.id, environmentData);
                
                // Update environment context
                if (window.environmentContext) {
                    const updatedEnv = { ...this.currentEnvironment, ...environmentData };
                    window.environmentContext.updateEnvironment(this.currentEnvironment.id, updatedEnv);
                }
                
                showToast('Environment updated successfully', 'success');
            } else {
                result = await environmentApi.createEnvironment(environmentData);
                
                // Add to environment context
                if (window.environmentContext) {
                    const newEnv = { ...environmentData, ...result };
                    window.environmentContext.addEnvironment(newEnv);
                }
                
                showToast('Environment created successfully', 'success');
            }
            
            this.modal.hide();
        } catch (error) {
            console.error('Failed to save environment:', error);
            showToast(environmentApi.formatApiError(error), 'error');
        } finally {
            // Reset button state
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
    
    /**
     * Get form data
     */
    getFormData() {
        const data = {};
        
        // Helper function to safely get field value
        const getFieldValue = (fieldId, defaultValue = '') => {
            const field = document.getElementById(fieldId);
            if (!field) return defaultValue;
            return field.type === 'checkbox' ? field.checked : field.value.trim();
        };
        
        // Get all form data
        data.env_name = getFieldValue('env-name');
        data.env_type = getFieldValue('env-type');
        data.display_name = getFieldValue('display-name');
        data.description = getFieldValue('description');
        data.db_host = getFieldValue('db-host');
        data.db_port = getFieldValue('db-port', '3306');
        data.db_name = getFieldValue('db-name');
        data.db_user = getFieldValue('db-user');
        data.db_password = getFieldValue('db-password');
        data.api_base_url = getFieldValue('api-base-url');
        data.color_theme = getFieldValue('color-theme', 'blue');
        data.icon = getFieldValue('icon', 'server');
        data.is_default = getFieldValue('is-default', false);
        
        return data;
    }
    
    /**
     * Validate form
     */
    validateForm() {
        let isValid = true;
        
        // Validate required fields
        const requiredFields = this.form.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        // Custom validations
        const envName = document.getElementById('env-name').value.trim();
        if (envName && !this.validateEnvironmentName(envName)) {
            isValid = false;
        }
        
        const dbPortField = document.getElementById('db-port');
        if (dbPortField) {
            const dbPort = dbPortField.value;
            if (dbPort && (dbPort < 1 || dbPort > 65535)) {
                this.setFieldError(dbPortField, 'Port must be between 1 and 65535');
                isValid = false;
            }
        }
        
        const apiUrlField = document.getElementById('api-base-url');
        if (apiUrlField) {
            const apiUrl = apiUrlField.value.trim();
            if (apiUrl && !this.validateUrl(apiUrl)) {
                this.setFieldError(apiUrlField, 'Please enter a valid URL');
                isValid = false;
            }
        }
        
        return isValid;
    }
    
    /**
     * Validate individual field
     */
    validateField(field) {
        const value = field.value.trim();
        
        if (field.hasAttribute('required') && !value) {
            this.setFieldError(field, 'This field is required');
            return false;
        }
        
        // Field-specific validation
        if (field.id === 'env-name' && value) {
            return this.validateEnvironmentName(value);
        }
        
        if (field.type === 'email' && value && !this.validateEmail(value)) {
            this.setFieldError(field, 'Please enter a valid email address');
            return false;
        }
        
        if (field.type === 'url' && value && !this.validateUrl(value)) {
            this.setFieldError(field, 'Please enter a valid URL');
            return false;
        }
        
        this.setFieldValid(field);
        return true;
    }
    
    /**
     * Validate environment name
     */
    validateEnvironmentName(name) {
        const field = document.getElementById('env-name');
        
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            this.setFieldError(field, 'Environment name must contain only letters, numbers, underscores, and dashes');
            return false;
        }
        
        if (name.length < 3) {
            this.setFieldError(field, 'Environment name must be at least 3 characters long');
            return false;
        }
        
        if (name.length > 50) {
            this.setFieldError(field, 'Environment name must be less than 50 characters');
            return false;
        }
        
        this.setFieldValid(field);
        return true;
    }
    
    /**
     * Validate email
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    /**
     * Validate URL
     */
    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Set field error state
     */
    setFieldError(field, message) {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        
        // Show error message
        let feedback = field.parentNode.querySelector('.invalid-feedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'invalid-feedback';
            field.parentNode.appendChild(feedback);
        }
        feedback.textContent = message;
    }
    
    /**
     * Set field valid state
     */
    setFieldValid(field) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        
        // Remove error message
        const feedback = field.parentNode.querySelector('.invalid-feedback');
        if (feedback) {
            feedback.remove();
        }
    }
    
    /**
     * Test connection with current form data
     */
    async testConnection() {
        console.log('🔌 Test connection started');
        
        // Get current form data for testing
        const formData = this.getFormData();
        console.log('📊 Form data:', formData);
        
        // Check if we have the minimum required fields for connection testing
        if (!formData.db_host || !formData.db_name || !formData.db_user) {
            console.log('⚠️ Missing required fields:', {
                db_host: formData.db_host,
                db_name: formData.db_name,
                db_user: formData.db_user
            });
            showToast('Connection information is incomplete. Please run discovery first.', 'warning');
            return;
        }
        
        const testBtn = document.getElementById('test-connection-btn');
        console.log('🔘 Test button found:', !!testBtn);
        const originalText = testBtn.innerHTML;
        
        try {
            console.log('⏳ Setting loading state');
            testBtn.classList.add('loading');
            testBtn.disabled = true;
            testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            
            // Prepare connection data for comprehensive service testing
            const connectionData = {
                server_host: formData.server_host || formData.db_host || 'localhost',
                server_port: formData.server_port || 3333
            };
            console.log('🔗 Connection data prepared:', connectionData);
            
            // Test connection with form data
            console.log('📡 Making API call to test connection');
            const result = await environmentApi.testConnectionWithData(connectionData);
            console.log('✅ API call completed, result:', result);
            
            console.log('📢 Calling showConnectionTestResult with:', result);
            this.showConnectionTestResult(result);
            
        } catch (error) {
            console.error('❌ Test connection error:', error);
            const errorResult = {
                success: false,
                message: error.message || 'Connection test failed',
                details: error.details || 'Unknown error occurred'
            };
            console.log('📢 Calling showConnectionTestResult with error:', errorResult);
            this.showConnectionTestResult(errorResult);
        } finally {
            console.log('🔄 Resetting button state');
            testBtn.classList.remove('loading');
            testBtn.disabled = false;
            testBtn.innerHTML = originalText;
        }
    }
    
    /**
     * Validate connection fields
     */
    validateConnectionFields() {
        const requiredFields = ['db-host', 'db-name', 'db-user'];
        
        for (const fieldId of requiredFields) {
            const field = document.getElementById(fieldId);
            if (!field || !field.value.trim()) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Show connection test result
     */
    showConnectionTestResult(result) {
        console.log('📢 showConnectionTestResult called with:', result);
        
        if (window.connectionTest) {
            console.log('🔧 Using window.connectionTest');
            window.connectionTest.showResult(result);
        } else {
            console.log('💡 Using fallback feedback display');
            // Enhanced feedback with detailed information
            if (result.success) {
                console.log('✅ Showing success feedback');
                const details = result.details || {};
                let successMessage = `✅ Connection successful!`;
                
                if (details.server_version) {
                    successMessage += `\n🔧 Server: ${details.server_version}`;
                }
                if (details.database_name) {
                    successMessage += `\n📊 Database: ${details.database_name}`;
                }
                if (details.host && details.port) {
                    successMessage += `\n🌐 Host: ${details.host}:${details.port}`;
                }
                
                console.log('🍞 Calling showToast with success message:', successMessage);
                showToast(successMessage, 'success');
                
                // Also show a temporary success indicator in the modal
                console.log('📋 Calling showConnectionStatus with success');
                this.showConnectionStatus('success', 'Connection verified successfully');
            } else {
                console.log('❌ Showing error feedback');
                const errorMessage = result.message || 'Connection test failed';
                const details = result.details ? `\nDetails: ${result.details}` : '';
                
                console.log('🍞 Calling showToast with error message:', `❌ ${errorMessage}${details}`);
                showToast(`❌ ${errorMessage}${details}`, 'error');
                
                // Show error indicator in the modal
                console.log('📋 Calling showConnectionStatus with error');
                this.showConnectionStatus('error', errorMessage);
            }
        }
    }
    
    /**
     * Show connection status in the modal
     */
    showConnectionStatus(type, message) {
        console.log('📋 showConnectionStatus called:', { type, message });
        
        // Remove any existing status
        const existingStatus = document.querySelector('.connection-status');
        if (existingStatus) {
            console.log('🗑️ Removing existing status element');
            existingStatus.remove();
        }
        
        // Create status element
        const statusDiv = document.createElement('div');
        statusDiv.className = `alert alert-${type === 'success' ? 'success' : 'danger'} connection-status mt-2`;
        statusDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
            <strong>${type === 'success' ? 'Success:' : 'Error:'}</strong> ${message}
        `;
        console.log('🎨 Created status element:', statusDiv);
        
        // Insert after the test connection button
        const testBtn = document.getElementById('test-connection-btn');
        console.log('🔘 Test button found for status insertion:', !!testBtn, testBtn?.parentNode ? 'with parent' : 'no parent');
        
        if (testBtn && testBtn.parentNode) {
            testBtn.parentNode.insertBefore(statusDiv, testBtn.nextSibling);
            console.log('✅ Status element inserted into DOM');
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (statusDiv && statusDiv.parentNode) {
                    console.log('⏰ Auto-removing status element after 5 seconds');
                    statusDiv.remove();
                }
            }, 5000);
        } else {
            console.warn('⚠️ Could not insert status element - test button or parent not found');
        }
    }
    
    /**
     * Update form defaults based on environment type
     */
    updateFormDefaults(envType) {
        const colorThemeField = document.getElementById('color-theme');
        const iconField = document.getElementById('icon');
        
        // Don't change if user has already selected something or fields don't exist
        if (this.isEditing || !colorThemeField || !iconField) return;
        
        const defaults = {
            production: { color: 'red', icon: 'shield-check' },
            test: { color: 'yellow', icon: 'bug' },
            development: { color: 'green', icon: 'code' },
            nqa: { color: 'blue', icon: 'network' }
        };
        
        const envDefaults = defaults[envType];
        if (envDefaults) {
            colorThemeField.value = envDefaults.color;
            iconField.value = envDefaults.icon;
        }
    }
    
    /**
     * Perform environment autodiscovery
     */
    async performAutodiscovery() {
        const serverHostInput = document.getElementById('server-host');
        const serverPortInput = document.getElementById('server-port');
        const autodiscoveryBtn = document.getElementById('autodiscovery-btn');
        
        // Validate required fields
        if (!serverHostInput.value.trim()) {
            showToast('Please enter a server host', 'error');
            serverHostInput.focus();
            return;
        }
        
        if (!serverPortInput.value.trim()) {
            showToast('Please enter a server port', 'error');
            serverPortInput.focus();
            return;
        }
        
        // Prepare connection data
        const connectionData = {
            server_host: serverHostInput.value.trim(),
            server_port: parseInt(serverPortInput.value.trim())
        };
        
        // Show loading state
        const originalText = autodiscoveryBtn.innerHTML;
        autodiscoveryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Discovering...';
        autodiscoveryBtn.disabled = true;
        
        try {
            const result = await environmentApi.autodiscoverEnvironment(connectionData);
            
            if (result.success) {
                this.applyDiscoveredSettings(result.data);
                this.showDiscoveryResults(result.data);
                showToast('Environment discovered successfully!', 'success');
            }
            
        } catch (error) {
            console.error('Autodiscovery failed:', error);
            showToast(`Discovery failed: ${error.message}`, 'error');
        } finally {
            // Restore button state
            autodiscoveryBtn.innerHTML = originalText;
            autodiscoveryBtn.disabled = false;
        }
    }
    
    /**
     * Apply discovered settings to form
     */
    applyDiscoveredSettings(discoveredData) {
        const { suggestions, discovered } = discoveredData;
        
        // Fill visible form fields with suggestions
        document.getElementById('env-name').value = suggestions.env_name || '';
        document.getElementById('env-type').value = suggestions.env_type || '';
        document.getElementById('display-name').value = suggestions.display_name || '';
        
        // Fill hidden database connection fields with discovered values
        document.getElementById('db-host').value = suggestions.db_host || '';
        document.getElementById('db-port').value = suggestions.db_port || 3306;
        document.getElementById('db-name').value = suggestions.db_name || '';
        document.getElementById('db-user').value = suggestions.db_user || '';
        document.getElementById('db-password').value = suggestions.db_password || '';
        document.getElementById('api-base-url').value = suggestions.api_base_url || '';
        document.getElementById('color-theme').value = suggestions.color_theme || 'blue';
        document.getElementById('icon').value = suggestions.icon || 'server';
        
        // Store all discovered environment variables for saving
        this.discoveredEnvVariables = discovered.env_variables_raw || {};
        this.serverHost = discovered.server_host;
    }
    
    /**
     * Show discovery results
     */
    showDiscoveryResults(discoveredData) {
        const resultsContainer = document.getElementById('discovery-results');
        const { discovered, suggestions } = discoveredData;
        
        let resultsHtml = `
            <div class="card border-success">
                <div class="card-header bg-success text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-check-circle me-2"></i>
                        Discovery Complete - ${discovered.server_host}
                    </h5>
                </div>
                <div class="card-body">
        `;
        
        // Connection Status
        resultsHtml += `
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-${discovered.server_type === 'LOCAL' ? 'home' : 'cloud'} text-success fs-4 me-3"></i>
                        <div>
                            <h6 class="mb-1">Server Type</h6>
                            <span class="badge bg-${discovered.server_type === 'LOCAL' ? 'primary' : 'info'}">${discovered.server_type}</span><br>
                            <small class="text-muted">${discovered.server_host}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-database text-success fs-4 me-3"></i>
                        <div>
                            <h6 class="mb-1">Database Connection</h6>
                            <span class="text-success">✅ Connected successfully</span><br>
                            <small class="text-muted">MySQL ${discovered.server_version}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-file-code ${discovered.env_file_found ? 'text-info' : 'text-warning'} fs-4 me-3"></i>
                        <div>
                            <h6 class="mb-1">MedPro .env File</h6>
                            <span class="${discovered.env_file_found ? 'text-info' : 'text-warning'}">
                                ${discovered.env_file_found ? '📁 .env file found' : '⚠️ No .env file found'}
                            </span><br>
                            <small class="text-muted">
                                ${discovered.env_file_found ? 
                                    `Path: ${discovered.env_file_path}` : 
                                    'Using default settings'}
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // .env File Details (if found)
        if (discovered.env_file_found) {
            resultsHtml += `
                <div class="alert alert-info mb-4">
                    <div class="row">
                        <div class="col-md-6">
                            <strong><i class="fas fa-file-code me-2"></i>MedPro Environment File:</strong><br>
                            <code>${discovered.env_file_path}</code>
                        </div>
                        <div class="col-md-6">
                            <strong><i class="fas fa-list me-2"></i>Variables Found:</strong><br>
                            <span class="badge bg-success">${discovered.env_variables_found.length} variables</span>
                            ${discovered.env_variables_found.slice(0, 5).map(v => `<span class="badge bg-light text-dark me-1">${v}</span>`).join('')}
                            ${discovered.env_variables_found.length > 5 ? '<span class="badge bg-secondary">+' + (discovered.env_variables_found.length - 5) + ' more</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Database Configuration Section
        resultsHtml += `
            <div class="border rounded p-3 mb-4" style="background-color: #f8f9fa;">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-database me-2"></i>Database Configuration
                </h6>
                <div class="row">
                    <div class="col-md-6">
                        <table class="table table-sm table-borderless mb-0">
                            <tr>
                                <td class="fw-bold" style="width: 40%;">Host:</td>
                                <td><span class="badge bg-light text-dark">${suggestions.db_host}</span></td>
                            </tr>
                            <tr>
                                <td class="fw-bold">Port:</td>
                                <td><span class="badge bg-light text-dark">${suggestions.db_port}</span></td>
                            </tr>
                            <tr>
                                <td class="fw-bold">Database:</td>
                                <td><span class="badge bg-primary">${suggestions.db_name || 'Not specified'}</span></td>
                            </tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <table class="table table-sm table-borderless mb-0">
                            <tr>
                                <td class="fw-bold" style="width: 40%;">User:</td>
                                <td><span class="badge bg-info">${suggestions.db_user}</span></td>
                            </tr>
                            <tr>
                                <td class="fw-bold">Password:</td>
                                <td><span class="badge bg-${suggestions.db_password ? 'success' : 'warning'}">${suggestions.db_password ? 'Set' : 'Empty'}</span></td>
                            </tr>
                            <tr>
                                <td class="fw-bold">Type:</td>
                                <td><span class="badge bg-secondary">${suggestions.env_type}</span></td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        // Databases Found Section
        resultsHtml += `
            <div class="border rounded p-3 mb-4" style="background-color: #f8f9fa;">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-table me-2"></i>Available Databases
                </h6>
        `;
        
        if (discovered.medpro_databases.length > 0) {
            resultsHtml += `
                <div class="alert alert-info mb-3">
                    <strong><i class="fas fa-star me-1"></i>MedPro Databases:</strong>
                    ${discovered.medpro_databases.map(db => `<span class="badge bg-info me-1">${db}</span>`).join('')}
                </div>
            `;
        }
        
        if (discovered.available_databases.length > 0) {
            resultsHtml += `
                <div>
                    <strong>All Databases (${discovered.available_databases.length}):</strong><br>
                    <div class="mt-2">
                        ${discovered.available_databases.map(db => `<span class="badge bg-light text-dark me-1 mb-1">${db}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        
        resultsHtml += `</div>`;
        
        // Raw .env File Section (if .env file was found)
        if (discovered.env_file_found && discovered.env_file_raw_content) {
            resultsHtml += `
                <div class="border rounded p-3 mb-4" style="background-color: #f8f9fa;">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="text-primary mb-0">
                            <i class="fas fa-file-code me-2"></i>Raw .env File Content
                        </h6>
                        <button class="btn btn-sm btn-outline-secondary" type="button" 
                                data-bs-toggle="collapse" data-bs-target="#rawEnvContent" 
                                aria-expanded="false" aria-controls="rawEnvContent">
                            <i class="fas fa-eye me-1"></i>Show/Hide Raw Content
                        </button>
                    </div>
                    <div class="collapse" id="rawEnvContent">
                        <div class="alert alert-info mb-2">
                            <small><i class="fas fa-info-circle me-1"></i>
                            Complete raw content from: <code>${discovered.env_file_path}</code></small>
                        </div>
                        <pre class="bg-dark text-light p-3 rounded" style="max-height: 400px; overflow-y: auto; font-size: 0.85rem;"><code>${discovered.env_file_raw_content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                    </div>
                </div>
            `;
        }
        
        // All Environment Variables Section (if .env file was found)
        if (discovered.env_file_found && discovered.env_variables_categorized) {
            resultsHtml += this.renderEnvironmentVariables(discovered.env_variables_categorized, discovered.sensitive_variables);
        }

        // Environment Suggestion Section
        resultsHtml += `
            <div class="border rounded p-3" style="background-color: #e7f3ff;">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-lightbulb me-2"></i>Suggested Environment Configuration
                </h6>
                <div class="row">
                    <div class="col-md-4">
                        <strong>Name:</strong><br>
                        <span class="text-primary">${suggestions.env_name}</span>
                    </div>
                    <div class="col-md-4">
                        <strong>Display Name:</strong><br>
                        <span class="text-primary">${suggestions.display_name}</span>
                    </div>
                    <div class="col-md-4">
                        <strong>Type:</strong><br>
                        <span class="badge bg-${suggestions.color_theme || 'primary'}">${suggestions.env_type}</span>
                    </div>
                </div>
            </div>
        `;
        
        resultsHtml += `
                </div>
            </div>
        `;
        
        resultsContainer.innerHTML = resultsHtml;
        resultsContainer.classList.remove('d-none');
        
        // Show the form section and buttons
        document.getElementById('environment-form-section').classList.remove('d-none');
        document.getElementById('test-connection-btn').classList.remove('d-none');
        document.getElementById('save-environment-btn').classList.remove('d-none');
    }
    
    /**
     * Render all environment variables in categorized sections
     */
    renderEnvironmentVariables(categorizedVars, sensitiveVars = {}) {
        const categoryInfo = {
            database: { icon: 'fas fa-database', title: 'Database Configuration', color: 'primary' },
            payment: { icon: 'fas fa-credit-card', title: 'Payment Services', color: 'success' },
            ai_services: { icon: 'fas fa-robot', title: 'AI Services', color: 'info' },
            email: { icon: 'fas fa-envelope', title: 'Email Services', color: 'warning' },
            sms_services: { icon: 'fas fa-sms', title: 'SMS & Communication', color: 'purple' },
            cloud_services: { icon: 'fas fa-cloud', title: 'Cloud Services', color: 'cyan' },
            authentication: { icon: 'fas fa-shield-alt', title: 'Authentication & Security', color: 'danger' },
            api_keys: { icon: 'fas fa-key', title: 'API Keys', color: 'secondary' },
            application: { icon: 'fas fa-cog', title: 'Application Settings', color: 'dark' },
            other: { icon: 'fas fa-ellipsis-h', title: 'Other Variables', color: 'light' }
        };
        
        let envVarsHtml = `
            <div class="border rounded p-3 mb-4" style="background-color: #f8f9fa;">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-file-code me-2"></i>Complete .env Configuration
                </h6>
        `;
        
        // Create accordion for different categories
        envVarsHtml += `<div class="accordion" id="envVariablesAccordion">`;
        
        Object.entries(categorizedVars).forEach(([category, variables], index) => {
            const varCount = Object.keys(variables).length;
            if (varCount === 0) return; // Skip empty categories
            
            const categoryDetails = categoryInfo[category];
            const isExpanded = category === 'database' || category === 'application'; // Expand these by default
            
            envVarsHtml += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="heading${category}">
                        <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" 
                                data-bs-toggle="collapse" data-bs-target="#collapse${category}" 
                                aria-expanded="${isExpanded}" aria-controls="collapse${category}">
                            <i class="${categoryDetails.icon} me-2 text-${categoryDetails.color}"></i>
                            <strong>${categoryDetails.title}</strong>
                            <span class="badge bg-${categoryDetails.color} ms-2">${varCount}</span>
                        </button>
                    </h2>
                    <div id="collapse${category}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" 
                         aria-labelledby="heading${category}" data-bs-parent="#envVariablesAccordion">
                        <div class="accordion-body">
            `;
            
            // Display variables in a table format
            envVarsHtml += `
                <div class="table-responsive">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th style="width: 30%;">Variable</th>
                                <th style="width: 70%;">Value</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            Object.entries(variables).forEach(([key, value]) => {
                const isSecret = this.isSecretVariable(key);
                const actualValue = sensitiveVars[key] || value;
                const displayValue = isSecret ? this.maskSecretValue(actualValue) : actualValue;
                const valueClass = isSecret ? 'text-muted font-monospace' : 'font-monospace';
                
                envVarsHtml += `
                    <tr>
                        <td><strong>${key}</strong></td>
                        <td class="${valueClass}">
                            ${isSecret ? 
                                `<span class="badge bg-warning me-2">SECRET</span>
                                 <span id="value-${key.replace(/[^a-zA-Z0-9]/g, '_')}" class="env-value">${displayValue}</span>
                                 <button type="button" class="btn btn-sm btn-outline-secondary ms-2 eye-toggle" 
                                         data-key="${key.replace(/[^a-zA-Z0-9]/g, '_')}" 
                                         data-actual-value="${this.escapeHtml(actualValue)}"
                                         title="Show/Hide actual value">
                                     <i class="fas fa-eye"></i>
                                 </button>` : 
                                displayValue || '<em class="text-muted">empty</em>'
                            }
                        </td>
                    </tr>
                `;
            });
            
            envVarsHtml += `
                        </tbody>
                    </table>
                </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        envVarsHtml += `</div></div>`;
        
        // Add event listeners for eye toggle buttons after DOM insertion
        setTimeout(() => {
            this.setupEyeToggleListeners();
        }, 100);
        
        return envVarsHtml;
    }
    
    /**
     * Check if a variable should be treated as secret
     */
    isSecretVariable(key) {
        const secretKeywords = ['password', 'secret', 'key', 'token', 'private', 'api_key', 'stripe', 'openai'];
        const lowerKey = key.toLowerCase();
        return secretKeywords.some(keyword => lowerKey.includes(keyword));
    }
    
    /**
     * Mask secret values for display
     */
    maskSecretValue(value) {
        if (!value || value.length < 4) return '****';
        return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
    }
    
    /**
     * Escape HTML characters for safe display
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Setup eye toggle button listeners
     */
    setupEyeToggleListeners() {
        document.querySelectorAll('.eye-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const key = e.currentTarget.dataset.key;
                const actualValue = e.currentTarget.dataset.actualValue;
                const valueSpan = document.getElementById(`value-${key}`);
                const icon = e.currentTarget.querySelector('i');
                
                if (icon.classList.contains('fa-eye')) {
                    // Show actual value
                    valueSpan.textContent = actualValue;
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                    valueSpan.classList.add('text-danger');
                } else {
                    // Hide actual value
                    valueSpan.textContent = this.maskSecretValue(actualValue);
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                    valueSpan.classList.remove('text-danger');
                }
            });
        });
    }
    
}

// Global function to show create modal
window.showCreateEnvironmentModal = function() {
    if (window.environmentEditor) {
        window.environmentEditor.showCreateModal();
    }
};

// Export class for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentEditor;
}