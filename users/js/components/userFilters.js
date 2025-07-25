/**
 * User Filters Component
 * Handles user filtering and search functionality
 */

class UserFilters {
    constructor() {
        this.currentFilters = {
            role: 'all',
            status: 'active',
            search: '',
            limit: 20,
            sort_field: 'fullname',
            sort_direction: 'asc'
        };
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        // Filter form elements
        this.roleFilter = document.getElementById('role-filter');
        this.statusFilter = document.getElementById('status-filter');
        this.searchInput = document.getElementById('search-input');
        this.limitSelect = document.getElementById('limit-select');
        this.clearFiltersBtn = document.getElementById('clear-filters-btn');
        this.applyFiltersBtn = document.getElementById('apply-filters-btn');
        
        // Sorting elements
        this.sortFieldSelect = document.getElementById('sort-field');
        this.sortDirectionSelect = document.getElementById('sort-direction');
        
        // Filter summary elements
        this.activeFiltersContainer = document.getElementById('active-filters');
        this.filterSummary = document.getElementById('filter-summary');
    }
    
    bindEvents() {
        // Role filter change
        this.roleFilter?.addEventListener('change', (e) => {
            this.updateFilter('role', e.target.value);
        });
        
        // Status filter change
        this.statusFilter?.addEventListener('change', (e) => {
            this.updateFilter('status', e.target.value);
        });
        
        // Search input with debounce
        if (this.searchInput) {
            let searchTimeout;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.updateFilter('search', e.target.value.trim());
                }, 300); // 300ms debounce
            });
        }
        
        // Limit select change
        this.limitSelect?.addEventListener('change', (e) => {
            this.updateFilter('limit', parseInt(e.target.value));
        });
        
        // Sort field change
        this.sortFieldSelect?.addEventListener('change', (e) => {
            this.updateFilter('sort_field', e.target.value);
        });
        
        // Sort direction change
        this.sortDirectionSelect?.addEventListener('change', (e) => {
            this.updateFilter('sort_direction', e.target.value);
        });
        
        // Apply filters button
        this.applyFiltersBtn?.addEventListener('click', () => {
            this.notifyFilterChange();
        });
        
        // Clear filters button
        this.clearFiltersBtn?.addEventListener('click', () => {
            this.clearAllFilters();
        });
        
        // Listen for environment changes to reset filters
        document.addEventListener('environmentChanged', () => {
            this.resetFilters();
        });
    }
    
    updateFilter(filterName, value) {
        // Update internal filter state
        this.currentFilters[filterName] = value;
        
        // Update filter summary
        this.updateFilterSummary();
        
        // Notify other components
        this.notifyFilterChange();
    }
    
    notifyFilterChange() {
        // Notify user list component
        if (window.userList) {
            window.userList.updateFilters(this.currentFilters);
        }
        
        // Dispatch custom event
        const event = new CustomEvent('filtersChanged', {
            detail: { filters: { ...this.currentFilters } }
        });
        document.dispatchEvent(event);
    }
    
    updateFilterSummary() {
        if (!this.filterSummary || !this.activeFiltersContainer) return;
        
        const activeFilters = [];
        
        // Check each filter for non-default values
        if (this.currentFilters.role !== 'all') {
            activeFilters.push({
                name: 'Role',
                value: this.formatRoleForDisplay(this.currentFilters.role),
                key: 'role'
            });
        }
        
        if (this.currentFilters.status !== 'active') {
            activeFilters.push({
                name: 'Status',
                value: this.formatStatusForDisplay(this.currentFilters.status),
                key: 'status'
            });
        }
        
        if (this.currentFilters.search) {
            activeFilters.push({
                name: 'Search',
                value: this.currentFilters.search,
                key: 'search'
            });
        }
        
        if (this.currentFilters.limit !== 20) {
            activeFilters.push({
                name: 'Results per page',
                value: this.currentFilters.limit.toString(),
                key: 'limit'
            });
        }
        
        if (this.currentFilters.sort_field !== 'fullname') {
            activeFilters.push({
                name: 'Sort by',
                value: this.formatSortFieldForDisplay(this.currentFilters.sort_field),
                key: 'sort_field'
            });
        }
        
        if (this.currentFilters.sort_direction !== 'asc') {
            activeFilters.push({
                name: 'Sort direction',
                value: this.formatSortDirectionForDisplay(this.currentFilters.sort_direction),
                key: 'sort_direction'
            });
        }
        
        // Show or hide active filters container
        if (activeFilters.length === 0) {
            this.activeFiltersContainer.classList.add('d-none');
        } else {
            this.activeFiltersContainer.classList.remove('d-none');
            this.renderActiveFilters(activeFilters);
        }
        
        // Update clear button visibility
        if (this.clearFiltersBtn) {
            if (activeFilters.length > 0) {
                this.clearFiltersBtn.classList.remove('d-none');
            } else {
                this.clearFiltersBtn.classList.add('d-none');
            }
        }
    }
    
    renderActiveFilters(activeFilters) {
        if (!this.filterSummary) return;
        
        this.filterSummary.innerHTML = '';
        
        activeFilters.forEach(filter => {
            const filterTag = document.createElement('span');
            filterTag.className = 'badge bg-primary me-2 mb-1';
            filterTag.innerHTML = `
                ${filter.name}: ${filter.value}
                <button type="button" class="btn-close btn-close-white ms-1" 
                        style="font-size: 0.6rem;" 
                        data-filter-key="${filter.key}"
                        aria-label="Remove filter"></button>
            `;
            
            // Add event listener to the close button
            const closeBtn = filterTag.querySelector('.btn-close');
            closeBtn.addEventListener('click', () => {
                this.removeFilter(filter.key);
            });
            
            this.filterSummary.appendChild(filterTag);
        });
    }
    
    removeFilter(filterKey) {
        // Reset specific filter to default
        const defaults = {
            role: 'all',
            status: 'active',
            search: '',
            limit: 20,
            sort_field: 'fullname',
            sort_direction: 'asc'
        };
        
        if (defaults.hasOwnProperty(filterKey)) {
            this.currentFilters[filterKey] = defaults[filterKey];
            
            // Update form elements
            this.updateFormElements();
            
            // Update summary and notify
            this.updateFilterSummary();
            this.notifyFilterChange();
        }
    }
    
    clearAllFilters() {
        // Reset all filters to defaults
        this.currentFilters = {
            role: 'all',
            status: 'active',
            search: '',
            limit: 20,
            sort_field: 'fullname',
            sort_direction: 'asc'
        };
        
        // Update form elements
        this.updateFormElements();
        
        // Update summary and notify
        this.updateFilterSummary();
        this.notifyFilterChange();
    }
    
    resetFilters() {
        // Same as clear all filters but without animation
        this.clearAllFilters();
    }
    
    updateFormElements() {
        // Update form inputs to match current filter state
        if (this.roleFilter) {
            this.roleFilter.value = this.currentFilters.role;
        }
        
        if (this.statusFilter) {
            this.statusFilter.value = this.currentFilters.status;
        }
        
        if (this.searchInput) {
            this.searchInput.value = this.currentFilters.search;
        }
        
        if (this.limitSelect) {
            this.limitSelect.value = this.currentFilters.limit.toString();
        }
        
        if (this.sortFieldSelect) {
            this.sortFieldSelect.value = this.currentFilters.sort_field;
        }
        
        if (this.sortDirectionSelect) {
            this.sortDirectionSelect.value = this.currentFilters.sort_direction;
        }
    }
    
    // Format filter values for display
    formatRoleForDisplay(role) {
        const roleMap = {
            'all': 'All Roles',
            'pract': 'Practitioners',
            'patient': 'Patients',
            'assist': 'Assistants'
        };
        return roleMap[role] || role;
    }
    
    formatStatusForDisplay(status) {
        const statusMap = {
            'all': 'All Status',
            'active': 'Active',
            'inactive': 'Inactive',
            'locked': 'Locked'
        };
        return statusMap[status] || status;
    }
    
    formatSortFieldForDisplay(sortField) {
        const sortFieldMap = {
            'fullname': 'Name',
            'email': 'Email',
            'role': 'Role',
            'activatedate': 'Activated Date',
            'plan': 'Plan'
        };
        return sortFieldMap[sortField] || sortField;
    }
    
    formatSortDirectionForDisplay(sortDirection) {
        const sortDirectionMap = {
            'asc': 'Ascending',
            'desc': 'Descending'
        };
        return sortDirectionMap[sortDirection] || sortDirection;
    }
    
    // Get current filters (for other components)
    getCurrentFilters() {
        return { ...this.currentFilters };
    }
    
    // Set filters programmatically (for external use)
    setFilters(newFilters) {
        this.currentFilters = { ...this.currentFilters, ...newFilters };
        this.updateFormElements();
        this.updateFilterSummary();
        this.notifyFilterChange();
    }
}

// Create global instance
const userFilters = new UserFilters();