/**
 * User Statistics Component
 * Handles displaying user statistics dashboard
 */

class UserStats {
    constructor() {
        this.currentEnvironmentId = null;
        this.currentStats = null;
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        // Statistics containers
        this.statsContainer = document.getElementById('user-stats-container');
        this.statsLoadingContainer = document.getElementById('stats-loading-container');
        this.statsErrorContainer = document.getElementById('stats-error-container');
        this.statsErrorMessage = document.getElementById('stats-error-message');
        this.retryStatsBtn = document.getElementById('retry-stats-btn');
        
        // Individual stat elements
        this.totalUsersElement = document.getElementById('total-users');
        this.practitionersElement = document.getElementById('total-practitioners');
        this.patientsElement = document.getElementById('total-patients');
        this.assistantsElement = document.getElementById('total-assistants');
        this.activeUsersElement = document.getElementById('active-users');
        this.aiEnabledElement = document.getElementById('ai-enabled-users');
        this.adminUsersElement = document.getElementById('admin-users');
        this.firstLoginElement = document.getElementById('first-login-users');
        
        // Plan distribution container
        this.planListContainer = document.getElementById('plan-list');
    }
    
    bindEvents() {
        this.retryStatsBtn?.addEventListener('click', () => this.loadStats());
        
        // Listen for environment changes
        document.addEventListener('environmentChanged', (e) => {
            this.currentEnvironmentId = e.detail.environmentId;
            this.loadStats();
        });
    }
    
    showStatsLoading() {
        this.statsLoadingContainer?.classList.remove('d-none');
        this.statsErrorContainer?.classList.add('d-none');
        this.statsContainer?.classList.add('d-none');
    }
    
    showStatsError(message) {
        this.statsLoadingContainer?.classList.add('d-none');
        this.statsErrorContainer?.classList.remove('d-none');
        this.statsContainer?.classList.add('d-none');
        
        if (this.statsErrorMessage) {
            this.statsErrorMessage.textContent = message;
        }
    }
    
    showStats() {
        this.statsLoadingContainer?.classList.add('d-none');
        this.statsErrorContainer?.classList.add('d-none');
        this.statsContainer?.classList.remove('d-none');
    }
    
    async loadStats() {
        if (!this.currentEnvironmentId) {
            console.warn('No environment selected for stats');
            return;
        }
        
        try {
            this.showStatsLoading();
            
            const statsData = await userApi.getUserStatistics(this.currentEnvironmentId);
            this.currentStats = statsData;
            
            this.renderStats(statsData);
            this.showStats();
            
        } catch (error) {
            console.error('Error loading user statistics:', error);
            this.showStatsError(error.message);
        }
    }
    
    renderStats(stats) {
        // Main statistics
        this.updateStatElement(this.totalUsersElement, stats.total_users || 0);
        this.updateStatElement(this.practitionersElement, stats.role_stats?.pract || 0);
        this.updateStatElement(this.patientsElement, stats.role_stats?.patient || 0);
        this.updateStatElement(this.assistantsElement, stats.role_stats?.assist || 0);
        this.updateStatElement(this.activeUsersElement, stats.active_users || 0);
        this.updateStatElement(this.aiEnabledElement, stats.ai_enabled_users || 0);
        this.updateStatElement(this.adminUsersElement, stats.admin_users || 0);
        this.updateStatElement(this.firstLoginElement, stats.first_login_users || 0);
        
        // Plan distribution
        this.renderPlanDistribution(stats.plan_stats || {});
    }
    
    updateStatElement(element, value) {
        if (element) {
            // Animate the number change
            this.animateNumber(element, parseInt(value) || 0);
        }
    }
    
    animateNumber(element, targetValue) {
        const currentValue = parseInt(element.textContent) || 0;
        const duration = 800; // ms
        const steps = 20;
        const stepValue = (targetValue - currentValue) / steps;
        const stepDuration = duration / steps;
        
        let currentStep = 0;
        
        const updateNumber = () => {
            currentStep++;
            const newValue = Math.round(currentValue + (stepValue * currentStep));
            
            if (currentStep >= steps) {
                element.textContent = targetValue.toLocaleString();
            } else {
                element.textContent = newValue.toLocaleString();
                setTimeout(updateNumber, stepDuration);
            }
        };
        
        updateNumber();
    }
    
    renderPlanDistribution(planStats) {
        if (!this.planListContainer) return;
        
        this.planListContainer.innerHTML = '';
        
        // Convert plan stats to array and sort by count (descending)
        const planArray = Object.entries(planStats)
            .map(([plan, count]) => ({ plan, count: parseInt(count) || 0 }))
            .sort((a, b) => b.count - a.count);
        
        if (planArray.length === 0) {
            this.planListContainer.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-chart-pie mb-2"></i>
                    <p class="mb-0">No plan data available</p>
                </div>
            `;
            return;
        }
        
        // Render plan items
        planArray.forEach(item => {
            const planItem = document.createElement('div');
            planItem.className = 'plan-item';
            
            planItem.innerHTML = `
                <div class="plan-name">${this.formatPlanName(item.plan)}</div>
                <div class="plan-count">${item.count.toLocaleString()}</div>
            `;
            
            this.planListContainer.appendChild(planItem);
        });
    }
    
    formatPlanName(plan) {
        if (!plan || plan === 'null' || plan === '') {
            return 'No Plan';
        }
        
        // Replace underscores with spaces and capitalize each word
        return plan.replace(/_/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase());
    }
    
    refresh() {
        this.loadStats();
    }
    
    // Get current statistics (for other components)
    getCurrentStats() {
        return this.currentStats;
    }
}

// Create global instance
const userStats = new UserStats();