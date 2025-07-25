/**
 * Connection Test Component
 * Handles testing database connections for environments
 */

class ConnectionTest {
    constructor() {
        this.modal = null;
        this.contentContainer = null;
        this.currentTest = null;
        
        this.init();
    }
    
    init() {
        const modalElement = document.getElementById('connectionTestModal');
        if (modalElement) {
            this.modal = new bootstrap.Modal(modalElement);
            this.contentContainer = document.getElementById('connection-test-content');
        }
    }
    
    /**
     * Test connection for a specific environment
     */
    async testEnvironment(environmentId) {
        try {
            // Get environment details
            const environment = window.environmentContext?.getEnvironmentById(environmentId);
            if (!environment) {
                throw new Error('Environment not found');
            }
            
            this.currentTest = {
                environmentId,
                environment,
                startTime: Date.now()
            };
            
            this.showTestingModal();
            
            // Perform the connection test
            const result = await environmentApi.testConnection(environmentId);
            
            this.showResult(result);
            
        } catch (error) {
            console.error('Connection test error:', error);
            this.showResult({
                success: false,
                message: error.message || 'Connection test failed',
                details: null
            });
        }
    }
    
    /**
     * Show testing modal with loading state
     */
    showTestingModal() {
        if (!this.modal || !this.contentContainer) return;
        
        const env = this.currentTest.environment;
        
        this.contentContainer.innerHTML = `
            <div class="text-center">
                <div class="mb-3">
                    <div class="environment-icon ${env.color_theme || 'blue'} mx-auto" style="width: 60px; height: 60px; font-size: 1.5rem;">
                        <i class="fas fa-${env.icon || 'server'}"></i>
                    </div>
                </div>
                
                <h5 class="mb-3">Testing Connection</h5>
                <p class="text-muted mb-4">
                    Testing connection to <strong>${this.escapeHtml(env.display_name)}</strong>
                </p>
                
                <div class="connection-test-progress">
                    <div class="d-flex align-items-center justify-content-center mb-3">
                        <div class="spinner-border text-primary me-3" role="status">
                            <span class="visually-hidden">Testing...</span>
                        </div>
                        <span class="test-status">Testing all services...</span>
                    </div>
                    
                    <div class="progress mb-3">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" style="width: 100%"></div>
                    </div>
                </div>
                
                <div class="connection-details">
                    <small class="text-muted">
                        <i class="fas fa-database"></i> 
                        ${this.escapeHtml(env.db_host)}:${env.db_port}/${this.escapeHtml(env.db_name)}
                    </small>
                </div>
            </div>
        `;
        
        this.modal.show();
        
        // Simulate progress updates
        this.simulateProgress();
    }
    
