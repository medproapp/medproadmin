/**
 * User List Component
 * Handles displaying users in a table with pagination
 */

class UserList {
    constructor() {
        this.currentEnvironmentId = null;
        this.currentPage = 1;
        this.currentFilters = {
            role: 'all',
            status: 'active',
            search: '',
            limit: 20,
            sort_field: 'fullname',
            sort_direction: 'asc'
        };
        this.totalPages = 0;
        this.totalUsers = 0;
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.loadingContainer = document.getElementById('loading-container');
        this.errorContainer = document.getElementById('error-container');
        this.emptyContainer = document.getElementById('empty-container');
        this.usersContainer = document.getElementById('users-container');
        this.usersTableBody = document.getElementById('users-table-body');
        this.paginationContainer = document.getElementById('pagination-container');
        this.paginationInfo = document.getElementById('pagination-info');
        this.errorMessage = document.getElementById('error-message');
        this.retryBtn = document.getElementById('retry-load-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
    }
    
    bindEvents() {
        this.retryBtn?.addEventListener('click', () => this.loadUsers());
        this.refreshBtn?.addEventListener('click', () => this.refresh());
        
        // Listen for environment changes
        document.addEventListener('environmentChanged', (e) => {
            this.currentEnvironmentId = e.detail.environmentId;
            this.loadUsers();
        });
        
        // Handle table header clicks for sorting
        document.addEventListener('click', (e) => {
            if (e.target.closest('.sortable-header')) {
                const header = e.target.closest('.sortable-header');
                const sortField = header.dataset.sortField;
                this.handleSort(sortField);
            }
        });
    }
    
    showLoading() {
        this.loadingContainer?.classList.remove('d-none');
        this.errorContainer?.classList.add('d-none');
        this.emptyContainer?.classList.add('d-none');
        this.usersContainer?.classList.add('d-none');
    }
    
    showError(message) {
        this.loadingContainer?.classList.add('d-none');
        this.errorContainer?.classList.remove('d-none');
        this.emptyContainer?.classList.add('d-none');
        this.usersContainer?.classList.add('d-none');
        
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
        }
    }
    
    showEmpty() {
        this.loadingContainer?.classList.add('d-none');
        this.errorContainer?.classList.add('d-none');
        this.emptyContainer?.classList.remove('d-none');
        this.usersContainer?.classList.add('d-none');
    }
    
    showUsers() {
        this.loadingContainer?.classList.add('d-none');
        this.errorContainer?.classList.add('d-none');
        this.emptyContainer?.classList.add('d-none');
        this.usersContainer?.classList.remove('d-none');
    }
    
    async loadUsers() {
        if (!this.currentEnvironmentId) {
            console.warn('No environment selected');
            return;
        }
        
        try {
            this.showLoading();
            
            const filters = {
                ...this.currentFilters,
                page: this.currentPage
            };
            
            const data = await userApi.searchUsers(this.currentEnvironmentId, filters);
            
            if (!data.users || data.users.length === 0) {
                this.showEmpty();
                return;
            }
            
            this.renderUsers(data.users);
            this.renderPagination(data.pagination);
            this.updatePaginationInfo(data.pagination);
            this.showUsers();
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError(error.message);
        }
    }
    
    renderUsers(users) {
        if (!this.usersTableBody) return;
        
        this.usersTableBody.innerHTML = '';
        
        users.forEach(user => {
            const row = this.createUserRow(user);
            this.usersTableBody.appendChild(row);
        });
        
        // Update sort indicators
        this.updateSortIndicators();
    }
    
