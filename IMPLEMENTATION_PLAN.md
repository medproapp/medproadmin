# MedPro Product Catalog - Detailed Implementation Plan

> **Note**: This is a historical planning document from the initial design phase. For the current implementation status and live features, please see [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Executive Summary

This document provides a step-by-step implementation plan for the MedPro Product Catalog System. It includes specific tasks, dependencies, resource allocation, and success criteria for each phase of development.

## Timeline Overview

```
Week 1: Foundation & Infrastructure
Week 2: Core Product Management
Week 3: Metadata & Pricing Systems  
Week 4: V3 Recovery & Sync Services
Week 5: Advanced Features & Integration
Week 6: Testing, Deployment & Training
```

## Pre-Implementation Checklist

### Environment Setup
- [ ] Create development environment
- [ ] Set up staging environment  
- [ ] Configure CI/CD pipeline
- [ ] Create Git repository and branches
- [ ] Set up project management tools

### Access Requirements
- [ ] Stripe API keys (test and production)
- [ ] Database credentials
- [ ] Admin server access
- [ ] SSL certificates
- [ ] Domain/subdomain configuration

### Team Assignments
- **Lead Developer**: Full-stack implementation
- **Backend Developer**: API and services
- **Frontend Developer**: UI components
- **DevOps Engineer**: Infrastructure and deployment
- **QA Engineer**: Testing and validation

## Week 1: Foundation & Infrastructure

### Day 1-2: Database Setup

**Tasks:**
1. Create `medpro_admin` database
```sql
CREATE DATABASE medpro_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Create database user with permissions
```sql
CREATE USER 'medpro_admin'@'localhost' IDENTIFIED BY 'SecurePassword123!';
GRANT ALL PRIVILEGES ON medpro_admin.* TO 'medpro_admin'@'localhost';
GRANT SELECT ON medpro.* TO 'medpro_admin'@'localhost';
FLUSH PRIVILEGES;
```

3. Execute schema creation scripts
```bash
mysql -u medpro_admin -p medpro_admin < schema/admin_tables.sql
```

4. Create initial data and templates
```bash
mysql -u medpro_admin -p medpro_admin < schema/initial_data.sql
```

5. Set up database connections in code
```javascript
// config/database.js
const adminPool = mysql.createPool({
  host: process.env.ADMIN_DB_HOST,
  user: process.env.ADMIN_DB_USER,
  password: process.env.ADMIN_DB_PASSWORD,
  database: 'medpro_admin',
  connectionLimit: 10
});
```

**Success Criteria:**
- All tables created successfully
- Connection pools working
- Basic queries executing

### Day 3-4: Authentication & Authorization

**Tasks:**
1. Create admin middleware
```javascript
// middleware/adminAuth.js
const verifyAdminAccess = async (req, res, next) => {
  // Implementation
};
```

2. Set up permission system
```javascript
// middleware/permissions.js
const checkPermission = (permission) => {
  return (req, res, next) => {
    // Check specific permission
  };
};
```

3. Create admin routes structure
```javascript
// routes/admin/index.js
router.use('/admin/*', verifyAdminAccess);
router.use('/admin/products', require('./products'));
```

4. Implement JWT enhancements
```javascript
// Add admin claims to existing JWT
const token = jwt.sign({
  ...existingClaims,
  admin_role: user.admin_role,
  admin_permissions: user.permissions
}, process.env.JWT_SECRET);
```

5. Create permission checking utilities

**Success Criteria:**
- Admin routes protected
- Permission system working
- JWT tokens include admin claims

### Day 5: Basic UI Structure

**Tasks:**
1. Create directory structure
```bash
mkdir -p medproadmin/{css,js,templates,assets}
mkdir -p medproadmin/js/{components,services,utils}
```

2. Create base HTML template
```html
<!-- medproadmin/index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>MedPro Admin - Product Catalog</title>
    <!-- Include existing MedPro styles -->
</head>
<body>
    <!-- Admin layout -->
</body>
</html>
```

3. Set up routing configuration
```javascript
// js/router.js
const routes = {
  '/admin/products': ProductListView,
  '/admin/products/:id': ProductEditView,
  '/admin/recovery': RecoveryView
};
```

4. Create base CSS structure
```css
/* css/admin-base.css */
.admin-container { }
.admin-sidebar { }
.admin-content { }
```

5. Implement basic navigation

**Success Criteria:**
- Admin interface accessible
- Navigation working
- Base styles applied

## Week 2: Core Product Management

### Day 6-7: Product List Implementation

**Tasks:**
1. Create ProductService backend
```javascript
// services/productService.js
class ProductService {
  async listProducts(filters) { }
  async getProduct(id) { }
  async createProduct(data) { }
  async updateProduct(id, data) { }
}
```

2. Implement product API endpoints
```javascript
// routes/admin/products.js
router.get('/', async (req, res) => {
  const products = await productService.listProducts(req.query);
  res.json({ success: true, data: products });
});
```

3. Create ProductList component
```javascript
// js/components/ProductList.js
class ProductList {
  constructor(container) { }
  async loadProducts() { }
  render(products) { }
}
```

4. Implement filtering and search
```javascript
// Add filter support
const filters = {
  plan_type: req.query.plan_type,
  user_tier: req.query.user_tier,
  search: req.query.search
};
```

5. Add pagination support

**Success Criteria:**
- Products load from database
- Filtering works
- Pagination implemented

### Day 8-9: Product CRUD Operations

**Tasks:**
1. Create product editor component
```javascript
// js/components/ProductEditor.js
class ProductEditor {
  showCreateModal() { }
  showEditModal(product) { }
  validateForm() { }
  saveProduct() { }
}
```

2. Implement create product flow
```javascript
// Backend
async createProduct(data, adminEmail) {
  const stripeProduct = await stripe.products.create({...});
  await this.saveToDatabase(stripeProduct);
  await auditService.log('create', stripeProduct.id, adminEmail);
  return stripeProduct;
}
```

3. Implement update product flow
```javascript
// Backend
async updateProduct(id, updates, adminEmail) {
  const before = await this.getProduct(id);
  const stripeProduct = await stripe.products.update(id, updates);
  await this.updateDatabase(stripeProduct);
  await auditService.log('update', id, adminEmail, before, updates);
  return stripeProduct;
}
```

4. Add form validation
```javascript
// js/utils/validation.js
const validateProduct = (data) => {
  const errors = [];
  if (!data.name) errors.push('Name is required');
  if (!data.plan_type) errors.push('Plan type is required');
  return errors;
};
```

5. Implement delete/archive functionality

**Success Criteria:**
- Can create new products
- Can edit existing products
- Validation prevents errors
- Changes reflected in Stripe

### Day 10: Audit System

**Tasks:**
1. Create audit service
```javascript
// services/auditService.js
class AuditService {
  async logAction(adminEmail, action, entityType, entityId, changes) {
    await db.execute(
      `INSERT INTO admin_audit_log 
       (admin_email, action_type, entity_type, entity_id, changes_json)
       VALUES (?, ?, ?, ?, ?)`,
      [adminEmail, action, entityType, entityId, JSON.stringify(changes)]
    );
  }
}
```

2. Add audit middleware
```javascript
// middleware/auditLogger.js
const auditLogger = (action) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action
      originalSend.call(this, data);
    };
    
    next();
  };
};
```

3. Create audit viewing interface
```javascript
// js/components/AuditLog.js
class AuditLog {
  async loadAuditHistory(entityId) { }
  renderTimeline(entries) { }
}
```

4. Implement audit search/filter

5. Add audit export functionality

**Success Criteria:**
- All actions logged
- Audit trail viewable
- Can search audit history

## Week 3: Metadata & Pricing Systems

### Day 11-12: Metadata Editor

**Tasks:**
1. Create metadata schema validator
```javascript
// services/metadataValidator.js
class MetadataValidator {
  validateSchema(metadata) { }
  validateBusinessRules(metadata) { }
  checkCompatibility(metadata, planType) { }
}
```

2. Build metadata editor UI
```javascript
// js/components/MetadataEditor.js
class MetadataEditor {
  constructor() {
    this.schema = this.loadSchema();
    this.currentMetadata = {};
  }
  
