-- Simple Migration Management Database Schema
-- Following the plan exactly - just 4 tables

USE medpro_admin;

-- Drop any existing tables to start fresh
DROP TABLE IF EXISTS migration_logs;
DROP TABLE IF EXISTS migration_executions;
DROP TABLE IF EXISTS migration_jobs;
DROP TABLE IF EXISTS migration_sources;

-- Migration sources (definitions)
CREATE TABLE migration_sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    script_path VARCHAR(500) NOT NULL,
    parameters JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration jobs (instances with parameters)
CREATE TABLE migration_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parameters JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES migration_sources(id)
);

-- Migration executions (history)
CREATE TABLE migration_executions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    environment_id VARCHAR(100) NOT NULL,
    status ENUM('running', 'completed', 'failed') DEFAULT 'running',
    progress INT DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    executed_by VARCHAR(255) NOT NULL,
    command_executed TEXT,
    result_summary JSON,
    FOREIGN KEY (job_id) REFERENCES migration_jobs(id)
);

-- Execution logs
CREATE TABLE migration_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    execution_id INT NOT NULL,
    log_level VARCHAR(20),
    message TEXT NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES migration_executions(id)
);

-- Insert example iClinic source
INSERT INTO migration_sources (name, display_name, description, script_path, parameters) VALUES (
    'iclinic',
    'iClinic Migration',
    'Import patient data from iClinic CSV files',
    '/medproback/jobs/import/orchestrate-import.js',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user', 'type', 'text', 'label', 'User/Directory Name', 'required', true),
        JSON_OBJECT('name', 'sourceSystemUserId', 'type', 'text', 'label', 'iClinic User ID', 'required', true),
        JSON_OBJECT('name', 'practId', 'type', 'email', 'label', 'MedPro Practitioner Email', 'required', true),
        JSON_OBJECT('name', 'targetPatientId', 'type', 'text', 'label', 'Target Patient ID (optional)', 'required', false)
    )
);

-- Verify tables were created
SELECT 'Migration tables created successfully' as status; 