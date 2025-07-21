# Stripe Product Catalog Management System - Complete Implementation Plan

## Executive Summary

Build a comprehensive product catalog management system that synchronizes between Stripe and MedPro database, providing a unified admin interface for managing subscription products, pricing, and metadata. The system will use a separate admin database for audit and management tables while referencing the main MedPro database for application data.

## Technical Stack

- **Frontend**: HTML/CSS/JavaScript (following MedPro patterns)
- **Backend**: Node.js/Express (same as MedPro backend)
- **Databases**: 
  - **medpro_admin** (new): Admin-specific tables for audit, sync, and management
  - **medpro** (existing): Reference for existing application data
- **External Services**: Stripe API

## Database Architecture

### Two-Database Approach

```sql
-- Database 1: medpro_admin (New Admin Database)
-- Contains all admin-specific tables for product management

-- Database 2: medpro (Existing Application Database)
-- Read-only access for reference data:
-- - PLANS table
-- - ai_plan_features table
-- - user_subscriptions table
-- - organizations table
```

### Admin Database Schema (medpro_admin)

```sql
-- Create admin database
CREATE DATABASE IF NOT EXISTS medpro_admin;
USE medpro_admin;

-- Product catalog mirror from Stripe
CREATE TABLE product_catalog (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    metadata JSON COMMENT 'Complete Stripe metadata',
    
    -- Parsed metadata for easier querying
    plan_type VARCHAR(50),
    user_tier INT,
    environment VARCHAR(20) DEFAULT 'production',
    
    -- Sync tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_stripe_sync TIMESTAMP NULL,
    sync_status ENUM('synced', 'pending', 'error', 'conflict') DEFAULT 'pending',
    sync_error TEXT,
    
    -- Reference to MedPro database
    medpro_plan_code VARCHAR(50) COMMENT 'Links to medpro.PLANS.plan',
    
    INDEX idx_stripe_id (stripe_product_id),
    INDEX idx_active (active),
    INDEX idx_sync_status (sync_status),
    INDEX idx_plan_type (plan_type, user_tier)
);

-- Price information from Stripe
CREATE TABLE product_prices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_product_id VARCHAR(255) NOT NULL,
    
    -- Price details
    unit_amount INT NOT NULL COMMENT 'Amount in cents',
    currency VARCHAR(3) NOT NULL,
    billing_period ENUM('month', 'semester', 'year', 'one_time') NOT NULL,
    lookup_key VARCHAR(255),
    nickname VARCHAR(255),
    active BOOLEAN DEFAULT true,
    trial_period_days INT DEFAULT 0,
    
    -- Metadata
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (stripe_product_id) REFERENCES product_catalog(stripe_product_id),
    INDEX idx_stripe_price_id (stripe_price_id),
    INDEX idx_product (stripe_product_id),
    INDEX idx_lookup_key (lookup_key),
    INDEX idx_active (active)
);

-- Audit log for all admin actions
CREATE TABLE admin_audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_email VARCHAR(255) NOT NULL,
    action_type ENUM('create', 'update', 'delete', 'sync', 'bulk_update', 'recovery') NOT NULL,
    entity_type ENUM('product', 'price', 'metadata', 'sync') NOT NULL,
    entity_id VARCHAR(255) COMMENT 'Stripe ID of affected entity',
    
    -- Change details
    changes_json JSON COMMENT 'What changed',
    metadata_before JSON,
    metadata_after JSON,
    
    -- Request context
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(36) COMMENT 'UUID for tracking related actions',
    
    -- Results
    status ENUM('success', 'error', 'partial') DEFAULT 'success',
    error_message TEXT,
    affected_count INT DEFAULT 1,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_admin (admin_email, created_at),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_request (request_id),
    INDEX idx_created (created_at)
);

-- Sync queue for Stripe operations
CREATE TABLE sync_queue (
    id INT PRIMARY KEY AUTO_INCREMENT,
    operation_type ENUM('create_product', 'update_product', 'create_price', 'update_price', 'archive') NOT NULL,
    entity_type ENUM('product', 'price') NOT NULL,
    entity_id VARCHAR(255),
    
    -- Operation data
    operation_data JSON NOT NULL,
    priority INT DEFAULT 5 COMMENT '1-10, 1 is highest',
    
    -- Status tracking
    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    
    -- Scheduling
    scheduled_for TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- Error tracking
    last_error TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_status_priority (status, priority, scheduled_for),
    INDEX idx_entity (entity_type, entity_id)
);

-- Metadata templates for quick product creation
CREATE TABLE metadata_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    category ENUM('subscription', 'ai_addon', 'bundle') NOT NULL,
    description TEXT,
    
    -- Template content
    base_metadata JSON NOT NULL,
    variable_fields JSON COMMENT 'Fields that need user input',
    validation_rules JSON,
    
    -- Usage tracking
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_category (category),
    INDEX idx_usage (usage_count DESC)
);

-- V3 recovery tracking
CREATE TABLE v3_recovery_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    recovery_batch VARCHAR(36) NOT NULL COMMENT 'UUID for grouping related fixes',
    
    -- What was fixed
    issue_type ENUM('missing_v3_prefix', 'wrong_lookup_key', 'orphaned_price', 'missing_price') NOT NULL,
    stripe_entity_id VARCHAR(255),
    entity_type ENUM('product', 'price') NOT NULL,
    
    -- Fix details
    original_value TEXT,
    fixed_value TEXT,
    action_taken ENUM('renamed', 'updated_metadata', 'created', 'archived', 'deleted') NOT NULL,
    
    -- Status
    status ENUM('pending', 'fixed', 'failed', 'skipped') DEFAULT 'pending',
    error_message TEXT,
    
    -- Audit
    executed_at TIMESTAMP NULL,
    executed_by VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_batch (recovery_batch),
    INDEX idx_status (status),
    INDEX idx_issue (issue_type)
);

-- Admin user permissions (simplified)
CREATE TABLE admin_permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('super_admin', 'product_admin', 'viewer') DEFAULT 'viewer',
    
    -- Specific permissions
    can_create_products BOOLEAN DEFAULT FALSE,
    can_edit_products BOOLEAN DEFAULT FALSE,
    can_delete_products BOOLEAN DEFAULT FALSE,
    can_sync_stripe BOOLEAN DEFAULT FALSE,
    can_run_recovery BOOLEAN DEFAULT FALSE,
    can_view_audit BOOLEAN DEFAULT TRUE,
    
    -- Access control
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    
    INDEX idx_email (email),
    INDEX idx_active (is_active)
);
```

## Complete Metadata Structure

