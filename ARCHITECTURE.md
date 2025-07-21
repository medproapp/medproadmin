# MedPro Admin - System Architecture

## Overview

MedPro Admin is a production-ready administrative system built with Node.js, Express, MySQL, and vanilla JavaScript. The system provides comprehensive product catalog management with real-time Stripe integration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (SPA)                          │
│  Vanilla JS + Bootstrap 5 + Content Security Policy Compliant  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS/JWT
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server (Port 4040)                   │
│                  JWT Auth + RESTful API + Logging               │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   MySQL (medpro_admin)  │     │     Stripe API          │
│   Write Operations      │     │   Products & Prices     │
└─────────────────────────┘     └─────────────────────────┘
                │
                ▼
┌─────────────────────────┐
│    MySQL (medpro)       │
│   Read-Only Access      │
└─────────────────────────┘
```

## Technology Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js 4.x
- **Authentication**: JWT (jsonwebtoken)
- **Database**: MySQL 8.0
- **ORM**: None (raw SQL with mysql2)
- **Payment**: Stripe API
- **Logging**: Winston with daily rotation
- **Environment**: dotenv

### Frontend
- **Framework**: None (Vanilla JavaScript)
- **UI Library**: Bootstrap 5.3
- **Icons**: Font Awesome 6
- **Build Tools**: None (served as static files)
- **State Management**: Component-based architecture
- **API Communication**: Fetch API with JWT

## Directory Structure

```
medproadmin/
├── server/                      # Backend application
│   ├── server.js               # Entry point
│   ├── config/                 # Configuration files
│   │   ├── database.js         # MySQL connection pool
│   │   └── winston.js          # Logger configuration
│   ├── middleware/             # Express middleware
│   │   ├── auth.js             # JWT authentication
│   │   ├── errorHandler.js    # Global error handler
│   │   └── requestLogger.js   # Request logging
│   ├── routes/                 # API endpoints
│   │   ├── auth.js             # Authentication routes
│   │   ├── products.js         # Product CRUD operations
│   │   ├── sync.js             # Stripe synchronization
│   │   └── webhooks.js         # Stripe webhooks
│   ├── services/               # Business logic
│   │   ├── stripe.js           # Stripe API wrapper
│   │   └── audit.js            # Audit logging
│   ├── utils/                  # Utility functions
│   ├── logs/                   # Application logs
│   └── scripts/                # Management scripts
│       ├── start-server.sh     # Start script
│       ├── stop-server.sh      # Stop script
│       └── restart-server.sh   # Restart script
│
├── product-catalog/            # Frontend application
│   ├── index.html              # Main SPA page
│   ├── css/                    # Styles
│   ├── js/                     # JavaScript modules
│   │   ├── app.js              # Main application
│   │   ├── services/           # API services
│   │   ├── components/         # UI components
│   │   └── utils/              # Helper functions
│   └── assets/                 # Static assets
│
├── shared/                     # Shared frontend resources
│   ├── css/                    # Common styles
│   └── js/                     # Common utilities
│       ├── adminAuth.js        # Authentication module
│       └── adminUtils.js       # Shared utilities
│
└── database/                   # Database files
    └── schema.sql              # Database schema
```

## API Architecture

### RESTful Endpoints

```
Authentication:
POST   /api/v1/auth/login          # User login
GET    /api/v1/auth/verify         # Verify JWT token
POST   /api/v1/auth/logout         # User logout

Products:
GET    /api/v1/products            # List products (with filters)
GET    /api/v1/products/:id        # Get single product
POST   /api/v1/products            # Create product
PUT    /api/v1/products/:id        # Update product
DELETE /api/v1/products/:id        # Delete product

Prices:
GET    /api/v1/products/:id/prices # List product prices
POST   /api/v1/products/:id/prices # Create price
PUT    /api/v1/prices/:id          # Update price
DELETE /api/v1/prices/:id          # Delete price

Synchronization:
POST   /api/v1/sync/stripe/full    # Full Stripe sync
GET    /api/v1/sync/status         # Sync status

