/**
 * Migration Jobs App
 * Main application logic for migration jobs
 */

let jobs = [];
let sources = [];
let currentJobId = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication
        const auth = await checkAdminAuth();
        if (!auth) return;
        
        // Set admin email in header
        document.getElementById('admin-email').textContent = auth.email;
        
        // Load sources and jobs
        await loadSources();
        await loadJobs();
        
    } catch (error) {
        console.error('Failed to initialize migration jobs app:', error);
        showError('Failed to initialize application');
    }
});

// Load migration sources for dropdown
async function loadSources() {
    try {
        const response = await migrationAPI.getSources();
        if (response.success) {
            sources = response.data;
            populateSourcesDropdown();
        } else {
            throw new Error(response.error || 'Failed to load sources');
        }
    } catch (error) {
        console.error('Error loading sources:', error);
        // Don't show error here as sources are for form only
    }
}

// Populate sources dropdown
function populateSourcesDropdown() {
    const dropdown = document.getElementById('job-source');
    
    // Clear existing options except first
    dropdown.innerHTML = '<option value="">Select a migration source...</option>';
    
    sources.forEach(source => {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.display_name;
        option.dataset.parameters = JSON.stringify(source.parameters);
        dropdown.appendChild(option);
    });
}

// Load migration jobs
async function loadJobs() {
    try {
        showLoading();
        
        const response = await migrationAPI.getJobs();
        if (response.success) {
            jobs = response.data;
            displayJobs();
        } else {
            throw new Error(response.error || 'Failed to load jobs');
        }
    } catch (error) {
        console.error('Error loading jobs:', error);
        showError('Failed to load migration jobs: ' + error.message);
    }
}