```javascript
// Product Metadata Schema (stored in product_catalog.metadata)
const ProductMetadataSchema = {
  // Version Control
  schema_version: "1.0",
  
  // Basic Classification
  classification: {
    plan_type: "SCHEDULING|CLINIC",
    user_tier: 1|5|10|20|50,
    market_segment: "small_practice|clinic|hospital",
    billing_model: "subscription|usage_based|hybrid"
  },
  
  // Subscription Limits
  subscription_limits: {
    users: {
      practitioners: 10,
      assistants: 5,
      admins: 2,
      total_concurrent: 15
    },
    patients: {
      active_patients: 1000,
      total_patients: 5000,
      patient_history_years: 5
    },
    locations: {
      max_locations: 3,
      max_rooms_per_location: 10
    },
    storage: {
      documents_gb: 50,
      images_gb: 25,
      backups_retention_days: 90,
      audit_retention_days: 365
    }
  },
  
  // Feature Access
  features: {
    clinical: {
      electronic_prescriptions: true,
      lab_integrations: true,
      imaging_viewer: true,
      clinical_protocols: true,
      referral_management: true
    },
    scheduling: {
      online_booking: true,
      recurring_appointments: true,
      multi_location_scheduling: true,
      waiting_list: true,
      automated_reminders: true
    },
    financial: {
      billing_module: true,
      insurance_claims: true,
      payment_processing: true,
      financial_reports: true,
      revenue_cycle_management: false
    },
    communication: {
      sms_reminders: true,
      email_campaigns: true,
      whatsapp_integration: true,
      patient_portal: true,
      telemedicine: true
    },
    reporting: {
      standard_reports: true,
      custom_reports: true,
      analytics_dashboard: true,
      export_formats: ["pdf", "excel", "csv"],
      api_access: false
    }
  },
  
  // AI Configuration
  ai_quotas: {
    tokens: {
      monthly_limit: 500000,
      daily_limit: 20000,
      per_request_limit: 4096
    },
    audio: {
      monthly_minutes: 600,
      per_file_minutes: 30,
      supported_formats: ["mp3", "wav", "m4a"]
    },
    models: {
      text_models: ["gpt-4o", "gpt-4o-mini"],
      audio_models: ["whisper-1"],
      vision_models: ["gpt-4-vision"],
      embeddings_enabled: true
    },
    features: {
      clinical_notes_ai: true,
      prescription_assistance: true,
      diagnosis_suggestions: true,
      report_generation: true,
      image_analysis: true
    },
    priority: {
      queue_priority: "standard|high|critical",
      rate_limit_multiplier: 1,
      batch_processing: true
    }
  },
  
  // Support & SLA
  support: {
    level: "email|chat|phone|dedicated",
    response_time_hours: 24,
    included_training_hours: 5,
    dedicated_account_manager: false,
    custom_onboarding: false
  },
  
  // Billing Configuration
  billing: {
    grace_period_days: 15,
    auto_renewal: true,
    payment_methods: ["credit_card", "bank_transfer", "boleto"],
    invoice_customization: true,
    bulk_discount_eligible: true
  },
  
  // Cross-sell & Upsell
  commercial: {
    upgrade_paths: ["prod_ABC123", "prod_DEF456"],
    compatible_addons: ["ai_boost", "storage_extra", "training_pack"],
    bundle_components: [],
    promotional_eligibility: {
      seasonal_discounts: true,
      referral_program: true,
      loyalty_rewards: true
    }
  },
  
  // Display Configuration
  display: {
    ui_position: {
      category_order: 2,
      featured: true,
      badge: "MOST_POPULAR|NEW|BEST_VALUE"
    },
    marketing: {
      highlight_features: [
        "Unlimited appointments",
        "AI Clinical Assistant",
        "24/7 Support"
      ],
      target_audience: ["clinics", "hospitals"],
      seo_tags: ["medical", "clinic", "management"]
    }
  },
  
  // Technical Configuration
  technical: {
    api_version: "v3",
    webhook_events: ["subscription.updated", "invoice.payment_failed"],
    integration_endpoints: {
      lab_systems: ["lab_corp", "quest"],
      pharmacy_networks: ["cvs", "walgreens"],
      insurance_providers: ["PROVIDER_LIST"]
    }
  }
};
```

## Backend API Implementation

### Project Structure

```
/medproback/
├── src/
│   ├── routes/
│   │   └── admin/
│   │       ├── products.js         # Product management routes
│   │       ├── prices.js           # Price management routes
│   │       ├── sync.js             # Stripe sync routes
│   │       ├── recovery.js         # V3 recovery routes
│   │       └── audit.js            # Audit log routes
│   ├── services/
│   │   └── admin/
│   │       ├── productService.js   # Product business logic
│   │       ├── stripeService.js    # Stripe API wrapper
│   │       ├── syncService.js      # Sync orchestration
│   │       ├── metadataService.js  # Metadata validation
│   │       └── auditService.js     # Audit logging
│   ├── middleware/
│   │   ├── adminAuth.js            # Admin authentication
│   │   ├── validateMetadata.js     # Metadata validation
│   │   └── auditLogger.js          # Request audit logging
│   └── config/
│       ├── adminDatabase.js        # Admin DB connection
│       └── stripe.js               # Stripe configuration
```

### Database Connections

```javascript
// config/adminDatabase.js
const mysql = require('mysql2/promise');

// Create connection pools for both databases
const adminPool = mysql.createPool({
  host: process.env.ADMIN_DB_HOST || '127.0.0.1',
  user: process.env.ADMIN_DB_USER || 'medpro_admin',
  password: process.env.ADMIN_DB_PASSWORD || 'admin_password',
  database: 'medpro_admin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const medproPool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'medpro',
  password: process.env.DB_PASSWORD || 'medpro',
  database: 'medpro',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = {
  adminDb: adminPool,
  medproDb: medproPool,
  
  // Helper for transactions
  async withAdminTransaction(callback) {
    const connection = await adminPool.getConnection();
    await connection.beginTransaction();
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
};
```

### Stripe Configuration

```javascript
// config/stripe.js
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Webhook configuration
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = {
  stripe,
  webhookSecret,
  
  // Helper to construct webhook event
  constructWebhookEvent(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  }
};
```

### Admin Authentication Middleware

```javascript
// middleware/adminAuth.js
const jwt = require('jsonwebtoken');
const { adminDb } = require('../config/adminDatabase');

async function verifyAdminAccess(req, res, next) {
  try {
    // Extract token from header
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check admin permissions in database
    const [admins] = await adminDb.execute(
      `SELECT * FROM admin_permissions 
       WHERE email = ? AND is_active = TRUE`,
      [decoded.email]
    );

    if (admins.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Attach admin info to request
    req.admin = {
      email: decoded.email,
      permissions: admins[0]
    };

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid authentication'
    });
  }
}

// Permission check middleware factory
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin.permissions[permission]) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${permission} required`
      });
    }
    next();
  };
}

module.exports = {
  verifyAdminAccess,
  requirePermission
};
```

### Product Service Implementation

```javascript
// services/admin/productService.js
const { adminDb, medproDb, withAdminTransaction } = require('../../config/adminDatabase');
const { stripe } = require('../../config/stripe');
const auditService = require('./auditService');

