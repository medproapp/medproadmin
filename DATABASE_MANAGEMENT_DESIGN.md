# Database Management Page - Design Document

## Overview
A simple database management dashboard page located under Environment Management that displays database entity statistics and provides script execution capabilities for the currently selected MedPro environment.

## Page Location & Navigation
- **URL**: `/medproadmin/database-management/`
- **Navigation Path**: Environment Management → Database Management
- **Page Title**: Database Management

## Core Requirements

### Environment Dependency
- **CRITICAL**: All functionality depends on having a selected MedPro environment
- If NO environment selected: Display message "Please select an environment to view database information"
- If environment selected: Show full dashboard functionality
- All data and operations target the currently selected environment's database

### Dashboard Statistics (4 Entity Boxes)
Display count statistics for main database entities:
1. **Users** - Total user count
2. **Practitioners** - Total practitioner count  
3. **Patients** - Total patient count
4. **Organizations** - Total organization count

**Box Design**: Similar to main dashboard cards with:
- Entity icon
- Current count number
- Entity label
- Card styling matching existing dashboard

### Stored Procedure Execution Area
Interface for executing existing stored procedures from MedPro database:
- **Procedure Selector**: Dropdown listing available stored procedures
- **Parameter Form**: Dynamic form with default parameter values (configurable)
- **Execute Button**: Runs the selected stored procedure on current environment
- **Results Display**: Shows execution output/results
- **Environment Context**: Clearly shows which environment the procedure will run on

## Technical Implementation

### File Structure
```
database-management/
├── index.html           # Main page
├── css/
│   └── database.css    # Page styles
└── js/
    └── app.js          # Page logic
```

### Page Standards Compliance
- Follow existing page HTML structure
- Include standard navigation CSS and NavigationManager
- Use existing admin header and container layout
- Implement standard authentication checks
- Follow existing error handling patterns

### Environment Integration
- Use existing `window.environmentContext` to get current environment
- Listen for environment changes to update data
- Pass environment ID to all API calls
- Show environment name/context in UI

### Database Connection Strategy
The page connects to MedPro databases using the existing environment connection mechanism:

1. **Environment Selection**: User selects MedPro environment via global selector
2. **Connection Retrieval**: Backend retrieves environment configuration from admin `environments` table
3. **Direct Database Connection**: Creates MySQL connection to selected MedPro database using decrypted credentials
4. **Query Execution**: Runs queries directly on MedPro database tables

**Connection Pattern** (following existing user management approach):
```javascript
// Backend creates connection to MedPro database
const { connection, environment } = await getEnvironmentConnection(environmentId);
// Execute queries directly on MedPro tables
const users = await connection.execute('SELECT COUNT(*) FROM users');
```

### API Endpoints Required
- `GET /api/v1/database/stats?environment_id={environmentId}` - Get entity counts from MedPro database
  - Queries: `SELECT COUNT(*) FROM users`, `SELECT COUNT(*) FROM practitioners`, etc.
- `GET /api/v1/database/procedures?environment_id={environmentId}` - List available stored procedures from MedPro database
  - Query: `SHOW PROCEDURE STATUS WHERE Db = 'medpro_database_name'`
  - Returns procedure names, parameters, and default configurations
- `POST /api/v1/database/execute-procedure` - Execute stored procedure on MedPro database
  ```json
  {
    "environmentId": "env-123",
    "procedureName": "sp_maintenance_cleanup",
    "parameters": {
      "days_old": 30,
      "dry_run": true
    }
  }
  ```

**Database Tables Queried** (on selected MedPro database):
- `users` - User count statistics
- `practitioners` - Practitioner count statistics  
- `patients` - Patient count statistics
- `organizations` - Organization count statistics

### Stored Procedure Configuration
To provide default parameter values and avoid manual input each time:

**Configuration Storage Options**:
1. **Admin Database Table**: Store procedure configurations in `procedure_configs` table
2. **Environment Variables**: Store common defaults in environment config
3. **Frontend Configuration**: Store defaults in JavaScript configuration object

**Configuration Structure**:
```json
{
  "sp_maintenance_cleanup": {
    "displayName": "Maintenance Cleanup",
    "description": "Cleans up old temporary data",
    "parameters": {
      "days_old": {
        "type": "number",
        "default": 30,
        "label": "Days Old",
        "required": true
      },
      "dry_run": {
        "type": "boolean", 
        "default": true,
        "label": "Dry Run Mode"
      }
    }
  }
}
```

## User Experience Flow

### Initial Load
1. Check authentication
2. Check if environment is selected
3. If no environment: Show selection message
4. If environment exists: Load dashboard data

### Environment Selection
1. User selects environment via global selector
2. Page detects environment change
3. Automatically refresh statistics for new environment
4. Update script execution context

### Statistics Display
1. Fetch current counts from API
2. Display in dashboard card format
3. Show loading states during fetch
4. Handle API errors gracefully

### Stored Procedure Execution
1. User selects stored procedure from dropdown
2. Dynamic parameter form appears with default values
3. Clear indication which environment will be targeted
4. Confirmation dialog for procedure execution
5. Execute procedure via API with parameters
6. Display results in results area
7. Handle execution errors and timeouts

## Security & Safety
- Require admin authentication
- Validate environment access permissions
- Log all stored procedure executions with user, timestamp, and parameters
- Add confirmation dialogs for procedure execution
- Validate procedure parameters and sanitize output display
- Only execute pre-existing stored procedures (no dynamic SQL)

## Visual Design
- Match existing admin page styling
- Use Bootstrap 5 classes for consistency
- Dashboard cards similar to main dashboard
- Clean, professional layout
- Clear visual separation between stats and execution areas

## Error Handling
- No environment selected: Clear message with call-to-action
- API failures: User-friendly error messages
- Script execution errors: Display error details safely
- Network issues: Show retry options

This design keeps the implementation simple and focused while following existing patterns and providing the exact functionality requested.