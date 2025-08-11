# Migration Execution Tracking Fix Plan

## Current Problems

### 1. Log Collection Issues
- Logs stored in random chunks as SSH stdout arrives
- No ordering by timestamp, stored by database insert order
- Log buffer flushes out of sequence
- Final summary not parsed or stored

### 2. Missing Result Summary
- `result_summary` column only has basic exit_code, stdout_length
- Rich migration data (patients, encounters, etc.) not extracted
- Success/failure details not captured
- Warnings and validation results ignored

### 3. Poor UI Display
- Details modal shows raw JSON with no useful data
- Logs displayed out of order
- No parsing of structured data from logs
- No visual representation of migration results

## Solution Architecture

### 1. Enhanced Log Collection

```javascript
// Parse structured data from logs
function parseExecutionResults(stdout) {
    const results = {
        success: false,
        metrics: {},
        warnings: [],
        errors: [],
        summary: null
    };
    
    // Look for JSON summary in logs
    const jsonMatch = stdout.match(/RESUMO ESTRUTURADO FINAL \(JSON\)\s*\[DATA\]\s*({[\s\S]*?})\s*\[/);
    if (jsonMatch) {
        try {
            results.summary = JSON.parse(jsonMatch[1]);
            results.success = results.summary.execution?.success || false;
            results.metrics = results.summary.data || {};
            results.warnings = results.summary.warnings || [];
            results.errors = results.summary.errors || [];
        } catch (e) {
            console.error('Failed to parse JSON summary:', e);
        }
    }
    
    // Check for success indicator
    if (stdout.includes('✅ IMPORTAÇÃO CONCLUÍDA COM SUCESSO!')) {
        results.success = true;
    }
    
    return results;
}
```

### 2. Database Schema Enhancement

```sql
-- Add columns to store parsed results
ALTER TABLE migration_executions 
ADD COLUMN metrics JSON COMMENT 'Parsed migration metrics',
ADD COLUMN warnings JSON COMMENT 'Warnings encountered',
ADD COLUMN success_indicators TEXT COMMENT 'Success validation details';

-- Add sequence number to logs for ordering
ALTER TABLE migration_logs
ADD COLUMN sequence_num INT NOT NULL DEFAULT 0,
ADD INDEX idx_execution_sequence (execution_id, sequence_num);
```

### 3. Fixed Log Storage

```javascript
// In executeScriptOnMedProServer function
let logSequence = 0;
const logBuffer = new LogBuffer(executionId, 1000);

// Modified LogBuffer to maintain sequence
class LogBuffer {
    async flush() {
        if (this.buffer.length === 0) return;
        
        const logs = this.buffer.splice(0);
        
        // Add sequence numbers
        const values = logs.map((log, index) => {
            const seq = this.baseSequence + index;
            return [this.executionId, log.level, log.message, seq];
        });
        
        await executeQuery(adminPool,
            'INSERT INTO migration_logs (execution_id, log_level, message, sequence_num) VALUES ?',
            [values]
        );
        
        this.baseSequence += logs.length;
    }
}
```

### 4. Process Completion Handler

```javascript
// On process close, parse and store results
sshProcess.on('close', async (code) => {
    // Parse execution results from stdout
    const results = parseExecutionResults(stdout);
    
    // Build comprehensive result summary
    const resultSummary = {
        exit_code: code,
        success: results.success,
        metrics: {
            imported: results.metrics.imported || {},
            migrated: results.metrics.migrated || {},
            duration: results.summary?.execution?.duration
        },
        validation: {
            warnings: results.warnings,
            errors: results.errors,
            success_rate: calculateSuccessRate(results.metrics)
        },
        details: {
            total_patients: results.metrics.migrated?.patients || 0,
            total_encounters: results.metrics.migrated?.encounters || 0,
            total_medications: results.metrics.migrated?.medications || 0,
            total_attachments: results.metrics.migrated?.attachments || 0
        }
    };
    
    // Update execution with rich results
    await executeQuery(adminPool,
        `UPDATE migration_executions 
         SET status = ?, 
             completed_at = NOW(), 
             progress = 100,
             result_summary = ?,
             metrics = ?
         WHERE id = ?`,
        [
            results.success ? 'completed' : 'failed',
            JSON.stringify(resultSummary),
            JSON.stringify(results.metrics),
            executionId
        ]
    );
});
```

### 5. Enhanced UI Components