Webhooks:
POST   /api/v1/webhooks/stripe     # Stripe webhook handler
```

### Request/Response Format

All API responses follow this structure:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-07-21T12:00:00Z",
    "requestId": "uuid"
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

## Database Schema

### Dual Database Architecture
- **medpro_admin**: Write operations (product management)
- **medpro**: Read-only access (existing system data)

### Key Tables

```sql
product_catalog
├── id (PRIMARY KEY)
├── stripe_product_id (UNIQUE)
├── name
├── description
├── plan_type
├── user_tier
├── active
├── metadata (JSON)
├── sync_status
└── timestamps

product_prices
├── id (PRIMARY KEY)
├── stripe_price_id (UNIQUE)
├── stripe_product_id (FK)
├── unit_amount
├── currency
├── recurring_interval
└── timestamps

admin_audit_log
├── id (PRIMARY KEY)
├── user_id
├── action
├── entity_type
├── entity_id
├── changes (JSON)
└── created_at
```

## Security Architecture

### Authentication Flow
1. User submits credentials to `/api/v1/auth/login`
2. Server validates against database
3. JWT token generated with user claims
4. Token returned to client
5. Client includes token in Authorization header
6. Middleware validates token on each request

### Security Measures
- **JWT Authentication**: Stateless token-based auth
- **Content Security Policy**: No inline scripts/styles
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: HTML escaping
- **CORS Configuration**: Restricted origins
- **Input Validation**: Request validation middleware
- **Rate Limiting**: API endpoint protection
- **Secure Headers**: Helmet.js integration

## Frontend Architecture

### Component Structure
```
app.js (Main Application)
├── ProductList Component
├── ProductEditor Component
├── MetadataEditor Component
├── PriceManager Component
├── RecoveryWizard Component
└── Shared Utilities
```

### State Management
- No external state library
- Component-based state
- Event delegation for performance
- Global app instance for inter-component communication

### API Communication
```javascript
// All API calls go through authenticatedFetch
const response = await authenticatedFetch('/api/v1/products', {
  method: 'POST',
  body: productData
});
```

## Deployment Architecture

### Development Environment
```bash
npm run dev     # Start with nodemon
npm run logs    # View logs
npm run stop    # Stop server
```

### Production Environment
```bash
./scripts/start-server.sh    # Start with PM2
./scripts/stop-server.sh     # Graceful shutdown
./scripts/restart-server.sh  # Zero-downtime restart
```

### Environment Variables
```
NODE_ENV=production
PORT=4040
DB_HOST=localhost
DB_USER=medpro_admin
DB_PASSWORD=secure_password
DB_NAME=medpro_admin
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=random_32_char_string
```

## Performance Considerations

### Database Optimization
- Connection pooling (10 connections)
- Indexed columns for frequent queries
- JSON column for flexible metadata
- Prepared statements for performance

### Frontend Optimization
- Event delegation for dynamic content
- Lazy loading for large datasets
- Debounced search inputs
- Minimal DOM manipulation

### Caching Strategy
- No server-side caching (real-time data priority)
- Browser caching for static assets
- JWT token caching in localStorage

## Monitoring and Logging

### Winston Logger Configuration
- Daily rotating log files
- Separate error logs
- Structured JSON logging
- Request ID tracking
- Performance metrics

### Log Levels
- **error**: System errors, exceptions
- **warn**: Deprecations, non-critical issues
- **info**: General information, requests
- **debug**: Detailed debugging info

## Error Handling

### Backend Error Handling
1. Try-catch blocks in async routes
2. Global error middleware
3. Structured error responses
4. Detailed logging with stack traces
5. User-friendly error messages

### Frontend Error Handling
1. API error interceptor
2. Toast notifications for users
3. Console logging for debugging
4. Graceful degradation
5. Loading states

## Testing Strategy

### Current Testing
- Manual testing via UI
- API testing with curl/Postman
- Database query validation
- Stripe webhook testing

### Recommended Testing
- Unit tests for services
- Integration tests for API
- Frontend component tests
- End-to-end testing
- Load testing for production

## Scalability Considerations

### Horizontal Scaling
- Stateless JWT authentication
- Database connection pooling
- No server-side sessions
- Static asset serving

### Vertical Scaling
- Efficient SQL queries
- Minimal memory usage
- Async/await patterns
- Stream processing for large datasets

## Future Architecture Improvements

### Short Term
- Redis for caching
- Queue system for background jobs
- API rate limiting
- Automated testing

### Long Term
- Microservices architecture
- GraphQL API
- Real-time updates (WebSockets)
- Multi-tenant support

---

Last Updated: July 21, 2025