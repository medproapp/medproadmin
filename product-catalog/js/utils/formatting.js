// Formatting Utilities for Product Catalog

class ProductFormatter {
    constructor() {
        this.currencyFormatter = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
        
        this.numberFormatter = new Intl.NumberFormat('pt-BR');
        
        this.dateFormatter = new Intl.DateTimeFormat('pt-BR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Format currency from cents
    formatCurrency(cents, currency = 'BRL') {
        const amount = cents / 100;
        
        if (currency === 'USD') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(amount);
        }
        
        return this.currencyFormatter.format(amount);
    }
    
    // Format price (alias for formatCurrency)
    formatPrice(cents, currency = 'BRL') {
        return this.formatCurrency(cents, currency);
    }
    
    // Format large numbers
    formatNumber(num) {
        if (!num && num !== 0) return '0';
        
        // For very large numbers, use abbreviations
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}k`;
        }
        
        return this.numberFormatter.format(num);
    }
    
    // Format billing period
    formatBillingPeriod(period) {
        const periods = {
            'month': 'Mensal',
            'semester': 'Semestral',
            'year': 'Anual',
            'one_time': 'Único'
        };
        
        return periods[period] || period;
    }
    
    // Format plan type
    formatPlanType(type) {
        const types = {
            'CLINIC': 'Clínica',
            'SCHEDULING': 'Agendamento'
        };
        
        return types[type] || type;
    }
    
    // Format user tier
    formatUserTier(tier) {
        if (tier === 1) return '1 usuário';
        return `${tier} usuários`;
    }
    
    // Format product name for display
    formatProductName(product) {
        const parts = [];
        
        if (product.metadata?.classification) {
            const { plan_type, user_tier } = product.metadata.classification;
            parts.push(this.formatPlanType(plan_type));
            parts.push('-');
            parts.push(this.formatUserTier(user_tier));
        }
        
        return product.name || parts.join(' ');
    }
    
    // Format metadata for display
    formatMetadataDisplay(metadata) {
        const display = [];
        
        // Patient limits
        if (metadata.subscription_limits?.patients?.max_patients) {
            display.push({
                label: 'Pacientes',
                value: this.formatNumber(metadata.subscription_limits.patients.max_patients)
            });
        }
        
        // User limits
        if (metadata.subscription_limits?.users) {
            const users = metadata.subscription_limits.users;
            const total = (users.practitioners || 0) + (users.assistants || 0);
            display.push({
                label: 'Usuários',
                value: `${users.practitioners || 0} médicos, ${users.assistants || 0} assistentes`
            });
        }
        
        // AI tokens
        if (metadata.ai_quotas?.tokens?.monthly_limit) {
            display.push({
                label: 'AI Tokens/mês',
                value: this.formatNumber(metadata.ai_quotas.tokens.monthly_limit)
            });
        }
        
        // Storage
        if (metadata.subscription_limits?.storage) {
            const storage = metadata.subscription_limits.storage;
            display.push({
                label: 'Armazenamento',
                value: `${storage.documents_gb || 0}GB docs, ${storage.images_gb || 0}GB imagens`
            });
        }
        
        return display;
    }
    
    // Format price summary
    formatPriceSummary(prices) {
        if (!prices || prices.length === 0) {
            return 'Sem preços definidos';
        }
        
        const activePrices = prices.filter(p => p.active);
        if (activePrices.length === 0) {
            return 'Nenhum preço ativo';
        }
        
        // Find monthly price as base
        const monthlyPrice = activePrices.find(p => p.billing_period === 'month');
        if (monthlyPrice) {
            return `A partir de ${this.formatCurrency(monthlyPrice.unit_amount)}/mês`;
        }
        
        // Use lowest price
        const lowestPrice = activePrices.reduce((min, p) => 
            p.unit_amount < min.unit_amount ? p : min
        );
        
        return `${this.formatCurrency(lowestPrice.unit_amount)}/${this.formatBillingPeriod(lowestPrice.billing_period)}`;
    }
    
    // Format sync status
    formatSyncStatus(status) {
        const statuses = {
            'synced': { text: 'Sincronizado', class: 'text-success' },
            'pending': { text: 'Pendente', class: 'text-warning' },
            'error': { text: 'Erro', class: 'text-danger' },
            'conflict': { text: 'Conflito', class: 'text-danger' }
        };
        
        return statuses[status] || { text: status, class: 'text-muted' };
    }
    
    // Format issue severity
    formatIssueSeverity(severity) {
        const severities = {
            'high': { text: 'Alto', class: 'text-danger', icon: 'exclamation-circle' },
            'medium': { text: 'Médio', class: 'text-warning', icon: 'exclamation-triangle' },
            'low': { text: 'Baixo', class: 'text-info', icon: 'info-circle' }
        };
        
        return severities[severity] || severities.medium;
    }
    
    // Format date relative
    formatDateRelative(date) {
        if (!date) return 'Nunca';
        
        const now = new Date();
        const past = new Date(date);
        const diff = now - past;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'Agora mesmo';
        if (minutes < 60) return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
        if (hours < 24) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
        if (days < 30) return `${days} dia${days > 1 ? 's' : ''} atrás`;
        
        return this.dateFormatter.format(past);
    }
    
    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Generate product badge HTML
    generateBadgeHtml(type, text) {
        const badges = {
            'active': 'bg-success',
            'inactive': 'bg-secondary',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info',
            'new': 'bg-primary'
        };
        
        const badgeClass = badges[type] || 'bg-secondary';
        return `<span class="badge ${badgeClass}">${text}</span>`;
    }
    
    // Truncate text
    truncateText(text, maxLength = 100) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    // Format JSON for display
    formatJSON(obj, indent = 2) {
        return JSON.stringify(obj, null, indent);
    }
    
    // Parse additionalusers field
    parseAdditionalUsers(jsonString) {
        try {
            const users = JSON.parse(jsonString);
            const result = {
                practitioners: 0,
                assistants: 0
            };
            
            users.forEach(user => {
                if (user.usertype === 'pract') {
                    result.practitioners = user.quantity;
                } else if (user.usertype === 'assist') {
                    result.assistants = user.quantity;
                }
            });
            
            return result;
        } catch (e) {
            return { practitioners: 0, assistants: 0 };
        }
    }
    
    // Format additionalusers for saving
    formatAdditionalUsers(practitioners, assistants) {
        const users = [];
        
        if (practitioners > 0) {
            users.push({ usertype: 'pract', quantity: practitioners });
        }
        
        if (assistants > 0) {
            users.push({ usertype: 'assist', quantity: assistants });
        }
        
        return JSON.stringify(users);
    }
}

// Create global instance
window.productFormatter = new ProductFormatter();