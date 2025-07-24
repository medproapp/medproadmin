/**
 * Analytics Charts Component
 * Handles chart creation and data visualization
 */
class AnalyticsCharts {
    constructor() {
        this.charts = {};
        this.chartColors = {
            primary: '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            danger: '#dc3545',
            info: '#17a2b8',
            secondary: '#6c757d',
            gradient: [
                '#007bff', '#28a745', '#ffc107', '#dc3545', 
                '#17a2b8', '#6f42c1', '#fd7e14', '#20c997'
            ]
        };
    }

    /**
     * Initialize all charts with data
     * @param {Object} data - Analytics data
     */
    async initializeCharts(data) {
        try {
            // Destroy existing charts
            this.destroyCharts();

            // Initialize charts with data
            await Promise.all([
                this.initGrowthChart(data.customer_growth || []),
                this.initRevenueChart(data.revenue_trends || []),
                this.initSubscriptionStatusChart(data.subscription_breakdown || []),
                this.initHealthDistributionChart(data.health_distribution || []),
                this.initProductRevenueChart(data.revenue_by_product || []),
                this.initLTVDistributionChart(data.ltv_distribution || [])
            ]);

        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }

    /**
     * Customer Growth Chart
     * @param {Array} data - Growth data
     */
    async initGrowthChart(data) {
        const ctx = document.getElementById('growth-chart');
        if (!ctx || !data.length) return;

        try {
            const dates = data.map(d => new Date(d.date).toLocaleDateString('pt-BR'));
            const newCustomers = data.map(d => d.new_customers || 0);
            const cumulativeCustomers = data.map(d => d.cumulative_customers || 0);

            this.charts.growth = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'New Customers',
                            data: newCustomers,
                            borderColor: this.chartColors.primary,
                            backgroundColor: this.chartColors.primary + '20',
                            tension: 0.4,
                            fill: true,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Total Customers',
                            data: cumulativeCustomers,
                            borderColor: this.chartColors.success,
                            backgroundColor: this.chartColors.success + '20',
                            tension: 0.4,
                            fill: false,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.parsed.y}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'New Customers'
                            },
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Total Customers'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating growth chart:', error);
        }
    }

    /**
     * Revenue Trend Chart
     * @param {Array} data - Revenue data
     */
    async initRevenueChart(data) {
        const ctx = document.getElementById('revenue-chart');
        if (!ctx || !data.length) return;

        try {
            const dates = data.map(d => new Date(d.date).toLocaleDateString('pt-BR'));
            const revenue = data.map(d => d.total_revenue || 0);
            const subscriptions = data.map(d => d.active_subscriptions || 0);

            this.charts.revenue = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'Revenue (R$)',
                            data: revenue,
                            backgroundColor: this.chartColors.success + '80',
                            borderColor: this.chartColors.success,
                            borderWidth: 1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Active Subscriptions',
                            data: subscriptions,
                            type: 'line',
                            borderColor: this.chartColors.primary,
                            backgroundColor: this.chartColors.primary + '20',
                            tension: 0.4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (context.dataset.label.includes('Revenue')) {
                                        return `${context.dataset.label}: R$ ${context.parsed.y}`;
                                    }
                                    return `${context.dataset.label}: ${context.parsed.y}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Revenue (R$)'
                            },
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Subscriptions'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating revenue chart:', error);
        }
    }

    /**
     * Subscription Status Chart
     * @param {Array} data - Subscription status data
     */
    async initSubscriptionStatusChart(data) {
        const ctx = document.getElementById('subscription-status-chart');
        if (!ctx || !data.length) return;

        try {
            const labels = data.map(d => CustomerUtils.getStatusText(d.status));
            const values = data.map(d => d.count || 0);
            const colors = data.map(d => this.getStatusColor(d.status));

            this.charts.subscriptionStatus = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed * 100) / total).toFixed(1);
                                    return `${context.label}: ${context.parsed} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating subscription status chart:', error);
        }
    }

    /**
     * Health Score Distribution Chart
     * @param {Array} data - Health distribution data
     */
    async initHealthDistributionChart(data) {
        const ctx = document.getElementById('health-distribution-chart');
        if (!ctx || !data.length) return;

        try {
            const labels = data.map(d => d.category);
            const values = data.map(d => d.customer_count || 0);
            const colors = data.map(d => this.getHealthColor(d.category));

            this.charts.healthDistribution = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Customers',
                        data: values,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace('80', 'ff')),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label}: ${context.parsed.y} customers`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Customers'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Health Score Category'
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating health distribution chart:', error);
        }
    }

    /**
     * Product Revenue Chart
     * @param {Array} data - Product revenue data
     */
    async initProductRevenueChart(data) {
        const ctx = document.getElementById('product-revenue-chart');
        if (!ctx || !data.length) return;

        try {
            // Take top 8 products to avoid cluttering
            const topProducts = data.slice(0, 8);
            const labels = topProducts.map(d => this.truncateLabel(d.product_name, 20));
            const values = topProducts.map(d => d.total_revenue || 0);

            this.charts.productRevenue = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (R$)',
                        data: values,
                        backgroundColor: this.chartColors.gradient.slice(0, topProducts.length),
                        borderColor: this.chartColors.gradient.slice(0, topProducts.length).map(c => c + 'ff'),
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label}: R$ ${context.parsed.x}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Revenue (R$)'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Product'
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating product revenue chart:', error);
        }
    }

    /**
     * LTV Distribution Chart
     * @param {Array} data - LTV distribution data
     */
    async initLTVDistributionChart(data) {
        const ctx = document.getElementById('ltv-distribution-chart');
        if (!ctx || !data.length) return;

        try {
            const labels = data.map(d => d.ltv_range);
            const values = data.map(d => d.customer_count || 0);

            this.charts.ltvDistribution = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: this.chartColors.gradient.slice(0, data.length),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed * 100) / total).toFixed(1);
                                    return `${context.label}: ${context.parsed} customers (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating LTV distribution chart:', error);
        }
    }

    /**
     * Get color for subscription status
     * @param {string} status - Status name
     * @returns {string} Color
     */
    getStatusColor(status) {
        const statusColors = {
            'active': this.chartColors.success + '80',
            'past_due': this.chartColors.warning + '80',
            'canceled': this.chartColors.danger + '80',
            'trialing': this.chartColors.info + '80',
            'unpaid': this.chartColors.secondary + '80'
        };
        return statusColors[status?.toLowerCase()] || this.chartColors.secondary + '80';
    }

    /**
     * Get color for health category
     * @param {string} category - Health category
     * @returns {string} Color
     */
    getHealthColor(category) {
        if (category.includes('Excellent')) return this.chartColors.success + '80';
        if (category.includes('Good')) return this.chartColors.info + '80';
        if (category.includes('Fair')) return this.chartColors.warning + '80';
        if (category.includes('Poor')) return '#fd7e14' + '80';
        if (category.includes('Critical')) return this.chartColors.danger + '80';
        return this.chartColors.secondary + '80';
    }

    /**
     * Truncate label text
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateLabel(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Destroy all charts
     */
    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};
    }

    /**
     * Update chart theme (for future dark mode support)
     * @param {string} theme - Theme name
     */
    updateTheme(theme = 'light') {
        // Implementation for theme updates
        // This could be used to switch between light and dark modes
        console.log(`Chart theme updated to: ${theme}`);
    }

    /**
     * Resize all charts (useful for responsive updates)
     */
    resizeCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }

    /**
     * Export chart as image
     * @param {string} chartName - Name of chart to export
     * @returns {string} Data URL of chart image
     */
    exportChart(chartName) {
        const chart = this.charts[chartName];
        if (chart && chart.canvas) {
            return chart.canvas.toDataURL('image/png');
        }
        return null;
    }

    /**
     * Get chart configuration for debugging
     * @param {string} chartName - Name of chart
     * @returns {Object} Chart configuration
     */
    getChartConfig(chartName) {
        const chart = this.charts[chartName];
        if (chart) {
            return {
                type: chart.config.type,
                data: chart.config.data,
                options: chart.config.options
            };
        }
        return null;
    }
}

// Make AnalyticsCharts available globally
window.AnalyticsCharts = AnalyticsCharts;