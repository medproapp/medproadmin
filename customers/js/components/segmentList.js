/**
 * Segment List Component
 * Handles the display and management of segment cards
 */
class SegmentList {
    constructor(container) {
        this.container = container;
        this.segments = [];
        this.isLoading = false;

        this.bindEvents();
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Segment card click events (delegated)
        this.container.addEventListener('click', (e) => {
            const segmentCard = e.target.closest('.segment-card');
            if (segmentCard) {
                const segmentId = segmentCard.dataset.segmentId;
                const action = e.target.dataset.action;
                
                switch (action) {
                    case 'view-details':
                        this.showSegmentDetails(segmentId);
                        break;
                    case 'edit-segment':
                        this.editSegment(segmentId);
                        break;
                    case 'refresh-segment':
                        this.refreshSegment(segmentId);
                        break;
                    case 'delete-segment':
                        this.deleteSegment(segmentId);
                        break;
                    case 'view-customers':
                        this.viewSegmentCustomers(segmentId);
                        break;
                    default:
                        if (!action) { // Card itself clicked
                            this.showSegmentDetails(segmentId);
                        }
                        break;
                }
            }
        });
    }

    /**
     * Load segments
     * @param {Object} filters - Filter options
     */
    async loadSegments(filters = {}) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            this.showLoading();
            
            console.log('🔍 SegmentList: Making API call with filters:', filters);
            
            const response = await segmentAPI.getSegments(filters);
            
            console.log('🔍 SegmentList: Full API response:', response);
            
