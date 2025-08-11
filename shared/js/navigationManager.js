/**
 * NavigationManager - Enhanced Navigation System
 * Handles navigation state, collapsible sections, active states, and breadcrumbs
 */
class NavigationManager {
    constructor() {
        this.currentPage = '';
        this.currentSection = '';
        this.expandedSections = new Set();
        this.isInitialized = false;
        this.isMobileOpen = false;
        
        // Navigation configuration
        this.navigationConfig = {
            'dashboard': {
                section: null,
                title: 'Dashboard',
                breadcrumb: ['Dashboard']
            },
            'product-catalog': {
                section: 'products',
                title: 'Product Catalog',
                breadcrumb: ['Products', 'Product Catalog']
            },
            'v3-recovery': {
                section: 'products',
                title: 'V3 Recovery',
                breadcrumb: ['Products', 'V3 Recovery']
            },
            'templates': {
                section: 'products',
                title: 'Templates',
                breadcrumb: ['Products', 'Templates']
            },
            'customer-management': {
                section: 'customers',
                title: 'Customer Management',
                breadcrumb: ['Customers', 'Customer Management']
            },
            'customer-analytics': {
                section: 'customers',
                title: 'Customer Analytics',
                breadcrumb: ['Customers', 'Customer Analytics']
            },
            'customer-segments': {
                section: 'customers',
                title: 'Customer Segments',
                breadcrumb: ['Customers', 'Customer Segments']
            },
            'migration-sources': {
                section: 'migration',
                title: 'Migration Sources',
                breadcrumb: ['Migration Management', 'Migration Sources']
            },
            'migration-jobs': {
                section: 'migration',
                title: 'Migration Jobs',
                breadcrumb: ['Migration Management', 'Migration Jobs']
            },
            'migration-executions': {
                section: 'migration',
                title: 'Migration Executions',
                breadcrumb: ['Migration Management', 'Executions']
            },
            'environments': {
                section: 'environment',
                title: 'Environments',
                breadcrumb: ['Environment Management', 'Environments']
            },
            'database-management': {
                section: 'environment',
                title: 'Database Management',
                breadcrumb: ['Environment Management', 'Database Management']
            },
            'user-management': {
                section: 'environment',
                title: 'User Management',
                breadcrumb: ['Environment Management', 'User Management']
            },
            'audit-log': {
                section: 'system',
                title: 'Audit Log',
                breadcrumb: ['System', 'Audit Log']
            },
            'settings': {
                section: 'system',
                title: 'Settings',
                breadcrumb: ['System', 'Settings']
            },
            'news-management': {
                section: 'content',
                title: 'News Management',
                breadcrumb: ['Content Management', 'News']
            }
        };
        
        // Bind methods
        this.init = this.init.bind(this);
        this.loadNavigation = this.loadNavigation.bind(this);
        this.setCurrentPage = this.setCurrentPage.bind(this);
        this.toggleSection = this.toggleSection.bind(this);
        this.toggleMobileNav = this.toggleMobileNav.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }
    
    /**
     * Initialize the navigation system
     */
    async init(currentPageKey = null) {
        if (this.isInitialized) return;
        
        try {
            await this.loadNavigation();
            
            // Short delay to ensure DOM is ready
            setTimeout(() => {
                this.setupEventListeners();
                
                if (currentPageKey) {
                    this.setCurrentPage(currentPageKey);
                } else {
                    this.detectCurrentPage();
                }
                
                this.setupMobileHandlers();
                this.loadExpandedSections();
                this.updateBreadcrumb();
                
                this.isInitialized = true;
                console.log('NavigationManager initialized successfully');
            }, 100);
        } catch (error) {
            console.error('Failed to initialize NavigationManager:', error);
            // Still mark as initialized to prevent retries
            this.isInitialized = true;
        }
    }
    
