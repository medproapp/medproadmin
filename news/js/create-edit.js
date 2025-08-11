/**
 * News Article Create/Edit Application
 * Handles creation and editing of news articles
 */

class NewsEditorApp {
    constructor() {
        this.isEditMode = false;
        this.articleId = null;
        this.currentArticle = null;
        this.isDirty = false;
        
        this.initializeEditor();
        this.initializeEventListeners();
    }

    /**
     * Initialize application
     */
    async init() {
        try {
            // Initialize navigation
            const pageName = this.isEditMode ? 'news-edit' : 'news-create';
            await window.navigationManager.init(pageName);
            
            // Check authentication
            const auth = await checkAdminAuth();
            if (!auth) {
                window.location.href = '/login';
                return;
            }
            
            // Display admin email
            document.getElementById('admin-email').textContent = auth.email;
            
            // Check if we're in edit mode
            const urlParams = new URLSearchParams(window.location.search);
            this.articleId = urlParams.get('id');
            
            if (this.articleId) {
                this.isEditMode = true;
                await this.loadArticleForEdit(this.articleId);
            } else {
                this.isEditMode = false;
                this.initializeForCreate();
            }
            
        } catch (error) {
            console.error('Error initializing news editor:', error);
            this.showToast('Failed to initialize editor', 'error');
        }
    }