class ProductService {
  // List all products with filtering
  async listProducts(filters = {}) {
    let query = `
      SELECT 
        pc.*,
        COUNT(DISTINCT pp.id) as price_count,
        MIN(pp.unit_amount) as min_price,
        MAX(pp.unit_amount) as max_price
      FROM product_catalog pc
      LEFT JOIN product_prices pp ON pc.stripe_product_id = pp.stripe_product_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Apply filters
    if (filters.active !== undefined) {
      query += ' AND pc.active = ?';
      params.push(filters.active);
    }
    
    if (filters.plan_type) {
      query += ' AND pc.plan_type = ?';
      params.push(filters.plan_type);
    }
    
    if (filters.user_tier) {
      query += ' AND pc.user_tier = ?';
      params.push(filters.user_tier);
    }
    
    if (filters.search) {
      query += ' AND (pc.name LIKE ? OR pc.description LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    
    query += ' GROUP BY pc.id ORDER BY pc.name';
    
    const [products] = await adminDb.execute(query, params);
    
    // Get prices for each product
    for (const product of products) {
      const [prices] = await adminDb.execute(
        `SELECT * FROM product_prices 
         WHERE stripe_product_id = ? 
         ORDER BY unit_amount`,
        [product.stripe_product_id]
      );
      product.prices = prices;
      product.metadata = JSON.parse(product.metadata || '{}');
    }
    
    return products;
  }

  // Get single product with full details
  async getProduct(stripeProductId) {
    const [products] = await adminDb.execute(
      'SELECT * FROM product_catalog WHERE stripe_product_id = ?',
      [stripeProductId]
    );
    
    if (products.length === 0) {
      throw new Error('Product not found');
    }
    
    const product = products[0];
    product.metadata = JSON.parse(product.metadata || '{}');
    
    // Get prices
    const [prices] = await adminDb.execute(
      'SELECT * FROM product_prices WHERE stripe_product_id = ?',
      [stripeProductId]
    );
    product.prices = prices;
    
    // Get related MedPro plan if linked
    if (product.medpro_plan_code) {
      const [plans] = await medproDb.execute(
        'SELECT * FROM PLANS WHERE plan = ?',
        [product.medpro_plan_code]
      );
      product.medpro_plan = plans[0] || null;
    }
    
    return product;
  }

  // Create new product
  async createProduct(productData, adminEmail) {
    return withAdminTransaction(async (connection) => {
      try {
        // Create in Stripe first
        const stripeProduct = await stripe.products.create({
          name: productData.name,
          description: productData.description,
          active: productData.active !== false,
          metadata: this.flattenMetadata(productData.metadata)
        });
        
        // Parse metadata for database fields
        const parsedData = this.parseMetadata(productData.metadata);
        
        // Insert into local database
        await connection.execute(
          `INSERT INTO product_catalog 
           (stripe_product_id, name, description, active, metadata,
            plan_type, user_tier, environment, medpro_plan_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            stripeProduct.id,
            stripeProduct.name,
            stripeProduct.description,
            stripeProduct.active,
            JSON.stringify(productData.metadata),
            parsedData.plan_type,
            parsedData.user_tier,
            parsedData.environment || 'production',
            productData.medpro_plan_code || null
          ]
        );
        
        // Create prices if provided
        if (productData.prices && productData.prices.length > 0) {
          for (const priceData of productData.prices) {
            await this.createPrice(
              stripeProduct.id, 
              priceData, 
              adminEmail,
              connection
            );
          }
        }
        
        // Log audit
        await auditService.logAction(
          adminEmail,
          'create',
          'product',
          stripeProduct.id,
          { created: productData },
          null,
          productData.metadata,
          connection
        );
        
