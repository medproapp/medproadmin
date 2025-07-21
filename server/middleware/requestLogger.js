const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Middleware to log all requests and responses
const requestLogger = (req, res, next) => {
    // Generate unique request ID
    req.id = req.headers['x-request-id'] || uuidv4();
    
    // Start time for response duration
    const startTime = Date.now();
    
    // Log request
    logger.api(`${req.method} ${req.originalUrl}`, {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        body: req.method !== 'GET' ? req.body : undefined,
        user: req.user?.email
    });
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
        const responseTime = Date.now() - startTime;
        
        // Log response
        logger.api(`Response: ${req.method} ${req.originalUrl}`, {
            requestId: req.id,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            user: req.user?.email
        });
        
        // Log error responses with more detail
        if (res.statusCode >= 400) {
            logger.error(`Error response: ${req.method} ${req.originalUrl}`, {
                requestId: req.id,
                statusCode: res.statusCode,
                responseTime: `${responseTime}ms`,
                responseBody: data,
                user: req.user?.email
            });
        }
        
        // Add request ID to response headers
        res.set('X-Request-ID', req.id);
        
        originalSend.call(this, data);
    };
    
    next();
};

// Middleware to log errors
const errorLogger = (err, req, res, next) => {
    logger.error('Express error middleware:', {
        requestId: req.id,
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        user: req.user?.email
    });
    
    next(err);
};

module.exports = {
    requestLogger,
    errorLogger
};