#### Execution Details Modal
```javascript
function displayExecutionDetails(execution) {
    const results = execution.result_summary;
    
    const detailsHTML = `
        <div class="execution-details">
            <!-- Status Overview -->
            <div class="status-section ${results.success ? 'success' : 'failed'}">
                <h4>${results.success ? '✅ Migration Successful' : '❌ Migration Failed'}</h4>
                <p>Duration: ${formatDuration(results.metrics.duration)}</p>
            </div>
            
            <!-- Metrics Grid -->
            <div class="metrics-grid">
                <div class="metric-card">
                    <i class="fas fa-users"></i>
                    <div class="metric-value">${results.details.total_patients}</div>
                    <div class="metric-label">Patients</div>
                </div>
                <div class="metric-card">
                    <i class="fas fa-calendar-check"></i>
                    <div class="metric-value">${results.details.total_encounters}</div>
                    <div class="metric-label">Encounters</div>
                </div>
                <div class="metric-card">
                    <i class="fas fa-pills"></i>
                    <div class="metric-value">${results.details.total_medications}</div>
                    <div class="metric-label">Medications</div>
                </div>
                <div class="metric-card">
                    <i class="fas fa-paperclip"></i>
                    <div class="metric-value">${results.details.total_attachments}</div>
                    <div class="metric-label">Attachments</div>
                </div>
            </div>
            
            <!-- Import vs Migration Comparison -->
            <div class="comparison-section">
                <h5>Import → Migration Results</h5>
                <table class="comparison-table">
                    <tr>
                        <th>Type</th>
                        <th>Imported</th>
                        <th>Migrated</th>
                        <th>Success Rate</th>
                    </tr>
                    <tr>
                        <td>Patients</td>
                        <td>${results.metrics.imported.patients}</td>
                        <td>${results.metrics.migrated.patients}</td>
                        <td>${calculateRate(results.metrics.migrated.patients, results.metrics.imported.patients)}%</td>
                    </tr>
                    <tr>
                        <td>Encounters</td>
                        <td>${results.metrics.imported.encounters}</td>
                        <td>${results.metrics.migrated.encounters}</td>
                        <td>${calculateRate(results.metrics.migrated.encounters, results.metrics.imported.encounters)}%</td>
                    </tr>
                </table>
            </div>
            
            <!-- Warnings Section -->
            ${results.validation.warnings.length > 0 ? `
                <div class="warnings-section">
                    <h5>⚠️ Warnings</h5>
                    <ul>
                        ${results.validation.warnings.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <!-- Errors Section -->
            ${results.validation.errors.length > 0 ? `
                <div class="errors-section">
                    <h5>❌ Errors</h5>
                    <ul>
                        ${results.validation.errors.map(e => `<li>${e}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('execution-details-content').innerHTML = detailsHTML;
}
```

#### Log Viewer with Proper Ordering
```javascript
async function loadExecutionLogs(executionId) {
    const response = await fetch(`/api/v1/migration-executions/${executionId}/logs?limit=1000`);
    const data = await response.json();
    
    // Sort logs by sequence number
    const sortedLogs = data.data.sort((a, b) => a.sequence_num - b.sequence_num);
    
    // Group consecutive logs for better display
    const groupedLogs = groupLogsByContext(sortedLogs);
    
    // Display with syntax highlighting
    displayLogsWithHighlighting(groupedLogs);
}

function displayLogsWithHighlighting(logs) {
    const logContainer = document.getElementById('log-container');
    
    logContainer.innerHTML = logs.map(log => {
        let className = 'log-entry';
        
        // Add classes based on content
        if (log.message.includes('✅')) className += ' log-success';
        if (log.message.includes('❌')) className += ' log-error';
        if (log.message.includes('⚠️')) className += ' log-warning';
        if (log.message.includes('[DATA]')) className += ' log-data';
        if (log.message.includes('ETAPA')) className += ' log-step';
        
        return `<div class="${className}">${escapeHtml(log.message)}</div>`;
    }).join('');
}
```

### 6. Live Execution Monitor

```javascript
// For running executions, show live view
function showLiveExecutionMonitor(executionId) {
    const modal = document.getElementById('live-monitor-modal');
    modal.style.display = 'block';
    
    // Start polling for updates
    const pollInterval = setInterval(async () => {
        const execution = await getExecutionStatus(executionId);
        
        updateLiveView(execution);
        
        if (execution.status !== 'running') {
            clearInterval(pollInterval);
            showCompletionSummary(execution);
        }
    }, 2000);
}

function updateLiveView(execution) {
    // Update progress bar
    document.getElementById('live-progress').style.width = `${execution.progress}%`;
    
    // Show latest logs
    const latestLogs = execution.recent_logs || [];
    const logContainer = document.getElementById('live-logs');
    
    latestLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'live-log-entry';
        entry.textContent = log.message;
        logContainer.appendChild(entry);
        
        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    });
    
    // Update metrics if available
    if (execution.current_metrics) {
        document.getElementById('live-patients').textContent = execution.current_metrics.patients || 0;
        document.getElementById('live-encounters').textContent = execution.current_metrics.encounters || 0;
    }
}
```

## Implementation Steps

1. **Update Log Collection** (1 hour)
   - Add sequence numbering
   - Fix log buffer ordering
   - Parse final summary

2. **Enhance Database Schema** (30 min)
   - Add metrics columns
   - Add sequence number to logs
   - Update indexes

3. **Fix Result Processing** (1 hour)
   - Parse structured data from stdout
   - Extract metrics and validation results
   - Store comprehensive summary

4. **Update UI Components** (2 hours)
   - Create rich details modal
   - Fix log viewer ordering
   - Add metrics visualization
   - Implement live monitor

5. **Testing** (1 hour)
   - Test with successful migration
   - Test with failed migration
   - Verify all metrics captured

## Expected Results

### Before
- Empty result_summary: `{"exit_code": 0}`
- Logs out of order
- No visibility into migration results

### After
- Rich result_summary with all metrics
- Properly ordered logs with highlighting
- Clear visualization of:
  - Patients processed
  - Encounters migrated
  - Medications created
  - Attachments uploaded
  - Success rates
  - Warnings and errors
- Live monitoring for running executions

## Success Criteria

1. ✅ All migration metrics extracted and stored
2. ✅ Logs displayed in correct order
3. ✅ Details modal shows comprehensive results
4. ✅ Live monitor updates in real-time
5. ✅ Clear indication of success/failure with reasons