        return stripeProduct;
      } catch (error) {
        // If Stripe succeeded but DB failed, try to delete from Stripe
        if (stripeProduct?.id) {
          try {
            await stripe.products.update(stripeProduct.id, { active: false });
          } catch (cleanupError) {
            console.error('Failed to cleanup Stripe product:', cleanupError);
          }
        }
        throw error;
      }
    });
  }

  // Update existing product
  async updateProduct(stripeProductId, updates, adminEmail) {
    return withAdminTransaction(async (connection) => {
      // Get current state
      const currentProduct = await this.getProduct(stripeProductId);
      
      // Update in Stripe
      const stripeUpdates = {
        name: updates.name,
        description: updates.description,
        active: updates.active
      };
      
      if (updates.metadata) {
        stripeUpdates.metadata = this.flattenMetadata(updates.metadata);
      }
      
      const updatedStripeProduct = await stripe.products.update(
        stripeProductId,
        stripeUpdates
      );
      
      // Update local database
      const parsedData = this.parseMetadata(updates.metadata || currentProduct.metadata);
      
      await connection.execute(
        `UPDATE product_catalog 
         SET name = ?, description = ?, active = ?, metadata = ?,
             plan_type = ?, user_tier = ?, medpro_plan_code = ?,
             updated_at = NOW()
         WHERE stripe_product_id = ?`,
        [
          updates.name || currentProduct.name,
          updates.description || currentProduct.description,
          updates.active !== undefined ? updates.active : currentProduct.active,
          JSON.stringify(updates.metadata || currentProduct.metadata),
          parsedData.plan_type,
          parsedData.user_tier,
          updates.medpro_plan_code !== undefined ? 
            updates.medpro_plan_code : currentProduct.medpro_plan_code,
          stripeProductId
        ]
      );
      
      // Log audit
      await auditService.logAction(
        adminEmail,
        'update',
        'product',
        stripeProductId,
        updates,
        currentProduct.metadata,
        updates.metadata || currentProduct.metadata,
        connection
      );
      
      return updatedStripeProduct;
    });
  }

  // Create price for product
  async createPrice(stripeProductId, priceData, adminEmail, connection = null) {
    const executeCreate = async (conn) => {
      // Create lookup key
      const lookupKey = this.generateLookupKey(
        stripeProductId,
        priceData.billing_period,
        priceData.currency
      );
      
      // Create in Stripe
      const stripePrice = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: priceData.unit_amount,
        currency: priceData.currency,
        recurring: priceData.billing_period !== 'one_time' ? {
          interval: priceData.billing_period === 'semester' ? 'month' : priceData.billing_period,
          interval_count: priceData.billing_period === 'semester' ? 6 : 1
        } : undefined,
        nickname: priceData.nickname || lookupKey,
        lookup_key: lookupKey,
        metadata: priceData.metadata || {}
      });
      
      // Insert into local database
      await conn.execute(
        `INSERT INTO product_prices 
         (stripe_price_id, stripe_product_id, unit_amount, currency,
          billing_period, lookup_key, nickname, active, trial_period_days, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stripePrice.id,
          stripeProductId,
          priceData.unit_amount,
          priceData.currency,
          priceData.billing_period,
          lookupKey,
          priceData.nickname || lookupKey,
          true,
          priceData.trial_period_days || 0,
          JSON.stringify(priceData.metadata || {})
        ]
      );
      
      return stripePrice;
    };
    
    if (connection) {
      return executeCreate(connection);
    } else {
      return withAdminTransaction(executeCreate);
    }
  }

  // Helper methods
  flattenMetadata(metadata) {
    const flattened = {};
    
    // Flatten nested structure for Stripe (which only supports string values)
    const flatten = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}_${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flatten(value, fullKey);
        } else if (Array.isArray(value)) {
          flattened[fullKey] = value.join(',');
        } else {
          flattened[fullKey] = String(value);
        }
      }
    };
    
    flatten(metadata);
    return flattened;
  }

  parseMetadata(metadata) {
    return {
      plan_type: metadata.classification?.plan_type,
      user_tier: metadata.classification?.user_tier,
      environment: metadata.classification?.environment || 'production'
    };
  }

  generateLookupKey(productId, billingPeriod, currency) {
    // Extract plan info from product ID (e.g., "prod_v3_clinic_10users")
    const parts = productId.toLowerCase().split('_');
    const key = parts.join('_') + '_' + billingPeriod + '_' + currency;
    return key.replace(/[^a-z0-9_]/g, '_');
  }
}

module.exports = new ProductService();
```

### Sync Service Implementation

```javascript
// services/admin/syncService.js
const { adminDb, withAdminTransaction } = require('../../config/adminDatabase');
const { stripe } = require('../../config/stripe');
const productService = require('./productService');
const auditService = require('./auditService');

class SyncService {
  // Sync all products from Stripe to local database
  async syncFromStripe(adminEmail) {
    const results = {
      synced: 0,
      errors: 0,
      conflicts: 0,
      details: []
    };
    
    try {
      // Fetch all products from Stripe
      const stripeProducts = [];
      for await (const product of stripe.products.list({ limit: 100 })) {
        stripeProducts.push(product);
      }
      
      // Fetch all prices from Stripe
      const stripePrices = [];
      for await (const price of stripe.prices.list({ limit: 100 })) {
        stripePrices.push(price);
      }
      
      // Group prices by product
      const pricesByProduct = {};
      stripePrices.forEach(price => {
        if (!pricesByProduct[price.product]) {
          pricesByProduct[price.product] = [];
        }
        pricesByProduct[price.product].push(price);
      });
      
      // Sync each product
      for (const stripeProduct of stripeProducts) {
        try {
          await withAdminTransaction(async (connection) => {
            // Check if product exists locally
            const [existing] = await connection.execute(
              'SELECT * FROM product_catalog WHERE stripe_product_id = ?',
              [stripeProduct.id]
            );
            
            const metadata = this.unflattenMetadata(stripeProduct.metadata);
            const parsedData = productService.parseMetadata(metadata);
            
            if (existing.length === 0) {
              // Insert new product
              await connection.execute(
                `INSERT INTO product_catalog 
                 (stripe_product_id, name, description, active, metadata,
                  plan_type, user_tier, last_stripe_sync)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                  stripeProduct.id,
                  stripeProduct.name,
                  stripeProduct.description,
                  stripeProduct.active,
                  JSON.stringify(metadata),
                  parsedData.plan_type,
                  parsedData.user_tier
                ]
              );
            } else {
              // Update existing product
              await connection.execute(
                `UPDATE product_catalog 
                 SET name = ?, description = ?, active = ?, metadata = ?,
                     plan_type = ?, user_tier = ?, 
                     last_stripe_sync = NOW(), sync_status = 'synced'
                 WHERE stripe_product_id = ?`,
                [
                  stripeProduct.name,
                  stripeProduct.description,
                  stripeProduct.active,
                  JSON.stringify(metadata),
                  parsedData.plan_type,
                  parsedData.user_tier,
                  stripeProduct.id
                ]
              );
            }
            
            // Sync prices
            const productPrices = pricesByProduct[stripeProduct.id] || [];
            for (const stripePrice of productPrices) {
              await this.syncPrice(stripePrice, connection);
            }
            
            results.synced++;
            results.details.push({
              product_id: stripeProduct.id,
              status: 'success'
            });
          });
        } catch (error) {
          results.errors++;
          results.details.push({
            product_id: stripeProduct.id,
            status: 'error',
            error: error.message
          });
        }
      }
      
      // Log sync operation
      await auditService.logAction(
        adminEmail,
        'sync',
        'sync',
        'stripe_to_local',
        results
      );
      
      return results;
    } catch (error) {
      console.error('Sync from Stripe failed:', error);
      throw error;
    }
  }

  // Sync single price
  async syncPrice(stripePrice, connection) {
    const [existing] = await connection.execute(
      'SELECT * FROM product_prices WHERE stripe_price_id = ?',
      [stripePrice.id]
    );
    
    const billingPeriod = this.getBillingPeriod(stripePrice);
    
    if (existing.length === 0) {
      // Insert new price
      await connection.execute(
        `INSERT INTO product_prices 
         (stripe_price_id, stripe_product_id, unit_amount, currency,
          billing_period, lookup_key, nickname, active, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stripePrice.id,
          stripePrice.product,
          stripePrice.unit_amount,
          stripePrice.currency,
          billingPeriod,
          stripePrice.lookup_key,
          stripePrice.nickname,
          stripePrice.active,
          JSON.stringify(stripePrice.metadata || {})
        ]
      );
    } else {
      // Update existing price
      await connection.execute(
        `UPDATE product_prices 
         SET unit_amount = ?, active = ?, lookup_key = ?, 
             nickname = ?, metadata = ?
         WHERE stripe_price_id = ?`,
        [
          stripePrice.unit_amount,
          stripePrice.active,
          stripePrice.lookup_key,
          stripePrice.nickname,
          JSON.stringify(stripePrice.metadata || {}),
          stripePrice.id
        ]
      );
    }
  }

  // Helper to determine billing period
  getBillingPeriod(stripePrice) {
    if (!stripePrice.recurring) return 'one_time';
    
    const { interval, interval_count } = stripePrice.recurring;
    
    if (interval === 'month' && interval_count === 6) {
      return 'semester';
    }
    
    return interval; // month or year
  }

  // Convert flat Stripe metadata back to nested structure
  unflattenMetadata(flatMetadata) {
    const metadata = {};
    
    for (const [key, value] of Object.entries(flatMetadata)) {
      const parts = key.split('_');
      let current = metadata;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      // Convert string values back to appropriate types
      const lastKey = parts[parts.length - 1];
      if (value === 'true') {
        current[lastKey] = true;
      } else if (value === 'false') {
        current[lastKey] = false;
      } else if (!isNaN(value) && value !== '') {
        current[lastKey] = Number(value);
      } else if (value.includes(',')) {
        current[lastKey] = value.split(',');
      } else {
        current[lastKey] = value;
      }
    }
    
    return metadata;
  }
}

module.exports = new SyncService();
```

### V3 Recovery Service

```javascript
// services/admin/recoveryService.js
const { adminDb, withAdminTransaction } = require('../../config/adminDatabase');
const { stripe } = require('../../config/stripe');
const { v4: uuidv4 } = require('uuid');

class V3RecoveryService {
  // Run audit to find V3 issues
  async runAudit() {
    const issues = {
      products: [],
      prices: [],
      summary: {
        total_issues: 0,
        missing_v3_prefix: 0,
        wrong_lookup_keys: 0,
        orphaned_prices: 0,
        missing_prices: 0
      }
    };
    
    // Get all products and prices
    const [products] = await adminDb.execute(
      'SELECT * FROM product_catalog WHERE plan_type IN ("CLINIC", "SCHEDULING")'
    );
    
    const [prices] = await adminDb.execute(
      'SELECT * FROM product_prices'
    );
    
    // Check each product
    for (const product of products) {
      const productIssues = [];
      
      // Check for v3 naming
      if (product.environment === 'production' && 
          !product.name.toLowerCase().includes('v3') &&
          !product.stripe_product_id.includes('v3')) {
        productIssues.push('missing_v3_prefix');
        issues.summary.missing_v3_prefix++;
      }
      
      // Check for required prices (monthly, semester, annual)
      const productPrices = prices.filter(p => p.stripe_product_id === product.stripe_product_id);
      const expectedPeriods = ['month', 'semester', 'year'];
      const missingPeriods = expectedPeriods.filter(
        period => !productPrices.some(p => p.billing_period === period)
      );
      
      if (missingPeriods.length > 0) {
        productIssues.push('missing_prices');
        issues.summary.missing_prices += missingPeriods.length;
      }
      
      // Check lookup keys
      productPrices.forEach(price => {
        if (price.lookup_key && !price.lookup_key.startsWith('v3_')) {
          productIssues.push('wrong_lookup_key');
          issues.summary.wrong_lookup_keys++;
          
          issues.prices.push({
            price_id: price.stripe_price_id,
            current_lookup_key: price.lookup_key,
            issue: 'missing_v3_prefix'
          });
        }
      });
      
      if (productIssues.length > 0) {
        issues.products.push({
          product_id: product.stripe_product_id,
          name: product.name,
          issues: productIssues
        });
        issues.summary.total_issues += productIssues.length;
      }
    }
    
    // Check for orphaned prices
    const productIds = products.map(p => p.stripe_product_id);
    const orphanedPrices = prices.filter(p => !productIds.includes(p.stripe_product_id));
    
    issues.summary.orphaned_prices = orphanedPrices.length;
    issues.summary.total_issues += orphanedPrices.length;
    
    return issues;
  }

  // Execute recovery plan
  async executeRecovery(steps, adminEmail) {
    const batchId = uuidv4();
    const results = {
      batch_id: batchId,
      executed: 0,
      failed: 0,
      details: []
    };
    
    for (const step of steps) {
      try {
        await withAdminTransaction(async (connection) => {
          switch (step.action) {
            case 'fix_product_name':
              await this.fixProductName(step.product_id, step.new_name, batchId, connection);
              break;
              
            case 'fix_lookup_key':
              await this.fixLookupKey(step.price_id, step.new_lookup_key, batchId, connection);
              break;
              
            case 'create_missing_price':
              await this.createMissingPrice(step.product_id, step.price_data, batchId, connection);
              break;
              
            case 'remove_orphaned_price':
              await this.removeOrphanedPrice(step.price_id, batchId, connection);
              break;
          }
          
          results.executed++;
          results.details.push({
            step: step.action,
            entity_id: step.product_id || step.price_id,
            status: 'success'
          });
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          step: step.action,
          entity_id: step.product_id || step.price_id,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Fix product name to include v3
  async fixProductName(productId, newName, batchId, connection) {
    // Update in Stripe
    await stripe.products.update(productId, { name: newName });
    
    // Update locally
    await connection.execute(
      'UPDATE product_catalog SET name = ? WHERE stripe_product_id = ?',
      [newName, productId]
    );
    
    // Log recovery action
    await connection.execute(
      `INSERT INTO v3_recovery_log 
       (recovery_batch, issue_type, stripe_entity_id, entity_type,
        original_value, fixed_value, action_taken, status, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        batchId,
        'missing_v3_prefix',
        productId,
        'product',
        'old_name', // You'd fetch this first
        newName,
        'renamed',
        'fixed'
      ]
    );
  }

  // Fix price lookup key
  async fixLookupKey(priceId, newLookupKey, batchId, connection) {
    // Note: Stripe doesn't allow updating lookup_key directly
    // We need to create a new price and archive the old one
    
    // Get current price details
    const [prices] = await connection.execute(
      'SELECT * FROM product_prices WHERE stripe_price_id = ?',
      [priceId]
    );
    
    if (prices.length === 0) throw new Error('Price not found');
    
    const oldPrice = prices[0];
    
    // Create new price with correct lookup key
    const newPrice = await stripe.prices.create({
      product: oldPrice.stripe_product_id,
      unit_amount: oldPrice.unit_amount,
      currency: oldPrice.currency,
      recurring: oldPrice.billing_period !== 'one_time' ? {
        interval: oldPrice.billing_period === 'semester' ? 'month' : oldPrice.billing_period,
        interval_count: oldPrice.billing_period === 'semester' ? 6 : 1
      } : undefined,
      nickname: oldPrice.nickname,
      lookup_key: newLookupKey,
      metadata: JSON.parse(oldPrice.metadata || '{}')
    });
    
    // Archive old price
    await stripe.prices.update(priceId, { active: false });
    
    // Update database
    await connection.execute(
      'UPDATE product_prices SET active = FALSE WHERE stripe_price_id = ?',
      [priceId]
    );
    
    await connection.execute(
      `INSERT INTO product_prices 
       (stripe_price_id, stripe_product_id, unit_amount, currency,
        billing_period, lookup_key, nickname, active, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPrice.id,
        oldPrice.stripe_product_id,
        oldPrice.unit_amount,
        oldPrice.currency,
        oldPrice.billing_period,
        newLookupKey,
        oldPrice.nickname,
        true,
        oldPrice.metadata
      ]
    );
    
    // Log recovery
    await connection.execute(
      `INSERT INTO v3_recovery_log 
       (recovery_batch, issue_type, stripe_entity_id, entity_type,
        original_value, fixed_value, action_taken, status, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        batchId,
        'wrong_lookup_key',
        priceId,
        'price',
        oldPrice.lookup_key,
        newLookupKey,
        'created',
        'fixed'
      ]
    );
  }
}

