/**
 * Migration Jobs App
 * Main application logic for migration jobs
 */

let jobs = [];
let sources = [];
let currentJobId = null;
let isEditMode = false;
let editingJobId = null;

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
                    <button class="btn btn-warning btn-sm duplicate-job-btn" data-job-id="${job.id}">
                        <i class="fas fa-copy"></i> Duplicate
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
    isEditMode = false;
    editingJobId = null;
    document.querySelector('#create-job-modal h3').textContent = 'Create Migration Job';
    document.querySelector('#create-job-form button[type="submit"]').textContent = 'Create Job';
    document.getElementById('create-job-modal').style.display = 'block';
}

function showEditJobModal(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) {
        showToast('Job not found', 'error');
        return;
    }
    
    isEditMode = true;
    editingJobId = jobId;
    document.querySelector('#create-job-modal h3').textContent = 'Edit Migration Job';
    document.querySelector('#create-job-form button[type="submit"]').textContent = 'Update Job';
    
    // Show modal first
    document.getElementById('create-job-modal').style.display = 'block';
    
    // Pre-populate form after a short delay
    setTimeout(() => {
        // Pre-populate the form with the job data
        document.getElementById('job-name').value = job.name;
        document.getElementById('job-description').value = job.description || '';
        
        // Set the source (this will trigger parameter loading)
        const sourceSelect = document.getElementById('job-source');
        sourceSelect.value = job.source_id;
        
        // Trigger source selection to load parameters
        handleSourceSelection();
        
        // Pre-populate parameters after parameters are loaded
        setTimeout(() => {
            if (job.parameters && typeof job.parameters === 'object') {
                const paramInputs = document.querySelectorAll('#parameters-container input');
                paramInputs.forEach(input => {
                    const paramName = input.name;
                    if (job.parameters[paramName] !== undefined) {
                        input.value = job.parameters[paramName];
                    }
                });
            }
        }, 200);
    }, 100);
}

function closeCreateJobModal() {
    document.getElementById('create-job-modal').style.display = 'none';
    document.getElementById('create-job-form').reset();
    document.getElementById('parameters-section').style.display = 'none';
    document.getElementById('parameters-container').innerHTML = '';
    isEditMode = false;
    editingJobId = null;
}

function showExecuteJobModal(jobId) {
    currentJobId = jobId;
    
    // Display current environment in modal
    const currentEnv = window.environmentContext?.getCurrentEnvironment();
    const envDisplay = document.getElementById('current-env-display');
    if (envDisplay && currentEnv) {
        envDisplay.textContent = `${currentEnv.display_name} (${currentEnv.env_type})`;
        envDisplay.className = `badge bg-${currentEnv.env_type === 'production' ? 'danger' : currentEnv.env_type === 'staging' ? 'warning' : 'info'}`;
    }
    
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
        const target = e.target.closest('.execute-job-btn, .edit-job-btn, .view-job-btn, .duplicate-job-btn, .delete-job-btn');
        if (target) {
            const jobId = parseInt(target.dataset.jobId);
            if (target.classList.contains('execute-job-btn')) {
                showExecuteJobModal(jobId);
            } else if (target.classList.contains('edit-job-btn')) {
                editJob(jobId);
            } else if (target.classList.contains('view-job-btn')) {
                viewJob(jobId);
            } else if (target.classList.contains('duplicate-job-btn')) {
                duplicateJob(jobId);
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
                
                let response;
                if (isEditMode) {
                    // Update existing job
                    response = await migrationAPI.updateJob(editingJobId, {
                        name,
                        description,
                        parameters
                    });
                    
                    if (response.success) {
                        showToast('Migration job updated successfully', 'success');
                        closeCreateJobModal();
                        await loadJobs();
                    } else {
                        throw new Error(response.error);
                    }
                } else {
                    // Create new job
                    response = await migrationAPI.createJob({
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
                }
                
            } catch (error) {
                console.error('Error saving job:', error);
                const action = isEditMode ? 'update' : 'create';
                showToast(`Failed to ${action} migration job: ` + error.message, 'error');
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

// Duplicate job functionality
function duplicateJob(id) {
    const job = jobs.find(j => j.id === id);
    if (!job) {
        showToast('Job not found', 'error');
        return;
    }
    
    try {
        // Show the create job modal
        showCreateJobModal();
        
        // Wait a moment for modal to be visible and form to be available
        setTimeout(() => {
            // Pre-populate the form with the job data
            document.getElementById('job-name').value = `Copy of ${job.name}`;
            document.getElementById('job-description').value = job.description || '';
            
            // Find the source by matching the source_id from the job
            const sourceSelect = document.getElementById('job-source');
            const matchingSource = sources.find(s => s.id == job.source_id);
            
            if (matchingSource) {
                sourceSelect.value = matchingSource.id;
                
                // Trigger source selection to load parameters
                handleSourceSelection();
                
                // Pre-populate parameters after parameters are loaded
                setTimeout(() => {
                    if (job.parameters && typeof job.parameters === 'object') {
                        const paramInputs = document.querySelectorAll('#parameters-container input');
                        paramInputs.forEach(input => {
                            const paramName = input.name;
                            if (job.parameters[paramName] !== undefined) {
                                input.value = job.parameters[paramName];
                            }
                        });
                    }
                }, 200);
                
                showToast(`Duplicating job "${job.name}" - modify as needed and save`, 'info');
            } else {
                showToast('Source not found for this job', 'error');
            }
        }, 100);
        
    } catch (error) {
        console.error('Error duplicating job:', error);
        showToast('Failed to duplicate job', 'error');
    }
}

// Edit job functionality
function editJob(id) {
    showEditJobModal(id);
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