/**
 * Environment Context - Global state management for environment selection
 * This module provides centralized environment state management across the admin application
 */

class EnvironmentContext {
    constructor() {
        this.currentEnvironment = null;
        this.environments = [];
        this.listeners = [];
        this.initialized = false;
        
        // Initialize from localStorage if available
        this.loadFromStorage();
    }
    
    /**
     * Initialize the environment context
     */
    async init() {
        if (this.initialized) {
            return;
        }
        
        try {
            await this.loadEnvironments();
            this.initialized = true;
            this.notifyListeners('initialized');
        } catch (error) {
            console.error('Failed to initialize environment context:', error);
            throw error;
        }
    }
    
    /**
     * Load environments from API
     */
    async loadEnvironments() {
        try {
            const response = await authenticatedFetch('/api/v1/environments');
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to load environments');
            }
            
            this.environments = response.data;
            
            // Set default environment if none is selected
            if (!this.currentEnvironment && this.environments.length > 0) {
                const defaultEnv = this.environments.find(env => env.is_default) || this.environments[0];
                this.setCurrentEnvironment(defaultEnv.id, false); // Don't save to storage yet
            }
            
            this.saveToStorage();
            this.notifyListeners('environmentsLoaded', this.environments);
            
            return this.environments;
        } catch (error) {
            console.error('Failed to load environments:', error);
            throw error;
        }
    }
    
    /**
     * Set the current environment
     */
    setCurrentEnvironment(environmentId, saveToStorage = true) {
        const environment = this.environments.find(env => env.id === environmentId);
        
        if (!environment) {
            console.warn('Environment not found:', environmentId);
            return false;
        }
        
        const previousEnvironment = this.currentEnvironment;
        this.currentEnvironment = environment;
        
        if (saveToStorage) {
            this.saveToStorage();
        }
        
        this.notifyListeners('environmentChanged', {
            current: this.currentEnvironment,
            previous: previousEnvironment
        });
        
        return true;
    }
    
    /**
     * Get the current environment
     */
    getCurrentEnvironment() {
        return this.currentEnvironment;
    }
    
    /**
     * Get all environments
     */
    getEnvironments() {
        return this.environments;
    }
    
    /**
     * Get environment by ID
     */
    getEnvironmentById(id) {
        return this.environments.find(env => env.id === id);
    }
    
    /**
     * Add a new environment to the list
     */
    addEnvironment(environment) {
        this.environments.push(environment);
        this.saveToStorage();
        this.notifyListeners('environmentAdded', environment);
    }
    
    /**
     * Update an environment in the list
     */
    updateEnvironment(environmentId, updatedData) {
        const index = this.environments.findIndex(env => env.id === environmentId);
        
        if (index !== -1) {
            this.environments[index] = { ...this.environments[index], ...updatedData };
            
            // Update current environment if it's the one being updated
            if (this.currentEnvironment && this.currentEnvironment.id === environmentId) {
                this.currentEnvironment = this.environments[index];
            }
            
            this.saveToStorage();
            this.notifyListeners('environmentUpdated', this.environments[index]);
        }
    }
    
    /**
     * Set an environment as default
     */
    setDefaultEnvironment(environmentId) {
        // Update all environments - set the specified one as default, others as non-default
        this.environments.forEach(env => {
            env.is_default = (env.id === environmentId);
        });
        
        // If the new default environment is not currently selected, switch to it
        const newDefaultEnv = this.getEnvironmentById(environmentId);
        if (newDefaultEnv && (!this.currentEnvironment || this.currentEnvironment.id !== environmentId)) {
            this.setCurrentEnvironment(environmentId, false);
        }
        
        this.saveToStorage();
        this.notifyListeners('defaultEnvironmentChanged', newDefaultEnv);
    }
    
    /**
     * Remove an environment from the list
     */
    removeEnvironment(environmentId) {
        const environment = this.getEnvironmentById(environmentId);
        this.environments = this.environments.filter(env => env.id !== environmentId);
        
        // If the removed environment was current, switch to default or first available
        if (this.currentEnvironment && this.currentEnvironment.id === environmentId) {
            if (this.environments.length > 0) {
                const defaultEnv = this.environments.find(env => env.is_default) || this.environments[0];
                this.setCurrentEnvironment(defaultEnv.id, false);
            } else {
                this.currentEnvironment = null;
            }
        }
        
        this.saveToStorage();
        this.notifyListeners('environmentRemoved', environment);
    }
    
    /**
     * Refresh environments from server
     */
    async refresh() {
        try {
            await this.loadEnvironments();
            this.notifyListeners('refreshed');
        } catch (error) {
            this.notifyListeners('error', error);
            throw error;
        }
    }
    
    /**
     * Check if user can manage environments
     */
    canManageEnvironments() {
        // This should be checked against user permissions
        // For now, assume all authenticated users can manage environments
        return true;
    }
    
    /**
     * Add event listener
     */
    addEventListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
        
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }
    
    /**
     * Remove event listener
     */
    removeEventListener(callback) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }
    
    /**
     * Notify all listeners
     */
    notifyListeners(event, data = null) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in environment context listener:', error);
            }
        });
    }
    
    /**
     * Save state to localStorage
     */
    saveToStorage() {
        try {
            const state = {
                currentEnvironment: this.currentEnvironment,
                environments: this.environments,
                timestamp: Date.now()
            };
            
            localStorage.setItem('medproAdmin_environmentContext', JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save environment context to localStorage:', error);
        }
    }
    
    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('medproAdmin_environmentContext');
            
            if (stored) {
                const state = JSON.parse(stored);
                
                // Check if stored data is not too old (24 hours)
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours
                if (state.timestamp && (Date.now() - state.timestamp) < maxAge) {
                    this.currentEnvironment = state.currentEnvironment;
                    this.environments = state.environments || [];
                }
            }
        } catch (error) {
            console.warn('Failed to load environment context from localStorage:', error);
            this.clearStorage();
        }
    }
    
    /**
     * Clear stored state
     */
    clearStorage() {
        try {
            localStorage.removeItem('medproAdmin_environmentContext');
        } catch (error) {
            console.warn('Failed to clear environment context storage:', error);
        }
    }
    
    /**
     * Get display information for current environment
     */
    getCurrentEnvironmentDisplay() {
        if (!this.currentEnvironment) {
            return {
                name: 'No Environment',
                icon: 'fa-question-circle',
                theme: 'gray',
                type: 'unknown'
            };
        }
        
        return {
            name: this.currentEnvironment.display_name,
            icon: `fa-${this.currentEnvironment.icon || 'server'}`,
            theme: this.currentEnvironment.color_theme || 'blue',
            type: this.currentEnvironment.env_type,
            isDefault: this.currentEnvironment.is_default
        };
    }
    
    /**
     * Validate environment data
     */
    validateEnvironment(environment) {
        const required = ['env_name', 'env_type', 'display_name', 'db_host', 'db_name', 'db_user'];
        const missing = required.filter(field => !environment[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        // Validate environment name format
        if (!/^[a-zA-Z0-9_-]+$/.test(environment.env_name)) {
            throw new Error('Environment name must contain only letters, numbers, underscores, and dashes');
        }
        
        // Validate environment type
        const validTypes = ['production', 'test', 'development', 'nqa'];
        if (!validTypes.includes(environment.env_type)) {
            throw new Error('Invalid environment type');
        }
        
        return true;
    }
}

// Create global instance
window.environmentContext = new EnvironmentContext();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentContext;
}