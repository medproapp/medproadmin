# MedPro Admin Server

Express.js backend server for the MedPro Admin interface, providing APIs for product catalog management, V3 recovery tools, and Stripe integration.

## Features

- **Product Management**: Full CRUD operations for Stripe products
- **Price Management**: Create and manage product prices with BRL support
- **V3 Recovery**: Automated tools to fix naming issues from V3 migration
- **Authentication**: JWT-based admin authentication
- **Audit Logging**: Complete audit trail for all admin actions
- **Stripe Integration**: Real-time sync with Stripe API
- **Database**: MySQL with separate admin database

## Setup

### 1. Install Dependencies

```bash
cd medproadmin/server
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

Key configuration variables:
- `PORT`: Server port (default: 4040)
- `DB_*`: MySQL database credentials
- `JWT_SECRET`: Secret key for JWT tokens
- `STRIPE_SECRET_KEY`: Your Stripe secret key

### 3. Database Setup

Create the database schema:

```bash
npm run db:setup
```

Or manually:

```bash
mysql -u root -p < ../database/schema.sql
```

### 4. Start Server

Development mode with auto-reload:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/login` - Admin login
- `GET /api/v1/auth/verify` - Verify JWT token
- `POST /api/v1/auth/logout` - Logout (audit logging)
- `GET /api/v1/auth/me` - Get current user info

### Products

- `GET /api/v1/products` - List products with filtering
- `GET /api/v1/products/:id` - Get single product
- `POST /api/v1/products` - Create new product
- `PUT /api/v1/products/:id` - Update product
- `DELETE /api/v1/products/:id` - Delete (archive) product

### Prices

- `POST /api/v1/prices` - Create new price
- `PUT /api/v1/prices/:id` - Update price (limited)
- `DELETE /api/v1/prices/:id` - Deactivate price
- `POST /api/v1/prices/bulk` - Bulk create standard prices

### V3 Recovery

- `POST /api/v1/recovery/audit` - Run V3 audit
- `POST /api/v1/recovery/execute` - Execute recovery fixes
- `GET /api/v1/recovery/history` - Get recovery history

### Sync

- `POST /api/v1/sync/stripe/full` - Full Stripe sync
- `POST /api/v1/sync/stripe/product/:id` - Sync single product
- `GET /api/v1/sync/status` - Get sync status

### Audit

- `GET /api/v1/audit` - Get audit logs
- `GET /api/v1/audit/stats` - Get audit statistics

### Statistics

- `GET /api/v1/stats/dashboard` - Dashboard statistics
- `GET /api/v1/stats/products/distribution` - Product distribution
- `GET /api/v1/stats/sync/metrics` - Sync metrics

## Frontend Access

The server serves the frontend at:
```
http://localhost:4040/medproadmin
```

## Demo Mode

In development, you can login with:
- Email: `demo@medpro.com`
- Password: `demo123`

## Security

- JWT authentication required for all API endpoints
- Admin role verification
- Rate limiting on sensitive endpoints
- SQL injection protection via parameterized queries
- XSS protection headers

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

## Testing

Run tests:

```bash
npm test
```

## Deployment

1. Set `NODE_ENV=production`
2. Use a process manager like PM2
3. Configure reverse proxy (Nginx/Apache)
4. Enable HTTPS
5. Set up database backups

## Troubleshooting

### Database Connection Issues

Check MySQL is running and credentials are correct:

```bash
mysql -u medpro_admin -p -h localhost
```

### Stripe API Errors

Verify your Stripe secret key is correct and has proper permissions.

### Port Already in Use

Change the port in `.env` or kill the process using port 4040:

```bash
lsof -i :4040
kill -9 <PID>
```

## Support

For issues or questions, contact the MedPro development team.