            if (response.success && response.data) {
                this.segments = response.data.segments || [];
                
                console.log('🔍 SegmentList: Loaded segments count:', this.segments.length);
                
                this.render();
                this.updateStats();
            } else {
                console.error('❌ SegmentList: API call failed:', response);
                throw new Error(response.message || 'Failed to load segments');
            }
        } catch (error) {
            console.error('Error loading segments:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Render segment list
     */
    render() {
        console.log('🔍 SegmentList: render() called with', this.segments.length, 'segments');
        
        // Hide loading spinner and show content
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
            console.log('🔍 SegmentList: Hiding loading spinner');
        }
        if (errorState) errorState.style.display = 'none';
        
        if (this.segments.length === 0) {
            this.showEmptyState();
            return;
        }

        const html = this.segments.map(segment => 
            this.renderSegmentCard(segment)
        ).join('');
        
        this.container.innerHTML = html;
        console.log('🔍 SegmentList: Set container innerHTML with segment cards');
    }

    /**
     * Render a single segment card
     * @param {Object} segment - Segment data
     * @returns {string} HTML string
     */
    renderSegmentCard(segment) {
        const isSystem = segment.is_system;
        const isActive = segment.is_active;
        const color = segment.color || '#007bff';
        const customerCount = segment.customer_count || 0;
        
        const criteria = this.parseCriteria(segment.criteria);
        const criteriaText = this.formatCriteria(criteria);

        return `
            <div class="segment-card" 
                 data-segment-id="${segment.id}" 
                 style="--segment-color: ${color}">
                
                <div class="segment-header">
                    <div class="segment-info">
                        <h4>${this.escapeHtml(segment.name)}</h4>
                        ${segment.description ? `<p>${this.escapeHtml(segment.description)}</p>` : ''}
                    </div>
                    <div class="segment-badges">
                        <span class="segment-badge ${isSystem ? 'system' : 'custom'}">
                            ${isSystem ? 'System' : 'Custom'}
                        </span>
                        <span class="segment-badge ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </div>

                <div class="segment-stats">
                    <div class="segment-stat">
                        <span class="segment-stat-value">${customerCount.toLocaleString()}</span>
                        <span class="segment-stat-label">Customers</span>
                    </div>
                    <div class="segment-stat">
                        <span class="segment-stat-value">${segment.avg_assignment_score ? Math.round(segment.avg_assignment_score * 100) : 0}%</span>
                        <span class="segment-stat-label">Avg Match</span>
                    </div>
                </div>

                <div class="segment-criteria">
                    <h5>Criteria</h5>
                    <ul class="criteria-list">
                        ${criteriaText.map(text => `<li>${text}</li>`).join('')}
                    </ul>
                </div>

                <div class="segment-actions">
                    <button class="btn" data-action="view-details" title="View Details">
                        <i class="fas fa-eye"></i> Details
                    </button>
                    <button class="btn" data-action="view-customers" title="View Customers">
                        <i class="fas fa-users"></i> Customers
                    </button>
                    ${!isSystem ? `
                        <button class="btn" data-action="edit-segment" title="Edit Segment">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    ` : ''}
                    <button class="btn" data-action="refresh-segment" title="Refresh Assignments">
                        <i class="fas fa-sync"></i>
                    </button>
                    ${!isSystem ? `
                        <button class="btn danger" data-action="delete-segment" title="Delete Segment">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Parse criteria JSON string to object
     * @param {string|Object} criteria - Criteria string or object
     * @returns {Object} Parsed criteria
     */
    parseCriteria(criteria) {
        try {
            if (typeof criteria === 'string') {
                return JSON.parse(criteria);
            }
            return criteria || {};
        } catch (error) {
            console.warn('Error parsing segment criteria:', error);
            return {};
        }
    }

    /**
     * Format criteria for display
     * @param {Object} criteria - Segment criteria
     * @returns {Array<string>} Formatted criteria text
     */
    formatCriteria(criteria) {
        const formatted = [];

        if (criteria.ltv_min !== undefined) {
            formatted.push(`LTV ≥ ${this.formatCurrency(criteria.ltv_min)}`);
        }
        if (criteria.ltv_max !== undefined) {
            formatted.push(`LTV ≤ ${this.formatCurrency(criteria.ltv_max)}`);
        }
        if (criteria.health_score_min !== undefined) {
            formatted.push(`Health Score ≥ ${criteria.health_score_min}`);
        }
        if (criteria.health_score_max !== undefined) {
            formatted.push(`Health Score ≤ ${criteria.health_score_max}`);
        }
        if (criteria.churn_risk_min !== undefined) {
            formatted.push(`Churn Risk ≥ ${Math.round(criteria.churn_risk_min * 100)}%`);
        }
        if (criteria.churn_risk_max !== undefined) {
            formatted.push(`Churn Risk ≤ ${Math.round(criteria.churn_risk_max * 100)}%`);
        }
        if (criteria.subscription_count_min !== undefined) {
            formatted.push(`Subscriptions ≥ ${criteria.subscription_count_min}`);
        }
        if (criteria.days_since_created_max !== undefined) {
            formatted.push(`Customer for ≤ ${criteria.days_since_created_max} days`);
        }
        if (criteria.status) {
            formatted.push(`Status: ${this.capitalizeFirst(criteria.status)}`);
        }

        return formatted.length > 0 ? formatted : ['No specific criteria'];
    }

    /**
     * Show loading state
     */
    showLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
        
        this.container.innerHTML = '';
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const errorMessage = document.getElementById('error-message');
        const emptyState = document.getElementById('empty-state');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorState) {
            errorState.style.display = 'block';
            if (errorMessage) errorMessage.textContent = message;
        }
        if (emptyState) emptyState.style.display = 'none';
        
        this.container.innerHTML = '';
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const errorState = document.getElementById('error-state');
        const emptyState = document.getElementById('empty-state');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        
        this.container.innerHTML = '';
    }

    /**
     * Update stats cards
     */
    updateStats() {
        console.log('🔍 SegmentList: updateStats called');
        
        const totalSegments = this.segments.length;
        const activeSegments = this.segments.filter(s => s.is_active).length;
        const totalCustomers = this.segments.reduce((sum, s) => sum + (s.customer_count || 0), 0);
        const avgSegmentSize = totalSegments > 0 ? Math.round(totalCustomers / totalSegments) : 0;
        
        const totalSegmentsEl = document.getElementById('total-segments');
        const activeSegmentsEl = document.getElementById('active-segments');
        const segmentedCustomersEl = document.getElementById('segmented-customers');
        const avgSegmentSizeEl = document.getElementById('avg-segment-size');
        
        if (totalSegmentsEl) totalSegmentsEl.textContent = totalSegments;
        if (activeSegmentsEl) activeSegmentsEl.textContent = activeSegments;
        if (segmentedCustomersEl) segmentedCustomersEl.textContent = totalCustomers.toLocaleString();
        if (avgSegmentSizeEl) avgSegmentSizeEl.textContent = avgSegmentSize;
        
        console.log('🔍 SegmentList: Updated stats', {
            totalSegments,
            activeSegments,
            totalCustomers,
            avgSegmentSize
        });
    }

    /**
     * Show segment details modal
     * @param {string} segmentId - Segment ID
     */
    async showSegmentDetails(segmentId) {
        if (window.segmentModal) {
            await window.segmentModal.showDetails(segmentId);
        }
    }

    /**
     * Edit segment
     * @param {string} segmentId - Segment ID
     */
    async editSegment(segmentId) {
        if (window.segmentModal) {
            await window.segmentModal.editSegment(segmentId);
        }
    }

    /**
     * Refresh segment assignments
     * @param {string} segmentId - Segment ID
     */
    async refreshSegment(segmentId) {
        try {
            const response = await segmentAPI.refreshSegment(segmentId);
            
            if (response.success) {
                showToast(`Segment refreshed! ${response.data.assigned_customers} customers assigned.`, 'success');
                
                // Reload segments to show updated counts
                this.loadSegments();
            } else {
                showToast('Failed to refresh segment: ' + response.message, 'error');
            }
        } catch (error) {
            console.error('Error refreshing segment:', error);
            showToast('Failed to refresh segment: ' + error.message, 'error');
        }
    }

    /**
     * Delete segment
     * @param {string} segmentId - Segment ID
     */
    async deleteSegment(segmentId) {
        const segment = this.segments.find(s => s.id === parseInt(segmentId));
        if (!segment) return;

        if (!confirm(`Are you sure you want to delete the segment "${segment.name}"?`)) {
            return;
        }

        try {
            const response = await segmentAPI.deleteSegment(segmentId);
            
            if (response.success) {
                showToast('Segment deleted successfully', 'success');
                
                // Reload segments
                this.loadSegments();
            } else {
                showToast('Failed to delete segment: ' + response.message, 'error');
            }
        } catch (error) {
            console.error('Error deleting segment:', error);
            showToast('Failed to delete segment: ' + error.message, 'error');
        }
    }

    /**
     * View segment customers
     * @param {string} segmentId - Segment ID
     */
    viewSegmentCustomers(segmentId) {
        // Navigate to customer list with segment filter
        const segment = this.segments.find(s => s.id === parseInt(segmentId));
        if (segment) {
            window.location.href = `/medproadmin/customers/?segment=${segmentId}&segment_name=${encodeURIComponent(segment.name)}`;
        }
    }

    /**
     * Refresh current view
     */
    refresh() {
        this.loadSegments();
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatCurrency(cents) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format((cents || 0) / 100);
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
}

// Make SegmentList available globally
window.SegmentList = SegmentList;