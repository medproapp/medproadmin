const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
    let msg = `${timestamp} [${service}] ${level}: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
});

// Define log format for files
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Define log format for console
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    customFormat
);

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'medpro-admin' },
    transports: [
        // Error logs - with daily rotation
        new winston.transports.File({ 
            filename: path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`), 
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 30 // Keep 30 days of logs
        }),
        
        // Combined logs - with daily rotation
        new winston.transports.File({ 
            filename: path.join(logsDir, `combined-${new Date().toISOString().split('T')[0]}.log`),
            format: fileFormat,
            maxsize: 10485760, // 10MB
            maxFiles: 30
        }),
        
        // Separate logs for different components
        new winston.transports.File({
            filename: path.join(logsDir, `stripe-${new Date().toISOString().split('T')[0]}.log`),
            level: 'info',
            format: fileFormat,
            filter: (info) => info.component === 'stripe'
        }),
        
        new winston.transports.File({
            filename: path.join(logsDir, `auth-${new Date().toISOString().split('T')[0]}.log`),
            level: 'info',
            format: fileFormat,
            filter: (info) => info.component === 'auth'
        }),
        
        new winston.transports.File({
            filename: path.join(logsDir, `database-${new Date().toISOString().split('T')[0]}.log`),
            level: 'info',
            format: fileFormat,
            filter: (info) => info.component === 'database'
        })
    ]
});

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        handleExceptions: true
    }));
}

// Create specialized loggers
logger.stripe = (message, metadata = {}) => {
    logger.info(message, { component: 'stripe', ...metadata });
};

logger.auth = (message, metadata = {}) => {
    logger.info(message, { component: 'auth', ...metadata });
};

logger.database = (message, metadata = {}) => {
    logger.info(message, { component: 'database', ...metadata });
};

logger.api = (message, metadata = {}) => {
    logger.info(message, { component: 'api', ...metadata });
};

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    process.exit(1);
});

module.exports = logger;