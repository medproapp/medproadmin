/**
 * Customer Detail Component
 * Handles displaying detailed customer information in a modal
 */
class CustomerDetail {
    constructor() {
        this.modal = document.getElementById('customer-modal');
        this.modalName = document.getElementById('modal-customer-name');
        this.modalBody = document.getElementById('modal-body');
        this.currentCustomer = null;
        
        this.bindEvents();
    }

    /**
     * Bind modal event handlers
     */
    bindEvents() {
        if (!this.modal) return;

        // Close modal events
        const closeBtn = this.modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hideModal();
            }
        });
    }

    /**
     * Show customer details
     * @param {string} customerId - Customer ID
     */
    async showDetails(customerId) {
        try {
            this.showModal();
            this.showLoading();
            
            const response = await customerAPI.getCustomer(customerId);
            
            if (response.success && response.data) {
                this.currentCustomer = response.data.customer;
                this.renderCustomerDetails(response.data);
            } else {
                throw new Error(response.message || 'Failed to load customer details');
            }
        } catch (error) {
            console.error('Error loading customer details:', error);
            this.showError('Failed to load customer details: ' + error.message);
        }
    }

    /**
     * Show customer subscriptions
     * @param {string} customerId - Customer ID
     */
    async showSubscriptions(customerId) {
        try {
            this.showModal();
            this.showLoading();
            
            const [customerResponse, subscriptionsResponse] = await Promise.all([
                customerAPI.getCustomer(customerId),
                customerAPI.getCustomerSubscriptions(customerId)
            ]);
            
            if (customerResponse.success && subscriptionsResponse.success) {
                this.currentCustomer = customerResponse.data.customer;
                this.renderSubscriptions(subscriptionsResponse.data);
            } else {
                throw new Error('Failed to load subscription data');
            }
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            this.showError('Failed to load subscriptions: ' + error.message);
        }
    }

    /**
     * Show customer activity timeline
     * @param {string} customerId - Customer ID
     */
    async showActivity(customerId) {
        try {
            this.showModal();
            this.showLoading();
            
            const [customerResponse, activityResponse] = await Promise.all([
                customerAPI.getCustomer(customerId),
                customerAPI.getCustomerActivity(customerId, { limit: 50 })
            ]);
            
            if (customerResponse.success && activityResponse.success) {
                this.currentCustomer = customerResponse.data.customer;
                this.renderActivity(activityResponse.data);
            } else {
                throw new Error('Failed to load activity data');
            }
        } catch (error) {
            console.error('Error loading activity:', error);
            this.showError('Failed to load activity: ' + error.message);
        }
    }

    /**
     * Render complete customer details
     * @param {Object} data - Customer data with subscriptions and metrics
     */
    renderCustomerDetails(data) {
        const customer = data.customer;
        const subscriptions = data.subscriptions || [];
        const metricsHistory = data.metrics_history || [];
        const paymentMethods = data.payment_methods || [];

        if (this.modalName) {
            this.modalName.textContent = customer.name || customer.email;
        }

        if (this.modalBody) {
            this.modalBody.innerHTML = `
                <div class="customer-detail-container">
                    ${this.renderCustomerOverview(customer)}
                    ${this.renderCustomerMetrics(customer)}
                    ${this.renderSubscriptionsList(subscriptions)}
                    ${this.renderPaymentMethods(paymentMethods)}
                    ${this.renderMetricsHistory(metricsHistory)}
                    ${this.renderCustomerActions(customer)}
                </div>
            `;

            // Bind action buttons
            this.bindActionButtons();
        }
    }

    /**
     * Render customer overview section
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderCustomerOverview(customer) {
        const initials = CustomerUtils.getInitials(customer.name, customer.email);
        const avatarColor = CustomerUtils.getAvatarColor(customer.name || customer.email);
        const healthClass = CustomerUtils.getHealthClass(customer.health_score);
        const riskClass = CustomerUtils.getChurnRiskClass(customer.churn_risk_score);

        return `
            <div class="customer-overview">
                <div class="customer-header-detail">
                    <div class="customer-avatar-large" style="background-color: ${avatarColor}">
                        ${initials}
                    </div>
                    <div class="customer-basic-info">
                        <h3>${customer.name || 'No name provided'}</h3>
                        <p class="customer-email-large">${customer.email}</p>
                        <p class="customer-id">ID: ${customer.stripe_customer_id}</p>
                        <div class="customer-badges-detail">
                            <span class="health-badge-detail ${healthClass}">
                                Health: ${CustomerUtils.getHealthText(customer.health_score)}
                            </span>
                            <span class="risk-badge-detail ${riskClass}">
                                Risk: ${CustomerUtils.getChurnRiskText(customer.churn_risk_score)}
                            </span>
                            ${customer.delinquent ? '<span class="delinquent-badge">Delinquent</span>' : ''}
                            ${customer.deleted ? '<span class="deleted-badge">Deleted</span>' : ''}
                        </div>
                    </div>
                </div>

                <div class="customer-info-grid">
                    <div class="info-item">
                        <label>Customer Since</label>
                        <span>${CustomerUtils.formatDate(customer.stripe_created_at)}</span>
                    </div>
                    <div class="info-item">
                        <label>Last Sync</label>
                        <span>${CustomerUtils.formatRelativeTime(customer.last_sync_at)}</span>
                    </div>
                    <div class="info-item">
                        <label>Currency</label>
                        <span>${(customer.currency || 'BRL').toUpperCase()}</span>
                    </div>
                    <div class="info-item">
                        <label>Balance</label>
                        <span>${CustomerUtils.formatCurrency(customer.balance || 0)}</span>
                    </div>
                    ${customer.phone ? `
                        <div class="info-item">
                            <label>Phone</label>
                            <span>${customer.phone}</span>
                        </div>
                    ` : ''}
                    ${customer.description ? `
                        <div class="info-item full-width">
                            <label>Description</label>
                            <span>${customer.description}</span>
                        </div>
                    ` : ''}
                    ${this.renderAddress(customer)}
                </div>
            </div>
        `;
    }

    /**
     * Render customer address if available
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderAddress(customer) {
        const address = [
            customer.address_line1,
            customer.address_line2,
            customer.address_city,
            customer.address_state,
            customer.address_postal_code,
            customer.address_country
        ].filter(Boolean);

        if (address.length === 0) return '';

        return `
            <div class="info-item full-width">
                <label>Address</label>
                <span>${address.join(', ')}</span>
            </div>
        `;
    }

    /**
     * Render customer metrics
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderCustomerMetrics(customer) {
        return `
            <div class="customer-metrics">
                <h4>Customer Metrics</h4>
                <div class="metrics-grid-detail">
                    <div class="metric-item">
                        <label>Total Revenue</label>
                        <span class="metric-value">${CustomerUtils.formatCurrency(customer.total_revenue || 0)}</span>
                    </div>
                    <div class="metric-item">
                        <label>Lifetime Value</label>
                        <span class="metric-value">${CustomerUtils.formatCurrency(customer.lifetime_value || 0)}</span>
                    </div>
                    <div class="metric-item">
                        <label>Subscriptions</label>
                        <span class="metric-value">${customer.subscription_count || 0} total</span>
                    </div>
                    <div class="metric-item">
                        <label>Active Subscriptions</label>
                        <span class="metric-value">${customer.active_subscription_count || 0}</span>
                    </div>
                    <div class="metric-item">
                        <label>Health Score</label>
                        <span class="metric-value">${customer.health_score || 0}/100</span>
                    </div>
                    <div class="metric-item">
                        <label>Churn Risk</label>
                        <span class="metric-value">${Math.round((customer.churn_risk_score || 0) * 100)}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render subscriptions list
     * @param {Array} subscriptions - Subscription data
     * @returns {string} HTML string
     */
    renderSubscriptionsList(subscriptions) {
        if (!subscriptions || subscriptions.length === 0) {
            return `
                <div class="customer-subscriptions">
                    <h4>Subscriptions</h4>
                    <div class="empty-subscriptions">
                        <p>No subscriptions found</p>
                    </div>
                </div>
            `;
        }

        const subscriptionCards = subscriptions.map(sub => this.renderSubscriptionCard(sub)).join('');

        return `
            <div class="customer-subscriptions">
                <h4>Subscriptions (${subscriptions.length})</h4>
                <div class="subscriptions-list">
                    ${subscriptionCards}
                </div>
            </div>
        `;
    }

    /**
     * Render single subscription card
     * @param {Object} subscription - Subscription data
     * @returns {string} HTML string
     */
    renderSubscriptionCard(subscription) {
        const statusClass = CustomerUtils.getStatusClass(subscription.status);
        const statusText = CustomerUtils.getStatusText(subscription.status);

        return `
            <div class="subscription-card ${statusClass}">
                <div class="subscription-header">
                    <div class="subscription-info">
                        <h5>${subscription.product_name || 'Unknown Product'}</h5>
                        <p class="subscription-id">${subscription.stripe_subscription_id}</p>
                    </div>
                    <span class="subscription-status ${statusClass}">${statusText}</span>
                </div>
                
                <div class="subscription-details">
                    <div class="detail-item">
                        <label>Price</label>
                        <span>${CustomerUtils.formatCurrency(subscription.unit_amount || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Billing</label>
                        <span>${subscription.billing_period || 'Unknown'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Current Period</label>
                        <span>${CustomerUtils.formatDate(subscription.current_period_start)} - ${CustomerUtils.formatDate(subscription.current_period_end)}</span>
                    </div>
                    ${subscription.trial_end ? `
                        <div class="detail-item">
                            <label>Trial Ends</label>
                            <span>${CustomerUtils.formatDate(subscription.trial_end)}</span>
                        </div>
                    ` : ''}
                    ${subscription.canceled_at ? `
                        <div class="detail-item">
                            <label>Canceled</label>
                            <span>${CustomerUtils.formatDate(subscription.canceled_at)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render payment methods
     * @param {Array} paymentMethods - Payment methods data
     * @returns {string} HTML string
     */
    renderPaymentMethods(paymentMethods) {
        if (!paymentMethods || paymentMethods.length === 0) {
            return `
                <div class="customer-payment-methods">
                    <h4>Payment Methods</h4>
                    <div class="empty-payment-methods">
                        <p>No payment methods found</p>
                    </div>
                </div>
            `;
        }

        const methodCards = paymentMethods.map(method => {
            return `
                <div class="payment-method-card">
                    <div class="payment-method-info">
                        <span class="payment-brand">${method.card?.brand?.toUpperCase() || 'Card'}</span>
                        <span class="payment-last4">•••• ${method.card?.last4 || '0000'}</span>
                        <span class="payment-expires">${method.card?.exp_month}/${method.card?.exp_year}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="customer-payment-methods">
                <h4>Payment Methods</h4>
                <div class="payment-methods-list">
                    ${methodCards}
                </div>
            </div>
        `;
    }

    /**
     * Render metrics history
     * @param {Array} metricsHistory - Historical metrics data
     * @returns {string} HTML string
     */
    renderMetricsHistory(metricsHistory) {
        if (!metricsHistory || metricsHistory.length === 0) {
            return '';
        }

        // Show last 7 days of metrics
        const recentMetrics = metricsHistory.slice(0, 7);
        const historyRows = recentMetrics.map(metric => `
            <tr>
                <td>${CustomerUtils.formatDate(metric.metric_date)}</td>
                <td>${metric.health_score || 0}</td>
                <td>${Math.round((metric.churn_risk_score || 0) * 100)}%</td>
                <td>${CustomerUtils.formatCurrency(metric.total_revenue || 0)}</td>
                <td>${CustomerUtils.formatCurrency(metric.lifetime_value || 0)}</td>
            </tr>
        `).join('');

        return `
            <div class="customer-metrics-history">
                <h4>Recent Metrics History</h4>
                <div class="metrics-table-container">
                    <table class="metrics-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Health Score</th>
                                <th>Churn Risk</th>
                                <th>Revenue</th>
                                <th>LTV</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Render customer actions
     * @param {Object} customer - Customer data
     * @returns {string} HTML string
     */
    renderCustomerActions(customer) {
        return `
            <div class="customer-actions-detail">
                <h4>Actions</h4>
                <div class="action-buttons">
                    <button class="btn btn-secondary" data-action="view-activity">
                        📋 View Activity
                    </button>
                    <button class="btn btn-secondary" data-action="recalculate-metrics">
                        🔄 Recalculate Metrics
                    </button>
                    <button class="btn btn-secondary" data-action="view-stripe" onclick="window.open('https://dashboard.stripe.com/customers/${customer.stripe_customer_id}', '_blank')">
                        🔗 View in Stripe
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render subscriptions-only view
     * @param {Object} data - Subscriptions data
     */
    renderSubscriptions(data) {
        const subscriptions = data.subscriptions || [];

        if (this.modalName) {
            this.modalName.textContent = `Subscriptions - ${this.currentCustomer?.name || this.currentCustomer?.email || 'Customer'}`;
        }

        if (this.modalBody) {
            this.modalBody.innerHTML = `
                <div class="subscriptions-detail-container">
                    ${this.renderSubscriptionsList(subscriptions)}
                </div>
            `;
        }
    }

    /**
     * Render activity timeline
     * @param {Object} data - Activity data
     */
    renderActivity(data) {
        const activities = data.activities || [];

        if (this.modalName) {
            this.modalName.textContent = `Activity - ${this.currentCustomer?.name || this.currentCustomer?.email || 'Customer'}`;
        }

        const activityItems = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    ${this.getActivityIcon(activity.activity_type)}
                </div>
                <div class="activity-content">
                    <div class="activity-description">${activity.activity_description}</div>
                    <div class="activity-date">${CustomerUtils.formatDateTime(activity.activity_date)}</div>
                    ${activity.metadata?.amount ? `<div class="activity-amount">${CustomerUtils.formatCurrency(activity.metadata.amount)}</div>` : ''}
                </div>
            </div>
        `).join('');

        if (this.modalBody) {
            this.modalBody.innerHTML = `
                <div class="activity-detail-container">
                    <div class="customer-activity-timeline">
                        <h4>Activity Timeline</h4>
                        <div class="activity-list">
                            ${activities.length > 0 ? activityItems : '<p>No activity found</p>'}
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Get icon for activity type
     * @param {string} type - Activity type
     * @returns {string} Icon
     */
    getActivityIcon(type) {
        const icons = {
            'subscription': '📋',
            'customer_sync': '🔄',
            'payment': '💳',
            'invoice': '📄',
            'default': '📌'
        };
        return icons[type] || icons.default;
    }

    /**
     * Bind action button events
     */
    bindActionButtons() {
        if (!this.modalBody) return;

        this.modalBody.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action || !this.currentCustomer) return;

            switch (action) {
                case 'view-activity':
                    await this.showActivity(this.currentCustomer.stripe_customer_id);
                    break;
                case 'recalculate-metrics':
                    await this.recalculateMetrics();
                    break;
            }
        });
    }

    /**
     * Recalculate customer metrics
     */
    async recalculateMetrics() {
        if (!this.currentCustomer) return;

        try {
            this.showLoading();
            await customerAPI.recalculateMetrics(this.currentCustomer.stripe_customer_id);
            
            // Refresh customer details
            await this.showDetails(this.currentCustomer.stripe_customer_id);
            
            // Show success message
            if (window.adminUtils && window.adminUtils.showToast) {
                window.adminUtils.showToast('Metrics recalculated successfully', 'success');
            }
        } catch (error) {
            console.error('Error recalculating metrics:', error);
            this.showError('Failed to recalculate metrics: ' + error.message);
        }
    }

    /**
     * Show modal
     */
    showModal() {
        if (this.modal) {
            this.modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Hide modal
     */
    hideModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
            document.body.style.overflow = '';
            this.currentCustomer = null;
        }
    }

    /**
     * Show loading in modal body
     */
    showLoading() {
        if (this.modalBody) {
            CustomerUtils.showLoading(this.modalBody, 'Loading customer data...');
        }
    }

    /**
     * Show error in modal body
     * @param {string} message - Error message
     */
    showError(message) {
        if (this.modalBody) {
            CustomerUtils.showError(this.modalBody, message, () => this.hideModal());
        }
    }
}

// Create global instance
window.customerDetail = new CustomerDetail();