  renderForm() { }
  renderJSONEditor() { }
  switchMode() { }
}
```

3. Implement field-level validation
```javascript
// Real-time validation
input.addEventListener('change', (e) => {
  const errors = this.validateField(e.target.name, e.target.value);
  this.showFieldErrors(e.target, errors);
});
```

4. Create metadata templates
```sql
INSERT INTO metadata_templates (name, category, template) VALUES
('Basic Clinic', 'subscription', '{"classification":{"plan_type":"CLINIC"}}'),
('AI Professional', 'ai_addon', '{"ai_quotas":{"monthly_tokens":1000000}}');
```

5. Add template management UI

**Success Criteria:**
- Visual metadata editing works
- Validation prevents errors
- Templates speed up creation

### Day 13-14: Price Management

**Tasks:**
1. Create price service
```javascript
// services/priceService.js
class PriceService {
  async createPrice(productId, priceData) { }
  async updatePrice(priceId, updates) { }
  generateLookupKey(productId, period, currency) { }
}
```

2. Build price matrix component
```javascript
// js/components/PriceMatrix.js
class PriceMatrix {
  renderPriceGrid(prices) { }
  addPrice() { }
  editPrice(priceId) { }
  bulkUpdatePrices(percentage) { }
}
```

3. Implement currency handling
```javascript
// utils/currency.js
const convertCurrency = (amount, from, to) => {
  const rates = { USD_BRL: 5.0, BRL_USD: 0.2 };
  return amount * rates[`${from}_${to}`];
};
```

4. Add billing period management
```javascript
// Semester = 6 months handling
if (billingPeriod === 'semester') {
  stripePriceData.recurring = {
    interval: 'month',
    interval_count: 6
  };
}
```

5. Create price preview/calculator

**Success Criteria:**
- Can manage multiple prices
- Lookup keys generated correctly
- Price matrix displays clearly

### Day 15: Sync Service Implementation

**Tasks:**
1. Create sync service
```javascript
// services/syncService.js
class SyncService {
  async syncFromStripe() { }
  async syncToStripe() { }
  async reconcileDifferences() { }
  handleConflict(local, remote) { }
}
```

2. Implement webhook handlers
```javascript
// routes/webhooks/stripe.js
router.post('/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  switch(event.type) {
    case 'product.updated':
      await syncService.handleProductUpdate(event.data.object);
      break;
  }
});
```

3. Create sync status dashboard
```javascript
// js/components/SyncStatus.js
class SyncStatus {
  showSyncProgress() { }
  displayConflicts() { }
  resolveConflict(productId, resolution) { }
}
```

4. Add sync scheduling
```javascript
// Schedule nightly sync
cron.schedule('0 2 * * *', async () => {
  await syncService.performFullSync();
});
```

5. Implement sync queue processing

**Success Criteria:**
- Manual sync works
- Webhooks process correctly
- Conflicts identified and resolvable

## Week 4: V3 Recovery & Advanced Sync

### Day 16-17: V3 Recovery System

**Tasks:**
1. Create recovery service
```javascript
// services/recoveryService.js
class V3RecoveryService {
  async runAudit() { }
  async generateRecoveryPlan() { }
  async executeFix(step) { }
  async verifyFix() { }
}
```

2. Build recovery wizard UI
```javascript
// js/components/RecoveryWizard.js
class RecoveryWizard {
  steps = ['audit', 'review', 'execute', 'verify'];
  currentStep = 0;
  
