# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT - Login Credentials (DO NOT FORGET!)

**Admin Login for Testing:**
- Email: `demo@medpro.com`
- Password: `demo123`

## Common Development Commands

### Backend Server (server/)
```bash
# Start development server with auto-reload
npm run dev

# Start production server with PM2
npm run start:prod

# Manage server
npm run stop
npm run restart

# View logs
npm run logs
npm run logs:tail      # Combined logs
npm run logs:error     # Error logs only
npm run logs:stripe    # Stripe-specific logs

# Database setup
npm run db:setup

# Run tests
npm test

# Lint code
npx eslint .
```

### Frontend Development
The frontend is vanilla JavaScript with no build process. Files are served directly from the filesystem. Access the application at http://localhost:4040/medproadmin/product-catalog/

## Architecture Overview

MedPro Admin is a production-ready administrative system for managing Stripe products and subscriptions with the following key characteristics:

### Technology Stack
- **Backend**: Node.js/Express server on port 4040
- **Frontend**: Vanilla JavaScript SPA with Bootstrap 5 (no build tools)
- **Database**: Dual MySQL setup (medpro_admin for writes, medpro for reads)
- **Authentication**: JWT-based stateless auth
- **Payment Integration**: Stripe API with webhook support
- **Logging**: Winston with daily rotation

### Key Architectural Patterns
- **Component-based Frontend**: Self-contained JavaScript modules in `js/components/`
- **Service Layer**: API communication abstracted in `js/services/`
- **RESTful API**: Follows `/api/v1/` versioning convention
- **Dual Database**: Write operations use `medpro_admin`, reads can access `medpro`
- **Audit Logging**: All changes tracked in `admin_audit_log` table
- **No Build Process**: Direct file serving for maximum simplicity

### Directory Structure Context
```
medproadmin/
├── server/                    # Express backend
│   ├── routes/               # API endpoints (/api/v1/*)
│   ├── services/             # Business logic
│   ├── middleware/          # Auth, logging, error handling
│   └── scripts/             # Server management scripts
├── product-catalog/         # Main frontend application
├── customers/              # Customer management feature
├── environments/           # Environment management feature
├── users/                  # User management feature
└── shared/                 # Common frontend resources
```

## Development Guidelines

### Backend Development
- All API routes use `/api/v1/` prefix
- JWT authentication required for protected endpoints
- Use parameterized queries to prevent SQL injection
- Follow the existing error response format
- Log all significant operations with Winston
- Validate input using express-validator

### Frontend Development
- Use vanilla JavaScript (no frameworks)
- Follow component-based architecture pattern
- Use `authenticatedFetch()` from `shared/js/adminAuth.js` for API calls
- Maintain Content Security Policy compliance (no inline scripts/styles)
- Use Bootstrap 5 classes for styling
- Handle errors gracefully with toast notifications

### Database Access
- Write operations: Use `medpro_admin` database
- Read operations: Can access both `medpro_admin` and `medpro` databases
- Use connection pooling via `config/database.js`
- Follow the existing table naming conventions

### Authentication Flow
1. Login via `/api/v1/auth/login`
2. Store JWT token in localStorage
3. Include token in Authorization header for API calls
4. Token validation handled by middleware

## Important Implementation Details

### Stripe Integration
- Live Stripe integration with webhook support
- Products and prices synced bidirectionally
- Webhook endpoint: `/api/v1/webhooks/stripe`
- Use `services/stripe.js` for all Stripe operations

### Security Considerations
- All routes require authentication except login
- Content Security Policy enforced
- Input validation on all endpoints
- Audit logging for all administrative actions
- No sensitive data in client-side code

### Current Features
- **Product Catalog**: Full CRUD operations for Stripe products/prices
- **Customer Management**: Customer analytics and segmentation
- **Environment Management**: Server environment monitoring
- **User Management**: Admin user management system

## Testing Approach

Currently uses manual testing. When adding tests:
- Use Jest for backend unit tests
- API testing with supertest
- Frontend testing should be component-based
- Test Stripe webhook handling thoroughly

## Server Management

The server uses PM2 for production deployment:
- Start: `./scripts/start-server.sh`
- Stop: `./scripts/stop-server.sh`
- Restart: `./scripts/restart-server.sh`
- Logs are in `server/logs/` with daily rotation

## Error Handling Standards

### Backend
- Use try-catch in all async routes
- Return structured error responses
- Log errors with full stack traces
- Use appropriate HTTP status codes

### Frontend
- Check API response status
- Show user-friendly error messages
- Log errors to console for debugging
- Provide fallback states for failed operations