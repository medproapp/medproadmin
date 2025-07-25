/**
 * Real-time Analytics Component
 * Handles real-time charts and analytics visualization
 */

class RealtimeAnalytics {
    constructor() {
        this.charts = {};
        this.updateInterval = null;
        this.updateFrequency = 30000; // 30 seconds
        this.isAutoRefreshEnabled = false;
        
        this.init();
    }
    
    /**
     * Initialize the analytics component
     */
    init() {
        this.setupCharts();
        this.attachEventListeners();
        this.loadInitialData();
    }
    
    /**
     * Setup all charts
     */
    setupCharts() {
        this.setupRequestsChart();
        this.setupResponseTimeChart();
        this.setupStatusCodeChart();
    }
    
    /**
     * Setup requests over time chart
     */
    setupRequestsChart() {
        const ctx = document.getElementById('requests-chart');
        if (!ctx) return;
        
        this.charts.requests = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Requests/min',
                    data: [],
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Errors/min',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Requests per minute'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }
    
    /**
     * Setup response time distribution pie chart
     */
    setupResponseTimeChart() {
        const ctx = document.getElementById('response-time-chart');
        if (!ctx) return;
        
        this.charts.responseTime = new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['< 100ms', '100-500ms', '500ms-1s', '1s-5s', '> 5s'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: [
                        '#28a745',
                        '#17a2b8',
                        '#ffc107',
                        '#fd7e14',
                        '#dc3545'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} requests (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Setup status code distribution bar chart
     */
    setupStatusCodeChart() {
        const ctx = document.getElementById('status-code-chart');
        if (!ctx) return;
        
        this.charts.statusCode = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['200', '201', '400', '401', '403', '404', '500'],
                datasets: [{
                    label: 'Status Codes',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: [
                        '#28a745',
                        '#20c997',
                        '#ffc107',
                        '#fd7e14',
                        '#e83e8c',
                        '#6f42c1',
                        '#dc3545'
                    ],
                    borderWidth: 1,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'HTTP Status Code'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Number of Requests'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} requests`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Refresh buttons
        document.getElementById('refresh-analytics-btn')?.addEventListener('click', () => {
            this.refreshAnalytics();
        });
        
        document.getElementById('refresh-endpoints-btn')?.addEventListener('click', () => {
            this.refreshTopEndpoints();
        });
        
        document.getElementById('refresh-response-chart-btn')?.addEventListener('click', () => {
            this.refreshResponseTimeChart();
        });
        
        document.getElementById('refresh-status-chart-btn')?.addEventListener('click', () => {
            this.refreshStatusCodeChart();
        });
        
        // Timeframe selector
        document.getElementById('analytics-timeframe')?.addEventListener('change', (e) => {
            this.updateTimeframe(e.target.value);
        });
        
        // Auto refresh toggle
        const autoRefreshBtn = document.getElementById('auto-refresh-toggle');
        if (autoRefreshBtn) {
            autoRefreshBtn.addEventListener('click', () => {
                this.toggleAutoRefresh();
            });
        }
    }
    
    /**
     * Load initial data
     */
    async loadInitialData() {
        try {
            await Promise.all([
                this.refreshAnalytics(),
                this.refreshTopEndpoints(),
                this.refreshResponseTimeChart(),
                this.refreshStatusCodeChart()
            ]);
        } catch (error) {
            console.error('Error loading initial analytics data:', error);
        }
    }
    
    /**
     * Refresh analytics data
     */
    async refreshAnalytics() {
        try {
            const button = document.getElementById('refresh-analytics-btn');
            this.setButtonLoading(button, true);
            
            // Get real analytics data
            const analyticsData = await this.getRealAnalyticsData();
            
            // Check if environment is not configured and disable auto-refresh
            if (analyticsData && analyticsData.message === 'Environment not configured') {
                this.showMessage('No environment selected for monitoring', 'info');
                this.disableAutoRefresh();
                return;
            }
            
            // Update metrics
            this.updateMetrics(analyticsData.metrics);
            
            // Update requests chart
            this.updateRequestsChart(analyticsData.requests);
            
        } catch (error) {
            console.error('Error refreshing analytics:', error);
            this.showError('Failed to refresh analytics data');
            // Disable auto-refresh on error to prevent spam
            this.disableAutoRefresh();
        } finally {
            const button = document.getElementById('refresh-analytics-btn');
            this.setButtonLoading(button, false);
        }
    }
    
    /**
     * Refresh top endpoints
     */
    async refreshTopEndpoints() {
        try {
            const button = document.getElementById('refresh-endpoints-btn');
            this.setButtonLoading(button, true);
            
            const analyticsData = await this.getRealAnalyticsData();
            this.updateTopEndpoints(analyticsData.topEndpoints);
            
        } catch (error) {
            console.error('Error refreshing endpoints:', error);
            this.showError('Failed to refresh endpoints data');
        } finally {
            const button = document.getElementById('refresh-endpoints-btn');
            this.setButtonLoading(button, false);
        }
    }
    
    /**
     * Refresh response time chart
     */
    async refreshResponseTimeChart() {
        try {
            const button = document.getElementById('refresh-response-chart-btn');
            this.setButtonLoading(button, true);
            
            const analyticsData = await this.getRealAnalyticsData();
            this.updateResponseTimeChart(analyticsData.responseTimeDistribution);
            
        } catch (error) {
            console.error('Error refreshing response time chart:', error);
        } finally {
            const button = document.getElementById('refresh-response-chart-btn');
            this.setButtonLoading(button, false);
        }
    }
    
    /**
     * Refresh status code chart
     */
    async refreshStatusCodeChart() {
        try {
            const button = document.getElementById('refresh-status-chart-btn');
            this.setButtonLoading(button, true);
            
            const analyticsData = await this.getRealAnalyticsData();
            this.updateStatusCodeChart(analyticsData.statusCodeDistribution);
            
        } catch (error) {
            console.error('Error refreshing status code chart:', error);
        } finally {
            const button = document.getElementById('refresh-status-chart-btn');
            this.setButtonLoading(button, false);
        }
    }
    
    /**
     * Update metrics display
     */
    updateMetrics(metrics) {
        document.getElementById('total-requests').textContent = metrics.totalRequests.toLocaleString();
        document.getElementById('avg-response-time').textContent = metrics.avgResponseTime + 'ms';
        document.getElementById('error-rate').textContent = metrics.errorRate + '%';
        document.getElementById('active-users').textContent = metrics.activeUsers.toLocaleString();
    }
    
    /**
     * Update requests chart
     */
    updateRequestsChart(requestsData) {
        const chart = this.charts.requests;
        if (!chart) return;
        
        chart.data.labels = requestsData.labels;
        chart.data.datasets[0].data = requestsData.requests;
        chart.data.datasets[1].data = requestsData.errors;
        chart.update('none');
    }
    
    /**
     * Update top endpoints display
     */
    updateTopEndpoints(endpointsData) {
        const container = document.getElementById('top-endpoints-content');
        if (!container) return;
        
        const html = endpointsData.map((endpoint, index) => `
            <div class="endpoint-item mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="endpoint-info">
                        <span class="endpoint-rank">#${index + 1}</span>
                        <span class="endpoint-method ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                        <span class="endpoint-path">${this.escapeHtml(endpoint.path)}</span>
                    </div>
                    <span class="endpoint-count">${endpoint.count.toLocaleString()}</span>
                </div>
                <div class="progress progress-sm">
                    <div class="progress-bar" style="width: ${endpoint.percentage}%"></div>
                </div>
                <div class="endpoint-stats">
                    <small class="text-muted">
                        Avg: ${endpoint.avgResponseTime}ms | 
                        Errors: ${endpoint.errorCount}
                    </small>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }
    
    /**
     * Update response time chart
     */
    updateResponseTimeChart(data) {
        const chart = this.charts.responseTime;
        if (!chart) return;
        
        chart.data.datasets[0].data = data;
        chart.update('none');
    }
    
    /**
     * Update status code chart
     */
    updateStatusCodeChart(data) {
        const chart = this.charts.statusCode;
        if (!chart) return;
        
        chart.data.datasets[0].data = data;
        chart.update('none');
    }
    
    /**
     * Toggle auto refresh
     */
    toggleAutoRefresh() {
        const button = document.getElementById('auto-refresh-toggle');
        
        if (this.isAutoRefreshEnabled) {
            // Disable auto refresh
            this.disableAutoRefresh();
        } else {
            // Enable auto refresh
            this.enableAutoRefresh();
        }
    }
    
    /**
     * Disable auto refresh
     */
    disableAutoRefresh() {
        const button = document.getElementById('auto-refresh-toggle');
        clearInterval(this.updateInterval);
        this.isAutoRefreshEnabled = false;
        if (button) {
            button.innerHTML = '<i class="fas fa-play"></i> Auto Refresh';
            button.classList.remove('auto-refresh-active');
        }
    }
    
    /**
     * Enable auto refresh
     */
    enableAutoRefresh() {
        const button = document.getElementById('auto-refresh-toggle');
        this.updateInterval = setInterval(() => {
            this.loadInitialData();
        }, this.updateFrequency);
        this.isAutoRefreshEnabled = true;
        if (button) {
            button.innerHTML = '<i class="fas fa-pause"></i> Auto Refresh';
            button.classList.add('auto-refresh-active');
        }
    }
    
    /**
     * Update timeframe
     */
    updateTimeframe(timeframe) {
        // This would typically update the API call parameters
        console.log('Timeframe changed to:', timeframe);
        this.refreshAnalytics();
    }
    
    /**
     * Get real analytics data from API
     */
    async getRealAnalyticsData() {
        const envId = window.monitorApi.currentEnvironmentId;
        if (!envId) {
            throw new Error('No environment selected for monitoring');
        }
        
        const response = await authenticatedFetch(`/api/v1/environments/${envId}/monitor/analytics`);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to fetch analytics data');
        }
        
        return response.data;
    }
    
    /**
     * Generate mock analytics data (fallback only)
     */
    generateMockAnalyticsData() {
        const now = new Date();
        const labels = [];
        const requests = [];
        const errors = [];
        
        // Generate last 24 hours of data (hourly)
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now.getTime() - (i * 60 * 60 * 1000));
            labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
            
            const baseRequests = Math.floor(Math.random() * 500) + 100;
            const errorCount = Math.floor(baseRequests * (Math.random() * 0.1)); // 0-10% error rate
            
            requests.push(baseRequests);
            errors.push(errorCount);
        }
        
        const totalRequests = requests.reduce((a, b) => a + b, 0);
        const totalErrors = errors.reduce((a, b) => a + b, 0);
        
        return {
            requests: { labels, requests, errors },
            metrics: {
                totalRequests: totalRequests,
                avgResponseTime: Math.floor(Math.random() * 200) + 50,
                errorRate: totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : 0,
                activeUsers: Math.floor(Math.random() * 500) + 50
            }
        };
    }
    
    /**
     * Generate mock endpoints data
     */
    generateMockEndpointsData() {
        const endpoints = [
            { method: 'GET', path: '/api/v1/patients', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'POST', path: '/api/v1/appointments', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'GET', path: '/api/v1/practitioners', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'PUT', path: '/api/v1/patients/:id', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'GET', path: '/api/v1/dashboard/stats', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'POST', path: '/api/v1/auth/login', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'GET', path: '/api/v1/environments', count: 0, avgResponseTime: 0, errorCount: 0 },
            { method: 'DELETE', path: '/api/v1/appointments/:id', count: 0, avgResponseTime: 0, errorCount: 0 }
        ];
        
        // Generate random data
        endpoints.forEach(endpoint => {
            endpoint.count = Math.floor(Math.random() * 1000) + 50;
            endpoint.avgResponseTime = Math.floor(Math.random() * 300) + 50;
            endpoint.errorCount = Math.floor(endpoint.count * (Math.random() * 0.05)); // 0-5% errors
        });
        
        // Sort by count descending and take top 5
        const sortedEndpoints = endpoints.sort((a, b) => b.count - a.count).slice(0, 5);
        
        // Calculate percentages
        const maxCount = sortedEndpoints[0].count;
        sortedEndpoints.forEach(endpoint => {
            endpoint.percentage = Math.round((endpoint.count / maxCount) * 100);
        });
        
        return sortedEndpoints;
    }
    
    /**
     * Generate mock response time data
     */
    generateMockResponseTimeData() {
        const total = Math.floor(Math.random() * 1000) + 500;
        return [
            Math.floor(total * 0.6), // < 100ms
            Math.floor(total * 0.25), // 100-500ms
            Math.floor(total * 0.1),  // 500ms-1s
            Math.floor(total * 0.04), // 1s-5s
            Math.floor(total * 0.01)  // > 5s
        ];
    }
    
    /**
     * Generate mock status code data
     */
    generateMockStatusCodeData() {
        const total = Math.floor(Math.random() * 1000) + 500;
        return [
            Math.floor(total * 0.8),   // 200
            Math.floor(total * 0.1),   // 201
            Math.floor(total * 0.03),  // 400
            Math.floor(total * 0.02),  // 401
            Math.floor(total * 0.01),  // 403
            Math.floor(total * 0.03),  // 404
            Math.floor(total * 0.01)   // 500
        ];
    }
    
    /**
     * Set button loading state
     */
    setButtonLoading(button, isLoading) {
        if (!button) return;
        
        const icon = button.querySelector('i');
        if (isLoading) {
            button.disabled = true;
            button.classList.add('refreshing');
            if (icon) icon.classList.add('fa-spin');
        } else {
            button.disabled = false;
            button.classList.remove('refreshing');
            if (icon) icon.classList.remove('fa-spin');
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }
    
    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Destroy all charts and intervals
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
    }
}

// Manual initialization - called by monitor controller
window.initRealtimeAnalytics = function() {
    if (!window.realtimeAnalytics) {
        window.realtimeAnalytics = new RealtimeAnalytics();
    }
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealtimeAnalytics;
}