module.exports = new V3RecoveryService();
```

## Frontend Implementation

### Directory Structure

```
/medproadmin/
├── index.html                    # Admin dashboard
├── product-catalog/
│   ├── index.html               # Product catalog main page
│   ├── css/
│   │   ├── product-catalog.css  # Main styles
│   │   └── components.css       # Component styles
│   ├── js/
│   │   ├── app.js              # Main application
│   │   ├── api.js              # API communication layer
│   │   ├── components/
│   │   │   ├── productList.js   # Product list component
│   │   │   ├── productEditor.js # Product editor
│   │   │   ├── metadataEditor.js# Metadata editor
│   │   │   ├── priceManager.js  # Price management
│   │   │   └── recoveryWizard.js# V3 recovery
│   │   └── utils/
│   │       ├── validation.js    # Validation helpers
│   │       └── formatting.js    # Display formatting
│   └── templates/               # HTML templates
```

### Main HTML Structure

```html
<!-- product-catalog/index.html -->
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MedPro Admin - Product Catalog</title>
    
    <!-- CSS -->
    <link href="/css/bootstrap.min.css" rel="stylesheet">
    <link href="/css/admin-base.css" rel="stylesheet">
    <link href="css/product-catalog.css" rel="stylesheet">
    <link href="css/components.css" rel="stylesheet">
    
    <!-- Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body>
    <!-- Admin Header -->
    <header id="admin-header"></header>
    
    <!-- Main Container -->
    <div class="admin-container">
        <!-- Sidebar -->
        <aside id="admin-sidebar"></aside>
        
        <!-- Main Content -->
        <main class="admin-content">
            <!-- Page Header -->
            <div class="page-header">
                <h1>Product Catalog Management</h1>
                <div class="header-actions">
                    <button class="btn btn-primary" id="btn-new-product">
                        <i class="fas fa-plus"></i> New Product
                    </button>
                    <button class="btn btn-warning" id="btn-v3-recovery">
                        <i class="fas fa-tools"></i> V3 Recovery
                    </button>
                    <button class="btn btn-secondary" id="btn-sync">
                        <i class="fas fa-sync"></i> Sync with Stripe
                    </button>
                </div>
            </div>
            
            <!-- Filters Section -->
            <div class="filters-section card">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-3">
                            <label>Plan Type</label>
                            <select class="form-control" id="filter-plan-type">
                                <option value="">All Types</option>
                                <option value="CLINIC">Clinic</option>
                                <option value="SCHEDULING">Scheduling</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label>User Tier</label>
                            <select class="form-control" id="filter-user-tier">
                                <option value="">All Tiers</option>
                                <option value="1">1 User</option>
                                <option value="5">5 Users</option>
                                <option value="10">10 Users</option>
                                <option value="20">20 Users</option>
                                <option value="50">50 Users</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label>Status</label>
                            <select class="form-control" id="filter-status">
                                <option value="">All</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label>Search</label>
                            <input type="text" class="form-control" id="filter-search" 
                                   placeholder="Search products...">
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Products Grid -->
            <div id="products-container" class="products-grid">
                <!-- Products will be loaded here -->
            </div>
            
            <!-- Pagination -->
            <div id="pagination-container" class="pagination-wrapper">
                <!-- Pagination will be loaded here -->
            </div>
        </main>
    </div>
    
    <!-- Modals -->
    <div id="modal-container"></div>
    
    <!-- Scripts -->
    <script src="/js/jquery.min.js"></script>
    <script src="/js/bootstrap.bundle.min.js"></script>
    <script src="/js/medpro.js"></script>
    
    <!-- Admin Scripts -->
    <script src="/admin/shared/js/adminAuth.js"></script>
    <script src="/admin/shared/js/adminUtils.js"></script>
    
    <!-- Product Catalog Scripts -->
    <script src="js/api.js"></script>
    <script src="js/utils/validation.js"></script>
    <script src="js/utils/formatting.js"></script>
    <script src="js/components/productList.js"></script>
    <script src="js/components/productEditor.js"></script>
    <script src="js/components/metadataEditor.js"></script>
    <script src="js/components/priceManager.js"></script>
    <script src="js/components/recoveryWizard.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