    /**
     * Load navigation HTML from shared component
     */
    async loadNavigation() {
        console.log('Loading navigation component...');
        
        try {
            // Always use absolute path for consistency
            const navPath = '/medproadmin/shared/components/navigation.html';
            console.log(`Fetching navigation from: ${navPath}`);
            
            const response = await fetch(navPath);
            console.log(`Navigation fetch response: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load navigation: ${response.status} ${response.statusText}`);
            }
            
            const navigationHTML = await response.text();
            console.log(`Navigation HTML loaded, length: ${navigationHTML.length}`);
            
            this.injectNavigation(navigationHTML);
        } catch (error) {
            console.error('Failed to load navigation component:', error);
            console.log('Using fallback navigation...');
            // Use fallback navigation
            this.createFallbackNavigation();
        }
    }
    
    /**
     * Inject navigation HTML into the page
     */
    injectNavigation(navigationHTML) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(navigationHTML, 'text/html');
            const newSidebar = doc.querySelector('.admin-sidebar');
            const mobileToggle = doc.querySelector('.nav-mobile-toggle');
            const breadcrumbContainer = doc.querySelector('.breadcrumb-container');
            
            // Replace or insert sidebar
            const existingSidebar = document.querySelector('.admin-sidebar');
            const adminContainer = document.querySelector('.admin-container');
            
            if (existingSidebar && newSidebar) {
                existingSidebar.parentNode.replaceChild(newSidebar, existingSidebar);
            } else if (adminContainer && newSidebar) {
                // Insert as first child of admin-container
                adminContainer.insertBefore(newSidebar, adminContainer.firstChild);
            }
            
            // Add mobile toggle if not exists
            if (mobileToggle && !document.querySelector('.nav-mobile-toggle')) {
                document.body.appendChild(mobileToggle);
            }
            
            // Add breadcrumb container if not exists
            if (breadcrumbContainer && !document.querySelector('.breadcrumb-container')) {
                const mainContent = document.querySelector('.admin-content');
                if (mainContent) {
                    mainContent.parentNode.insertBefore(breadcrumbContainer, mainContent);
                }
            }
            
            console.log('Navigation injected successfully');
        } catch (error) {
            console.error('Failed to inject navigation:', error);
            throw error;
        }
    }
    
    /**
     * Create fallback navigation if component loading fails
     */
    createFallbackNavigation() {
        console.log('Creating fallback navigation...');
        
        const adminContainer = document.querySelector('.admin-container');
        if (!adminContainer) {
            console.error('Admin container not found, cannot create fallback navigation');
            return;
        }
        
        const fallbackHTML = `
        <aside class="admin-sidebar" id="admin-sidebar">
            <nav class="admin-nav">
                <ul class="nav-list">
                    <li class="nav-item">
                        <a href="/medproadmin/" class="nav-link" data-page="dashboard">
                            <i class="fas fa-dashboard nav-icon"></i> 
                            <span class="nav-text">Dashboard</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="/medproadmin/product-catalog/" class="nav-link" data-page="product-catalog">
                            <i class="fas fa-box nav-icon"></i>
                            <span class="nav-text">Product Catalog</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="/medproadmin/customers/" class="nav-link" data-page="customer-management">
                            <i class="fas fa-users nav-icon"></i>
                            <span class="nav-text">Customer Management</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="/medproadmin/environments/" class="nav-link" data-page="environments">
                            <i class="fas fa-server nav-icon"></i>
                            <span class="nav-text">Environments</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </aside>
        `;
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(fallbackHTML, 'text/html');
        const sidebar = doc.querySelector('.admin-sidebar');
        
        if (sidebar) {
            adminContainer.insertBefore(sidebar, adminContainer.firstChild);
            console.log('Fallback navigation created');
        }
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Section toggle handlers
        document.querySelectorAll('.nav-section-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionHeader = toggle.closest('.nav-section-header');
                const sectionName = sectionHeader.getAttribute('data-section');
                this.toggleSection(sectionName);
            });
        });
        
        // Navigation link handlers
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                // Allow normal navigation, but update state
                const pageKey = link.getAttribute('data-page');
                if (pageKey) {
                    this.setCurrentPage(pageKey);
                }
            });
        });
        
        // Window resize handler
        window.addEventListener('resize', this.handleResize);
    }
    
    /**
     * Setup mobile navigation handlers
     */
    setupMobileHandlers() {
        const mobileToggle = document.getElementById('nav-mobile-toggle');
        const navToggle = document.getElementById('nav-toggle');
        const overlay = document.getElementById('nav-mobile-overlay');
        
        if (mobileToggle) {
            mobileToggle.addEventListener('click', this.toggleMobileNav);
        }
        
        if (navToggle) {
            navToggle.addEventListener('click', this.toggleMobileNav);
        }
        
        if (overlay) {
            overlay.addEventListener('click', this.toggleMobileNav);
        }
    }
    
    /**
     * Detect current page from URL
     */
    detectCurrentPage() {
        const path = window.location.pathname;
        
        // Map URL patterns to page keys
        const urlPatterns = {
            '/medproadmin/$': 'dashboard',
            '/medproadmin/product-catalog/$': 'product-catalog',
            '/medproadmin/product-catalog/recovery.html': 'v3-recovery',
            '/medproadmin/product-catalog/templates.html': 'templates',
            '/medproadmin/customers/$': 'customer-management',
            '/medproadmin/customers/analytics.html': 'customer-analytics',
            '/medproadmin/customers/segments.html': 'customer-segments',
            '/medproadmin/migration/$': 'migration-sources',
            '/medproadmin/migration/jobs.html': 'migration-jobs',
            '/medproadmin/migration/executions.html': 'migration-executions',
            '/medproadmin/environments/$': 'environments',
            '/medproadmin/database-management/$': 'database-management',
            '/medproadmin/users/$': 'user-management',
            '/medproadmin/audit-log/$': 'audit-log',
            '/medproadmin/settings/$': 'settings',
            '/medproadmin/news/$': 'news-management'
        };
        
        for (const [pattern, pageKey] of Object.entries(urlPatterns)) {
            const regex = new RegExp(pattern);
            if (regex.test(path)) {
                this.setCurrentPage(pageKey);
                return;
            }
        }
        
        console.warn('Could not detect current page from URL:', path);
    }
    
    /**
     * Set the current active page
     */
    setCurrentPage(pageKey) {
        if (!this.navigationConfig[pageKey]) {
            console.warn('Unknown page key:', pageKey);
            return;
        }
        
        this.currentPage = pageKey;
        const config = this.navigationConfig[pageKey];
        this.currentSection = config.section;
        
        // Update active states
        this.updateActiveStates();
        
        // Expand current section
        if (this.currentSection) {
            this.expandSection(this.currentSection);
        }
        
        // Update breadcrumb
        this.updateBreadcrumb();
        
        // Save state
        this.saveNavigationState();
        
        console.log('Current page set to:', pageKey);
    }
    
    /**
     * Update active states in navigation
     */
    updateActiveStates() {
        // Clear all active states
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        document.querySelectorAll('.nav-section-header').forEach(header => {
            header.classList.remove('active-section');
        });
        
        // Set active page
        const activeLink = document.querySelector(`[data-page="${this.currentPage}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        // Set active section
        if (this.currentSection) {
            const sectionHeader = document.querySelector(`[data-section="${this.currentSection}"]`);
            if (sectionHeader) {
                sectionHeader.classList.add('active-section');
            }
        }
    }
    
    /**
     * Toggle section collapse/expand
     */
    toggleSection(sectionName) {
        if (this.expandedSections.has(sectionName)) {
            this.collapseSection(sectionName);
        } else {
            this.expandSection(sectionName);
        }
        
        this.saveExpandedSections();
    }
    
    /**
     * Expand a section
     */
    expandSection(sectionName) {
        this.expandedSections.add(sectionName);
        
        const sectionContent = document.querySelector(`[data-section="${sectionName}"].nav-section-content`);
        const arrow = document.querySelector(`[data-section="${sectionName}"] .section-arrow`);
        
        if (sectionContent) {
            sectionContent.classList.add('expanded');
        }
        
        if (arrow) {
            arrow.classList.add('expanded');
        }
    }
    
    /**
     * Collapse a section
     */
    collapseSection(sectionName) {
        this.expandedSections.delete(sectionName);
        
        const sectionContent = document.querySelector(`[data-section="${sectionName}"].nav-section-content`);
        const arrow = document.querySelector(`[data-section="${sectionName}"] .section-arrow`);
        
        if (sectionContent) {
            sectionContent.classList.remove('expanded');
        }
        
        if (arrow) {
            arrow.classList.remove('expanded');
        }
    }
    
    /**
     * Update breadcrumb navigation
     */
    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb || !this.currentPage) return;
        
        const config = this.navigationConfig[this.currentPage];
        if (!config || !config.breadcrumb) return;
        
        // Clear existing breadcrumb
        breadcrumb.innerHTML = '';
        
        // Build breadcrumb items
        config.breadcrumb.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'breadcrumb-item';
            
            if (index === config.breadcrumb.length - 1) {
                // Last item is active
                li.classList.add('active');
                li.setAttribute('aria-current', 'page');
                li.textContent = item;
            } else {
                // Previous items can be clickable
                li.innerHTML = `<a href="#">${item}</a>`;
            }
            
            breadcrumb.appendChild(li);
        });
    }
    
    /**
     * Toggle mobile navigation
     */
    toggleMobileNav() {
        const sidebar = document.getElementById('admin-sidebar');
        const overlay = document.getElementById('nav-mobile-overlay');
        const body = document.body;
        
        if (this.isMobileOpen) {
            // Close mobile nav
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('show');
            body.classList.remove('nav-mobile-open');
            this.isMobileOpen = false;
        } else {
            // Open mobile nav
            sidebar.classList.add('mobile-open');
            overlay.classList.add('show');
            body.classList.add('nav-mobile-open');
            this.isMobileOpen = true;
        }
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        // Close mobile nav on desktop
        if (window.innerWidth >= 992 && this.isMobileOpen) {
            this.toggleMobileNav();
        }
    }
    
    /**
     * Update user management navigation based on environment context
     */
    updateUserManagementNav(environmentId = null) {
        const navItem = document.getElementById('user-management-nav-item');
        const navLink = document.getElementById('user-management-nav-link');
        
        if (!navItem || !navLink) return;
        
        if (environmentId) {
            navItem.style.display = 'block';
            navLink.href = `/medproadmin/users/?env=${environmentId}`;
        } else {
            navItem.style.display = 'none';
        }
    }
    
    /**
     * Save navigation state to localStorage
     */
    saveNavigationState() {
        const state = {
            currentPage: this.currentPage,
            currentSection: this.currentSection,
            expandedSections: Array.from(this.expandedSections)
        };
        
        localStorage.setItem('medpro_nav_state', JSON.stringify(state));
    }
    
    /**
     * Save expanded sections to localStorage
     */
    saveExpandedSections() {
        localStorage.setItem('medpro_nav_expanded', JSON.stringify(Array.from(this.expandedSections)));
    }
    
    /**
     * Load expanded sections from localStorage
     */
    loadExpandedSections() {
        try {
            const saved = localStorage.getItem('medpro_nav_expanded');
            if (saved) {
                const expandedSections = JSON.parse(saved);
                expandedSections.forEach(section => this.expandSection(section));
            } else {
                // Default: expand current section
                if (this.currentSection) {
                    this.expandSection(this.currentSection);
                }
            }
        } catch (error) {
            console.warn('Failed to load expanded sections:', error);
            // Default: expand current section
            if (this.currentSection) {
                this.expandSection(this.currentSection);
            }
        }
    }
    
    /**
     * Get navigation manager instance
     */
    static getInstance() {
        if (!NavigationManager.instance) {
            NavigationManager.instance = new NavigationManager();
        }
        return NavigationManager.instance;
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.NavigationManager = NavigationManager;
    window.navigationManager = NavigationManager.getInstance();
}