  async startRecovery() { }
  showAuditResults(results) { }
  executeRecoveryPlan(plan) { }
}
```

3. Implement specific fixes
```javascript
// Fix product names
async fixProductName(productId, correctName) {
  await stripe.products.update(productId, { name: correctName });
  await this.updateLocalDatabase(productId, { name: correctName });
  await this.logRecoveryAction('fix_name', productId, correctName);
}
```

4. Create recovery simulation mode
```javascript
// Dry run capability
async simulateRecovery() {
  const actions = await this.generateRecoveryPlan();
  return actions.map(action => ({
    ...action,
    simulated: true,
    wouldChange: this.calculateChanges(action)
  }));
}
```

5. Add recovery reporting

**Success Criteria:**
- Audit identifies all issues
- Recovery plan is accurate
- Fixes execute successfully
- Verification confirms resolution

### Day 18-19: Bulk Operations

**Tasks:**
1. Create bulk operation service
```javascript
// services/bulkOperationService.js
class BulkOperationService {
  async bulkUpdate(productIds, updates) { }
  async bulkArchive(productIds) { }
  async bulkPriceUpdate(filters, adjustment) { }
}
```

2. Build bulk selection UI
```javascript
// js/components/BulkSelector.js
class BulkSelector {
  selectedProducts = new Set();
  
