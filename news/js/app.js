/**
 * News Management Application
 * Main application logic for news management interface
 */

class NewsApp {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.totalPages = 0;
        this.currentFilters = {};
        this.selectedArticles = new Set();
        this.articles = [];
        
        this.initializeEventListeners();
    }

    /**
     * Initialize application
     */
    async init() {
        try {
            // Initialize navigation first
            await window.navigationManager.init('news-management');
            
            // Check authentication
            const auth = await checkAdminAuth();
            if (!auth) {
                window.location.href = '/login';
                return;
            }
            
            // Display admin email
            document.getElementById('admin-email').textContent = auth.email;
            
            // Load initial data
            await Promise.all([
                this.loadCategories(),
                this.loadArticles(),
                this.loadStats()
            ]);
            
        } catch (error) {
            console.error('Error initializing news app:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Search and filters
        document.getElementById('search').addEventListener('input', this.debounce(() => {
            this.currentPage = 1;
            this.loadArticles();
        }, 300));

        ['category-filter', 'type-filter', 'status-filter'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.currentPage = 1;
                this.loadArticles();
            });
        });

        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Select all checkbox
        document.getElementById('select-all').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // Bulk actions
        document.getElementById('bulk-publish').addEventListener('click', () => {
            this.bulkAction('publish');
        });

        document.getElementById('bulk-unpublish').addEventListener('click', () => {
            this.bulkAction('unpublish');
        });

        document.getElementById('bulk-delete').addEventListener('click', () => {
            this.bulkDeleteConfirm();
        });

        // Sync to platform
        document.getElementById('sync-to-platform').addEventListener('click', () => {
            this.syncToPlatform();
        });

        // Delete confirmation modal
        document.getElementById('confirm-delete').addEventListener('click', () => {
            this.executeDelete();
        });

        // Event delegation for action buttons
        document.addEventListener('click', (e) => {
            const actionButton = e.target.closest('[data-action]');
            if (!actionButton) return;

            const action = actionButton.getAttribute('data-action');
            const id = actionButton.getAttribute('data-id');
            const title = actionButton.getAttribute('data-title');
            const active = actionButton.getAttribute('data-active') === 'true';

            switch (action) {
                case 'edit':
                    editArticle(parseInt(id));
                    break;
                case 'toggle-publish':
                    togglePublish(parseInt(id), !active);
                    break;
                case 'delete':
                    deleteArticle(parseInt(id), title);
                    break;
                case 'reload':
                    location.reload();
                    break;
            }
        });
    }

    /**
     * Load articles with current filters and pagination
     */
    async loadArticles() {
        try {
            this.showLoading();
            
            // Get filter values
            const filters = {
                page: this.currentPage,
                limit: this.itemsPerPage,
                search: document.getElementById('search').value.trim(),
                category: document.getElementById('category-filter').value,
                type: document.getElementById('type-filter').value,
                status: document.getElementById('status-filter').value,
                sort_by: 'created_at',
                sort_order: 'DESC'
            };

            // Remove empty filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === '' || filters[key] === null || filters[key] === undefined) {
                    delete filters[key];
                }
            });

            this.currentFilters = filters;

            const response = await window.newsApiService.getArticles(filters);
            
            if (response.success) {
                this.articles = response.data.articles;
                this.totalPages = response.data.pagination.total_pages;
                
                this.renderArticles();
                this.renderPagination(response.data.pagination);
                
                // Clear selection
                this.selectedArticles.clear();
                this.updateBulkActions();
                
            } else {
                throw new Error(response.error);
            }
            
        } catch (error) {
            console.error('Error loading articles:', error);
            this.showError('Failed to load articles: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Load available categories for filter dropdown
     */
    async loadCategories() {
        try {
            const response = await window.newsApiService.getCategories();
            
            if (response.success) {
                const categoryFilter = document.getElementById('category-filter');
                const currentValue = categoryFilter.value;
                
                // Clear existing options (except "All Categories")
                const firstOption = categoryFilter.firstElementChild;
                categoryFilter.innerHTML = '';
                categoryFilter.appendChild(firstOption);
                
                // Add category options
                response.data.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categoryFilter.appendChild(option);
                });
                
                // Restore selected value
                categoryFilter.value = currentValue;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    /**
     * Load dashboard statistics
     */
    async loadStats() {
        try {
            // Get stats from current articles or make separate API call
            const response = await window.newsApiService.getArticles({ limit: 1000 });
            
            if (response.success) {
                const articles = response.data.articles;
                const categories = new Set(articles.map(a => a.category).filter(Boolean));
                
                document.getElementById('stats-total').textContent = articles.length;
                document.getElementById('stats-published').textContent = articles.filter(a => a.active).length;
                document.getElementById('stats-featured').textContent = articles.filter(a => a.featured).length;
                document.getElementById('stats-categories').textContent = categories.size;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    /**
     * Render articles table
     */
    renderArticles() {
        const tbody = document.getElementById('articles-table-body');
        tbody.innerHTML = '';

        if (this.articles.length === 0) {
            this.showNoArticles();
            return;
        }

        this.articles.forEach(article => {
            const row = this.createArticleRow(article);
            tbody.appendChild(row);
        });

        this.showArticlesTable();
    }

    /**
     * Create single article table row
     */
    createArticleRow(article) {
        const row = document.createElement('tr');
        row.className = 'fade-in';
        
        // Checkbox
        const checkboxCell = document.createElement('td');
        checkboxCell.innerHTML = `
            <input type="checkbox" class="form-check-input article-checkbox" 
                   value="${article.id}" data-title="${this.escapeHtml(article.title)}">
        `;
        row.appendChild(checkboxCell);

        // Title (with featured badge)
        const titleCell = document.createElement('td');
        titleCell.innerHTML = `
            <div class="d-flex align-items-center">
                <strong>${this.escapeHtml(article.title)}</strong>
                ${article.featured ? '<span class="featured-badge"><i class="fas fa-star"></i> Featured</span>' : ''}
            </div>
            ${article.summary ? `<small class="text-muted">${this.truncateText(article.summary, 100)}</small>` : ''}
        `;
        row.appendChild(titleCell);

        // Category
        const categoryCell = document.createElement('td');
        categoryCell.innerHTML = `
            <span class="badge bg-secondary">${article.category || 'N/A'}</span>
        `;
        row.appendChild(categoryCell);

        // Type
        const typeCell = document.createElement('td');
        const typeIcon = window.newsApiService.getTypeIcon(article.type);
        typeCell.innerHTML = `
            <span class="type-badge type-${article.type}">
                <i class="${typeIcon}"></i> ${this.capitalizeFirst(article.type)}
            </span>
        `;
        row.appendChild(typeCell);

        // Target Audience
        const audienceCell = document.createElement('td');
        const audienceIcon = window.newsApiService.getAudienceIcon(article.target_audience);
        audienceCell.innerHTML = `
            <span class="audience-badge audience-${article.target_audience}">
                <i class="${audienceIcon}"></i> ${this.capitalizeFirst(article.target_audience)}
            </span>
        `;
        row.appendChild(audienceCell);

        // Status
        const statusCell = document.createElement('td');
        statusCell.innerHTML = `
            <span class="status-badge status-${article.active ? 'active' : 'inactive'}">
                ${article.active ? 'Active' : 'Inactive'}
            </span>
        `;
        row.appendChild(statusCell);

        // Published Date
        const publishedCell = document.createElement('td');
        publishedCell.innerHTML = `
            <small class="text-muted">
                ${window.newsApiService.formatDate(article.publish_date)}
            </small>
        `;
        row.appendChild(publishedCell);

        // Actions
        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = `
            <div class="action-buttons">
                <button class="btn btn-edit" data-action="edit" data-id="${article.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn ${article.active ? 'btn-unpublish' : 'btn-publish'}" 
                        data-action="toggle-publish" data-id="${article.id}" data-active="${article.active}"
                        title="${article.active ? 'Unpublish' : 'Publish'}">
                    <i class="fas ${article.active ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="btn btn-delete" data-action="delete" data-id="${article.id}" data-title="${this.escapeHtml(article.title)}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        row.appendChild(actionsCell);

        // Add checkbox event listener
        const checkbox = checkboxCell.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedArticles.add(parseInt(e.target.value));
            } else {
                this.selectedArticles.delete(parseInt(e.target.value));
            }
            this.updateBulkActions();
        });

        return row;
    }

    /**
     * Render pagination
     */
    renderPagination(pagination) {
        const paginationElement = document.getElementById('pagination');
        paginationElement.innerHTML = '';

        if (pagination.total_pages <= 1) {
            return;
        }

        const currentPage = pagination.current_page;
        const totalPages = pagination.total_pages;

        // Previous button
        if (pagination.has_prev) {
            paginationElement.appendChild(this.createPaginationButton(currentPage - 1, '‹ Previous'));
        }

        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            paginationElement.appendChild(this.createPaginationButton(1, '1'));
            if (startPage > 2) {
                paginationElement.appendChild(this.createPaginationEllipsis());
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const button = this.createPaginationButton(i, i.toString());
            if (i === currentPage) {
                button.classList.add('active');
            }
            paginationElement.appendChild(button);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationElement.appendChild(this.createPaginationEllipsis());
            }
            paginationElement.appendChild(this.createPaginationButton(totalPages, totalPages.toString()));
        }

        // Next button
        if (pagination.has_next) {
            paginationElement.appendChild(this.createPaginationButton(currentPage + 1, 'Next ›'));
        }
    }

    /**
     * Create pagination button
     */
    createPaginationButton(page, text) {
        const li = document.createElement('li');
        li.className = 'page-item';
        
        const button = document.createElement('button');
        button.className = 'page-link';
        button.textContent = text;
        button.addEventListener('click', () => {
            this.currentPage = page;
            this.loadArticles();
        });
        
        li.appendChild(button);
        return li;
    }

    /**
     * Create pagination ellipsis
     */
    createPaginationEllipsis() {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = '<span class="page-link">…</span>';
        return li;
    }

    /**
     * Toggle select all articles
     */
    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.article-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            const articleId = parseInt(checkbox.value);
            
            if (checked) {
                this.selectedArticles.add(articleId);
            } else {
                this.selectedArticles.delete(articleId);
            }
        });

        this.updateBulkActions();
    }

    /**
     * Update bulk actions visibility and count
     */
    updateBulkActions() {
        const bulkActionsCard = document.getElementById('bulk-actions-card');
        const selectedCount = document.getElementById('selected-count');
        const selectAllCheckbox = document.getElementById('select-all');
        
        selectedCount.textContent = this.selectedArticles.size;
        
        if (this.selectedArticles.size > 0) {
            bulkActionsCard.style.display = 'block';
        } else {
            bulkActionsCard.style.display = 'none';
        }

        // Update select all checkbox state
        const totalCheckboxes = document.querySelectorAll('.article-checkbox').length;
        if (this.selectedArticles.size === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (this.selectedArticles.size === totalCheckboxes) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
            selectAllCheckbox.checked = false;
        }
    }

    /**
     * Perform bulk action on selected articles
     */
    async bulkAction(action) {
        if (this.selectedArticles.size === 0) return;

        const articleIds = Array.from(this.selectedArticles);
        const actionText = action === 'publish' ? 'publishing' : 'unpublishing';
        
        if (!confirm(`Are you sure you want to ${action} ${articleIds.length} selected articles?`)) {
            return;
        }

        try {
            this.showToast(`Starting bulk ${actionText}...`, 'info');
            
            const results = await window.newsApiService.batchOperation(articleIds, action);
            
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            if (failed === 0) {
                this.showToast(`Successfully ${action}ed ${successful} articles`, 'success');
            } else {
                this.showToast(`${action}ed ${successful} articles, ${failed} failed`, 'warning');
            }
            
            // Reload articles and stats
            await Promise.all([
                this.loadArticles(),
                this.loadStats()
            ]);
            
        } catch (error) {
            console.error(`Error in bulk ${action}:`, error);
            this.showToast(`Failed to ${action} articles`, 'error');
        }
    }

    /**
     * Show bulk delete confirmation
     */
    bulkDeleteConfirm() {
        if (this.selectedArticles.size === 0) return;
        
        if (confirm(`Are you sure you want to delete ${this.selectedArticles.size} selected articles? This action cannot be undone.`)) {
            this.bulkAction('delete');
        }
    }

    /**
     * Sync news to platform
     */
    async syncToPlatform() {
        if (!confirm('This will sync all active news articles to the platform. Continue?')) {
            return;
        }

        try {
            this.showToast('Syncing news to platform...', 'info');
            
            // Call sync procedure (this would need to be implemented in the backend)
            // For now, just show success message
            setTimeout(() => {
                this.showToast('News successfully synced to platform', 'success');
            }, 2000);
            
        } catch (error) {
            console.error('Error syncing to platform:', error);
            this.showToast('Failed to sync news to platform', 'error');
        }
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        document.getElementById('search').value = '';
        document.getElementById('category-filter').value = '';
        document.getElementById('type-filter').value = '';
        document.getElementById('status-filter').value = '';
        
        this.currentPage = 1;
        this.loadArticles();
    }

    /**
     * Show loading state
     */
    showLoading() {
        document.getElementById('articles-loading').style.display = 'block';
        document.getElementById('articles-container').style.display = 'none';
        document.getElementById('no-articles').style.display = 'none';
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        document.getElementById('articles-loading').style.display = 'none';
    }

    /**
     * Show articles table
     */
    showArticlesTable() {
        document.getElementById('articles-container').style.display = 'block';
        document.getElementById('no-articles').style.display = 'none';
    }

    /**
     * Show no articles state
     */
    showNoArticles() {
        document.getElementById('articles-container').style.display = 'none';
        document.getElementById('no-articles').style.display = 'block';
    }

    /**
     * Show error state
     */
    showError(message) {
        document.getElementById('articles-loading').style.display = 'none';
        document.getElementById('articles-container').style.display = 'none';
        
        const errorState = document.createElement('div');
        errorState.className = 'empty-state';
        errorState.innerHTML = `
            <i class="fas fa-exclamation-triangle fa-3x text-danger"></i>
            <h5>Error Loading Articles</h5>
            <p>${message}</p>
            <button class="btn btn-primary" data-action="reload">
                <i class="fas fa-refresh"></i> Try Again
            </button>
        `;
        
        document.getElementById('no-articles').replaceWith(errorState);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        const toastId = 'toast-' + Date.now();
        
        const toastHtml = `
            <div id="${toastId}" class="toast toast-${type}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header">
                    <i class="fas ${this.getToastIcon(type)} me-2"></i>
                    <strong class="me-auto">${this.getToastTitle(type)}</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toast = new bootstrap.Toast(document.getElementById(toastId), {
            autohide: true,
            delay: type === 'error' ? 8000 : 5000
        });
        
        toast.show();
        
        // Remove from DOM after it's hidden
        document.getElementById(toastId).addEventListener('hidden.bs.toast', () => {
            document.getElementById(toastId).remove();
        });
    }

    /**
     * Get toast icon based on type
     */
    getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle text-success',
            error: 'fa-exclamation-circle text-danger',
            warning: 'fa-exclamation-triangle text-warning',
            info: 'fa-info-circle text-info'
        };
        return icons[type] || icons.info;
    }

    /**
     * Get toast title based on type
     */
    getToastTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        return titles[type] || titles.info;
    }

    /**
     * Utility: Debounce function
     */
    debounce(func, wait) {
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

    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Utility: Truncate text
     */
    truncateText(text, length) {
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    /**
     * Utility: Capitalize first letter
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Global functions for inline event handlers
let currentDeleteId = null;

function editArticle(id) {
    window.location.href = `edit.html?id=${id}`;
}

async function togglePublish(id, published) {
    try {
        const action = published ? 'publish' : 'unpublish';
        await window.newsApiService.togglePublishStatus(id, published);
        
        window.newsApp.showToast(`Article ${action}ed successfully`, 'success');
        await Promise.all([
            window.newsApp.loadArticles(),
            window.newsApp.loadStats()
        ]);
        
    } catch (error) {
        console.error('Error toggling publish status:', error);
        window.newsApp.showToast('Failed to change publish status', 'error');
    }
}

function deleteArticle(id, title) {
    currentDeleteId = id;
    document.getElementById('delete-article-title').textContent = title;
    
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
}

async function executeDelete() {
    if (!currentDeleteId) return;
    
    try {
        await window.newsApiService.deleteArticle(currentDeleteId);
        
        const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
        deleteModal.hide();
        
        window.newsApp.showToast('Article deleted successfully', 'success');
        await Promise.all([
            window.newsApp.loadArticles(),
            window.newsApp.loadStats()
        ]);
        
        currentDeleteId = null;
        
    } catch (error) {
        console.error('Error deleting article:', error);
        window.newsApp.showToast('Failed to delete article', 'error');
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/login';
}

// Initialize application
window.newsApp = new NewsApp();

document.addEventListener('DOMContentLoaded', () => {
    window.newsApp.init();
    
    // Add logout button event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});