// Display jobs in table
function displayJobs() {
    hideLoading();
    
    const tbody = document.getElementById('jobs-tbody');
    tbody.innerHTML = '';
    
    if (jobs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p>No migration jobs found</p>
                    <button class="btn btn-primary btn-sm" onclick="showCreateJobModal()">
                        <i class="fas fa-plus"></i> Create First Job
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    jobs.forEach(job => {
        const parametersCount = job.parameters ? Object.keys(job.parameters).length : 0;
        const createdDate = new Date(job.created_at).toLocaleDateString();
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${job.name}</strong>
            </td>
            <td>
                <span class="source-badge">${job.source_display_name}</span>
                <br><small class="text-muted">${job.source_name}</small>
            </td>
            <td>${job.description || 'No description'}</td>
            <td>
                <span class="parameter-count">${parametersCount} parameters</span>
            </td>
            <td>${createdDate}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-success btn-sm execute-job-btn" data-job-id="${job.id}">
                        <i class="fas fa-play"></i> Execute
                    </button>
                    <button class="btn btn-primary btn-sm edit-job-btn" data-job-id="${job.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-outline-secondary btn-sm view-job-btn" data-job-id="${job.id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-job-btn" data-job-id="${job.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('jobs-content').style.display = 'block';
}

// Show loading state
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('jobs-content').style.display = 'none';
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

// Modal functions
function showCreateJobModal() {
    document.getElementById('create-job-modal').style.display = 'block';
}

function closeCreateJobModal() {
    document.getElementById('create-job-modal').style.display = 'none';
    document.getElementById('create-job-form').reset();
    document.getElementById('parameters-section').style.display = 'none';
    document.getElementById('parameters-container').innerHTML = '';
}

function showExecuteJobModal(jobId) {
    currentJobId = jobId;
    document.getElementById('execute-job-modal').style.display = 'block';
}

function closeExecuteJobModal() {
    document.getElementById('execute-job-modal').style.display = 'none';
    document.getElementById('execute-job-form').reset();
    currentJobId = null;
}

// Handle source selection to show parameters
function handleSourceSelection() {
    const sourceSelect = document.getElementById('job-source');
    const parametersSection = document.getElementById('parameters-section');
    const parametersContainer = document.getElementById('parameters-container');
    
    if (sourceSelect.value) {
        const selectedOption = sourceSelect.selectedOptions[0];
        const parameters = JSON.parse(selectedOption.dataset.parameters || '[]');
        
        if (parameters.length > 0) {
            parametersContainer.innerHTML = '';
            
            parameters.forEach(param => {
                const fieldGroup = document.createElement('div');
                fieldGroup.className = 'form-group';
                
                const label = document.createElement('label');
                label.className = 'form-label';
                label.textContent = param.label + (param.required ? ' *' : '');
                
                let input;
                if (param.type === 'email') {
                    input = document.createElement('input');
                    input.type = 'email';
                } else if (param.type === 'number') {
                    input = document.createElement('input');
                    input.type = 'number';
                } else {
                    input = document.createElement('input');
                    input.type = 'text';
                }
                
                input.className = 'form-control';
                input.name = param.name;
                input.placeholder = `Enter ${param.label.toLowerCase()}`;
                if (param.required) {
                    input.required = true;
                }
                
                fieldGroup.appendChild(label);
                fieldGroup.appendChild(input);
                parametersContainer.appendChild(fieldGroup);
            });
            
            parametersSection.style.display = 'block';
        } else {
            parametersSection.style.display = 'none';
        }
    } else {
        parametersSection.style.display = 'none';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Create job button
    const createJobBtn = document.getElementById('create-job-btn');
    if (createJobBtn) {
        createJobBtn.addEventListener('click', showCreateJobModal);
    }
    
    // Close modal buttons
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeCreateJobModal);
    }
    
    const cancelBtn = document.getElementById('cancel-create-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeCreateJobModal);
    }
    
    // Execute modal buttons
    const closeExecuteModalBtn = document.getElementById('close-execute-modal-btn');
    if (closeExecuteModalBtn) {
        closeExecuteModalBtn.addEventListener('click', closeExecuteJobModal);
    }
    
    const cancelExecuteBtn = document.getElementById('cancel-execute-btn');
    if (cancelExecuteBtn) {
        cancelExecuteBtn.addEventListener('click', closeExecuteJobModal);
    }
    
    // Source selection change
    const sourceSelect = document.getElementById('job-source');
    if (sourceSelect) {
        sourceSelect.addEventListener('change', handleSourceSelection);
    }
    
    // Table action buttons (delegated)
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.execute-job-btn, .edit-job-btn, .view-job-btn, .delete-job-btn');
        if (target) {
            const jobId = parseInt(target.dataset.jobId);
            if (target.classList.contains('execute-job-btn')) {
                showExecuteJobModal(jobId);
            } else if (target.classList.contains('edit-job-btn')) {
                editJob(jobId);
            } else if (target.classList.contains('view-job-btn')) {
                viewJob(jobId);
            } else if (target.classList.contains('delete-job-btn')) {
                deleteJob(jobId);
            }
        }
    });
    
    // Create job form submission
    const createForm = document.getElementById('create-job-form');
    if (createForm) {
        createForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                const sourceId = document.getElementById('job-source').value;
                const name = document.getElementById('job-name').value;
                const description = document.getElementById('job-description').value;
                
                if (!sourceId || !name) {
                    showToast('Please fill in all required fields', 'error');
                    return;
                }
                
                // Collect parameters
                const parameters = {};
                const paramInputs = document.querySelectorAll('#parameters-container input');
                paramInputs.forEach(input => {
                    if (input.value) {
                        parameters[input.name] = input.value;
                    }
                });
                
                const response = await migrationAPI.createJob({
                    source_id: parseInt(sourceId),
                    name,
                    description,
                    parameters
                });
                
                if (response.success) {
                    showToast('Migration job created successfully', 'success');
                    closeCreateJobModal();
                    await loadJobs();
                } else {
                    throw new Error(response.error);
                }
                
            } catch (error) {
                console.error('Error creating job:', error);
                showToast('Failed to create migration job: ' + error.message, 'error');
            }
        });
    }
    
    // Execute job form submission
    const executeForm = document.getElementById('execute-job-form');
    if (executeForm) {
        executeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                // Get current environment from global context
                const environmentId = window.environmentContext?.getCurrentEnvironment()?.id;
                
                if (!environmentId || !currentJobId) {
                    showToast('No environment selected or no job specified', 'error');
                    return;
                }
                
                const response = await migrationAPI.executeJob(currentJobId, { environment_id: environmentId });
                
                if (response.success) {
                    showToast('Migration job execution started successfully', 'success');
                    closeExecuteJobModal();
                    
                    // Redirect to executions page to monitor
                    setTimeout(() => {
                        window.location.href = '/medproadmin/migration/executions.html';
                    }, 1500);
                } else {
                    throw new Error(response.error);
                }
                
            } catch (error) {
                console.error('Error executing job:', error);
                showToast('Failed to execute migration job: ' + error.message, 'error');
            }
        });
    }
});

// Placeholder functions for future implementation
function editJob(id) {
    console.log('Edit job', id, '- to be implemented');
    showToast('Edit functionality coming soon', 'info');
}

function viewJob(id) {
    const job = jobs.find(j => j.id === id);
    if (job) {
        alert(`Job: ${job.name}\nSource: ${job.source_display_name}\nParameters: ${JSON.stringify(job.parameters, null, 2)}`);
    }
}

async function deleteJob(id) {
    if (!confirm('Are you sure you want to delete this migration job? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await migrationAPI.deleteJob(id);
        
        if (response.success) {
            showToast('Migration job deleted successfully', 'success');
            await loadJobs();
        } else {
            throw new Error(response.error);
        }
        
    } catch (error) {
        console.error('Error deleting job:', error);
        showToast('Failed to delete migration job: ' + error.message, 'error');
    }
}