  selectAll() { }
  selectFiltered() { }
  showBulkActions() { }
}
```

3. Implement progress tracking
```javascript
// js/components/BulkProgress.js
class BulkProgress {
  showProgressModal(totalItems) { }
  updateProgress(completed, total) { }
  handleError(item, error) { }
}
```

4. Add bulk validation
```javascript
// Validate bulk operations
async validateBulkOperation(productIds, operation) {
  const issues = [];
  for (const id of productIds) {
    const product = await this.getProduct(id);
    if (!this.canPerformOperation(product, operation)) {
      issues.push({ id, reason: 'Invalid state' });
    }
  }
  return issues;
}
```

5. Create bulk operation history

**Success Criteria:**
- Can select multiple products
- Bulk operations execute reliably
- Progress tracked accurately
- Errors handled gracefully

### Day 20: Advanced Search & Filters

**Tasks:**
1. Implement advanced search
```javascript
// Advanced search query builder
class SearchBuilder {
  buildQuery(criteria) {
    let query = 'SELECT * FROM product_catalog WHERE 1=1';
    
    if (criteria.metadata) {
      query += ` AND JSON_CONTAINS(metadata, '${JSON.stringify(criteria.metadata)}')`;
    }
    
    return query;
  }
}
```

2. Create saved searches
```sql
CREATE TABLE saved_searches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255),
  criteria JSON,
  created_by VARCHAR(255)
);
```

3. Build advanced filter UI
```javascript
// js/components/AdvancedFilter.js
class AdvancedFilter {
  addFilterCriteria() { }
  removeFilterCriteria() { }
  saveSearch() { }
  loadSavedSearch() { }
}
```

4. Add export functionality
```javascript
// Export filtered results
async exportProducts(format = 'csv') {
  const products = await this.getFilteredProducts();
  
  switch(format) {
    case 'csv':
      return this.generateCSV(products);
    case 'json':
      return JSON.stringify(products, null, 2);
    case 'excel':
      return this.generateExcel(products);
  }
}
```

5. Implement search analytics

**Success Criteria:**
- Complex searches work
- Saved searches functional
- Export generates valid files

## Week 5: Integration & Polish

### Day 21-22: External Integrations

**Tasks:**
1. Create integration framework
```javascript
// services/integrationService.js
class IntegrationService {
  async notifyExternalSystem(event, data) { }
  async syncWithERP() { }
  async updateReporting() { }
}
```

2. Implement notification system
```javascript
// Email notifications for critical changes
async notifyAdmins(change) {
  if (this.isCriticalChange(change)) {
    await emailService.send({
      to: config.ADMIN_EMAILS,
      subject: 'Critical Product Change',
      template: 'product-change',
      data: change
    });
  }
}
```

3. Add Slack integration
```javascript
// Slack webhook for updates
async postToSlack(message) {
  await fetch(process.env.SLACK_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({ text: message })
  });
}
```

4. Create API documentation
```javascript
// Generate OpenAPI spec
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MedPro Admin API',
    version: '1.0.0'
  },
  paths: generatePaths()
};
```

5. Implement rate limiting

**Success Criteria:**
- Notifications sent correctly
- External systems updated
- API documented

### Day 23-24: Performance Optimization

**Tasks:**
1. Implement caching layer
```javascript
// Redis caching
const cache = {
  async get(key) {
    return await redis.get(key);
  },
  
  async set(key, value, ttl = 3600) {
    await redis.setex(key, ttl, JSON.stringify(value));
  }
};
```

2. Optimize database queries
```sql
-- Add missing indexes
CREATE INDEX idx_metadata_plan_type 
ON product_catalog((JSON_EXTRACT(metadata, '$.classification.plan_type')));
```

3. Implement lazy loading
```javascript
// Lazy load prices only when needed
class ProductList {
  async loadPrices(productId) {
    if (!this.priceCache[productId]) {
      this.priceCache[productId] = await api.getPrices(productId);
    }
    return this.priceCache[productId];
  }
}
```

4. Add request batching
```javascript
// Batch multiple requests
class BatchProcessor {
  queue = [];
  
