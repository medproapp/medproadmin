// Admin Authentication Module
class AdminAuth {
    constructor() {
        this.tokenKey = 'adminToken';
        this.baseUrl = '/api/v1/auth';
    }
    
    // Check if user is authenticated
    async checkAuth() {
        const token = this.getToken();
        if (!token) {
            return false;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.success === true ? data.data.user : false;
            }
            
            // Token invalid, remove it
            this.removeToken();
            return false;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    }
    
    // Login with credentials
    async login(email, password) {
        try {
            const response = await fetch(`${this.baseUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.setToken(data.data.token);
                return { success: true, user: data.data.user };
            }
            
            return {
                success: false,
                error: data.error || 'Login failed'
            };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Network error. Please try again.'
            };
        }
    }
    
    // Logout
    logout() {
        this.removeToken();
        window.location.href = '/login';
    }
    
    // Get stored token
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }
    
    // Store token
    setToken(token) {
        localStorage.setItem(this.tokenKey, token);
    }
    
    // Remove token
    removeToken() {
        localStorage.removeItem(this.tokenKey);
    }
    
    // Make authenticated request
    async authenticatedFetch(url, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error('No authentication token');
        }
        
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        const fetchOptions = {
            ...options,
            headers
        };
        
        // Convert body to JSON if it's an object
        if (options.body && typeof options.body === 'object') {
            fetchOptions.body = JSON.stringify(options.body);
        }
        
        try {
            const response = await fetch(url, fetchOptions);
            
            // Handle 401 Unauthorized
            if (response.status === 401) {
                this.removeToken();
                window.location.href = '/login';
                throw new Error('Unauthorized');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            // If the response already has a success property, return it as-is
            // This prevents double-wrapping of API responses
            if (data && typeof data === 'object' && 'success' in data) {
                return data;
            }
            
            // Otherwise, wrap it in our standard format
            return { success: true, data };
        } catch (error) {
            console.error('Authenticated fetch error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create global instance
const adminAuth = new AdminAuth();

// Global helper functions
async function checkAdminAuth() {
    const user = await adminAuth.checkAuth();
    if (!user) {
        window.location.href = '/login';
        return null;
    }
    return user;
}

async function authenticatedFetch(url, options) {
    return adminAuth.authenticatedFetch(url, options);
}

// Auto-check auth on page load for admin pages
if (window.location.pathname.startsWith('/medproadmin/') && 
    !window.location.pathname.includes('/login')) {
    document.addEventListener('DOMContentLoaded', async () => {
        const auth = await checkAdminAuth();
        if (!auth) {
            return;
        }
        
        // Set active nav item
        const currentPath = window.location.pathname;
        document.querySelectorAll('.admin-nav a').forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });
    });
}