    /**
     * Initialize rich text editor
     */
    initializeEditor() {
        const editorContent = document.getElementById('content-editor');
        const contentTextarea = document.getElementById('content');
        
        // Initialize with placeholder text for create mode
        if (!this.isEditMode) {
            editorContent.innerHTML = '<p>Start writing your article content here...</p>';
        }
        
        // Sync editor content with hidden textarea
        editorContent.addEventListener('input', () => {
            contentTextarea.value = editorContent.innerHTML;
            this.isDirty = true;
            this.updatePreview();
        });

        // Handle toolbar buttons
        document.querySelectorAll('[data-command]').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const command = button.getAttribute('data-command');
                this.executeEditorCommand(command);
            });
        });
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Form input changes
        document.querySelectorAll('#article-form input, #article-form select, #article-form textarea').forEach(element => {
            element.addEventListener('change', () => {
                this.isDirty = true;
                this.updatePreview();
                this.updatePublishStatus();
            });
            
            element.addEventListener('input', () => {
                this.isDirty = true;
                this.updatePreview();
            });
        });

        // Save button
        document.getElementById('save-btn').addEventListener('click', () => {
            this.saveArticle();
        });

        // Quick action buttons
        document.getElementById('save-draft-btn').addEventListener('click', () => {
            this.saveAsDraft();
        });

        document.getElementById('publish-now-btn').addEventListener('click', () => {
            this.publishNow();
        });

        document.getElementById('schedule-publish-btn').addEventListener('click', () => {
            this.schedulePublish();
        });

        // Preview button
        document.getElementById('preview-btn').addEventListener('click', () => {
            this.togglePreview();
        });

        // Image upload
        document.getElementById('upload-image-btn').addEventListener('click', () => {
            document.getElementById('image-file').click();
        });

        document.getElementById('image-file').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.uploadImage(e.target.files[0]);
            }
        });

        // Image URL preview
        document.getElementById('image_url').addEventListener('change', () => {
            this.updateImagePreview();
        });

        // Delete button (edit mode only)
        const deleteBtn = document.getElementById('delete-article-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteArticle();
            });
        }

        // Warn about unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    /**
     * Initialize for create mode
     */
    initializeForCreate() {
        document.getElementById('loading-article')?.style.setProperty('display', 'none');
        document.getElementById('edit-form-container')?.style.setProperty('display', 'block');
        
        // Set default values
        document.getElementById('active').checked = true;
        document.getElementById('type').value = 'update';
        document.getElementById('target_audience').value = 'all';
        
        // Update status display
        this.updatePublishStatus();
        this.updatePreview();
        
        // Show the form container for create mode
        const createContainer = document.querySelector('.admin-content > div:not(#loading-article):not(#article-not-found)');
        if (createContainer) {
            createContainer.style.display = 'block';
        }
    }

    /**
     * Load article data for edit mode
     */
    async loadArticleForEdit(articleId) {
        try {
            const response = await window.newsApiService.getArticle(articleId);
            
            if (response.success) {
                this.currentArticle = response.data.article;
                this.populateForm(this.currentArticle);
                
                // Show edit form
                document.getElementById('loading-article').style.display = 'none';
                document.getElementById('edit-form-container').style.display = 'block';
                
                this.updatePublishStatus();
                this.updatePreview();
                this.updateImagePreview();
                
            } else {
                throw new Error(response.error);
            }
            
        } catch (error) {
            console.error('Error loading article:', error);
            document.getElementById('loading-article').style.display = 'none';
            document.getElementById('article-not-found').style.display = 'block';
        }
    }

    /**
     * Populate form with article data
     */
    populateForm(article) {
        // Basic fields
        document.getElementById('title').value = article.title || '';
        document.getElementById('summary').value = article.summary || '';
        document.getElementById('category').value = article.category || '';
        document.getElementById('type').value = article.type || 'update';
        document.getElementById('target_audience').value = article.target_audience || 'all';
        
        // Content
        const editorContent = document.getElementById('content-editor');
        editorContent.innerHTML = article.content || '<p>Start writing your article content here...</p>';
        document.getElementById('content').value = article.content || '';
        
        // Publishing options
        document.getElementById('featured').checked = article.featured || false;
        document.getElementById('active').checked = article.active || false;
        
        // Dates
        if (article.publish_date) {
            document.getElementById('publish_date').value = this.formatDateForInput(article.publish_date);
        }
        if (article.expiry_date) {
            document.getElementById('expiry_date').value = this.formatDateForInput(article.expiry_date);
        }
        
        // Links and media
        document.getElementById('link_url').value = article.link_url || '';
        document.getElementById('link_text').value = article.link_text || '';
        document.getElementById('image_url').value = article.image_url || '';
    }

    /**
     * Execute editor command
     */
    executeEditorCommand(command) {
        const editorContent = document.getElementById('content-editor');
        
        if (command === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) {
                document.execCommand(command, false, url);
            }
        } else {
            document.execCommand(command, false, null);
        }
        
        editorContent.focus();
        
        // Sync with textarea
        document.getElementById('content').value = editorContent.innerHTML;
        this.isDirty = true;
        this.updatePreview();
    }

    /**
     * Get form data
     */
    getFormData() {
        const form = document.getElementById('article-form');
        const formData = new FormData(form);
        const data = {};
        
        // Convert FormData to object
        for (const [key, value] of formData.entries()) {
            if (key === 'featured' || key === 'active') {
                data[key] = document.getElementById(key).checked;
            } else if (value.trim() !== '') {
                data[key] = value.trim();
            }
        }
        
        // Get content from editor
        data.content = document.getElementById('content').value;
        
        // Handle empty dates
        if (!data.publish_date) delete data.publish_date;
        if (!data.expiry_date) delete data.expiry_date;
        
        return data;
    }

    /**
     * Validate form data
     */
    validateForm() {
        const data = this.getFormData();
        const validation = window.newsApiService.validateArticleData(data);
        
        // Clear previous validation errors
        document.querySelectorAll('.is-invalid').forEach(el => {
            el.classList.remove('is-invalid');
        });
        
        // Show validation errors
        if (!validation.isValid) {
            validation.errors.forEach(error => {
                console.error('Validation error:', error);
            });
            
            // Highlight first error field
            if (validation.errors.some(e => e.includes('Title'))) {
                document.getElementById('title').classList.add('is-invalid');
            }
            
            this.showToast('Please fix validation errors: ' + validation.errors.join(', '), 'error');
        }
        
        return validation;
    }

    /**
     * Save article
     */
    async saveArticle() {
        try {
            const validation = this.validateForm();
            if (!validation.isValid) return;
            
            const data = this.getFormData();
            const saveBtn = document.getElementById('save-btn');
            const originalText = saveBtn.innerHTML;
            
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;
            
            let response;
            if (this.isEditMode && this.articleId) {
                response = await window.newsApiService.updateArticle(this.articleId, data);
            } else {
                response = await window.newsApiService.createArticle(data);
            }
            
            if (response.success) {
                this.isDirty = false;
                this.showToast(`Article ${this.isEditMode ? 'updated' : 'created'} successfully`, 'success');
                
                // Redirect to edit mode if created
                if (!this.isEditMode && response.data.id) {
                    setTimeout(() => {
                        window.location.href = `edit.html?id=${response.data.id}`;
                    }, 1000);
                } else {
                    // Reload current article data
                    if (this.articleId) {
                        await this.loadArticleForEdit(this.articleId);
                    }
                }
            } else {
                throw new Error(response.error);
            }
            
        } catch (error) {
            console.error('Error saving article:', error);
            this.showToast('Failed to save article: ' + error.message, 'error');
        } finally {
            const saveBtn = document.getElementById('save-btn');
            saveBtn.innerHTML = this.isEditMode ? '<i class="fas fa-save"></i> Update Article' : '<i class="fas fa-save"></i> Create Article';
            saveBtn.disabled = false;
        }
    }

    /**
     * Save as draft
     */
    async saveAsDraft() {
        // Set active to false for draft
        document.getElementById('active').checked = false;
        await this.saveArticle();
    }

    /**
     * Publish now
     */
    async publishNow() {
        // Set active to true and clear publish date for immediate publishing
        document.getElementById('active').checked = true;
        document.getElementById('publish_date').value = '';
        await this.saveArticle();
    }

    /**
     * Schedule publish
     */
    schedulePublish() {
        const publishDate = document.getElementById('publish_date').value;
        if (!publishDate) {
            this.showToast('Please set a publish date first', 'warning');
            document.getElementById('publish_date').focus();
            return;
        }
        
        document.getElementById('active').checked = true;
        this.saveArticle();
    }

    /**
     * Delete article (edit mode only)
     */
    async deleteArticle() {
        if (!this.isEditMode || !this.articleId) return;
        
        const title = this.currentArticle?.title || 'this article';
        if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            await window.newsApiService.deleteArticle(this.articleId);
            this.showToast('Article deleted successfully', 'success');
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            
        } catch (error) {
            console.error('Error deleting article:', error);
            this.showToast('Failed to delete article: ' + error.message, 'error');
        }
    }

    /**
     * Upload image
     */
    async uploadImage(file) {
        try {
            const uploadBtn = document.getElementById('upload-image-btn');
            const originalText = uploadBtn.innerHTML;
            
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            uploadBtn.disabled = true;
            
            const response = await window.newsApiService.uploadImage(file);
            
            if (response.success) {
                document.getElementById('image_url').value = response.data.url;
                this.updateImagePreview();
                this.isDirty = true;
                this.showToast('Image uploaded successfully', 'success');
            } else {
                throw new Error(response.error);
            }
            
        } catch (error) {
            console.error('Error uploading image:', error);
            this.showToast('Failed to upload image: ' + error.message, 'error');
        } finally {
            const uploadBtn = document.getElementById('upload-image-btn');
            uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
            uploadBtn.disabled = false;
        }
    }

    /**
     * Update image preview
     */
    updateImagePreview() {
        const imageUrl = document.getElementById('image_url').value;
        const previewContainer = document.getElementById('image-preview');
        const previewImage = document.getElementById('preview-image');
        
        if (imageUrl && this.isValidUrl(imageUrl)) {
            previewImage.src = imageUrl;
            previewImage.onerror = () => {
                previewContainer.style.display = 'none';
            };
            previewImage.onload = () => {
                previewContainer.style.display = 'block';
            };
        } else {
            previewContainer.style.display = 'none';
        }
    }

    /**
     * Update article preview
     */
    updatePreview() {
        const data = this.getFormData();
        const previewContent = document.getElementById('preview-content');
        
        if (!data.title && !data.summary && !data.content) {
            previewContent.innerHTML = '<p class="text-muted text-center">Fill in the form to see a preview of your article</p>';
            return;
        }
        
        const typeIcon = window.newsApiService.getTypeIcon(data.type);
        const audienceIcon = window.newsApiService.getAudienceIcon(data.target_audience);
        
        previewContent.innerHTML = `
            <div class="news-item">
                <div class="news-header">
                    <div class="d-flex align-items-center">
                        <div class="news-icon">${this.getTypeEmoji(data.type)}</div>
                        <h6 class="news-title">${data.title || 'Untitled Article'}</h6>
                    </div>
                    ${data.publish_date ? `<div class="news-date">${this.formatDate(data.publish_date)}</div>` : ''}
                </div>
                
                ${data.summary ? `<div class="news-content">${data.summary}</div>` : ''}
                
                ${data.image_url ? `<img src="${data.image_url}" alt="${data.title || 'Article image'}" class="news-image" style="max-width: 100%; height: auto; border-radius: 8px; margin-top: 10px;">` : ''}
                
                <div class="news-footer">
                    <div class="d-flex gap-2">
                        ${data.category ? `<span class="badge bg-secondary">${data.category}</span>` : ''}
                        <span class="badge bg-primary">${data.target_audience || 'all'}</span>
                        ${data.featured ? '<span class="badge bg-warning">Featured</span>' : ''}
                    </div>
                    ${data.link_url ? `<a href="${data.link_url}" target="_blank" class="news-link">
                        ${data.link_text || 'Learn More'} <i class="fas fa-external-link-alt"></i>
                    </a>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Update publishing status
     */
    updatePublishStatus() {
        const data = this.getFormData();
        
        const statusText = document.getElementById('status-text');
        const visibilityText = document.getElementById('visibility-text');
        const createdText = document.getElementById('created-text');
        const modifiedText = document.getElementById('modified-text');
        
        // Status
        if (data.active) {
            statusText.innerHTML = '<span class="badge bg-success">Published</span>';
        } else {
            statusText.innerHTML = '<span class="badge bg-secondary">Draft</span>';
        }
        
        // Visibility
        const audience = data.target_audience || 'all';
        visibilityText.innerHTML = `<span class="badge bg-info">${audience}</span>`;
        
        // Dates
        if (this.currentArticle) {
            createdText.textContent = this.formatDate(this.currentArticle.created_at);
            modifiedText.textContent = this.isDirty ? 'Modified (unsaved)' : this.formatDate(this.currentArticle.updated_at);
        } else {
            createdText.textContent = 'Not saved';
            modifiedText.textContent = this.isDirty ? 'Modified (unsaved)' : 'Not saved';
        }
    }

    /**
     * Toggle preview mode
     */
    togglePreview() {
        // This could expand the preview or open in a modal
        this.updatePreview();
        this.showToast('Preview updated', 'info');
    }

    /**
     * Utility: Format date for datetime-local input
     */
    formatDateForInput(dateString) {
        const date = new Date(dateString);
        return date.toISOString().slice(0, 16);
    }

    /**
     * Utility: Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return window.newsApiService.formatDate(dateString);
    }

    /**
     * Utility: Get type emoji
     */
    getTypeEmoji(type) {
        const emojis = {
            feature: '🚀',
            update: '⚡',
            fix: '🔧',
            security: '🔒',
            maintenance: '🛠️'
        };
        return emojis[type] || '📢';
    }

    /**
     * Utility: Validate URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
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
}

// Global function for logout
function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/login';
}

// Initialize application
window.newsEditorApp = new NewsEditorApp();

document.addEventListener('DOMContentLoaded', () => {
    window.newsEditorApp.init();
    
    // Add logout button event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});