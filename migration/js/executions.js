/**
 * Migration Executions App
 * Main application logic for migration executions monitoring
 */

let executions = [];
let currentExecutionId = null;
let refreshInterval = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication
        const auth = await checkAdminAuth();
        if (!auth) return;
        
        // Set admin email in header
        document.getElementById('admin-email').textContent = auth.email;
        
        // Load executions
        await loadExecutions();
        
        // Set up auto-refresh for running executions
        startAutoRefresh();
        
    } catch (error) {
        console.error('Failed to initialize migration executions app:', error);
        showError('Failed to initialize application');
    }
});

// Load migration executions
async function loadExecutions(filters = {}) {
    try {
        showLoading();
        
        const response = await migrationAPI.getExecutions(filters);
        if (response.success) {
            executions = response.data;
            displayExecutions();
        } else {
            throw new Error(response.error || 'Failed to load executions');
        }
    } catch (error) {
        console.error('Error loading executions:', error);
        showError('Failed to load migration executions: ' + error.message);
    }
}

// Display executions in table
function displayExecutions() {
    hideLoading();
    
    const tbody = document.getElementById('executions-tbody');
    tbody.innerHTML = '';
    
    if (executions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p>No migration executions found</p>
                    <button class="btn btn-primary btn-sm" onclick="window.location.href='/medproadmin/migration/jobs.html'">
                        <i class="fas fa-play"></i> Execute a Job
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    executions.forEach(execution => {
        const startedDate = new Date(execution.started_at);
        const completedDate = execution.completed_at ? new Date(execution.completed_at) : null;
        
        // Calculate duration
        let duration = '';
        if (completedDate) {
            const diffMs = completedDate - startedDate;
            duration = formatDuration(diffMs);
        } else if (execution.status === 'running') {
            const diffMs = new Date() - startedDate;
            duration = formatDuration(diffMs) + ' (running)';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${execution.job_name}</strong>
            </td>
            <td>
                <span class="source-badge">${execution.source_name}</span>
            </td>
            <td>
                <span class="environment-badge ${execution.environment_id}">${execution.environment_id}</span>
            </td>
            <td>
                <span class="status-badge status-${execution.status}">
                    ${getStatusIcon(execution.status)} ${execution.status.toUpperCase()}
                </span>
            </td>
            <td>
                <div class="progress-container">
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar ${getProgressBarClass(execution.status)}" 
                             role="progressbar" 
                             style="width: ${execution.progress || 0}%"
                             aria-valuenow="${execution.progress || 0}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                            ${execution.progress || 0}%
                        </div>
                    </div>
                </div>
            </td>
            <td>
                <small>${startedDate.toLocaleString()}</small>
            </td>
            <td>
                <small>${duration}</small>
            </td>
            <td>
                <small>${execution.executed_by}</small>
            </td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm view-details-btn" data-execution-id="${execution.id}">
                        <i class="fas fa-eye"></i> Details
                    </button>
                    <button class="btn btn-outline-secondary btn-sm view-logs-btn" data-execution-id="${execution.id}">
                        <i class="fas fa-file-alt"></i> Logs
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('executions-content').style.display = 'block';
}

// Helper functions
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'running':
            return '<i class="fas fa-spinner fa-spin"></i>';
        case 'completed':
            return '<i class="fas fa-check-circle"></i>';
        case 'failed':
            return '<i class="fas fa-times-circle"></i>';
        default:
            return '<i class="fas fa-question-circle"></i>';
    }
}

function getProgressBarClass(status) {
    switch (status) {
        case 'running':
            return 'progress-bar-animated progress-bar-striped bg-primary';
        case 'completed':
            return 'bg-success';
        case 'failed':
            return 'bg-danger';
        default:
            return 'bg-secondary';
    }
}

// Show loading state
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('executions-content').style.display = 'none';
    document.getElementById('error').style.display = 'none';
}

// Hide loading state
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// Show error
function showError(message) {
    hideLoading();
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Show success toast
function showToast(message, type = 'success') {
    adminUtils.showToast(message, type);
}

// Auto-refresh functionality
function startAutoRefresh() {
    // Check for running executions every 5 seconds
    refreshInterval = setInterval(() => {
        const hasRunning = executions.some(e => e.status === 'running');
        if (hasRunning) {
            loadExecutions(getCurrentFilters());
        }
    }, 5000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Get current filter values
function getCurrentFilters() {
    const filters = {};
    const status = document.getElementById('status-filter').value;
    const environment = document.getElementById('environment-filter').value;
    
    if (status) filters.status = status;
    if (environment) filters.environment_id = environment;
    
    return filters;
}

// Modal functions
function showExecutionDetailsModal(executionId) {
    currentExecutionId = executionId;
    loadExecutionDetails(executionId);
    document.getElementById('execution-details-modal').style.display = 'block';
}

function closeExecutionDetailsModal() {
    document.getElementById('execution-details-modal').style.display = 'none';
    currentExecutionId = null;
}

function showLogsModal(executionId) {
    currentExecutionId = executionId;
    loadExecutionLogs(executionId);
    document.getElementById('logs-modal').style.display = 'block';
}

function closeLogsModal() {
    document.getElementById('logs-modal').style.display = 'none';
    currentExecutionId = null;
}

// Load execution details
async function loadExecutionDetails(executionId) {
    try {
        const response = await migrationAPI.getExecution(executionId);
        if (response.success) {
            displayExecutionDetails(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading execution details:', error);
        showToast('Failed to load execution details: ' + error.message, 'error');
    }
}

// Display execution details
function displayExecutionDetails(execution) {
    const container = document.getElementById('execution-details-content');
    
    const startedDate = new Date(execution.started_at);
    const completedDate = execution.completed_at ? new Date(execution.completed_at) : null;
    const duration = completedDate ? formatDuration(completedDate - startedDate) : 'Still running';
    
    container.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h5>Job Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Job Name:</strong></td><td>${execution.job_name}</td></tr>
                    <tr><td><strong>Source:</strong></td><td>${execution.source_display_name}</td></tr>
                    <tr><td><strong>Script Path:</strong></td><td><code>${execution.script_path}</code></td></tr>
                    <tr><td><strong>Environment:</strong></td><td><span class="environment-badge ${execution.environment_id}">${execution.environment_id}</span></td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h5>Execution Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Status:</strong></td><td><span class="status-badge status-${execution.status}">${execution.status.toUpperCase()}</span></td></tr>
                    <tr><td><strong>Progress:</strong></td><td>${execution.progress || 0}%</td></tr>
                    <tr><td><strong>Started:</strong></td><td>${startedDate.toLocaleString()}</td></tr>
                    <tr><td><strong>Duration:</strong></td><td>${duration}</td></tr>
                    <tr><td><strong>Executed By:</strong></td><td>${execution.executed_by}</td></tr>
                </table>
            </div>
        </div>
        
        <div class="mt-3">
            <h5>Command Executed</h5>
            <div class="bg-dark text-light p-3 rounded">
                <code>${execution.command_executed}</code>
            </div>
        </div>
        
        <div class="mt-3">
            <h5>Job Parameters</h5>
            <pre class="bg-light p-3 rounded">${JSON.stringify(execution.job_parameters, null, 2)}</pre>
        </div>
        
        ${execution.result_summary ? `
            <div class="mt-3">
                <h5>Result Summary</h5>
                <pre class="bg-light p-3 rounded">${JSON.stringify(execution.result_summary, null, 2)}</pre>
            </div>
        ` : ''}
    `;
}

// Load execution logs
async function loadExecutionLogs(executionId) {
    try {
        const container = document.getElementById('logs-container');
        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';
        
        const response = await migrationAPI.getExecutionLogs(executionId);
        if (response.success) {
            displayExecutionLogs(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading execution logs:', error);
        document.getElementById('logs-container').innerHTML = 
            `<div class="text-danger">Failed to load logs: ${error.message}</div>`;
    }
}

// Display execution logs
function displayExecutionLogs(logs) {
    const container = document.getElementById('logs-container');
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="text-muted">No logs available for this execution.</div>';
        return;
    }
    
    container.innerHTML = logs.map(log => {
        const logTime = new Date(log.logged_at).toLocaleTimeString();
        const logLevelClass = getLogLevelClass(log.log_level);
        
        return `
            <div class="log-entry ${logLevelClass}">
                <span class="log-time">${logTime}</span>
                <span class="log-level">[${log.log_level.toUpperCase()}]</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function getLogLevelClass(level) {
    switch (level?.toLowerCase()) {
        case 'error':
            return 'log-error';
        case 'warn':
        case 'warning':
            return 'log-warning';
        case 'info':
            return 'log-info';
        case 'debug':
            return 'log-debug';
        default:
            return 'log-info';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadExecutions(getCurrentFilters()));
    }
    
    // Filter buttons
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => loadExecutions(getCurrentFilters()));
    }
    
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            document.getElementById('status-filter').value = '';
            document.getElementById('environment-filter').value = '';
            loadExecutions();
        });
    }
    
    // Modal close buttons
    const closeDetailsModalBtn = document.getElementById('close-details-modal-btn');
    if (closeDetailsModalBtn) {
        closeDetailsModalBtn.addEventListener('click', closeExecutionDetailsModal);
    }
    
    const closeLogsModalBtn = document.getElementById('close-logs-modal-btn');
    if (closeLogsModalBtn) {
        closeLogsModalBtn.addEventListener('click', closeLogsModal);
    }
    
    // Refresh logs button
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', () => {
            if (currentExecutionId) {
                loadExecutionLogs(currentExecutionId);
            }
        });
    }
    
    // Table action buttons (delegated)
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.view-details-btn, .view-logs-btn');
        if (target) {
            const executionId = parseInt(target.dataset.executionId);
            if (target.classList.contains('view-details-btn')) {
                showExecutionDetailsModal(executionId);
            } else if (target.classList.contains('view-logs-btn')) {
                showLogsModal(executionId);
            }
        }
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});