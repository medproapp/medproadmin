const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.stripe.com"]
        }
    }
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // In production, you should validate against a whitelist
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:4040',
            'https://medpro.com',
            'https://admin.medpro.com'
        ];
        
        if (process.env.NODE_ENV === 'development' || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Webhook routes MUST come before body parser (they need raw body)
app.use('/api/v1/webhooks', require('./routes/webhooks'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
const { requestLogger, errorLogger } = require('./middleware/requestLogger');
app.use(requestLogger);

// Static files - serve the frontend
app.use('/medproadmin', express.static(path.join(__dirname, '..')));

// Login page route
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// API Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/products', require('./routes/products'));
app.use('/api/v1/prices', require('./routes/prices'));
app.use('/api/v1/recovery', require('./routes/recovery'));
app.use('/api/v1/audit', require('./routes/audit'));
app.use('/api/v1/sync', require('./routes/sync'));
app.use('/api/v1/static-sync', require('./routes/staticSync'));
app.use('/api/v1/stats', require('./routes/stats'));
app.use('/api/v1/customers', require('./routes/customers'));
app.use('/api/v1/segments', require('./routes/segments'));
app.use('/api/v1/churn', require('./routes/churn'));
app.use('/api/v1/analytics', require('./routes/analytics'));

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Catch-all route for frontend
app.get('/medproadmin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error logging middleware (must come before error handler)
app.use(errorLogger);

// Global error handler
app.use((err, req, res, next) => {
    // Don't leak error details in production
    const isDev = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
        success: false,
        error: isDev ? err.message : 'Internal server error',
        ...(isDev && { stack: err.stack }),
        requestId: req.id
    });
});

// Start server
const PORT = process.env.PORT || 4040;
const server = app.listen(PORT, () => {
    logger.info(`MedPro Admin Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Frontend available at: http://localhost:${PORT}/medproadmin`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app;