    /**
     * Simulate connection test progress
     */
    simulateProgress() {
        const statusElement = this.contentContainer.querySelector('.test-status');
        if (!statusElement) return;
        
        const steps = [
            'Connecting to MedPro server...',
            'Testing database connection...',
            'Testing OpenAI API...',
            'Testing Twilio service...',
            'Testing SendGrid API...',
            'Testing Stripe API...',
            'Testing Azure Storage...',
            'Compiling results...'
        ];
        
        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep < steps.length && statusElement) {
                statusElement.textContent = steps[currentStep];
                currentStep++;
            } else {
                clearInterval(interval);
            }
        }, 800);
        
        // Clear interval after 10 seconds as fallback
        setTimeout(() => clearInterval(interval), 10000);
    }
    
    /**
     * Show service test result
     */
    showResult(result) {
        if (!this.contentContainer) {
            // Fallback to toast if modal is not available
            const message = result.success ? 'Service tests completed!' : result.message;
            const type = result.success ? 'success' : 'error';
            showToast(message, type);
            return;
        }
        
        const env = this.currentTest?.environment;
        const duration = this.currentTest ? Date.now() - this.currentTest.startTime : 0;
        
        // Handle comprehensive service test results
        if (result.summary && result.test_results) {
            this.showComprehensiveResults(result, env, duration);
        } else {
            // Fallback for simple results
            this.showSimpleResults(result, env, duration);
        }
    }

    /**
     * Show comprehensive service test results
     */
    showComprehensiveResults(result, env, duration) {
        const summary = result.summary;
        const overallSuccess = summary.failed === 0;
        const successIcon = overallSuccess ? 'fa-check-circle text-success' : 'fa-exclamation-circle text-warning';
        const statusClass = overallSuccess ? 'text-success' : (summary.successful > 0 ? 'text-warning' : 'text-danger');
        
        let statusText = 'All Services OK';
        if (summary.failed > 0) {
            statusText = summary.successful > 0 ? 'Partial Service Failures' : 'All Services Failed';
        }
        
        this.contentContainer.innerHTML = `
            <div class="text-center">
                <div class="mb-3">
                    <i class="fas ${successIcon}" style="font-size: 3rem;"></i>
                </div>
                
                <h5 class="${statusClass} mb-3">${statusText}</h5>
                
                ${env ? `
                    <p class="text-muted mb-4">
                        Service tests for <strong>${this.escapeHtml(env.display_name)}</strong>
                    </p>
                ` : ''}
                
                <div class="service-test-summary mb-4">
                    <div class="row text-center">
                        <div class="col-4">
                            <div class="h4 text-primary">${summary.total}</div>
                            <small class="text-muted">Total Tests</small>
                        </div>
                        <div class="col-4">
                            <div class="h4 text-success">${summary.successful}</div>
                            <small class="text-muted">Successful</small>
                        </div>
                        <div class="col-4">
                            <div class="h4 text-danger">${summary.failed}</div>
                            <small class="text-muted">Failed</small>
                        </div>
                    </div>
                </div>
                
                <div class="service-test-details">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-list"></i> Service Test Results</h6>
                        </div>
                        <div class="card-body">
                            ${this.formatServiceResults(result.test_results)}
                            
                            <hr>
                            
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Server:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="font-monospace small">
                                        ${this.escapeHtml(result.server_info?.url || 'Unknown')}
                                    </span>
                                </div>
                            </div>
                            
                            <hr>
                            
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Duration:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="small">${duration}ms</span>
                                </div>
                            </div>
                            
                            <hr>
                            
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Timestamp:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="small">${new Date(result.timestamp).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${this.getOverallAlert(summary)}
                
                <div class="connection-test-actions mt-4">
                    ${summary.failed > 0 ? `
                        <button class="btn btn-outline-primary me-2" onclick="window.connectionTest.retryTest()">
                            <i class="fas fa-redo"></i> Retry Tests
                        </button>
                    ` : ''}
                    
                    ${env ? `
                        <button class="btn btn-outline-secondary me-2" onclick="editEnvironment(${env.id})">
                            <i class="fas fa-edit"></i> Edit Environment
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Show the modal to the user
        if (this.modal) {
            this.modal.show();
        }
    }

    /**
     * Show simple results for non-comprehensive tests
     */
    showSimpleResults(result, env, duration) {
        const successIcon = result.success ? 'fa-check-circle text-success' : 'fa-exclamation-circle text-danger';
        const statusClass = result.success ? 'text-success' : 'text-danger';
        const statusText = result.success ? 'Connection Successful' : 'Connection Failed';
        
        this.contentContainer.innerHTML = `
            <div class="text-center">
                <div class="mb-3">
                    <i class="fas ${successIcon}" style="font-size: 3rem;"></i>
                </div>
                
                <h5 class="${statusClass} mb-3">${statusText}</h5>
                
                ${env ? `
                    <p class="text-muted mb-4">
                        Connection test for <strong>${this.escapeHtml(env.display_name)}</strong>
                    </p>
                ` : ''}
                
                <div class="connection-result-details">
                    <div class="card">
                        <div class="card-body">
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Status:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="${statusClass}">
                                        <i class="fas ${result.success ? 'fa-check' : 'fa-times'}"></i>
                                        ${result.success ? 'Connected' : 'Failed'}
                                    </span>
                                </div>
                            </div>
                            
                            <hr>
                            
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Message:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="font-monospace small">
                                        ${this.escapeHtml(result.message)}
                                    </span>
                                </div>
                            </div>
                            
                            ${result.details ? `
                                <hr>
                                <div class="row text-start">
                                    <div class="col-sm-4">
                                        <strong>Details:</strong>
                                    </div>
                                    <div class="col-sm-8">
                                        <div class="font-monospace small">
                                            ${this.formatConnectionDetails(result.details)}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            
                            <hr>
                            
                            <div class="row text-start">
                                <div class="col-sm-4">
                                    <strong>Duration:</strong>
                                </div>
                                <div class="col-sm-8">
                                    <span class="small">${duration}ms</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${result.success ? `
                    <div class="alert alert-success mt-3" role="alert">
                        <i class="fas fa-check-circle"></i>
                        <strong>Success!</strong> Connection is working properly.
                    </div>
                ` : `
                    <div class="alert alert-danger mt-3" role="alert">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Connection Failed!</strong> Please check the configuration.
                    </div>
                `}
                
                <div class="connection-test-actions mt-4">
                    ${!result.success ? `
                        <button class="btn btn-outline-primary me-2" onclick="window.connectionTest.retryTest()">
                            <i class="fas fa-redo"></i> Retry Test
                        </button>
                    ` : ''}
                    
                    ${env ? `
                        <button class="btn btn-outline-secondary me-2" onclick="editEnvironment(${env.id})">
                            <i class="fas fa-edit"></i> Edit Environment
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Show the modal to the user
        if (this.modal) {
            this.modal.show();
        }
    }

    /**
     * Format service test results for display
     */
    formatServiceResults(testResults) {
        if (!testResults || typeof testResults !== 'object') {
            return '<div class="text-muted">No service test results available</div>';
        }

        const serviceIcons = {
            database: 'fa-database',
            openai: 'fa-brain',
            twilio: 'fa-phone',
            sendgrid: 'fa-envelope',
            stripe: 'fa-credit-card',
            azure_storage: 'fa-cloud'
        };

        const serviceLabels = {
            database: 'Database',
            openai: 'OpenAI API',
            twilio: 'Twilio SMS',
            sendgrid: 'SendGrid Email',
            stripe: 'Stripe Payments',
            azure_storage: 'Azure Storage'
        };

        return Object.entries(testResults).map(([service, result]) => {
            const icon = serviceIcons[service] || 'fa-cog';
            const label = serviceLabels[service] || service.replace('_', ' ').toUpperCase();
            const statusIcon = result.status === 'success' ? 'fa-check text-success' : 'fa-times text-danger';
            const statusClass = result.status === 'success' ? 'text-success' : 'text-danger';

            return `
                <div class="service-result mb-2">
                    <div class="d-flex align-items-center">
                        <div class="service-icon me-3" style="min-width: 20px;">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-center">
                                <strong>${label}</strong>
                                <span class="${statusClass}">
                                    <i class="fas ${statusIcon}"></i>
                                    ${result.status.toUpperCase()}
                                </span>
                            </div>
                            <div class="service-message small text-muted mt-1">
                                ${this.escapeHtml(result.message)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Get overall alert based on test summary
     */
    getOverallAlert(summary) {
        if (summary.failed === 0) {
            return `
                <div class="alert alert-success mt-3" role="alert">
                    <i class="fas fa-check-circle"></i>
                    <strong>Excellent!</strong> All ${summary.total} services are working properly.
                </div>
            `;
        } else if (summary.successful > 0) {
            return `
                <div class="alert alert-warning mt-3" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Partial Success!</strong> ${summary.successful} of ${summary.total} services are working. 
                    ${summary.failed} service(s) need attention.
                </div>
            `;
        } else {
            return `
                <div class="alert alert-danger mt-3" role="alert">
                    <i class="fas fa-times-circle"></i>
                    <strong>All Services Failed!</strong> None of the ${summary.total} services are accessible. 
                    Please check your environment configuration.
                </div>
            `;
        }
    }
    
    /**
     * Format connection details for display
     */
    formatConnectionDetails(details) {
        if (typeof details === 'string') {
            return this.escapeHtml(details);
        }
        
        if (typeof details === 'object') {
            return Object.entries(details)
                .map(([key, value]) => `<div><strong>${key}:</strong> ${this.escapeHtml(String(value))}</div>`)
                .join('');
        }
        
        return 'No additional details available';
    }
    
    /**
     * Retry the current test
     */
    async retryTest() {
        if (this.currentTest && this.currentTest.environmentId) {
            await this.testEnvironment(this.currentTest.environmentId);
        }
    }
    
    /**
     * Test connection with form data (for environment editor)
     */
    async testFormConnection(formData) {
        try {
            // Extract server host and port from form data
            const serverHost = formData.server_host || formData.host || 'localhost';
            const serverPort = formData.server_port || formData.port || 3000;

            this.currentTest = {
                environmentId: null,
                environment: { 
                    display_name: `${serverHost}:${serverPort}`,
                    color_theme: 'blue',
                    icon: 'server'
                },
                startTime: Date.now()
            };
            
            this.showTestingModal();
            
            // Call the form-based test connection API
            const result = await environmentApi.testFormConnection({
                server_host: serverHost,
                server_port: serverPort
            });
            
            this.showResult(result);
            
        } catch (error) {
            console.error('Form connection test error:', error);
            this.showResult({
                success: false,
                message: error.message || 'Service test failed',
                details: null
            });
        }
        
        if (this.modal) {
            this.modal.show();
        }
    }
    
    /**
     * Hide the connection test modal
     */
    hide() {
        if (this.modal) {
            this.modal.hide();
        }
    }
    
    /**
     * Check if modal is currently visible
     */
    isVisible() {
        return this.modal && this.modal._isShown;
    }
    
    /**
     * Get the result of the last test
     */
    getLastResult() {
        return this.currentTest;
    }
    
    /**
     * Utility function to escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global function for testing environment connection
window.testEnvironmentConnection = async function(environmentId) {
    if (window.connectionTest) {
        await window.connectionTest.testEnvironment(environmentId);
    } else {
        // Fallback to basic test
        try {
            const result = await environmentApi.testConnection(environmentId);
            const message = result.success ? 'Connection successful!' : result.message;
            const type = result.success ? 'success' : 'error';
            showToast(message, type);
        } catch (error) {
            showToast(error.message || 'Connection test failed', 'error');
        }
    }
};

// Initialize connection test when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.connectionTest = new ConnectionTest();
});

// Export class for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionTest;
}