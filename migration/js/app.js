/**
 * Migration Management App
 * Main application logic for migration sources
 */

let sources = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication
        const auth = await checkAdminAuth();
        if (!auth) return;
        
        // Set admin email in header
        document.getElementById('admin-email').textContent = auth.email;
        
        // Load migration sources
        await loadSources();
        
    } catch (error) {
        console.error('Failed to initialize migration app:', error);
        showError('Failed to initialize application');
    }
});

// Load migration sources
async function loadSources() {
    try {
        showLoading();
        
        const response = await migrationAPI.getSources();
        if (response.success) {
            sources = response.data;
            displaySources();
        } else {
            throw new Error(response.error || 'Failed to load sources');
        }
    } catch (error) {
        console.error('Error loading sources:', error);
        showError('Failed to load migration sources: ' + error.message);
    }
}

// Display sources in table
function displaySources() {
    hideLoading();
    
    const tbody = document.getElementById('sources-tbody');
    tbody.innerHTML = '';
    
    if (sources.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p>No migration sources found</p>
                    <button class="btn btn-primary btn-sm" onclick="showCreateSourceModal()">
                        <i class="fas fa-plus"></i> Create First Source
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    sources.forEach(source => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${source.display_name}</strong>
                <br><small class="text-muted">${source.name}</small>
            </td>
            <td>${source.description || 'No description'}</td>
            <td><code class="script-path">${source.script_path}</code></td>
            <td>
                <span class="parameter-count">${source.parameters.length} parameters</span>
            </td>
            <td>
                <span class="migration-status ${source.is_active ? 'active' : 'inactive'}">
                    ${source.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm edit-source-btn" data-source-id="${source.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-outline-secondary btn-sm view-source-btn" data-source-id="${source.id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-source-btn" data-source-id="${source.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('sources-content').style.display = 'block';
}

// Show loading state
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('sources-content').style.display = 'none';
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

// Real functionality - no mock code
function showCreateSourceModal() {
    document.getElementById('create-source-modal').style.display = 'block';
}

function closeCreateSourceModal() {
    document.getElementById('create-source-modal').style.display = 'none';
    document.getElementById('create-source-form').reset();
}

function showEditSourceModal(source) {
    // Populate form fields
    document.getElementById('edit-source-id').value = source.id;
    document.getElementById('edit-source-name').value = source.name;
    document.getElementById('edit-source-display-name').value = source.display_name;
    document.getElementById('edit-source-description').value = source.description || '';
    document.getElementById('edit-source-script-path').value = source.script_path;
    
    // Populate parameters
    const container = document.getElementById('edit-parameters-container');
    container.innerHTML = '';
    
    const parameters = Array.isArray(source.parameters) ? source.parameters : [];
    parameters.forEach(param => {
        addEditParameter(param);
    });
    
    // If no parameters, add one empty row
    if (parameters.length === 0) {
        addEditParameter();
    }
    
    document.getElementById('edit-source-modal').style.display = 'block';
}

function closeEditSourceModal() {
    document.getElementById('edit-source-modal').style.display = 'none';
    document.getElementById('edit-source-form').reset();
    document.getElementById('edit-parameters-container').innerHTML = '';
}

function showViewSourceModal(source) {
    const modalBody = document.getElementById('view-source-content');
    
    modalBody.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h5>Basic Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Name:</strong></td><td>${source.name}</td></tr>
                    <tr><td><strong>Display Name:</strong></td><td>${source.display_name}</td></tr>
                    <tr><td><strong>Status:</strong></td><td><span class="migration-status ${source.is_active ? 'active' : 'inactive'}">${source.is_active ? 'Active' : 'Inactive'}</span></td></tr>
                    <tr><td><strong>Created:</strong></td><td>${new Date(source.created_at).toLocaleString()}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h5>Script Information</h5>
                <table class="table table-sm">
                    <tr><td><strong>Script Path:</strong></td><td><code>${source.script_path}</code></td></tr>
                </table>
            </div>
        </div>
        
        <div class="mt-3">
            <h5>Description</h5>
            <p>${source.description || 'No description provided'}</p>
        </div>
        
        <div class="mt-3">
            <h5>Parameters (${source.parameters.length})</h5>
            ${source.parameters.length > 0 ? `
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Parameter Name</th>
                                <th>Type</th>
                                <th>Label</th>
                                <th>Required</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${source.parameters.map(param => `
                                <tr>
                                    <td><code>${param.name}</code></td>
                                    <td><span class="badge badge-secondary">${param.type}</span></td>
                                    <td>${param.label}</td>
                                    <td>${param.required ? '<span class="text-success">Yes</span>' : '<span class="text-muted">No</span>'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p class="text-muted">No parameters defined</p>'}
        </div>
    `;
    
    document.getElementById('view-source-modal').style.display = 'block';
}

function closeViewSourceModal() {
    document.getElementById('view-source-modal').style.display = 'none';
}

function addParameter() {
    const container = document.getElementById('parameters-container');
    const parameterRow = document.createElement('div');
    parameterRow.className = 'parameter-row mt-2';
    parameterRow.innerHTML = `
        <div class="row">
            <div class="col-md-3">
                <input type="text" class="form-control parameter-name" placeholder="Parameter name" required>
            </div>
            <div class="col-md-3">
                <select class="form-control parameter-type">
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                </select>
            </div>
            <div class="col-md-4">
                <input type="text" class="form-control parameter-label" placeholder="Display label" required>
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-outline-danger btn-sm remove-parameter-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(parameterRow);
}

function removeParameter(button) {
    button.closest('.parameter-row').remove();
}

function addEditParameter(param = {}) {
    const container = document.getElementById('edit-parameters-container');
    const parameterRow = document.createElement('div');
    parameterRow.className = 'parameter-row mt-2';
    parameterRow.innerHTML = `
        <div class="row">
            <div class="col-md-3">
                <input type="text" class="form-control parameter-name" placeholder="Parameter name" value="${param.name || ''}" required>
            </div>
            <div class="col-md-3">
                <select class="form-control parameter-type">
                    <option value="text" ${param.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="email" ${param.type === 'email' ? 'selected' : ''}>Email</option>
                    <option value="number" ${param.type === 'number' ? 'selected' : ''}>Number</option>
                    <option value="select" ${param.type === 'select' ? 'selected' : ''}>Select</option>
                </select>
            </div>
            <div class="col-md-4">
                <input type="text" class="form-control parameter-label" placeholder="Display label" value="${param.label || ''}" required>
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-outline-danger btn-sm remove-parameter-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(parameterRow);
}

// Handle form submission and event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Create source button
    const createSourceBtn = document.getElementById('create-source-btn');
    if (createSourceBtn) {
        createSourceBtn.addEventListener('click', showCreateSourceModal);
    }
    
    // Close modal button
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeCreateSourceModal);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('cancel-create-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeCreateSourceModal);
    }
    
    // Add parameter button
    const addParameterBtn = document.getElementById('add-parameter-btn');
    if (addParameterBtn) {
        addParameterBtn.addEventListener('click', addParameter);
    }
    
    // Edit modal buttons
    const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', closeEditSourceModal);
    }
    
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeEditSourceModal);
    }
    
    // Edit add parameter button
    const editAddParameterBtn = document.getElementById('edit-add-parameter-btn');
    if (editAddParameterBtn) {
        editAddParameterBtn.addEventListener('click', () => addEditParameter());
    }
    
    // View modal button
    const closeViewModalBtn = document.getElementById('close-view-modal-btn');
    if (closeViewModalBtn) {
        closeViewModalBtn.addEventListener('click', closeViewSourceModal);
    }
    
    // Remove parameter buttons (delegated)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.remove-parameter-btn')) {
            removeParameter(e.target.closest('.remove-parameter-btn'));
        }
    });
    
    // Table action buttons (delegated)
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.edit-source-btn, .view-source-btn, .delete-source-btn');
        if (target) {
            const sourceId = parseInt(target.dataset.sourceId);
            if (target.classList.contains('edit-source-btn')) {
                editSource(sourceId);
            } else if (target.classList.contains('view-source-btn')) {
                viewSource(sourceId);
            } else if (target.classList.contains('delete-source-btn')) {
                deleteSource(sourceId);
            }
        }
    });
    
    // Form submission
    const createForm = document.getElementById('create-source-form');
    if (createForm) {
        createForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                // Collect form data
                const name = document.getElementById('source-name').value;
                const display_name = document.getElementById('source-display-name').value;
                const description = document.getElementById('source-description').value;
                const script_path = document.getElementById('source-script-path').value;
                
                // Collect parameters
                const parameters = [];
                const parameterRows = document.querySelectorAll('.parameter-row');
                parameterRows.forEach(row => {
                    const nameInput = row.querySelector('.parameter-name');
                    const typeInput = row.querySelector('.parameter-type');
                    const labelInput = row.querySelector('.parameter-label');
                    
                    if (nameInput.value && labelInput.value) {
                        parameters.push({
                            name: nameInput.value,
                            type: typeInput.value,
                            label: labelInput.value,
                            required: true
                        });
                    }
                });
                
                // Validate
                if (!name || !display_name || !script_path || parameters.length === 0) {
                    showToast('Please fill in all required fields', 'error');
                    return;
                }
                
                // Create source
                const response = await migrationAPI.createSource({
                    name,
                    display_name,
                    description,
                    script_path,
                    parameters
                });
                
                if (response.success) {
                    showToast('Migration source created successfully', 'success');
                    closeCreateSourceModal();
                    await loadSources(); // Reload the list
                } else {
                    throw new Error(response.error);
                }
                
            } catch (error) {
                console.error('Error creating source:', error);
                showToast('Failed to create migration source: ' + error.message, 'error');
            }
        });
    }
    
    // Edit form submission
    const editForm = document.getElementById('edit-source-form');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                // Collect form data
                const id = document.getElementById('edit-source-id').value;
                const name = document.getElementById('edit-source-name').value;
                const display_name = document.getElementById('edit-source-display-name').value;
                const description = document.getElementById('edit-source-description').value;
                const script_path = document.getElementById('edit-source-script-path').value;
                
                // Collect parameters
                const parameters = [];
                const parameterRows = document.querySelectorAll('#edit-parameters-container .parameter-row');
                parameterRows.forEach(row => {
                    const nameInput = row.querySelector('.parameter-name');
                    const typeInput = row.querySelector('.parameter-type');
                    const labelInput = row.querySelector('.parameter-label');
                    
                    if (nameInput.value && labelInput.value) {
                        parameters.push({
                            name: nameInput.value,
                            type: typeInput.value,
                            label: labelInput.value,
                            required: true
                        });
                    }
                });
                
                // Validate
                if (!name || !display_name || !script_path || parameters.length === 0) {
                    showToast('Please fill in all required fields', 'error');
                    return;
                }
                
                // Update source
                const response = await migrationAPI.updateSource(id, {
                    name,
                    display_name,
                    description,
                    script_path,
                    parameters
                });
                
                if (response.success) {
                    showToast('Migration source updated successfully', 'success');
                    closeEditSourceModal();
                    await loadSources(); // Reload the list
                } else {
                    throw new Error(response.error);
                }
                
            } catch (error) {
                console.error('Error updating source:', error);
                showToast('Failed to update migration source: ' + error.message, 'error');
            }
        });
    }
});

async function editSource(id) {
    try {
        // Get source details
        const response = await migrationAPI.getSource(id);
        if (response.success) {
            showEditSourceModal(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading source for edit:', error);
        showToast('Failed to load source details: ' + error.message, 'error');
    }
}

async function viewSource(id) {
    try {
        const response = await migrationAPI.getSource(id);
        if (response.success) {
            showViewSourceModal(response.data);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading source for view:', error);
        showToast('Failed to load source details: ' + error.message, 'error');
    }
}

async function deleteSource(id) {
    if (!confirm('Are you sure you want to delete this migration source? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await migrationAPI.deleteSource(id);
        
        if (response.success) {
            showToast('Migration source deleted successfully', 'success');
            await loadSources(); // Reload the list
        } else {
            throw new Error(response.error);
        }
        
    } catch (error) {
        console.error('Error deleting source:', error);
        showToast('Failed to delete migration source: ' + error.message, 'error');
    }
} 