```

### API Communication Layer

```javascript
// js/api.js
class ProductCatalogAPI {
  constructor() {
    this.baseUrl = '/api/admin';
  }

  // Products
  async getProducts(filters = {}) {
    const params = new URLSearchParams(filters);
    return await authenticatedFetch(`${this.baseUrl}/products?${params}`);
  }

  async getProduct(productId) {
    return await authenticatedFetch(`${this.baseUrl}/products/${productId}`);
  }

  async createProduct(productData) {
    return await authenticatedFetch(`${this.baseUrl}/products`, {
      method: 'POST',
      body: productData
    });
  }

  async updateProduct(productId, updates) {
    return await authenticatedFetch(`${this.baseUrl}/products/${productId}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deleteProduct(productId) {
    return await authenticatedFetch(`${this.baseUrl}/products/${productId}`, {
      method: 'DELETE'
    });
  }

  // Prices
  async createPrice(productId, priceData) {
    return await authenticatedFetch(`${this.baseUrl}/products/${productId}/prices`, {
      method: 'POST',
      body: priceData
    });
  }

  async updatePrice(priceId, updates) {
    return await authenticatedFetch(`${this.baseUrl}/prices/${priceId}`, {
      method: 'PUT',
      body: updates
    });
  }

  async deletePrice(priceId) {
    return await authenticatedFetch(`${this.baseUrl}/prices/${priceId}`, {
      method: 'DELETE'
    });
  }

  // Metadata
  async validateMetadata(metadata) {
    return await authenticatedFetch(`${this.baseUrl}/products/validate-metadata`, {
      method: 'POST',
      body: { metadata }
    });
  }

  async getMetadataTemplates() {
    return await authenticatedFetch(`${this.baseUrl}/metadata/templates`);
  }

  // Sync
  async syncFromStripe() {
    return await authenticatedFetch(`${this.baseUrl}/sync/stripe-to-local`, {
      method: 'POST'
    });
  }

  async syncToStripe() {
    return await authenticatedFetch(`${this.baseUrl}/sync/local-to-stripe`, {
      method: 'POST'
    });
  }

  // V3 Recovery
  async runV3Audit() {
    return await authenticatedFetch(`${this.baseUrl}/products/v3-audit`);
  }

  async executeV3Recovery(steps) {
    return await authenticatedFetch(`${this.baseUrl}/products/v3-recovery`, {
      method: 'POST',
      body: { steps }
    });
  }

  // Audit
  async getAuditLog(filters = {}) {
    const params = new URLSearchParams(filters);
    return await authenticatedFetch(`${this.baseUrl}/audit/products?${params}`);
  }
}

// Create global instance
window.productAPI = new ProductCatalogAPI();
```

### Main Application

```javascript
// js/app.js
class ProductCatalogApp {
  constructor() {
    this.currentFilters = {
      plan_type: '',
      user_tier: '',
      active: '',
      search: ''
    };
    
    this.components = {
      productList: null,
      productEditor: null,
      metadataEditor: null,
      priceManager: null,
      recoveryWizard: null
    };
  }

  async init() {
    // Check admin authentication
    if (!await this.checkAuth()) {
      window.location.href = '/admin/login';
      return;
    }
    
    // Initialize components
    this.initializeComponents();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Load initial data
    await this.loadProducts();
  }

  async checkAuth() {
    try {
      const response = await authenticatedFetch('/api/admin/verify');
      return response.data?.success === true;
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }

  initializeComponents() {
    // Initialize product list
    this.components.productList = new ProductList(
      document.getElementById('products-container'),
      {
        onProductSelect: (productId) => this.editProduct(productId),
        onProductDelete: (productId) => this.deleteProduct(productId)
      }
    );
    
    // Initialize editors (will be shown in modals)
    this.components.productEditor = new ProductEditor();
    this.components.metadataEditor = new MetadataEditor();
    this.components.priceManager = new PriceManager();
    this.components.recoveryWizard = new V3RecoveryWizard();
  }

  setupEventListeners() {
    // New product button
    document.getElementById('btn-new-product').addEventListener('click', () => {
      this.createNewProduct();
    });
    
    // V3 Recovery button
    document.getElementById('btn-v3-recovery').addEventListener('click', () => {
      this.startV3Recovery();
    });
    
    // Sync button
    document.getElementById('btn-sync').addEventListener('click', () => {
      this.syncWithStripe();
    });
    
    // Filters
    document.getElementById('filter-plan-type').addEventListener('change', (e) => {
      this.currentFilters.plan_type = e.target.value;
      this.loadProducts();
    });
    
    document.getElementById('filter-user-tier').addEventListener('change', (e) => {
      this.currentFilters.user_tier = e.target.value;
      this.loadProducts();
    });
    
    document.getElementById('filter-status').addEventListener('change', (e) => {
      this.currentFilters.active = e.target.value === 'active' ? true : 
                                   e.target.value === 'inactive' ? false : '';
      this.loadProducts();
    });
    
    // Search with debounce
    let searchTimeout;
    document.getElementById('filter-search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.currentFilters.search = e.target.value;
        this.loadProducts();
      }, 300);
    });
  }

  async loadProducts() {
    try {
      showLoading();
      
      const response = await productAPI.getProducts(this.currentFilters);
      
      if (response.data?.success) {
        this.components.productList.render(response.data.data.products);
        this.updatePagination(response.data.data.pagination);
      } else {
        showToast('Failed to load products', 'error');
      }
    } catch (error) {
      console.error('Load products error:', error);
      showToast('Error loading products', 'error');
    } finally {
      hideLoading();
    }
  }

  createNewProduct() {
    const modal = this.components.productEditor.showCreateModal();
    
    modal.on('save', async (productData) => {
      try {
        showLoading();
        
        const response = await productAPI.createProduct(productData);
        
        if (response.data?.success) {
          showToast('Product created successfully', 'success');
          modal.hide();
          await this.loadProducts();
        } else {
          showToast(response.data?.error || 'Failed to create product', 'error');
        }
      } catch (error) {
        console.error('Create product error:', error);
        showToast('Error creating product', 'error');
      } finally {
        hideLoading();
      }
    });
  }

  async editProduct(productId) {
    try {
      showLoading();
      
      const response = await productAPI.getProduct(productId);
      
      if (response.data?.success) {
        const product = response.data.data;
        const modal = this.components.productEditor.showEditModal(product);
        
        modal.on('save', async (updates) => {
          try {
            showLoading();
            
            const updateResponse = await productAPI.updateProduct(productId, updates);
            
            if (updateResponse.data?.success) {
              showToast('Product updated successfully', 'success');
              modal.hide();
              await this.loadProducts();
            } else {
              showToast(updateResponse.data?.error || 'Failed to update product', 'error');
            }
          } catch (error) {
            console.error('Update product error:', error);
            showToast('Error updating product', 'error');
          } finally {
            hideLoading();
          }
        });
        
        // Handle metadata editing
        modal.on('edit-metadata', () => {
          this.editMetadata(product);
        });
        
        // Handle price management
        modal.on('manage-prices', () => {
          this.managePrices(product);
        });
      }
    } catch (error) {
      console.error('Edit product error:', error);
      showToast('Error loading product', 'error');
    } finally {
      hideLoading();
    }
  }

  editMetadata(product) {
    const modal = this.components.metadataEditor.showModal(product.metadata);
    
    modal.on('save', async (metadata) => {
      try {
        // Validate metadata first
        const validationResponse = await productAPI.validateMetadata(metadata);
        
        if (validationResponse.data?.valid) {
          const response = await productAPI.updateProduct(product.stripe_product_id, { metadata });
          
          if (response.data?.success) {
            showToast('Metadata updated successfully', 'success');
            modal.hide();
            await this.loadProducts();
          }
        } else {
          this.components.metadataEditor.showValidationErrors(
            validationResponse.data.errors,
            validationResponse.data.warnings
          );
        }
      } catch (error) {
        console.error('Update metadata error:', error);
        showToast('Error updating metadata', 'error');
      }
    });
  }

  managePrices(product) {
    const modal = this.components.priceManager.showModal(product);
    
    modal.on('add-price', async (priceData) => {
      try {
        const response = await productAPI.createPrice(product.stripe_product_id, priceData);
        
        if (response.data?.success) {
          showToast('Price created successfully', 'success');
          this.components.priceManager.refreshPrices(product.stripe_product_id);
        }
      } catch (error) {
        console.error('Create price error:', error);
        showToast('Error creating price', 'error');
      }
    });
    
    modal.on('update-price', async (priceId, updates) => {
      try {
        const response = await productAPI.updatePrice(priceId, updates);
        
        if (response.data?.success) {
          showToast('Price updated successfully', 'success');
          this.components.priceManager.refreshPrices(product.stripe_product_id);
        }
      } catch (error) {
        console.error('Update price error:', error);
        showToast('Error updating price', 'error');
      }
    });
  }

  async deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }
    
    try {
      showLoading();
      
      const response = await productAPI.deleteProduct(productId);
      
      if (response.data?.success) {
        showToast('Product deleted successfully', 'success');
        await this.loadProducts();
      } else {
        showToast(response.data?.error || 'Failed to delete product', 'error');
      }
    } catch (error) {
      console.error('Delete product error:', error);
      showToast('Error deleting product', 'error');
    } finally {
      hideLoading();
    }
  }

  async startV3Recovery() {
    const wizard = this.components.recoveryWizard;
    const modal = wizard.showModal();
    
    // Run audit
    const auditResponse = await productAPI.runV3Audit();
    
    if (auditResponse.data?.success) {
      wizard.showAuditResults(auditResponse.data.data);
      
      modal.on('execute-recovery', async (steps) => {
        try {
          showLoading();
          
          const response = await productAPI.executeV3Recovery(steps);
          
          if (response.data?.success) {
            wizard.showRecoveryResults(response.data.data);
            await this.loadProducts();
          }
        } catch (error) {
          console.error('V3 recovery error:', error);
          showToast('Error executing recovery', 'error');
        } finally {
          hideLoading();
        }
      });
    }
  }

  async syncWithStripe() {
    if (!confirm('This will sync all products from Stripe. Continue?')) {
      return;
    }
    
    try {
      showLoading('Syncing with Stripe...');
      
      const response = await productAPI.syncFromStripe();
      
      if (response.data?.success) {
        const results = response.data.data;
        showToast(
          `Sync complete: ${results.synced} synced, ${results.errors} errors`, 
          results.errors > 0 ? 'warning' : 'success'
        );
        await this.loadProducts();
      }
    } catch (error) {
      console.error('Sync error:', error);
      showToast('Error syncing with Stripe', 'error');
    } finally {
      hideLoading();
    }
  }

  updatePagination(pagination) {
    // Simple pagination implementation
    const container = document.getElementById('pagination-container');
    const totalPages = Math.ceil(pagination.total / pagination.per_page);
    
    let html = '<nav><ul class="pagination">';
    
    for (let i = 1; i <= totalPages; i++) {
      const active = i === pagination.page ? 'active' : '';
      html += `<li class="page-item ${active}">
                 <a class="page-link" href="#" data-page="${i}">${i}</a>
               </li>`;
    }
    
    html += '</ul></nav>';
    container.innerHTML = html;
    
    // Add click handlers
    container.querySelectorAll('.page-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentFilters.page = parseInt(e.target.dataset.page);
        this.loadProducts();
      });
    });
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new ProductCatalogApp();
  app.init();
});
```

## Environment Configuration

### .env File Structure

```bash
# Database Configuration
DB_HOST=127.0.0.1
DB_USER=medpro
DB_PASSWORD=medpro
DB_NAME=medpro

# Admin Database Configuration
ADMIN_DB_HOST=127.0.0.1
ADMIN_DB_USER=medpro_admin
ADMIN_DB_PASSWORD=admin_secure_password
ADMIN_DB_NAME=medpro_admin

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# JWT Configuration
JWT_SECRET=your-secure-jwt-secret
JWT_EXPIRY=24h

# Application
NODE_ENV=production
PORT=3000
```

## Deployment Instructions

### 1. Database Setup

```sql
-- Create admin database and user
CREATE DATABASE medpro_admin;
CREATE USER 'medpro_admin'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON medpro_admin.* TO 'medpro_admin'@'localhost';

-- Grant read-only access to main medpro database
GRANT SELECT ON medpro.* TO 'medpro_admin'@'localhost';

FLUSH PRIVILEGES;

-- Run schema creation scripts
USE medpro_admin;
-- Execute all CREATE TABLE statements from above
```

### 2. Backend Deployment

```bash
# Install dependencies
cd medproback
npm install stripe mysql2 uuid

# Create admin directories
mkdir -p src/routes/admin
mkdir -p src/services/admin
mkdir -p src/middleware

# Copy admin files to appropriate directories
# Set up environment variables
cp .env.example .env
# Edit .env with production values

# Restart Node.js application
pm2 restart medpro-backend
```

### 3. Frontend Deployment

```bash
# Create admin directory structure
mkdir -p /var/www/medpro/admin/product-catalog
cd /var/www/medpro/admin/product-catalog

# Copy frontend files
cp -r product-catalog/* .

# Set permissions
chown -R www-data:www-data /var/www/medpro/admin
chmod -R 755 /var/www/medpro/admin

# Configure nginx (add to existing config)
location /admin/ {
    auth_basic "Admin Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
    try_files $uri $uri/ =404;
}
```

### 4. Stripe Webhook Setup

1. Go to Stripe Dashboard > Webhooks
2. Add endpoint: `https://your-domain.com/api/admin/webhooks/stripe`
3. Select events:
   - product.created
   - product.updated
   - product.deleted
   - price.created
   - price.updated
4. Copy webhook secret to .env file

## Testing Plan

### 1. Unit Tests

```javascript
// tests/admin/productService.test.js
const productService = require('../../src/services/admin/productService');

describe('ProductService', () => {
  test('should create product with valid metadata', async () => {
    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      metadata: {
        classification: {
          plan_type: 'CLINIC',
          user_tier: 10
        }
      }
    };
    
    const result = await productService.createProduct(productData, 'test@admin.com');
    expect(result.id).toBeDefined();
    expect(result.name).toBe(productData.name);
  });
});
```

### 2. Integration Tests

- Test Stripe API connections
- Test database transactions
- Test webhook processing
- Test metadata validation

### 3. End-to-End Tests

- Complete product creation flow
- V3 recovery process
- Sync operations
- Price management

## Monitoring & Maintenance

### 1. Health Checks

```javascript
// Add health check endpoint
app.get('/api/admin/health', async (req, res) => {
  const checks = {
    database: false,
    adminDatabase: false,
    stripe: false
  };
  
  // Check databases
  try {
    await medproDb.execute('SELECT 1');
    checks.database = true;
  } catch (error) {}
  
  try {
    await adminDb.execute('SELECT 1');
    checks.adminDatabase = true;
  } catch (error) {}
  
  // Check Stripe
  try {
    await stripe.products.list({ limit: 1 });
    checks.stripe = true;
  } catch (error) {}
  
  const healthy = Object.values(checks).every(v => v === true);
  
  res.status(healthy ? 200 : 500).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks
  });
});
```

### 2. Monitoring Queries

```sql
-- Check sync status
SELECT 
  sync_status, 
  COUNT(*) as count,
  MAX(last_stripe_sync) as last_sync
FROM product_catalog
GROUP BY sync_status;

-- Recent admin actions
SELECT 
  admin_email,
  action_type,
  entity_type,
  COUNT(*) as action_count,
  MAX(created_at) as last_action
FROM admin_audit_log
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY admin_email, action_type, entity_type
ORDER BY last_action DESC;

-- V3 recovery status
SELECT 
  issue_type,
  status,
  COUNT(*) as count
FROM v3_recovery_log
GROUP BY issue_type, status;
```

## Security Checklist

- [ ] Admin authentication implemented
- [ ] Role-based permissions enforced
- [ ] All API endpoints protected
- [ ] Stripe webhook signature verified
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection (input sanitization)
- [ ] HTTPS enforced
- [ ] Rate limiting implemented
- [ ] Audit logging enabled
- [ ] Database backups configured

## Success Metrics

1. **System Performance**
   - Page load time < 2 seconds
   - API response time < 500ms
   - Sync completion < 30 seconds

2. **Business Metrics**
   - 100% product data accuracy
   - Zero manual Stripe updates needed
   - V3 issues resolved within 1 week

3. **User Satisfaction**
   - Admin task completion time reduced by 80%
   - Error rate < 0.1%
   - Complete audit trail availability