  add(request) {
    this.queue.push(request);
    if (this.queue.length >= 10) {
      this.process();
    }
  }
  
  async process() {
    const batch = this.queue.splice(0, 10);
    await this.executeBatch(batch);
  }
}
```

5. Optimize frontend assets

**Success Criteria:**
- Page loads under 2 seconds
- API responses under 500ms
- Smooth UI interactions

### Day 25: Error Handling & Recovery

**Tasks:**
1. Implement comprehensive error handling
```javascript
// Global error handler
class ErrorHandler {
  handle(error, context) {
    console.error('Error in', context, error);
    
    if (error.code === 'STRIPE_API_ERROR') {
      return this.handleStripeError(error);
    }
    
    return {
      user_message: 'An error occurred. Please try again.',
      admin_message: error.message,
      error_id: this.logError(error, context)
    };
  }
}
```

2. Add retry mechanisms
```javascript
// Exponential backoff retry
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

3. Create error monitoring
```javascript
// Sentry integration
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});
```

4. Implement data recovery
```javascript
// Backup before dangerous operations
async function withBackup(entity, operation) {
  const backup = await this.createBackup(entity);
  try {
    return await operation();
  } catch (error) {
    await this.restoreBackup(backup);
    throw error;
  }
}
```

5. Add user-friendly error messages

**Success Criteria:**
- Errors logged properly
- Retry logic works
- Users see helpful messages

## Week 6: Testing & Deployment

### Day 26-27: Testing

**Tasks:**
1. Write unit tests
```javascript
// tests/productService.test.js
describe('ProductService', () => {
  test('creates product with valid data', async () => {
    const product = await productService.create({
      name: 'Test Product',
      plan_type: 'CLINIC'
    });
    
    expect(product.id).toBeDefined();
    expect(product.name).toBe('Test Product');
  });
});
```

2. Create integration tests
```javascript
// tests/integration/api.test.js
describe('Product API', () => {
  test('GET /api/admin/products returns products', async () => {
    const response = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

3. Implement E2E tests
```javascript
// tests/e2e/productCreation.test.js
describe('Product Creation Flow', () => {
  test('Admin can create new product', async () => {
    await page.goto('/admin/products');
    await page.click('#btn-new-product');
    await page.fill('#product-name', 'E2E Test Product');
    await page.click('#save-product');
    
    await expect(page).toHaveText('Product created successfully');
  });
});
```

4. Performance testing
```javascript
// Load testing with k6
import http from 'k6/http';