    createUserRow(user) {
        const row = document.createElement('tr');
        
        // User info column
        const userCell = document.createElement('td');
        userCell.innerHTML = `
            <div class="d-flex align-items-center">
                <div class="user-avatar">
                    ${this.getUserInitials(user.fullname)}
                </div>
                <div class="user-info">
                    <h6>${this.escapeHtml(user.fullname || 'N/A')}</h6>
                    <small class="text-muted">${this.escapeHtml(user.email)}</small>
                </div>
            </div>
        `;
        
        // Role column
        const roleCell = document.createElement('td');
        roleCell.innerHTML = `<span class="role-badge role-${user.role}">${this.formatRole(user.role)}</span>`;
        
        // Status column
        const statusCell = document.createElement('td');
        const status = this.getUserStatus(user.status);
        statusCell.innerHTML = `<span class="status-badge status-${status}">${this.formatStatus(status)}</span>`;
        
        // Plan column
        const planCell = document.createElement('td');
        planCell.innerHTML = `<span class="plan-badge">${this.formatPlan(user.plan)}</span>`;
        
        // Activated column
        const activatedCell = document.createElement('td');
        activatedCell.textContent = this.formatDate(user.activatedate);
        
        // Actions column
        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = `
            <div class="btn-group" role="group">
                <button class="btn btn-sm btn-outline-primary btn-view" data-user-email="${this.escapeHtml(user.email)}">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="fas fa-cog"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><h6 class="dropdown-header">User Management</h6></li>
                    <li><a class="dropdown-item btn-status-toggle" href="#" data-user-email="${this.escapeHtml(user.email)}" data-current-status="${user.status || 'active'}">
                        <i class="fas fa-${this.getStatusToggleIcon(user.status)}"></i> ${this.getStatusToggleText(user.status)}
                    </a></li>
                    <li><a class="dropdown-item btn-lock-user" href="#" data-user-email="${this.escapeHtml(user.email)}">
                        <i class="fas fa-lock"></i> Lock Account
                    </a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><h6 class="dropdown-header">Password Management</h6></li>
                    <li><a class="dropdown-item btn-reset-password" href="#" data-user-email="${this.escapeHtml(user.email)}">
                        <i class="fas fa-key"></i> Reset Password
                    </a></li>
                    <li><a class="dropdown-item btn-generate-password" href="#" data-user-email="${this.escapeHtml(user.email)}">
                        <i class="fas fa-random"></i> Generate New Password
                    </a></li>
                </ul>
            </div>
        `;
        
        // Add event listeners
        const viewBtn = actionsCell.querySelector('.btn-view');
        viewBtn.addEventListener('click', () => {
            this.viewUserDetails(user.email);
        });
        
        const statusToggleBtn = actionsCell.querySelector('.btn-status-toggle');
        statusToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleUserStatus(user.email, user.status || 'active');
        });
        
        const lockBtn = actionsCell.querySelector('.btn-lock-user');
        lockBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.lockUser(user.email);
        });
        
        const resetPasswordBtn = actionsCell.querySelector('.btn-reset-password');
        resetPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.resetPassword(user.email, false);
        });
        
        const generatePasswordBtn = actionsCell.querySelector('.btn-generate-password');
        generatePasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.resetPassword(user.email, true);
        });
        
        row.appendChild(userCell);
        row.appendChild(roleCell);
        row.appendChild(statusCell);
        row.appendChild(planCell);
        row.appendChild(activatedCell);
        row.appendChild(actionsCell);
        
        return row;
    }
    
    renderPagination(pagination) {
        if (!this.paginationContainer) return;
        
        this.totalPages = pagination.totalPages;
        this.totalUsers = pagination.total;
        this.currentPage = pagination.page;
        
        this.paginationContainer.innerHTML = '';
        
        if (this.totalPages <= 1) return;
        
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${this.currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `
            <a class="page-link" href="#" data-page="${this.currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </a>
        `;
        this.paginationContainer.appendChild(prevLi);
        
        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            this.paginationContainer.appendChild(li);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `
            <a class="page-link" href="#" data-page="${this.currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </a>
        `;
        this.paginationContainer.appendChild(nextLi);
        
        // Bind pagination events
        this.paginationContainer.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target.closest('.page-link') && !e.target.closest('.disabled')) {
                const page = parseInt(e.target.closest('.page-link').dataset.page);
                if (page && page !== this.currentPage) {
                    this.currentPage = page;
                    this.loadUsers();
                }
            }
        });
    }
    
    updatePaginationInfo(pagination) {
        if (!this.paginationInfo) return;
        
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(pagination.page * pagination.limit, pagination.total);
        
        this.paginationInfo.textContent = `Showing ${start}-${end} of ${pagination.total} users`;
    }
    
    updateFilters(filters) {
        this.currentFilters = { ...this.currentFilters, ...filters };
        this.currentPage = 1; // Reset to first page
        this.loadUsers();
    }
    
    refresh() {
        this.loadUsers();
    }
    
    viewUserDetails(email) {
        // Trigger user detail modal
        const event = new CustomEvent('showUserDetail', {
            detail: { email, environmentId: this.currentEnvironmentId }
        });
        document.dispatchEvent(event);
    }
    
    // Utility methods
    getUserInitials(fullname) {
        if (!fullname) return '?';
        return fullname.trim().split(' ')
            .map(name => name.charAt(0))
            .join('')
            .substring(0, 2)
            .toUpperCase();
    }
    
    getUserStatus(status) {
        if (!status || status === '' || status === null) return 'active';
        return status.toLowerCase();
    }
    
    formatRole(role) {
        const roleMap = {
            'pract': 'Practitioner',
            'patient': 'Patient',
            'assist': 'Assistant'
        };
        return roleMap[role] || role;
    }
    
    formatStatus(status) {
        const statusMap = {
            'active': 'Active',
            'inactive': 'Inactive', 
            'locked': 'Locked'
        };
        return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    formatPlan(plan) {
        if (!plan) return 'No Plan';
        return plan.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('pt-BR');
        } catch (error) {
            return 'N/A';
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    handleSort(sortField) {
        // Toggle sort direction if same field, otherwise use ascending
        if (this.currentFilters.sort_field === sortField) {
            this.currentFilters.sort_direction = this.currentFilters.sort_direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentFilters.sort_field = sortField;
            this.currentFilters.sort_direction = 'asc';
        }
        
        // Reset to first page when sorting
        this.currentPage = 1;
        
        // Update filters in userFilters component
        if (window.userFilters) {
            window.userFilters.setFilters({
                sort_field: this.currentFilters.sort_field,
                sort_direction: this.currentFilters.sort_direction
            });
        }
        
        // Load users with new sort
        this.loadUsers();
    }
    
    updateSortIndicators() {
        // Reset all headers
        document.querySelectorAll('.sortable-header').forEach(header => {
            header.classList.remove('sort-active');
            const indicator = header.querySelector('.sort-indicator');
            if (indicator) {
                indicator.className = 'sort-indicator sort-none';
            }
        });
        
        // Set active header
        const activeHeader = document.querySelector(`[data-sort-field="${this.currentFilters.sort_field}"]`);
        if (activeHeader) {
            activeHeader.classList.add('sort-active');
            const indicator = activeHeader.querySelector('.sort-indicator');
            if (indicator) {
                indicator.className = `sort-indicator sort-${this.currentFilters.sort_direction}`;
            }
        }
    }
    
    // Helper methods for status management
    getStatusToggleIcon(status) {
        const currentStatus = this.getUserStatus(status);
        switch (currentStatus) {
            case 'active': return 'pause';
            case 'inactive': return 'play';
            case 'locked': return 'unlock';
            default: return 'pause';
        }
    }
    
    getStatusToggleText(status) {
        const currentStatus = this.getUserStatus(status);
        switch (currentStatus) {
            case 'active': return 'Disable Account';
            case 'inactive': return 'Enable Account';
            case 'locked': return 'Unlock Account';
            default: return 'Disable Account';
        }
    }
    
    async toggleUserStatus(email, currentStatus) {
        if (!this.currentEnvironmentId) {
            this.showNotification('No environment selected', 'error');
            return;
        }
        
        const status = this.getUserStatus(currentStatus);
        const newStatus = status === 'active' ? 'inactive' : 'active';
        const action = newStatus === 'active' ? 'enable' : 'disable';
        
        if (!confirm(`Are you sure you want to ${action} this user account?`)) {
            return;
        }
        
        try {
            const result = await userApi.updateUserStatus(email, this.currentEnvironmentId, newStatus);
            this.showNotification(result.message, 'success');
            this.loadUsers(); // Refresh the list
        } catch (error) {
            console.error('Error toggling user status:', error);
            this.showNotification(`Failed to ${action} user: ${error.message}`, 'error');
        }
    }
    
    async lockUser(email) {
        if (!this.currentEnvironmentId) {
            this.showNotification('No environment selected', 'error');
            return;
        }
        
        const reason = prompt('Enter reason for locking this account (optional):');
        if (reason === null) return; // User cancelled
        
        try {
            const result = await userApi.updateUserStatus(email, this.currentEnvironmentId, 'locked', reason);
            this.showNotification(result.message, 'success');
            this.loadUsers(); // Refresh the list
        } catch (error) {
            console.error('Error locking user:', error);
            this.showNotification(`Failed to lock user: ${error.message}`, 'error');
        }
    }
    
    async resetPassword(email, generateNew = false) {
        if (!this.currentEnvironmentId) {
            this.showNotification('No environment selected', 'error');
            return;
        }
        
        let options = {
            send_email: true,
            force_change: true
        };
        
        if (!generateNew) {
            // Ask for custom password
            const newPassword = prompt('Enter new password (leave empty to generate):');
            if (newPassword === null) return; // User cancelled
            
            if (newPassword && newPassword.length < 8) {
                this.showNotification('Password must be at least 8 characters long', 'error');
                return;
            }
            
            if (newPassword) {
                options.new_password = newPassword;
            }
        }
        
        const action = generateNew ? 'generate a new password' : 'reset password';
        
        if (!confirm(`Are you sure you want to ${action} for this user?`)) {
            return;
        }
        
        try {
            const result = await userApi.resetUserPassword(email, this.currentEnvironmentId, options);
            
            let message = result.message;
            if (result.generated_password) {
                message += `\n\nGenerated Password: ${result.generated_password}`;
                // Copy to clipboard
                navigator.clipboard.writeText(result.generated_password).catch(() => {
                    // Fallback if clipboard API fails
                    console.log('Generated password:', result.generated_password);
                });
                message += '\n(Password copied to clipboard)';
            }
            
            this.showNotification(message, 'success');
        } catch (error) {
            console.error('Error resetting password:', error);
            this.showNotification(`Failed to reset password: ${error.message}`, 'error');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; white-space: pre-line;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 5 seconds (longer for password notifications)
        const timeout = type === 'success' && message.includes('Password') ? 10000 : 5000;
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, timeout);
    }
}

// Create global instance
const userList = new UserList();