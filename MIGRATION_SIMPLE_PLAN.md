# MedPro Migration Management - Simple Plan

## 🎯 **What We're Building**

A simple UI in MedPro Admin to manage migration scripts that run on MedPro servers.

### **Core Components:**

1. **Migration Sources** - Define source systems (iClinic, Epic, etc.)
   - Script path on MedPro server
   - Required parameters (user, practitioner_id, etc.)
   - Description and metadata

2. **Migration Jobs** - Create job instances with specific parameters
   - Select a source
   - Fill in parameter values
   - Save for reuse

3. **Execution Management** - Run and monitor jobs
   - Execute on selected MedPro environment
   - Real-time progress tracking
   - Log monitoring
   - Results summary

## 🏗️ **Simple Database Schema**

```sql
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
```

## 🖥️ **User Interface**

### **1. Migration Sources Page**
- List all sources
- Add/edit source definitions
- Define parameters for each source

### **2. Migration Jobs Page**
- List all jobs
- Create new jobs from sources
- Edit existing jobs
- Run jobs

### **3. Execution Monitor**
- Real-time progress bar
- Live log display
- Status updates
- Results summary

## 🔧 **Implementation Steps**

1. **Database Setup** - Create simple tables
2. **Backend APIs** - Basic CRUD for sources/jobs/executions
3. **Frontend Pages** - Simple forms and lists
4. **Execution Engine** - SSH to MedPro server and run scripts
5. **Monitoring** - Parse logs and update progress

## 📋 **API Endpoints**

```
GET    /api/v1/migration-sources     # List sources
POST   /api/v1/migration-sources     # Create source
PUT    /api/v1/migration-sources/:id # Update source
DELETE /api/v1/migration-sources/:id # Delete source

GET    /api/v1/migration-jobs        # List jobs
POST   /api/v1/migration-jobs        # Create job
PUT    /api/v1/migration-jobs/:id    # Update job
DELETE /api/v1/migration-jobs/:id    # Delete job

POST   /api/v1/migration-jobs/:id/execute  # Execute job
GET    /api/v1/migration-executions/:id     # Get execution status
GET    /api/v1/migration-executions/:id/logs # Get logs
```

## 🚫 **What We're NOT Building**

- Complex orchestration engines
- Connection pooling
- WebSocket real-time updates (polling is fine)
- Complex validation frameworks
- Security management systems
- Multi-step wizards

**Focus: Simple, working UI for managing migration scripts.** 