export default function() {
  const response = http.get('https://api.medpro.com/admin/products');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500
  });
}
```

5. Security testing

**Success Criteria:**
- 90% test coverage
- All critical paths tested
- Performance benchmarks met

### Day 28-29: Deployment

**Tasks:**
1. Prepare production environment
```bash
# Server setup
sudo apt-get update
sudo apt-get install nginx mysql-server nodejs npm
sudo npm install -g pm2
```

2. Configure nginx
```nginx
server {
    listen 443 ssl;
    server_name admin.medpro.com;
    
    location / {
        root /var/www/medpro/admin;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/admin {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

3. Set up PM2 process manager
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'medpro-admin',
    script: './src/adminServer.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

4. Database migration
```bash
# Run migrations
npm run migrate:production

# Verify data
mysql -u medpro_admin -p -e "SELECT COUNT(*) FROM product_catalog"
```

5. Deploy and verify
```bash
# Deploy application
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Verify deployment
curl https://admin.medpro.com/api/admin/health
```

**Success Criteria:**
- Application deployed
- All services running
- Health checks passing

### Day 30: Training & Documentation

**Tasks:**
1. Create user documentation
```markdown
# MedPro Admin - User Guide

## Getting Started
1. Navigate to admin.medpro.com
2. Login with your admin credentials
3. Select "Product Catalog" from menu

## Common Tasks
### Creating a Product
1. Click "New Product"
2. Fill in required fields
3. Configure metadata
4. Set pricing
5. Click "Save"
```

2. Record training videos
- Product creation walkthrough
- V3 recovery process
- Bulk operations demo
- Troubleshooting guide

3. Create quick reference cards
```markdown
# Quick Reference

## Keyboard Shortcuts
- Ctrl+N: New product
- Ctrl+S: Save changes
- Ctrl+F: Search products

## Common Issues
- Sync failed: Check Stripe API status
- Validation error: Review metadata requirements
```

4. Conduct training sessions
- Admin team training (2 hours)
- Power user training (1 hour)
- Q&A session (30 minutes)

5. Set up support channel

**Success Criteria:**
- Documentation complete
- Training delivered
- Support channel active

## Post-Launch Tasks

### Week 7: Monitoring & Optimization

**Monitor:**
- System performance
- Error rates
- User adoption
- Support tickets

**Optimize:**
- Slow queries
- UI bottlenecks
- Common user paths

### Week 8: Feedback & Iteration

**Collect Feedback:**
- User surveys
- Usage analytics
- Support tickets
- Direct interviews

**Implement Improvements:**
- UI enhancements
- New features
- Bug fixes
- Performance improvements

## Risk Management

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stripe API changes | High | Version checking, graceful degradation |
| Database performance | Medium | Indexing, caching, query optimization |
| Data inconsistency | High | Transaction management, validation |
| Security breach | High | Regular audits, encryption, access control |

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User adoption | Medium | Training, documentation, support |
| Scope creep | Medium | Clear requirements, phase approach |
| Resource availability | Low | Cross-training, documentation |

## Success Metrics

### Technical Metrics
- [ ] Page load time < 2 seconds
- [ ] API response time < 500ms
- [ ] 99.9% uptime
- [ ] Zero data loss incidents

### Business Metrics
- [ ] V3 issues resolved 100%
- [ ] Product creation time < 5 minutes
- [ ] Support tickets reduced 50%
- [ ] Admin satisfaction > 8/10

### User Adoption
- [ ] 100% admin users trained
- [ ] 80% active usage within 2 weeks
- [ ] < 5% error rate in operations

## Conclusion

This implementation plan provides a structured approach to building the MedPro Product Catalog System. By following this plan, the team can deliver a robust, user-friendly system that solves immediate problems while providing a foundation for future growth.

Key success factors:
1. Clear task breakdown
2. Regular progress tracking
3. Continuous testing
4. User feedback integration
5. Comprehensive documentation