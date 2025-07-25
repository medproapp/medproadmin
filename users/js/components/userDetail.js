/**
 * User Detail Modal Component
 * Handles displaying detailed user information in a modal
 */

class UserDetail {
    constructor() {
        this.modalElement = null;
        this.modal = null;
        this.currentUser = null;
        this.currentEnvironmentId = null;
        
        this.initializeModal();
        this.bindEvents();
    }
    
    initializeModal() {
        // Check if modal already exists
        this.modalElement = document.getElementById('userDetailModal');
        
        if (!this.modalElement) {
            // Create modal HTML
            this.createModalHTML();
            // Wait for DOM insertion to complete
            setTimeout(() => {
                this.modalElement = document.getElementById('userDetailModal');
                if (this.modalElement) {
                    this.modal = new bootstrap.Modal(this.modalElement);
                    this.initializeElements();
                }
            }, 10);
        } else {
            // Modal already exists
            this.modal = new bootstrap.Modal(this.modalElement);
            this.initializeElements();
        }
    }
    
    createModalHTML() {
        const modalHTML = `
            <div class="modal fade" id="userDetailModal" tabindex="-1" aria-labelledby="userDetailModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="userDetailModalLabel">
                                <i class="fas fa-user"></i> User Details
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Loading State -->
                            <div id="userDetailLoading" class="text-center py-4">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                                <p class="text-muted mt-2">Loading user details...</p>
                            </div>
                            
                            <!-- Error State -->
                            <div id="userDetailError" class="alert alert-danger d-none" role="alert">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span id="userDetailErrorMessage">Error loading user details</span>
                            </div>
                            
                            <!-- User Details Content -->
                            <div id="userDetailContent" class="d-none">
                                <!-- User Header -->
                                <div class="user-detail-header">
                                    <div class="user-detail-avatar" id="userDetailAvatar">
                                        <!-- User initials will be inserted here -->
                                    </div>
                                    <div class="user-detail-info">
                                        <h4 id="userDetailName"><!-- User name --></h4>
                                        <p class="text-muted mb-0" id="userDetailEmail"><!-- User email --></p>
                                        <div class="mt-2">
                                            <span id="userDetailRole" class="role-badge"><!-- Role --></span>
                                            <span id="userDetailStatus" class="status-badge ms-2"><!-- Status --></span>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Basic Information -->
                                <div class="detail-section">
                                    <h6><i class="fas fa-info-circle"></i> Basic Information</h6>
                                    <div class="detail-row">
                                        <span class="detail-label">Full Name:</span>
                                        <span class="detail-value" id="detailFullName">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value" id="detailEmail">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Role:</span>
                                        <span class="detail-value" id="detailRole">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Status:</span>
                                        <span class="detail-value" id="detailStatus">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Plan:</span>
                                        <span class="detail-value" id="detailPlan">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Admin Access:</span>
                                        <span class="detail-value" id="detailAdmin">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">AI Enabled:</span>
                                        <span class="detail-value" id="detailAiEnabled">-</span>
                                    </div>
                                </div>
                                
                                <!-- Account Information -->
                                <div class="detail-section">
                                    <h6><i class="fas fa-calendar-alt"></i> Account Information</h6>
                                    <div class="detail-row">
                                        <span class="detail-label">Activated Date:</span>
                                        <span class="detail-value" id="detailActivateDate">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">First Login:</span>
                                        <span class="detail-value" id="detailFirstLogin">-</span>
                                    </div>
                                </div>
                                
                                <!-- Practitioner Information (shown only for practitioners) -->
                                <div class="detail-section" id="practitionerSection" style="display: none;">
                                    <h6><i class="fas fa-user-md"></i> Practitioner Information</h6>
                                    <div class="detail-row">
                                        <span class="detail-label">Title:</span>
                                        <span class="detail-value" id="detailTitle">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Specialty:</span>
                                        <span class="detail-value" id="detailSpecialty">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Registration Number:</span>
                                        <span class="detail-value" id="detailRegistrationNumber">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Phone:</span>
                                        <span class="detail-value" id="detailPhone">-</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Address:</span>
                                        <span class="detail-value" id="detailAddress">-</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    initializeElements() {
        // Loading/Error elements
        this.loadingElement = document.getElementById('userDetailLoading');
        this.errorElement = document.getElementById('userDetailError');
        this.errorMessageElement = document.getElementById('userDetailErrorMessage');
        this.contentElement = document.getElementById('userDetailContent');
        
        // Header elements
        this.avatarElement = document.getElementById('userDetailAvatar');
        this.nameElement = document.getElementById('userDetailName');
        this.emailElement = document.getElementById('userDetailEmail');
        this.roleElement = document.getElementById('userDetailRole');
        this.statusElement = document.getElementById('userDetailStatus');
        
        // Basic info elements
        this.detailFullName = document.getElementById('detailFullName');
        this.detailEmail = document.getElementById('detailEmail');
        this.detailRole = document.getElementById('detailRole');
        this.detailStatus = document.getElementById('detailStatus');
        this.detailPlan = document.getElementById('detailPlan');
        this.detailAdmin = document.getElementById('detailAdmin');
        this.detailAiEnabled = document.getElementById('detailAiEnabled');
        
        // Account info elements
        this.detailActivateDate = document.getElementById('detailActivateDate');
        this.detailFirstLogin = document.getElementById('detailFirstLogin');
        
        // Practitioner elements
        this.practitionerSection = document.getElementById('practitionerSection');
        this.detailTitle = document.getElementById('detailTitle');
        this.detailSpecialty = document.getElementById('detailSpecialty');
        this.detailRegistrationNumber = document.getElementById('detailRegistrationNumber');
        this.detailPhone = document.getElementById('detailPhone');
        this.detailAddress = document.getElementById('detailAddress');
    }
    
    bindEvents() {
        // Listen for show user detail events
        document.addEventListener('showUserDetail', (e) => {
            const { email, environmentId } = e.detail;
            this.showUserDetail(email, environmentId);
        });
    }
    
    async showUserDetail(email, environmentId) {
        this.currentEnvironmentId = environmentId;
        this.modal.show();
        
        try {
            this.showLoading();
            
            const userData = await userApi.getUserDetails(email, environmentId);
            this.currentUser = userData.user;
            
            this.renderUserDetail(userData.user);
            this.showContent();
            
        } catch (error) {
            console.error('Error loading user details:', error);
            this.showError(error.message);
        }
    }
    
    showLoading() {
        this.loadingElement?.classList.remove('d-none');
        this.errorElement?.classList.add('d-none');
        this.contentElement?.classList.add('d-none');
    }
    
    showError(message) {
        this.loadingElement?.classList.add('d-none');
        this.errorElement?.classList.remove('d-none');
        this.contentElement?.classList.add('d-none');
        
        if (this.errorMessageElement) {
            this.errorMessageElement.textContent = message;
        }
    }
    
    showContent() {
        this.loadingElement?.classList.add('d-none');
        this.errorElement?.classList.add('d-none');
        this.contentElement?.classList.remove('d-none');
    }
    
    renderUserDetail(user) {
        // Header section
        if (this.avatarElement) {
            this.avatarElement.textContent = this.getUserInitials(user.fullname);
        }
        
        if (this.nameElement) {
            this.nameElement.textContent = user.fullname || 'N/A';
        }
        
        if (this.emailElement) {
            this.emailElement.textContent = user.email;
        }
        
        if (this.roleElement) {
            this.roleElement.className = `role-badge role-${user.role}`;
            this.roleElement.textContent = this.formatRole(user.role);
        }
        
        if (this.statusElement) {
            const status = this.getUserStatus(user.status);
            this.statusElement.className = `status-badge status-${status}`;
            this.statusElement.textContent = this.formatStatus(status);
        }
        
        // Basic information
        this.setText(this.detailFullName, user.fullname || 'N/A');
        this.setText(this.detailEmail, user.email);
        this.setText(this.detailRole, this.formatRole(user.role));
        this.setText(this.detailStatus, this.formatStatus(this.getUserStatus(user.status)));
        this.setText(this.detailPlan, this.formatPlan(user.plan));
        this.setText(this.detailAdmin, user.admin ? 'Yes' : 'No');
        this.setText(this.detailAiEnabled, user.ai_enabled ? 'Yes' : 'No');
        
        // Account information
        this.setText(this.detailActivateDate, this.formatDate(user.activatedate));
        this.setText(this.detailFirstLogin, this.formatDate(user.first_login));
        
        // Practitioner information (only show for practitioners)
        if (user.role === 'pract' && user.practitioner) {
            if (this.practitionerSection) {
                this.practitionerSection.style.display = 'block';
            }
            
            const p = user.practitioner;
            this.setText(this.detailTitle, p.title || 'N/A');
            this.setText(this.detailSpecialty, p.specialty || 'N/A');
            this.setText(this.detailRegistrationNumber, p.registrationnumber || 'N/A');
            this.setText(this.detailPhone, p.phone || 'N/A');
            
            // Format address
            let address = 'N/A';
            if (p.address1 || p.address2 || p.city || p.state || p.zipcode) {
                const addressParts = [
                    p.address1,
                    p.address2,
                    p.city,
                    p.state,
                    p.zipcode
                ].filter(part => part && part.trim() !== '');
                
                if (addressParts.length > 0) {
                    address = addressParts.join(', ');
                }
            }
            this.setText(this.detailAddress, address);
        } else {
            if (this.practitionerSection) {
                this.practitionerSection.style.display = 'none';
            }
        }
    }
    
    setText(element, text) {
        if (element) {
            element.textContent = text || 'N/A';
        }
    }
    
    // Utility methods (same as UserList)
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
        return status.charAt(0).toUpperCase() + status.slice(1);
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
}

// Create global instance
const userDetail = new UserDetail();