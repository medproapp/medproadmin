/**
 * Customer Utilities
 * Helper functions for customer data formatting and display
 */
class CustomerUtils {
    /**
     * Format currency values from cents to readable format
     * @param {number} cents - Amount in cents
     * @param {string} currency - Currency code (default: BRL)
     * @returns {string} Formatted currency
     */
    static formatCurrency(cents, currency = 'BRL') {
        if (cents === null || cents === undefined || isNaN(cents)) {
            return 'R$ 0,00';
        }
        
        const amount = cents / 100;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency === 'usd' ? 'USD' : 'BRL'
        }).format(amount);
    }

    /**
     * Format date to Brazilian format
     * @param {string|Date} dateString - Date to format
     * @returns {string} Formatted date
     */
    static formatDate(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR');
    }

    /**
     * Format date with time to Brazilian format
     * @param {string|Date} dateString - Date to format
     * @returns {string} Formatted date and time
     */
    static formatDateTime(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Format relative time (e.g., "2 days ago")
     * @param {string|Date} dateString - Date to format
     * @returns {string} Relative time
     */
    static formatRelativeTime(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
        const diffMinutes = Math.floor(diffMs / (60 * 1000));
        
        if (diffDays > 30) {
            const diffMonths = Math.floor(diffDays / 30);
            return `${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'} atrás`;
        } else if (diffDays > 0) {
            return `${diffDays} ${diffDays === 1 ? 'dia' : 'dias'} atrás`;
        } else if (diffHours > 0) {
            return `${diffHours} ${diffHours === 1 ? 'hora' : 'horas'} atrás`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes} ${diffMinutes === 1 ? 'minuto' : 'minutos'} atrás`;
        } else {
            return 'Agora';
        }
    }

    /**
     * Get health score class for styling
     * @param {number} score - Health score (0-100)
     * @returns {string} CSS class name
     */
    static getHealthClass(score) {
        if (score === null || score === undefined || isNaN(score)) {
            return 'health-unknown';
        }
        
        if (score >= 80) return 'health-excellent';
        if (score >= 60) return 'health-good';
        if (score >= 40) return 'health-warning';
        if (score >= 20) return 'health-poor';
        return 'health-critical';
    }

    /**
     * Get health score display text
     * @param {number} score - Health score (0-100)
     * @returns {string} Health status text
     */
    static getHealthText(score) {
        if (score === null || score === undefined || isNaN(score)) {
            return 'Unknown';
        }
        
        if (score >= 80) return 'Excellent';
        if (score >= 60) return 'Good';
        if (score >= 40) return 'Fair';
        if (score >= 20) return 'Poor';
        return 'Critical';
    }

    /**
     * Get churn risk class for styling
     * @param {number} riskScore - Churn risk (0-1)
     * @returns {string} CSS class name
     */
    static getChurnRiskClass(riskScore) {
        if (riskScore === null || riskScore === undefined || isNaN(riskScore)) {
            return 'risk-unknown';
        }
        
        if (riskScore >= 0.8) return 'risk-critical';
        if (riskScore >= 0.6) return 'risk-high';
        if (riskScore >= 0.4) return 'risk-medium';
        if (riskScore >= 0.2) return 'risk-low';
        return 'risk-minimal';
    }

    /**
     * Get churn risk display text
     * @param {number} riskScore - Churn risk (0-1)
     * @returns {string} Risk level text
     */
    static getChurnRiskText(riskScore) {
        if (riskScore === null || riskScore === undefined || isNaN(riskScore)) {
            return 'Unknown';
        }
        
        if (riskScore >= 0.8) return 'Critical Risk';
        if (riskScore >= 0.6) return 'High Risk';
        if (riskScore >= 0.4) return 'Medium Risk';
        if (riskScore >= 0.2) return 'Low Risk';
        return 'Minimal Risk';
    }

    /**
     * Get subscription status class for styling
     * @param {string} status - Subscription status
     * @returns {string} CSS class name
     */
    static getStatusClass(status) {
        if (!status) return 'status-unknown';
        
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'active': return 'status-active';
            case 'trialing': return 'status-trial';
            case 'past_due': return 'status-past-due';
            case 'canceled': return 'status-canceled';
            case 'unpaid': return 'status-unpaid';
            case 'incomplete': return 'status-incomplete';
            case 'incomplete_expired': return 'status-expired';
            default: return 'status-unknown';
        }
    }

    /**
     * Get subscription status display text
     * @param {string} status - Subscription status
     * @returns {string} Human-readable status
     */
    static getStatusText(status) {
        if (!status) return 'Unknown';
        
        const statusLower = status.toLowerCase();
        const statusMap = {
            'active': 'Active',
            'trialing': 'Trial',
            'past_due': 'Past Due',
            'canceled': 'Canceled',
            'unpaid': 'Unpaid',
            'incomplete': 'Incomplete',
            'incomplete_expired': 'Expired'
        };
        
        return statusMap[statusLower] || status;
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    static truncateText(text, maxLength = 50) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Get customer initials for avatar
     * @param {string} name - Customer name
     * @param {string} email - Customer email (fallback)
     * @returns {string} Initials (max 2 characters)
     */
    static getInitials(name, email) {
        if (name && name.trim()) {
            const words = name.trim().split(' ');
            if (words.length >= 2) {
                return (words[0][0] + words[1][0]).toUpperCase();
            } else {
                return words[0].substring(0, 2).toUpperCase();
            }
        } else if (email && email.trim()) {
            return email.substring(0, 2).toUpperCase();
        } else {
            return '??';
        }
    }

    /**
     * Get avatar background color based on name/email
     * @param {string} text - Name or email
     * @returns {string} CSS background color
     */
    static getAvatarColor(text) {
        const colors = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
            '#9b59b6', '#1abc9c', '#34495e', '#e67e22',
            '#95a5a6', '#16a085', '#27ae60', '#2980b9'
        ];
        
        if (!text) return colors[0];
        
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * Format subscription billing period
     * @param {number} intervalCount - Billing interval count
     * @param {string} interval - Billing interval (month, year, etc.)
     * @returns {string} Formatted billing period
     */
    static formatBillingPeriod(intervalCount, interval) {
        if (!intervalCount || !interval) return '-';
        
        const intervalMap = {
            'day': intervalCount === 1 ? 'dia' : 'dias',
            'week': intervalCount === 1 ? 'semana' : 'semanas',
            'month': intervalCount === 1 ? 'mês' : 'meses',
            'year': intervalCount === 1 ? 'ano' : 'anos'
        };
        
        const periodText = intervalMap[interval.toLowerCase()] || interval;
        return intervalCount === 1 ? `1 ${periodText}` : `${intervalCount} ${periodText}`;
    }

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid email
     */
    static isValidEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Debounce function for search inputs
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
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
     * Show loading state
     * @param {HTMLElement} element - Element to show loading in
     * @param {string} message - Loading message
     */
    static showLoading(element, message = 'Loading...') {
        if (element) {
            element.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    /**
     * Show error state
     * @param {HTMLElement} element - Element to show error in
     * @param {string} message - Error message
     * @param {Function} retryCallback - Retry function
     */
    static showError(element, message = 'Something went wrong', retryCallback = null) {
        if (element) {
            element.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Error</h3>
                    <p>${message}</p>
                    ${retryCallback ? '<button class="btn btn-primary retry-btn">Retry</button>' : ''}
                </div>
            `;
            
            if (retryCallback) {
                const retryBtn = element.querySelector('.retry-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', retryCallback);
                }
            }
        }
    }
}

// Make CustomerUtils available globally
window.CustomerUtils = CustomerUtils;