// Admin Utility Functions

// Toast notifications
let toastContainer;

function showToast(message, type = 'info', duration = 3000) {
    // Create toast container if it doesn't exist
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            toast.remove();
            // Remove container if empty
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
                toastContainer = null;
            }
        }, 300);
    }, duration);
}

function getToastIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Loading states
let loadingOverlay;

function showLoading(message = 'Loading...') {
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div class="loading"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
    } else {
        loadingOverlay.querySelector('.loading-message').textContent = message;
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.remove();
        loadingOverlay = null;
    }
}

// Format currency
function formatCurrency(cents, currency = 'BRL') {
    const amount = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// Format number
function formatNumber(num) {
    if (!num) return '0';
    return new Intl.NumberFormat('pt-BR').format(num);
}

// Format date
function formatDate(date, format = 'short') {
    if (!date) return '';
    
    const dateObj = new Date(date);
    
    if (format === 'short') {
        return dateObj.toLocaleDateString('pt-BR');
    } else if (format === 'long') {
        return dateObj.toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else if (format === 'relative') {
        return getRelativeTime(dateObj);
    }
}

// Get relative time
function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    
    return formatDate(date);
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal helper
class Modal {
    constructor(options = {}) {
        this.options = {
            title: 'Modal',
            content: '',
            size: 'md', // sm, md, lg, xl
            closeButton: true,
            backdrop: true,
            keyboard: true,
            ...options
        };
        
        this.callbacks = {
            onShow: () => {},
            onHide: () => {},
            onSave: () => {}
        };
        
        this.create();
    }
    
    create() {
        // Create modal element
        this.modal = document.createElement('div');
        this.modal.className = 'modal fade';
        this.modal.setAttribute('tabindex', '-1');
        
        this.modal.innerHTML = `
            <div class="modal-dialog modal-${this.options.size}">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${this.options.title}</h5>
                        ${this.options.closeButton ? 
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' : 
                            ''}
                    </div>
                    <div class="modal-body">
                        ${this.options.content}
                    </div>
                    ${this.options.footer ? 
                        `<div class="modal-footer">${this.options.footer}</div>` : 
                        ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        
        // Initialize Bootstrap modal
        this.bsModal = new bootstrap.Modal(this.modal, {
            backdrop: this.options.backdrop,
            keyboard: this.options.keyboard
        });
        
        // Event listeners
        this.modal.addEventListener('shown.bs.modal', () => this.callbacks.onShow());
        this.modal.addEventListener('hidden.bs.modal', () => {
            this.callbacks.onHide();
            this.destroy();
        });
    }
    
    show() {
        this.bsModal.show();
    }
    
    hide() {
        this.bsModal.hide();
    }
    
    destroy() {
        this.modal.remove();
    }
    
    setContent(content) {
        this.modal.querySelector('.modal-body').innerHTML = content;
    }
    
    on(event, callback) {
        if (this.callbacks[`on${event.charAt(0).toUpperCase() + event.slice(1)}`]) {
            this.callbacks[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = callback;
        }
    }
}

// Confirm dialog
function confirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modal = new Modal({
            title: title,
            content: `<p>${message}</p>`,
            size: 'sm',
            footer: `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="confirm-btn">Confirm</button>
            `
        });
        
        modal.show();
        
        const confirmBtn = modal.modal.querySelector('#confirm-btn');
        confirmBtn.addEventListener('click', () => {
            modal.hide();
            resolve(true);
        });
        
        modal.on('hide', () => resolve(false));
    });
}

// Copy to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy', 'error');
        });
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            showToast('Failed to copy', 'error');
        }
        
        document.body.removeChild(textarea);
    }
}

// Export functions for use in other scripts
window.adminUtils = {
    showToast,
    showLoading,
    hideLoading,
    formatCurrency,
    formatNumber,
    formatDate,
    debounce,
    Modal,
    confirmDialog,
    copyToClipboard
};

// Add loading overlay styles
const style = document.createElement('style');
style.textContent = `
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    }
    
    .loading-content {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        text-align: center;
    }
    
    .loading-message {
        margin-top: 1rem;
        margin-bottom: 0;
    }
    
    @keyframes slideOut {
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);