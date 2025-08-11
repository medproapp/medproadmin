/**
 * Migration Executions App
 * Main application logic for migration executions monitoring
 */

let executions = [];
let currentExecutionId = null;
let refreshInterval = null;

// Pagination state
let currentPage = 1;
let totalPages = 1;
let totalExecutions = 0;
let pageLimit = 20;

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
        
        // Add pagination parameters to filters
        const requestFilters = {
            ...filters,
            page: currentPage,
            limit: pageLimit
        };
        
        const response = await migrationAPI.getExecutions(requestFilters);
        if (response.success) {
            executions = response.data;
            
            // Update pagination state
            if (response.pagination) {
                currentPage = response.pagination.page;
                totalPages = response.pagination.totalPages;
                totalExecutions = response.pagination.total;
            }
            
            displayExecutions();
            updatePaginationControls();
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
        // Hide pagination when no results
        const paginationSection = document.getElementById('pagination-section');
        if (paginationSection) {
            paginationSection.style.display = 'none';
        }
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
        row.dataset.startedAt = execution.started_at;
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
                    ${execution.status === 'running' ? `
                    <button class="btn btn-warning btn-sm follow-execution-btn" data-execution-id="${execution.id}">
                        <i class="fas fa-eye"></i> Follow
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('executions-content').style.display = 'block';
    
    // Show pagination section when there are results
    const paginationSection = document.getElementById('pagination-section');
    if (paginationSection) {
        paginationSection.style.display = 'block';
    }
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

function calculateSuccessRate(migrated, imported) {
    if (!imported || imported === 0) return 0;
    return Math.round((migrated / imported) * 100);
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

// Update pagination controls
function updatePaginationControls() {
    const paginationContainer = document.getElementById('pagination-container');
    const paginationInfo = document.getElementById('pagination-info');
    
    if (!paginationContainer) return;
    
    // Update pagination info
    if (paginationInfo) {
        const start = totalExecutions > 0 ? ((currentPage - 1) * pageLimit) + 1 : 0;
        const end = Math.min(currentPage * pageLimit, totalExecutions);
        paginationInfo.textContent = `Showing ${start}-${end} of ${totalExecutions} executions`;
    }
    
    // Clear existing pagination
    paginationContainer.innerHTML = '';
    
    // Don't show pagination if only one page or no results
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // Create pagination wrapper
    const pagination = document.createElement('nav');
    pagination.innerHTML = '<ul class="pagination pagination-sm"></ul>';
    const paginationList = pagination.querySelector('.pagination');
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `
        <a class="page-link" href="#" data-page="${currentPage - 1}">
            <i class="fas fa-chevron-left"></i>
        </a>
    `;
    paginationList.appendChild(prevLi);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    // First page if not in range
    if (startPage > 1) {
        const firstLi = document.createElement('li');
        firstLi.className = 'page-item';
        firstLi.innerHTML = '<a class="page-link" href="#" data-page="1">1</a>';
        paginationList.appendChild(firstLi);
        
        if (startPage > 2) {
            const dotsLi = document.createElement('li');
            dotsLi.className = 'page-item disabled';
            dotsLi.innerHTML = '<span class="page-link">...</span>';
            paginationList.appendChild(dotsLi);
        }
    }
    
    // Page range
    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
        paginationList.appendChild(li);
    }
    
    // Last page if not in range
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dotsLi = document.createElement('li');
            dotsLi.className = 'page-item disabled';
            dotsLi.innerHTML = '<span class="page-link">...</span>';
            paginationList.appendChild(dotsLi);
        }
        
        const lastLi = document.createElement('li');
        lastLi.className = 'page-item';
        lastLi.innerHTML = `<a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a>`;
        paginationList.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `
        <a class="page-link" href="#" data-page="${currentPage + 1}">
            <i class="fas fa-chevron-right"></i>
        </a>
    `;
    paginationList.appendChild(nextLi);
    
    // Add pagination to container
    paginationContainer.appendChild(pagination);
    
    // Bind pagination events
    paginationContainer.addEventListener('click', handlePaginationClick);
}

// Handle pagination clicks
function handlePaginationClick(e) {
    e.preventDefault();
    
    if (e.target.closest('.page-link') && !e.target.closest('.disabled')) {
        const page = parseInt(e.target.closest('.page-link').dataset.page);
        if (page && page !== currentPage && page >= 1 && page <= totalPages) {
            currentPage = page;
            loadExecutions(getCurrentFilters());
        }
    }
}

// Reset pagination when applying new filters
function resetPagination() {
    currentPage = 1;
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

// Extract patient information from logs
async function extractPatientInfoFromLogs(executionId) {
    try {
        // Get logs for this execution
        const response = await migrationAPI.getExecutionLogs(executionId, 1000);
        if (!response.success || !response.data) {
            return [];
        }
        
        const logs = response.data;
        const patients = [];
        const patientMap = {};
        
        // Join all log messages to search
        const fullLog = logs.map(l => l.message).join('\n');
        
        // Pattern 1: "paciente NOME (SourceID: ID) (CPF XXXXX)"
        const pattern1 = /paciente\s+([A-Z\s]+)\s+\(SourceID:\s*(\d+)\)\s+\(CPF\s*(\d+)/gi;
        let match;
        while ((match = pattern1.exec(fullLog)) !== null) {
            const [_, name, id, cpf] = match;
            if (!patientMap[id]) {
                patientMap[id] = {
                    id: id,
                    name: name.trim(),
                    cpf: formatCPF(cpf),
                    encounters: null
                };
            }
        }
        
        // Pattern 2: "Paciente com patient_id = XXX"
        const pattern2 = /Paciente com patient_id = (\d+)/gi;
        while ((match = pattern2.exec(fullLog)) !== null) {
            const id = match[1];
            if (!patientMap[id]) {
                patientMap[id] = {
                    id: id,
                    name: null,
                    cpf: null,
                    encounters: null
                };
            }
        }
        
        // Pattern 3: "👤 Paciente XXXXX: YYY consultas"
        const pattern3 = /👤 Paciente (\d+):\s*(\d+)\s*consultas/gi;
        while ((match = pattern3.exec(fullLog)) !== null) {
            const [_, id, encounters] = match;
            if (!patientMap[id]) {
                patientMap[id] = {
                    id: id,
                    name: null,
                    cpf: null,
                    encounters: encounters
                };
            } else {
                patientMap[id].encounters = encounters;
            }
        }
        
        // Convert map to array
        for (const id in patientMap) {
            patients.push(patientMap[id]);
        }
        
        return patients;
    } catch (error) {
        console.error('Error extracting patient info:', error);
        return [];
    }
}

// Format CPF for display
function formatCPF(cpf) {
    if (!cpf) return '';
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return cpf;
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Load execution details
async function loadExecutionDetails(executionId) {
    try {
        const response = await migrationAPI.getExecution(executionId);
        if (response.success) {
            await displayExecutionDetails(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading execution details:', error);
        showToast('Failed to load execution details: ' + error.message, 'error');
    }
}

// Display execution details
async function displayExecutionDetails(execution) {
    const container = document.getElementById('execution-details-content');
    
    const startedDate = new Date(execution.started_at);
    const completedDate = execution.completed_at ? new Date(execution.completed_at) : null;
    const duration = completedDate ? formatDuration(completedDate - startedDate) : 'Still running';
    
    // Parse result_summary if it's a string
    let results = execution.result_summary;
    if (typeof results === 'string') {
        try {
            results = JSON.parse(results);
        } catch (e) {
            results = {};
        }
    }
    results = results || {};
    
    // Extract patient info from logs
    let patientInfo = await extractPatientInfoFromLogs(execution.id);
    
    // Build status section
    const statusClass = results.success ? 'alert-success' : execution.status === 'failed' ? 'alert-danger' : 'alert-info';
    const statusIcon = results.success ? '✅' : execution.status === 'failed' ? '❌' : '🔄';
    const statusText = results.success ? 'Migration Completed Successfully' : 
                       execution.status === 'failed' ? 'Migration Failed' : 'Migration Running';
    
    let detailsHTML = `
        <div class="alert ${statusClass}">
            <h5>${statusIcon} ${statusText}</h5>
            <p class="mb-0">Duration: ${duration}</p>
            ${results.error_category ? `<p class="mb-0">Error Type: ${results.error_category}</p>` : ''}
        </div>
    `;
    
    // Add metrics if available
    if (results.details && Object.keys(results.details).length > 0) {
        detailsHTML += `
            <div class="metrics-section mb-4">
                <h5>📊 Migration Metrics</h5>
                <div class="row">
                    <div class="col-md-3 mb-3">
                        <div class="metric-card text-center p-3 border rounded">
                            <i class="fas fa-users fa-2x text-primary mb-2"></i>
                            <div class="metric-value h3">${results.details.total_patients || 0}</div>
                            <div class="metric-label text-muted">Patients</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="metric-card text-center p-3 border rounded">
                            <i class="fas fa-calendar-check fa-2x text-success mb-2"></i>
                            <div class="metric-value h3">${results.details.total_encounters || 0}</div>
                            <div class="metric-label text-muted">Encounters</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="metric-card text-center p-3 border rounded">
                            <i class="fas fa-pills fa-2x text-warning mb-2"></i>
                            <div class="metric-value h3">${results.details.total_medications || 0}</div>
                            <div class="metric-label text-muted">Medications</div>
                        </div>
                    </div>
                    <div class="col-md-3 mb-3">
                        <div class="metric-card text-center p-3 border rounded">
                            <i class="fas fa-paperclip fa-2x text-info mb-2"></i>
                            <div class="metric-value h3">${results.details.total_attachments || 0}</div>
                            <div class="metric-label text-muted">Attachments</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add success rates if available
        if (results.details.success_rate_patients || results.details.success_rate_encounters) {
            detailsHTML += `
                <div class="success-rates mb-4">
                    <h5>✅ Success Rates</h5>
                    <div class="row">
                        ${results.details.success_rate_patients ? `
                            <div class="col-md-6">
                                <div class="progress" style="height: 25px;">
                                    <div class="progress-bar bg-success" style="width: ${results.details.success_rate_patients}%">
                                        Patients: ${results.details.success_rate_patients}%
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        ${results.details.success_rate_encounters ? `
                            <div class="col-md-6">
                                <div class="progress" style="height: 25px;">
                                    <div class="progress-bar bg-info" style="width: ${results.details.success_rate_encounters}%">
                                        Encounters: ${results.details.success_rate_encounters}%
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }
    
    // Add import vs migration comparison if available
    if (results.metrics && results.metrics.imported && results.metrics.migrated) {
        const imported = results.metrics.imported;
        const migrated = results.metrics.migrated;
        
        detailsHTML += `
            <div class="comparison-section mb-4">
                <h5>📥 Import → Migration Results</h5>
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Imported</th>
                            <th>Migrated</th>
                            <th>Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${imported.patients ? `
                            <tr>
                                <td>Patients</td>
                                <td>${imported.patients || 0}</td>
                                <td>${migrated.patients || 0}</td>
                                <td>${calculateSuccessRate(migrated.patients, imported.patients)}%</td>
                            </tr>
                        ` : ''}
                        ${imported.encounters ? `
                            <tr>
                                <td>Encounters</td>
                                <td>${imported.encounters || 0}</td>
                                <td>${migrated.encounters || 0}</td>
                                <td>${calculateSuccessRate(migrated.encounters, imported.encounters)}%</td>
                            </tr>
                        ` : ''}
                        ${imported.prescriptions ? `
                            <tr>
                                <td>Prescriptions</td>
                                <td>${imported.prescriptions || 0}</td>
                                <td>${migrated.medications || 0}</td>
                                <td>${calculateSuccessRate(migrated.medications, imported.prescriptions)}%</td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Add warnings if any
    if (results.validation && results.validation.warnings && results.validation.warnings.length > 0) {
        detailsHTML += `
            <div class="warnings-section mb-4">
                <h5>⚠️ Warnings</h5>
                <ul class="list-group">
                    ${results.validation.warnings.map(w => `
                        <li class="list-group-item list-group-item-warning">${w}</li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    // Add errors if any
    if (results.validation && results.validation.errors && results.validation.errors.length > 0) {
        detailsHTML += `
            <div class="errors-section mb-4">
                <h5>❌ Errors</h5>
                <ul class="list-group">
                    ${results.validation.errors.map(e => `
                        <li class="list-group-item list-group-item-danger">${e}</li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    // Add patient list section if there are patients
    if (patientInfo && patientInfo.length > 0) {
        detailsHTML += `
            <div class="patients-section mb-4">
                <h5>👥 Imported Patients</h5>
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            <th>Patient ID</th>
                            <th>Name</th>
                            <th>CPF</th>
                            <th>Encounters</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${patientInfo.map(patient => `
                            <tr>
                                <td>${patient.id}</td>
                                <td>${patient.name || '-'}</td>
                                <td>${patient.cpf || '-'}</td>
                                <td>${patient.encounters || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Add job parameters
    detailsHTML += `
        <div class="row">
            <div class="col-md-6">
                <h5>Job Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Job Name:</strong></td><td>${execution.job_name}</td></tr>
                    <tr><td><strong>Source:</strong></td><td>${execution.source_display_name}</td></tr>
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
    
    // Update the container with the generated HTML
    container.innerHTML = detailsHTML;
}

// Load execution logs
async function loadExecutionLogs(executionId) {
    try {
        const container = document.getElementById('logs-container');
        container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';
        
        // Fetch up to 10000 logs to get complete execution
        const response = await migrationAPI.getExecutionLogs(executionId, 10000);
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
    
    // Sort by sequence number to ensure correct order
    const sortedLogs = logs.sort((a, b) => {
        // First sort by sequence_num, then by id as fallback
        if (a.sequence_num !== b.sequence_num) {
            return a.sequence_num - b.sequence_num;
        }
        return a.id - b.id;
    });
    
    // Reconstruct the full log by joining lines
    let fullLog = '';
    let inJsonBlock = false;
    let jsonBuffer = [];
    let jsonIndentLevel = 0;
    
    for (const log of sortedLogs) {
        const message = log.message;
        
        // Check for JSON block start/end
        if (message.includes('[DATA] {') || message.trim() === '{') {
            inJsonBlock = true;
            jsonBuffer = [message];
            jsonIndentLevel = 1;
        } else if (inJsonBlock) {
            jsonBuffer.push(message);
            
            // Count braces to detect end of JSON
            const openBraces = (message.match(/{/g) || []).length;
            const closeBraces = (message.match(/}/g) || []).length;
            jsonIndentLevel += openBraces - closeBraces;
            
            if (jsonIndentLevel <= 0 || message.trim() === '}') {
                // End of JSON block, add as single entry
                fullLog += jsonBuffer.join('\n') + '\n';
                inJsonBlock = false;
                jsonBuffer = [];
                jsonIndentLevel = 0;
            }
        } else {
            // Regular log line
            fullLog += message + '\n';
        }
    }
    
    // If there's remaining JSON buffer, add it
    if (jsonBuffer.length > 0) {
        fullLog += jsonBuffer.join('\n') + '\n';
    }
    
    // Apply syntax highlighting to the full log
    let highlightedLog = escapeHtml(fullLog);
    
    // Add syntax highlighting for special elements
    highlightedLog = highlightedLog
        .replace(/✅/g, '<span class="text-success">✅</span>')
        .replace(/❌/g, '<span class="text-danger">❌</span>')
        .replace(/⚠️/g, '<span class="text-warning">⚠️</span>')
        .replace(/🏥/g, '<span class="text-primary">🏥</span>')
        .replace(/📋/g, '<span class="text-info">📋</span>')
        .replace(/🚀/g, '<span class="text-primary">🚀</span>')
        .replace(/💊/g, '<span style="color: purple;">💊</span>')
        .replace(/📎/g, '<span class="text-secondary">📎</span>')
        .replace(/📊/g, '<span class="text-info">📊</span>')
        .replace(/🔍/g, '<span class="text-warning">🔍</span>')
        .replace(/👤/g, '<span class="text-info">👤</span>')
        .replace(/\[INFO\]/g, '<span class="badge bg-info">INFO</span>')
        .replace(/\[ERROR\]/g, '<span class="badge bg-danger">ERROR</span>')
        .replace(/\[DEBUG\]/g, '<span class="badge bg-secondary">DEBUG</span>')
        .replace(/\[DATA\]/g, '<span class="badge bg-primary">DATA</span>')
        .replace(/\[SUCCESS\]/g, '<span class="badge bg-success">SUCCESS</span>')
        .replace(/ETAPA (\d+)\/(\d+)/g, '<strong class="text-primary">ETAPA $1/$2</strong>')
        .replace(/(={3,})/g, '<span class="text-muted">$1</span>')
        .replace(/(\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2})/g, '<span class="text-warning">$1</span>')
        .replace(/(\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\])/g, '<span class="text-muted">$1</span>');
    
    // Use a pre tag to preserve formatting
    container.innerHTML = `<pre class="log-output" style="font-size: 12px; line-height: 1.4; background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 5px; overflow-x: auto;">${highlightedLog}</pre>`;
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
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

// Live monitoring state
let liveMonitoringId = null;
let liveMonitoringInterval = null;

// Start live monitoring for an execution
function startLiveMonitoring(executionId) {
    // Stop any existing monitoring
    stopLiveMonitoring();
    
    liveMonitoringId = executionId;
    currentExecutionId = executionId;
    
    // Show logs modal
    document.getElementById('logs-modal').style.display = 'block';
    
    // Update modal header to indicate live monitoring
    const modalHeader = document.querySelector('#logs-modal .modal-header h3');
    modalHeader.innerHTML = '<i class="fas fa-circle text-danger blinking"></i> Live Execution Logs';
    
    // Load initial logs
    loadLiveExecutionLogs(executionId);
    
    // Set up polling interval (every 2 seconds)
    liveMonitoringInterval = setInterval(() => {
        loadLiveExecutionLogs(executionId);
    }, 2000);
}

// Stop live monitoring
function stopLiveMonitoring() {
    if (liveMonitoringInterval) {
        clearInterval(liveMonitoringInterval);
        liveMonitoringInterval = null;
    }
    liveMonitoringId = null;
    
    // Reset modal header
    const modalHeader = document.querySelector('#logs-modal .modal-header h3');
    modalHeader.innerHTML = 'Execution Logs';
}

// Load logs for live monitoring with status parsing
async function loadLiveExecutionLogs(executionId) {
    try {
        // Fetch logs
        const response = await migrationAPI.getExecutionLogs(executionId, 10000);
        if (response.success) {
            displayExecutionLogs(response.data);
            
            // Parse current state from logs
            const state = parseExecutionState(response.data);
            updateLiveMonitoringStatus(state);
            
            // Update progress bar in the executions table
            updateExecutionProgress(executionId, state);
            
            // Check if execution is complete
            if (state.isComplete) {
                stopLiveMonitoring();
                showToast(state.success ? 'Migration completed successfully!' : 'Migration failed', 
                         state.success ? 'success' : 'error');
                // Refresh executions table
                loadExecutions(getCurrentFilters());
            }
        }
    } catch (error) {
        console.error('Error loading live logs:', error);
    }
}

// Parse execution state from logs
function parseExecutionState(logs) {
    const state = {
        isComplete: false,
        success: false,
        currentStep: '',
        currentStepNumber: 0,
        totalSteps: 0,
        progressPercent: 0,
        metrics: {}
    };
    
    // Join all log messages
    const fullLog = logs.map(l => l.message).join('\n');
    
    // Check for completion markers
    if (fullLog.includes('✅ SUCESSO COMPLETO') || 
        fullLog.includes('✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO!') ||
        fullLog.includes('Migration completed successfully')) {
        state.isComplete = true;
        state.success = true;
        state.progressPercent = 100;
    } else if (fullLog.includes('Migration failed') || 
               fullLog.includes('❌ ERRO') ||
               fullLog.includes('FALHA NA IMPORTAÇÃO')) {
        state.isComplete = true;
        state.success = false;
    }
    
    // Parse current step (ETAPA)
    const stepMatch = fullLog.match(/ETAPA (\d+)\/(\d+): ([^\n]+)/);
    if (stepMatch) {
        state.currentStepNumber = parseInt(stepMatch[1]);
        state.totalSteps = parseInt(stepMatch[2]);
        state.currentStep = `Step ${stepMatch[1]}/${stepMatch[2]}: ${stepMatch[3]}`;
        
        // Calculate progress based on steps if not complete
        if (!state.isComplete && state.totalSteps > 0) {
            state.progressPercent = Math.round((state.currentStepNumber / state.totalSteps) * 90); // Reserve last 10% for completion
        }
    }
    
    // Parse metrics
    const patientsMatch = fullLog.match(/✅ Pacientes:\s*(\d+)\/(\d+) migrados/);
    if (patientsMatch) {
        state.metrics.patients = {
            migrated: parseInt(patientsMatch[1]),
            total: parseInt(patientsMatch[2])
        };
    }
    
    const encountersMatch = fullLog.match(/[✅⚠️] Encontros:\s*(\d+)\/(\d+) migrados/);
    if (encountersMatch) {
        state.metrics.encounters = {
            migrated: parseInt(encountersMatch[1]),
            total: parseInt(encountersMatch[2])
        };
    }
    
    // If we have metrics but no explicit progress, calculate from metrics
    if (!state.progressPercent && (state.metrics.patients || state.metrics.encounters)) {
        let progress = 0;
        let count = 0;
        
        if (state.metrics.patients && state.metrics.patients.total > 0) {
            progress += (state.metrics.patients.migrated / state.metrics.patients.total) * 100;
            count++;
        }
        
        if (state.metrics.encounters && state.metrics.encounters.total > 0) {
            progress += (state.metrics.encounters.migrated / state.metrics.encounters.total) * 100;
            count++;
        }
        
        if (count > 0) {
            state.progressPercent = Math.round(progress / count);
        }
    }
    
    return state;
}

// Update execution progress in the table
function updateExecutionProgress(executionId, state) {
    // Find the row for this execution
    const row = document.querySelector(`[data-execution-id="${executionId}"]`)?.closest('tr');
    if (!row) return;
    
    // Update progress bar
    const progressBar = row.querySelector('.progress-bar');
    if (progressBar) {
        const progress = state.progressPercent || 0;
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        progressBar.textContent = `${progress}%`;
        
        // Update progress bar class based on state
        if (state.isComplete) {
            if (state.success) {
                progressBar.className = 'progress-bar bg-success';
            } else {
                progressBar.className = 'progress-bar bg-danger';
            }
        } else {
            progressBar.className = 'progress-bar progress-bar-animated progress-bar-striped bg-primary';
        }
    }
    
    // Update status badge
    const statusBadge = row.querySelector('.status-badge');
    if (statusBadge) {
        if (state.isComplete) {
            const status = state.success ? 'completed' : 'failed';
            statusBadge.className = `status-badge status-${status}`;
            statusBadge.innerHTML = `${getStatusIcon(status)} ${status.toUpperCase()}`;
        }
    }
    
    // Update duration if still running
    if (!state.isComplete) {
        const durationCell = row.cells[6]; // Duration column
        if (durationCell) {
            const startTime = new Date(row.dataset.startedAt || Date.now());
            const diffMs = Date.now() - startTime;
            durationCell.innerHTML = `<small>${formatDuration(diffMs)} (running)</small>`;
        }
    }
}

// Update live monitoring status display
function updateLiveMonitoringStatus(state) {
    const container = document.getElementById('logs-container');
    
    // Add status bar at the top of logs
    let statusBar = document.getElementById('live-status-bar');
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'live-status-bar';
        statusBar.className = 'alert mb-3';
        container.parentNode.insertBefore(statusBar, container);
    }
    
    // Update status bar content
    let statusContent = '';
    if (state.isComplete) {
        statusBar.className = `alert ${state.success ? 'alert-success' : 'alert-danger'} mb-3`;
        statusContent = `
            <strong>${state.success ? '✅ Migration Complete' : '❌ Migration Failed'}</strong>
        `;
    } else {
        statusBar.className = 'alert alert-info mb-3';
        statusContent = `<strong>🔄 Migration Running</strong>`;
        if (state.currentStep) {
            statusContent += ` - ${state.currentStep}`;
        }
        if (state.progressPercent) {
            statusContent += ` (${state.progressPercent}%)`;
        }
    }
    
    // Add metrics if available
    if (Object.keys(state.metrics).length > 0) {
        statusContent += '<div class="mt-2">';
        if (state.metrics.patients) {
            statusContent += `<span class="badge bg-primary me-2">Patients: ${state.metrics.patients.migrated}/${state.metrics.patients.total}</span>`;
        }
        if (state.metrics.encounters) {
            statusContent += `<span class="badge bg-info">Encounters: ${state.metrics.encounters.migrated}/${state.metrics.encounters.total}</span>`;
        }
        statusContent += '</div>';
    }
    
    statusBar.innerHTML = statusContent;
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
        applyFiltersBtn.addEventListener('click', () => {
            resetPagination();
            loadExecutions(getCurrentFilters());
        });
    }
    
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            document.getElementById('status-filter').value = '';
            document.getElementById('environment-filter').value = '';
            resetPagination();
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
        closeLogsModalBtn.addEventListener('click', () => {
            stopLiveMonitoring();
            closeLogsModal();
        });
    }
    
    // Refresh logs button
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', () => {
            if (currentExecutionId) {
                if (liveMonitoringId) {
                    loadLiveExecutionLogs(currentExecutionId);
                } else {
                    loadExecutionLogs(currentExecutionId);
                }
            }
        });
    }
    
    // Table action buttons (delegated)
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.view-details-btn, .view-logs-btn, .follow-execution-btn');
        if (target) {
            const executionId = parseInt(target.dataset.executionId);
            if (target.classList.contains('view-details-btn')) {
                showExecutionDetailsModal(executionId);
            } else if (target.classList.contains('view-logs-btn')) {
                showLogsModal(executionId);
            } else if (target.classList.contains('follow-execution-btn')) {
                startLiveMonitoring(executionId);
            }
        }
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});