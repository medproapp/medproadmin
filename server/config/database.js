const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Admin database connection pool
const adminPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'medpro_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'medpro_admin',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Main MedPro database connection pool (read-only)
const medproPool = mysql.createPool({
    host: process.env.MEDPRO_DB_HOST || 'localhost',
    user: process.env.MEDPRO_DB_USER || 'medpro_admin',
    password: process.env.MEDPRO_DB_PASSWORD,
    database: process.env.MEDPRO_DB_NAME || 'medpro',
    port: process.env.MEDPRO_DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test database connections
async function testConnections() {
    try {
        // Test admin database
        const adminConn = await adminPool.getConnection();
        await adminConn.ping();
        adminConn.release();
        logger.info('Admin database connection successful');
        
        // Test MedPro database
        const medproConn = await medproPool.getConnection();
        await medproConn.ping();
        medproConn.release();
        logger.info('MedPro database connection successful');
        
        return true;
    } catch (error) {
        logger.error('Database connection failed:', error);
        throw error;
    }
}

// Execute query with error handling
async function executeQuery(pool, query, params = []) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [results] = await connection.execute(query, params);
        return results;
    } catch (error) {
        logger.error('Query execution error:', { query, error: error.message });
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

// Transaction helper
async function executeTransaction(pool, callback) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const result = await callback(connection);
        
        await connection.commit();
        return result;
    } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Transaction error:', error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    adminPool,
    medproPool,
    testConnections,
    executeQuery,
    executeTransaction
};