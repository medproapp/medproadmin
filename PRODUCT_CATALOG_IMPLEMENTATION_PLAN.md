# MedPro Admin Product Catalog - Implementation Plan

> **Note**: This is a historical planning document from the initial design phase. For the current implementation status and live features, please see [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Executive Summary

The MedPro Admin Product Catalog is a comprehensive administrative interface for managing Stripe products, prices, and their associated metadata. This system addresses the critical need for centralized product management, including subscription features, AI quota limits, and the recovery from the V3 naming disaster.

**Key Objectives:**
- Provide complete control over Stripe product catalog
- Manage complex metadata for subscription features and AI quotas
- Enable recovery from V3 product naming issues
- Support AI addon packages and cross-sell configurations
- Ensure data consistency between Stripe and local database

## Current State Analysis

### Existing Product Structure

MedPro currently manages products with the following metadata categories:

#### 1. Subscription Plan Metadata
- **Patient Limits** (`qtypatients`): Maximum patients per plan
- **User Limits** (`additionalusers`): JSON structure defining practitioner and assistant limits
- **Plan Type**: SCHEDULING or CLINIC
- **User Tiers**: 1, 5, 10, 20, 50 users
- **Billing Cycles**: Monthly, Semester (6 months), Annual

#### 2. AI Quota Metadata
- **Monthly Token Limits** (`ai_monthly_tokens`): Total tokens per month
- **Daily Token Limits** (`ai_daily_tokens`): Daily token cap
- **Audio Minutes** (`ai_audio_minutes`): Monthly transcription minutes
- **Model Access** (`ai_models_access`): Comma-separated list of allowed models
- **Priority Support** (`ai_priority_support`): Boolean for priority access
- **Advanced Features** (`ai_advanced_features`): Boolean for advanced AI features

#### 3. Additional Metadata (Planned)
- **Location Limits**: Number of locations allowed
- **Storage Limits**: Document/image storage quota
- **Report Access**: Types of reports available
- **Integration Access**: Third-party integrations allowed
- **Support Level**: Email, chat, phone support tiers

### Current Issues

1. **V3 Naming Disaster**: 22 active products with incorrect lookup keys (missing v3_ prefix)
2. **Orphaned Prices**: 30 prices with correct v3_ prefixes linked to inactive products
3. **No Admin Interface**: Manual Stripe dashboard management prone to errors
4. **Metadata Inconsistency**: Lack of validation causing data integrity issues
5. **No Audit Trail**: Cannot track who made what changes when

## Detailed Architecture

### Data Model

```javascript
// Complete Product Metadata Structure
const ProductMetadata = {
  // Basic Information
  plan_type: "CLINIC|SCHEDULING",
  user_tier: "1|5|10|20|50",
  environment: "development|production",
  version: "v3",
  created_by: "admin_email",
  created_at: "ISO_DATE",
  
  // Subscription Features
  features: {
    patients: {
      max_patients: 1000,
      patient_history_years: 5,
      patient_portal_access: true
    },
    users: {
      max_practitioners: 10,
      max_assistants: 5,
      max_locations: 3,
      concurrent_sessions: 15
    },
    scheduling: {
      appointment_types: ["consultation", "procedure", "followup"],
      recurring_appointments: true,
      waiting_list: true,
      online_booking: true,
      sms_reminders: true,
      email_reminders: true
    },
    clinical: {
      electronic_prescriptions: true,
      lab_integrations: true,
      imaging_viewer: true,
      referral_management: true,
      care_plans: true
    },
    financial: {
      billing_module: true,
      insurance_claims: true,
      payment_processing: true,
      financial_reports: true
    },
    storage: {
      document_storage_gb: 100,
      image_storage_gb: 50,
      backup_retention_days: 90
    },
    reporting: {
      standard_reports: true,
      custom_reports: true,
      export_formats: ["pdf", "excel", "csv"],
      analytics_dashboard: true
    },
    integrations: {
      whatsapp_integration: true,
      email_integration: true,
      sms_gateway: true,
      external_lab_systems: true,
      government_reporting: true
    },
    support: {
      support_level: "email|chat|phone|dedicated",
      training_hours: 10,
      priority_support: true,
      sla_hours: 4
    }
  },
  
  // AI Quota Configuration
  ai_quotas: {
    monthly_tokens: 250000,
    daily_tokens: 10000,
    per_request_tokens: 4096,
    monthly_audio_minutes: 600,
    models_access: ["gpt-4o", "gpt-4o-mini", "whisper-1"],
    embeddings_enabled: true,
    fine_tuning_enabled: false,
    priority_queue: true,
    batch_processing: true
  },
  
  // Pricing & Billing
  pricing: {
    currency: "BRL",
    billing_cycles: {
      monthly: { 
        price_cents: 10000, 
        discount_percent: 0 
      },
      semester: { 
        price_cents: 54000, 
        discount_percent: 10 
      },
      annual: { 
        price_cents: 96000, 
        discount_percent: 20 
      }
    },
    trial_days: 15,
    setup_fee: 0
  },
  
  // Cross-sell Configuration
  cross_sell: {
    upgrade_paths: ["prod_ABC123", "prod_DEF456"],
    recommended_addons: ["ai_professional", "storage_extra"],
    bundle_discounts: {
      with_ai_package: 15,
      with_training: 10
    }
  },
  
  // Display Configuration
  display: {
    featured: true,
    popular: true,
    new_product: false,
    sort_order: 2,
    category: "healthcare_clinic",
    tags: ["clinic", "complete", "ai-enabled"]
  }
};

// AI Addon Package Metadata
const AIPackageMetadata = {
  package_type: "ai_addon",
  package_id: "ai_professional",
  
  quotas: {
    monthly_tokens: 200000,
    audio_minutes: 500,
    priority_multiplier: 2,
    models_upgrade: ["gpt-4-turbo"]
  },
  
  features: {
    advanced_prompts: true,
    custom_assistants: true,
    api_access: true,
    usage_analytics: true
  },
  
  compatibility: {
    required_plans: ["CLINIC_*"],
    excluded_plans: ["FREE-1"],
    stackable: true,
    max_quantity: 5
  }
};
```

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MedPro Admin Interface                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Product    │  │   Metadata   │  │    Recovery &          │ │
│  │  Dashboard  │  │    Editor    │  │    Audit Tools         │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Admin API Layer                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Product    │  │   Metadata   │  │    Sync &              │ │
│  │  Service    │  │   Service    │  │    Validation          │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌──────────────────────────┐    ┌────────────────────────────────┐
│      Stripe API          │    │      MedPro Database           │
├──────────────────────────┤    ├────────────────────────────────┤
│  • Products              │    │  • PLANS                       │
│  • Prices               │    │  • ai_plan_features            │
│  • Metadata             │    │  • ai_addon_packages           │
│  • Webhooks             │    │  • product_audit_log           │
└──────────────────────────┘    └────────────────────────────────┘
```

## Implementation Components

### 1. Directory Structure

```
/medproadmin/
├── index.html                          # Admin dashboard home
├── shared/
│   ├── css/
│   │   ├── admin-base.css            # Base admin styles
│   │   └── admin-components.css      # Reusable components
│   ├── js/
│   │   ├── adminAuth.js              # Admin authentication
│   │   ├── adminConfig.js            # Configuration
│   │   └── adminUtils.js             # Shared utilities
│   └── components/
│       ├── AdminHeader.js            # Admin header component
│       ├── AdminSidebar.js           # Navigation sidebar
│       └── AdminFooter.js            # Footer component
│
└── product-catalog/
    ├── index.html                     # Product catalog main page
    ├── css/
    │   └── product-catalog.css       # Catalog-specific styles
    ├── js/
    │   ├── product-catalog.js        # Main JavaScript
    │   ├── services/
    │   │   ├── productApi.js         # API communication
    │   │   ├── metadataValidator.js  # Metadata validation
    │   │   └── stripeSync.js         # Stripe synchronization
    │   └── components/
    │       ├── ProductList.js        # Product listing grid
    │       ├── ProductEditor.js      # Product edit form
    │       ├── MetadataEditor.js     # Metadata form builder
    │       ├── PriceMatrix.js        # Pricing visualization
    │       ├── RecoveryWizard.js     # V3 recovery tools
    │       ├── AuditLog.js           # Change history
    │       └── BulkOperations.js     # Bulk actions
    └── templates/
        ├── product-card.html          # Product card template
        ├── metadata-form.html         # Metadata form template
        └── price-row.html             # Price row template
```

### 2. Backend API Endpoints

#### Product Management

```javascript
// Product CRUD Operations
GET    /api/admin/products                    // List all products with filtering
GET    /api/admin/products/:id                // Get single product with full metadata
POST   /api/admin/products                    // Create new product with prices
PUT    /api/admin/products/:id                // Update product and metadata
DELETE /api/admin/products/:id                // Safe delete with validation
POST   /api/admin/products/:id/clone          // Clone product with new settings

// Price Management
GET    /api/admin/products/:id/prices         // List all prices for product
POST   /api/admin/products/:id/prices         // Add new price to product
PUT    /api/admin/prices/:id                  // Update price details
DELETE /api/admin/prices/:id                  // Remove price (with checks)

// Metadata Operations
GET    /api/admin/products/:id/metadata       // Get parsed metadata
PUT    /api/admin/products/:id/metadata       // Update metadata with validation
POST   /api/admin/products/validate-metadata  // Validate metadata structure

// Bulk Operations
POST   /api/admin/products/bulk-update        // Update multiple products
POST   /api/admin/products/bulk-activate      // Activate multiple products
POST   /api/admin/products/bulk-deactivate    // Deactivate multiple products
DELETE /api/admin/products/bulk-delete        // Delete multiple products

// V3 Recovery Operations
GET    /api/admin/products/v3-audit           // Audit V3 naming issues
POST   /api/admin/products/v3-recovery        // Execute recovery plan
POST   /api/admin/products/fix-lookup-keys    // Fix lookup key naming
POST   /api/admin/products/cleanup-orphaned   // Clean orphaned prices

// AI Package Management
GET    /api/admin/ai-packages                 // List AI addon packages
POST   /api/admin/ai-packages                 // Create AI package
PUT    /api/admin/ai-packages/:id             // Update AI package
DELETE /api/admin/ai-packages/:id             // Delete AI package

// Sync & Validation
POST   /api/admin/sync/stripe-to-local        // Sync from Stripe to DB
POST   /api/admin/sync/local-to-stripe        // Sync from DB to Stripe
GET    /api/admin/sync/status                 // Check sync status
POST   /api/admin/sync/verify                 // Verify data consistency

// Audit & History
GET    /api/admin/audit/products/:id          // Product change history
GET    /api/admin/audit/recent                // Recent changes across system
GET    /api/admin/audit/user/:userId          // Changes by specific admin
```

#### Request/Response Examples

```javascript
// GET /api/admin/products Response
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_ABC123",
        "name": "MedPro v3 - Plano Clínica - 10 usuários",
        "description": "Sistema completo de gestão de clínica médica para até 10 usuários (v3.0)",
        "active": true,
        "created": 1628784000,
        "metadata": {
          "plan_type": "CLINIC",
          "user_tier": "10",
          "qtypatients": "1000",
          "additionalusers": "[{\"usertype\":\"pract\",\"quantity\":10},{\"usertype\":\"assist\",\"quantity\":5}]",
          "ai_monthly_tokens": "250000",
          "ai_daily_tokens": "10000",
          "ai_audio_minutes": "600",
          "ai_models_access": "gpt-4o,gpt-4o-mini,whisper-1"
        },
        "prices": [
          {
            "id": "price_DEF456",
            "nickname": "v3-CLINIC-10USER-monthly",
            "unit_amount": 53125,
            "currency": "brl",
            "recurring": {
              "interval": "month",
              "interval_count": 1
            },
            "lookup_key": "v3_clinic_10users_monthly",
            "active": true
          }
        ],
        "local_sync_status": "synced",
        "issues": []
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "per_page": 20
    }
  }
}

// POST /api/admin/products/validate-metadata Request
{
  "metadata": {
    "plan_type": "CLINIC",
    "user_tier": "10",
    "qtypatients": "1000",
    "additionalusers": "[{\"usertype\":\"pract\",\"quantity\":10}]",
    "ai_monthly_tokens": "250000"
  }
}

// POST /api/admin/products/validate-metadata Response
{
  "success": true,
  "valid": true,
  "warnings": [
    {
      "field": "additionalusers",
      "message": "Missing 'assist' usertype in additionalusers array"
    }
  ],
  "errors": [],
  "suggestions": {
    "missing_fields": ["ai_daily_tokens", "ai_models_access"],
    "recommended_values": {
      "ai_daily_tokens": "10000",
      "ai_models_access": "gpt-4o,gpt-4o-mini,whisper-1"
    }
  }
}
```

### 3. Frontend Components

#### Product List Component

```javascript
// ProductList.js
class ProductList {
  constructor(container) {
    this.container = container;
    this.products = [];
    this.filters = {
      plan_type: 'all',
      user_tier: 'all',
      status: 'active',
      search: '',
      has_issues: false
    };
    this.selectedProducts = new Set();
  }

  async loadProducts() {
    const params = new URLSearchParams(this.filters);
    const response = await authenticatedFetch(
      `/api/admin/products?${params}`,
      { method: 'GET' }
    );

    if (response.data?.success) {
      this.products = response.data.data.products;
      this.render();
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="product-list-header">
        <div class="filters-row">
          <select id="filter-plan-type" class="form-select">
            <option value="all">All Types</option>
            <option value="SCHEDULING">Scheduling</option>
            <option value="CLINIC">Clinic</option>
          </select>
          <select id="filter-user-tier" class="form-select">
            <option value="all">All Tiers</option>
            <option value="1">1 User</option>
            <option value="5">5 Users</option>
            <option value="10">10 Users</option>
            <option value="20">20 Users</option>
            <option value="50">50 Users</option>
          </select>
          <input type="text" id="filter-search" class="form-control" 
                 placeholder="Search products...">
        </div>
        <div class="actions-row">
          <button class="btn btn-primary" onclick="createNewProduct()">
            <i class="fas fa-plus"></i> New Product
          </button>
          <button class="btn btn-warning" onclick="openV3Recovery()">
            <i class="fas fa-wrench"></i> V3 Recovery
          </button>
          <button class="btn btn-secondary" onclick="syncWithStripe()">
            <i class="fas fa-sync"></i> Sync
          </button>
        </div>
      </div>
      
      <div class="product-grid">
        ${this.products.map(product => this.renderProductCard(product)).join('')}
      </div>
    `;
  }

  renderProductCard(product) {
    const issues = this.detectIssues(product);
    const statusClass = product.active ? 'active' : 'inactive';
    const issueClass = issues.length > 0 ? 'has-issues' : '';

    return `
      <div class="product-card ${statusClass} ${issueClass}" 
           data-product-id="${product.id}">
        <div class="product-header">
          <input type="checkbox" class="product-select" 
                 value="${product.id}">
          <h4>${product.name}</h4>
          <div class="product-badges">
            ${product.active ? 
              '<span class="badge bg-success">Active</span>' : 
              '<span class="badge bg-secondary">Inactive</span>'}
            ${issues.length > 0 ? 
              `<span class="badge bg-danger">${issues.length} Issues</span>` : ''}
          </div>
        </div>
        
        <div class="product-metadata">
          <div class="metadata-row">
            <span class="label">Type:</span>
            <span class="value">${product.metadata.plan_type}</span>
          </div>
          <div class="metadata-row">
            <span class="label">Users:</span>
            <span class="value">${product.metadata.user_tier}</span>
          </div>
          <div class="metadata-row">
            <span class="label">Patients:</span>
            <span class="value">${product.metadata.qtypatients || 'N/A'}</span>
          </div>
          <div class="metadata-row">
            <span class="label">AI Tokens:</span>
            <span class="value">${this.formatNumber(product.metadata.ai_monthly_tokens)}/mo</span>
          </div>
        </div>
        
        <div class="product-prices">
          <h5>Prices (${product.prices.length})</h5>
          ${product.prices.slice(0, 3).map(price => `
            <div class="price-item">
              <span class="price-amount">R$ ${(price.unit_amount / 100).toFixed(2)}</span>
              <span class="price-interval">/${price.recurring.interval}</span>
              ${!price.active ? '<span class="badge bg-warning">Inactive</span>' : ''}
            </div>
          `).join('')}
        </div>
        
        ${issues.length > 0 ? `
          <div class="product-issues">
            <h5>Issues Detected:</h5>
            <ul>
              ${issues.map(issue => `<li class="issue-${issue.severity}">${issue.message}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="product-actions">
          <button class="btn btn-sm btn-primary" 
                  onclick="editProduct('${product.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-sm btn-info" 
                  onclick="viewMetadata('${product.id}')">
            <i class="fas fa-code"></i> Metadata
          </button>
          <button class="btn btn-sm btn-secondary" 
                  onclick="cloneProduct('${product.id}')">
            <i class="fas fa-copy"></i> Clone
          </button>
        </div>
      </div>
    `;
  }

  detectIssues(product) {
    const issues = [];
    
    // Check for V3 naming issues
    if (!product.name.includes('v3') && product.metadata.version === 'v3') {
      issues.push({
        severity: 'high',
        message: 'Missing v3 prefix in product name'
      });
    }
    
    // Check for missing lookup keys
    const expectedPrices = 3; // monthly, semester, annual
    if (product.prices.length < expectedPrices) {
      issues.push({
        severity: 'medium',
        message: `Missing prices (${product.prices.length}/${expectedPrices})`
      });
    }
    
    // Check for incorrect lookup keys
    product.prices.forEach(price => {
      if (price.lookup_key && !price.lookup_key.startsWith('v3_')) {
        issues.push({
          severity: 'high',
          message: `Invalid lookup key: ${price.lookup_key}`
        });
      }
    });
    
    // Check for missing AI metadata
    if (!product.metadata.ai_monthly_tokens) {
      issues.push({
        severity: 'medium',
        message: 'Missing AI quota configuration'
      });
    }
    
    return issues;
  }

  formatNumber(num) {
    if (!num) return '0';
    return parseInt(num).toLocaleString('pt-BR');
  }
}
```

#### Metadata Editor Component

```javascript
// MetadataEditor.js
class MetadataEditor {
  constructor(container, productId = null) {
    this.container = container;
    this.productId = productId;
    this.metadata = {};
    this.schema = this.getMetadataSchema();
  }

  getMetadataSchema() {
    return {
      basic: {
        title: 'Basic Information',
        fields: [
          {
            key: 'plan_type',
            label: 'Plan Type',
            type: 'select',
            options: ['SCHEDULING', 'CLINIC'],
            required: true
          },
          {
            key: 'user_tier',
            label: 'User Tier',
            type: 'select',
            options: ['1', '5', '10', '20', '50'],
            required: true
          },
          {
            key: 'version',
            label: 'Version',
            type: 'text',
            default: 'v3',
            readonly: true
          }
        ]
      },
      subscription: {
        title: 'Subscription Features',
        fields: [
          {
            key: 'qtypatients',
            label: 'Max Patients',
            type: 'number',
            min: 0,
            max: 100000,
            required: true
          },
          {
            key: 'additionalusers',
            label: 'User Limits',
            type: 'json',
            template: {
              practitioners: { usertype: 'pract', quantity: 0 },
              assistants: { usertype: 'assist', quantity: 0 }
            }
          },
          {
            key: 'location_limit',
            label: 'Max Locations',
            type: 'number',
            min: 1,
            max: 100,
            default: 1
          },
          {
            key: 'storage_gb',
            label: 'Storage (GB)',
            type: 'number',
            min: 0,
            max: 1000,
            default: 10
          }
        ]
      },
      ai_quotas: {
        title: 'AI Configuration',
        fields: [
          {
            key: 'ai_monthly_tokens',
            label: 'Monthly Tokens',
            type: 'number',
            min: 0,
            max: 10000000,
            required: true
          },
          {
            key: 'ai_daily_tokens',
            label: 'Daily Tokens',
            type: 'number',
            min: 0,
            max: 1000000,
            required: true
          },
          {
            key: 'ai_audio_minutes',
            label: 'Audio Minutes/Month',
            type: 'number',
            min: 0,
            max: 10000,
            default: 0
          },
          {
            key: 'ai_models_access',
            label: 'Allowed Models',
            type: 'multiselect',
            options: [
              'gpt-4o',
              'gpt-4o-mini',
              'gpt-4-turbo',
              'gpt-3.5-turbo',
              'whisper-1',
              'dall-e-3'
            ],
            required: true
          },
          {
            key: 'ai_priority_support',
            label: 'Priority Support',
            type: 'boolean',
            default: false
          },
          {
            key: 'ai_advanced_features',
            label: 'Advanced Features',
            type: 'boolean',
            default: false
          }
        ]
      },
      features: {
        title: 'Feature Access',
        fields: [
          {
            key: 'electronic_prescriptions',
            label: 'Electronic Prescriptions',
            type: 'boolean',
            default: false
          },
          {
            key: 'lab_integrations',
            label: 'Lab Integrations',
            type: 'boolean',
            default: false
          },
          {
            key: 'financial_module',
            label: 'Financial Module',
            type: 'boolean',
            default: false
          },
          {
            key: 'custom_reports',
            label: 'Custom Reports',
            type: 'boolean',
            default: false
          },
          {
            key: 'whatsapp_integration',
            label: 'WhatsApp Integration',
            type: 'boolean',
            default: false
          }
        ]
      },
      cross_sell: {
        title: 'Cross-sell Configuration',
        fields: [
          {
            key: 'upgrade_paths',
            label: 'Upgrade Products',
            type: 'product_select',
            multiple: true
          },
          {
            key: 'recommended_addons',
            label: 'Recommended Add-ons',
            type: 'package_select',
            multiple: true
          },
          {
            key: 'bundle_discount',
            label: 'Bundle Discount %',
            type: 'number',
            min: 0,
            max: 50,
            default: 0
          }
        ]
      },
      display: {
        title: 'Display Settings',
        fields: [
          {
            key: 'featured',
            label: 'Featured Product',
            type: 'boolean',
            default: false
          },
          {
            key: 'popular',
            label: 'Popular Badge',
            type: 'boolean',
            default: false
          },
          {
            key: 'sort_order',
            label: 'Sort Order',
            type: 'number',
            min: 0,
            max: 100,
            default: 50
          },
          {
            key: 'tags',
            label: 'Tags',
            type: 'tags',
            placeholder: 'Enter tags...'
          }
        ]
      }
    };
  }

  async loadMetadata() {
    if (!this.productId) return;

    const response = await authenticatedFetch(
      `/api/admin/products/${this.productId}/metadata`,
      { method: 'GET' }
    );

    if (response.data?.success) {
      this.metadata = response.data.data;
      this.render();
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="metadata-editor">
        <div class="editor-header">
          <h3>Product Metadata Editor</h3>
          <div class="editor-actions">
            <button class="btn btn-secondary" onclick="validateMetadata()">
              <i class="fas fa-check"></i> Validate
            </button>
            <button class="btn btn-info" onclick="previewMetadata()">
              <i class="fas fa-eye"></i> Preview
            </button>
            <button class="btn btn-primary" onclick="saveMetadata()">
              <i class="fas fa-save"></i> Save
            </button>
          </div>
        </div>
        
        <div class="editor-tabs">
          ${Object.keys(this.schema).map(section => `
            <button class="tab-button" data-section="${section}">
              ${this.schema[section].title}
            </button>
          `).join('')}
        </div>
        
        <div class="editor-content">
          ${Object.entries(this.schema).map(([section, config]) => `
            <div class="metadata-section" id="section-${section}">
              <h4>${config.title}</h4>
              <div class="fields-grid">
                ${config.fields.map(field => this.renderField(field)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="metadata-preview" id="metadata-preview" style="display: none;">
          <h4>Metadata Preview</h4>
          <pre><code id="metadata-json"></code></pre>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderField(field) {
    const value = this.metadata[field.key] || field.default || '';
    
    switch (field.type) {
      case 'select':
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}
              ${field.required ? '<span class="required">*</span>' : ''}
            </label>
            <select id="${field.key}" class="form-control" 
                    ${field.readonly ? 'disabled' : ''}>
              ${field.options.map(opt => `
                <option value="${opt}" ${value === opt ? 'selected' : ''}>
                  ${opt}
                </option>
              `).join('')}
            </select>
          </div>
        `;

      case 'multiselect':
        const values = value ? value.split(',') : [];
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}
              ${field.required ? '<span class="required">*</span>' : ''}
            </label>
            <select id="${field.key}" class="form-control" multiple>
              ${field.options.map(opt => `
                <option value="${opt}" ${values.includes(opt) ? 'selected' : ''}>
                  ${opt}
                </option>
              `).join('')}
            </select>
          </div>
        `;

      case 'number':
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}
              ${field.required ? '<span class="required">*</span>' : ''}
            </label>
            <input type="number" id="${field.key}" class="form-control"
                   value="${value}" 
                   min="${field.min || ''}" 
                   max="${field.max || ''}"
                   ${field.readonly ? 'readonly' : ''}>
          </div>
        `;

      case 'boolean':
        return `
          <div class="form-group">
            <div class="form-check">
              <input type="checkbox" id="${field.key}" 
                     class="form-check-input"
                     ${value === 'true' || value === true ? 'checked' : ''}>
              <label class="form-check-label" for="${field.key}">
                ${field.label}
              </label>
            </div>
          </div>
        `;

      case 'json':
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}
              ${field.required ? '<span class="required">*</span>' : ''}
            </label>
            <div class="json-editor" id="${field.key}-editor">
              <textarea id="${field.key}" class="form-control" rows="4">${value}</textarea>
              <button class="btn btn-sm btn-secondary mt-2" 
                      onclick="formatJSON('${field.key}')">
                Format JSON
              </button>
            </div>
          </div>
        `;

      case 'tags':
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}</label>
            <input type="text" id="${field.key}" class="form-control"
                   placeholder="${field.placeholder || ''}"
                   value="${value}"
                   data-role="tagsinput">
          </div>
        `;

      default:
        return `
          <div class="form-group">
            <label for="${field.key}">${field.label}
              ${field.required ? '<span class="required">*</span>' : ''}
            </label>
            <input type="text" id="${field.key}" class="form-control"
                   value="${value}"
                   ${field.readonly ? 'readonly' : ''}>
          </div>
        `;
    }
  }

  async validateMetadata() {
    const metadata = this.collectMetadata();
    
    const response = await authenticatedFetch(
      '/api/admin/products/validate-metadata',
      {
        method: 'POST',
        body: { metadata }
      }
    );

    if (response.data?.success) {
      const result = response.data;
      if (result.valid) {
        showToast('Metadata is valid!', 'success');
      } else {
        this.showValidationErrors(result.errors, result.warnings);
      }
    }
  }

  collectMetadata() {
    const metadata = {};
    
    Object.entries(this.schema).forEach(([section, config]) => {
      config.fields.forEach(field => {
        const element = document.getElementById(field.key);
        if (!element) return;

        let value;
        switch (field.type) {
          case 'multiselect':
            value = Array.from(element.selectedOptions)
              .map(opt => opt.value)
              .join(',');
            break;
          case 'boolean':
            value = element.checked.toString();
            break;
          case 'json':
            try {
              value = element.value;
              JSON.parse(value); // Validate JSON
            } catch {
              value = '[]';
            }
            break;
          default:
            value = element.value;
        }

        if (value) {
          metadata[field.key] = value;
        }
      });
    });

    return metadata;
  }

  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const section = e.target.dataset.section;
        this.switchTab(section);
      });
    });

    // Auto-save drafts
    let saveTimeout;
    document.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('change', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => this.saveDraft(), 2000);
      });
    });
  }

  switchTab(section) {
    document.querySelectorAll('.metadata-section').forEach(sec => {
      sec.style.display = sec.id === `section-${section}` ? 'block' : 'none';
    });
    
    document.querySelectorAll('.tab-button').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.section === section);
    });
  }
}
```

#### V3 Recovery Wizard

```javascript
// RecoveryWizard.js
class V3RecoveryWizard {
  constructor(container) {
    this.container = container;
    this.auditResults = null;
    this.recoveryPlan = null;
    this.currentStep = 1;
  }

  async start() {
    this.render();
    await this.runAudit();
  }

  async runAudit() {
    const response = await authenticatedFetch(
      '/api/admin/products/v3-audit',
      { method: 'GET' }
    );

    if (response.data?.success) {
      this.auditResults = response.data.data;
      this.generateRecoveryPlan();
      this.renderAuditResults();
    }
  }

  generateRecoveryPlan() {
    this.recoveryPlan = {
      steps: [],
      totalProducts: 0,
      totalPrices: 0,
      estimatedTime: 0
    };

    // Step 1: Identify products with wrong naming
    const wrongProducts = this.auditResults.products.filter(p => 
      p.issues.includes('missing_v3_prefix') ||
      p.issues.includes('wrong_lookup_key')
    );

    if (wrongProducts.length > 0) {
      this.recoveryPlan.steps.push({
        id: 'fix_product_names',
        title: 'Fix Product Names',
        description: `Update ${wrongProducts.length} products with correct v3 naming`,
        products: wrongProducts,
        action: 'update_names'
      });
    }

    // Step 2: Fix lookup keys
    const wrongLookupKeys = this.auditResults.prices.filter(p =>
      p.lookup_key && !p.lookup_key.startsWith('v3_')
    );

    if (wrongLookupKeys.length > 0) {
      this.recoveryPlan.steps.push({
        id: 'fix_lookup_keys',
        title: 'Fix Lookup Keys',
        description: `Update ${wrongLookupKeys.length} prices with correct lookup keys`,
        prices: wrongLookupKeys,
        action: 'update_lookup_keys'
      });
    }

    // Step 3: Clean orphaned prices
    const orphanedPrices = this.auditResults.orphaned_prices;
    
    if (orphanedPrices.length > 0) {
      this.recoveryPlan.steps.push({
        id: 'clean_orphaned',
        title: 'Clean Orphaned Prices',
        description: `Remove ${orphanedPrices.length} orphaned prices`,
        prices: orphanedPrices,
        action: 'delete_orphaned'
      });
    }

    // Step 4: Create missing prices
    const missingPrices = this.auditResults.missing_prices;
    
    if (missingPrices.length > 0) {
      this.recoveryPlan.steps.push({
        id: 'create_missing',
        title: 'Create Missing Prices',
        description: `Create ${missingPrices.length} missing price configurations`,
        configurations: missingPrices,
        action: 'create_prices'
      });
    }

    this.recoveryPlan.totalProducts = wrongProducts.length;
    this.recoveryPlan.totalPrices = wrongLookupKeys.length + 
                                    orphanedPrices.length + 
                                    missingPrices.length;
    this.recoveryPlan.estimatedTime = Math.ceil(
      (this.recoveryPlan.totalProducts + this.recoveryPlan.totalPrices) * 0.5
    );
  }

  render() {
    this.container.innerHTML = `
      <div class="recovery-wizard">
        <div class="wizard-header">
          <h2>V3 Recovery Wizard</h2>
          <div class="wizard-progress">
            <div class="progress-step ${this.currentStep >= 1 ? 'active' : ''}">
              <span class="step-number">1</span>
              <span class="step-label">Audit</span>
            </div>
            <div class="progress-step ${this.currentStep >= 2 ? 'active' : ''}">
              <span class="step-number">2</span>
              <span class="step-label">Review</span>
            </div>
            <div class="progress-step ${this.currentStep >= 3 ? 'active' : ''}">
              <span class="step-number">3</span>
              <span class="step-label">Execute</span>
            </div>
            <div class="progress-step ${this.currentStep >= 4 ? 'active' : ''}">
              <span class="step-number">4</span>
              <span class="step-label">Verify</span>
            </div>
          </div>
        </div>
        
        <div class="wizard-content" id="wizard-content">
          <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Running V3 audit...</p>
          </div>
        </div>
        
        <div class="wizard-footer">
          <button class="btn btn-secondary" onclick="cancelRecovery()">
            Cancel
          </button>
          <button class="btn btn-primary" id="next-step-btn" 
                  onclick="nextStep()" disabled>
            Next
          </button>
        </div>
      </div>
    `;
  }

  renderAuditResults() {
    const content = document.getElementById('wizard-content');
    
    content.innerHTML = `
      <div class="audit-results">
        <h3>Audit Results</h3>
        
        <div class="audit-summary">
          <div class="summary-card error">
            <div class="card-value">${this.auditResults.total_issues}</div>
            <div class="card-label">Total Issues</div>
          </div>
          <div class="summary-card warning">
            <div class="card-value">${this.auditResults.products_affected}</div>
            <div class="card-label">Products Affected</div>
          </div>
          <div class="summary-card info">
            <div class="card-value">${this.auditResults.prices_affected}</div>
            <div class="card-label">Prices Affected</div>
          </div>
        </div>
        
        <div class="issue-breakdown">
          <h4>Issues Found:</h4>
          <ul class="issue-list">
            <li class="issue-item">
              <span class="issue-icon">⚠️</span>
              <span class="issue-text">
                ${this.auditResults.wrong_naming_count} products with incorrect v3 naming
              </span>
            </li>
            <li class="issue-item">
              <span class="issue-icon">🔑</span>
              <span class="issue-text">
                ${this.auditResults.wrong_lookup_keys_count} prices with incorrect lookup keys
              </span>
            </li>
            <li class="issue-item">
              <span class="issue-icon">🗑️</span>
              <span class="issue-text">
                ${this.auditResults.orphaned_prices.length} orphaned prices to clean
              </span>
            </li>
            <li class="issue-item">
              <span class="issue-icon">➕</span>
              <span class="issue-text">
                ${this.auditResults.missing_prices.length} missing price configurations
              </span>
            </li>
          </ul>
        </div>
        
        <div class="recovery-plan-summary">
          <h4>Recovery Plan:</h4>
          <p>The wizard has generated a ${this.recoveryPlan.steps.length}-step 
             recovery plan that will:</p>
          <ol>
            ${this.recoveryPlan.steps.map(step => `
              <li>${step.description}</li>
            `).join('')}
          </ol>
          <p class="time-estimate">
            Estimated time: ~${this.recoveryPlan.estimatedTime} minutes
          </p>
        </div>
      </div>
    `;

    document.getElementById('next-step-btn').disabled = false;
  }

  async executeRecovery() {
    const content = document.getElementById('wizard-content');
    let currentStepIndex = 0;

    content.innerHTML = `
      <div class="recovery-execution">
        <h3>Executing Recovery Plan</h3>
        <div class="execution-progress">
          <div class="progress">
            <div class="progress-bar" id="execution-progress" 
                 style="width: 0%"></div>
          </div>
          <div class="progress-text" id="progress-text">
            Starting recovery...
          </div>
        </div>
        <div class="execution-log" id="execution-log"></div>
      </div>
    `;

    for (const step of this.recoveryPlan.steps) {
      await this.executeStep(step, currentStepIndex);
      currentStepIndex++;
      
      const progress = Math.round(
        (currentStepIndex / this.recoveryPlan.steps.length) * 100
      );
      document.getElementById('execution-progress').style.width = `${progress}%`;
    }

    this.currentStep = 4;
    await this.verifyRecovery();
  }

  async executeStep(step, index) {
    const log = document.getElementById('execution-log');
    const progressText = document.getElementById('progress-text');
    
    progressText.textContent = `Executing: ${step.title}`;
    
    log.innerHTML += `
      <div class="log-entry">
        <span class="log-time">${new Date().toLocaleTimeString()}</span>
        <span class="log-message">Starting: ${step.title}</span>
      </div>
    `;

    try {
      const response = await authenticatedFetch(
        '/api/admin/products/v3-recovery',
        {
          method: 'POST',
          body: {
            action: step.action,
            data: step
          }
        }
      );

      if (response.data?.success) {
        log.innerHTML += `
          <div class="log-entry success">
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-message">✓ ${step.title} completed successfully</span>
          </div>
        `;
      } else {
        throw new Error(response.data?.error || 'Unknown error');
      }
    } catch (error) {
      log.innerHTML += `
        <div class="log-entry error">
          <span class="log-time">${new Date().toLocaleTimeString()}</span>
          <span class="log-message">✗ ${step.title} failed: ${error.message}</span>
        </div>
      `;
      
      // Ask user if they want to continue
      if (!confirm(`Step failed: ${step.title}. Continue with recovery?`)) {
        throw new Error('Recovery cancelled by user');
      }
    }
  }

  async verifyRecovery() {
    const response = await authenticatedFetch(
      '/api/admin/products/v3-audit',
      { method: 'GET' }
    );

    const newAudit = response.data?.data;
    const content = document.getElementById('wizard-content');

    content.innerHTML = `
      <div class="recovery-verification">
        <h3>Recovery Verification</h3>
        
        <div class="verification-results">
          <h4>Before vs After:</h4>
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Before</th>
                <th>After</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Issues</td>
                <td>${this.auditResults.total_issues}</td>
                <td>${newAudit.total_issues}</td>
                <td class="${newAudit.total_issues < this.auditResults.total_issues ? 'success' : 'error'}">
                  ${newAudit.total_issues - this.auditResults.total_issues}
                </td>
              </tr>
              <tr>
                <td>Products with Issues</td>
                <td>${this.auditResults.products_affected}</td>
                <td>${newAudit.products_affected}</td>
                <td class="${newAudit.products_affected < this.auditResults.products_affected ? 'success' : 'error'}">
                  ${newAudit.products_affected - this.auditResults.products_affected}
                </td>
              </tr>
              <tr>
                <td>Prices with Issues</td>
                <td>${this.auditResults.prices_affected}</td>
                <td>${newAudit.prices_affected}</td>
                <td class="${newAudit.prices_affected < this.auditResults.prices_affected ? 'success' : 'error'}">
                  ${newAudit.prices_affected - this.auditResults.prices_affected}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        ${newAudit.total_issues > 0 ? `
          <div class="remaining-issues">
            <h4>Remaining Issues:</h4>
            <p>There are still ${newAudit.total_issues} issues that need manual attention.</p>
            <button class="btn btn-warning" onclick="viewRemainingIssues()">
              View Remaining Issues
            </button>
          </div>
        ` : `
          <div class="success-message">
            <i class="fas fa-check-circle"></i>
            <h4>Recovery Complete!</h4>
            <p>All V3 naming issues have been successfully resolved.</p>
          </div>
        `}
      </div>
    `;

    document.getElementById('next-step-btn').textContent = 'Finish';
    document.getElementById('next-step-btn').onclick = () => this.finish();
  }
}
```

### 4. Database Schema

```sql
-- Product audit log for tracking changes
CREATE TABLE product_audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_user VARCHAR(255) NOT NULL,
    action_type ENUM('create', 'update', 'delete', 'bulk_update', 'recovery') NOT NULL,
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    changes_json TEXT,
    metadata_before TEXT,
    metadata_after TEXT,
    recovery_action VARCHAR(100),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    INDEX idx_admin_user (admin_user),
    INDEX idx_product (stripe_product_id),
    INDEX idx_action_date (action_type, created_at)
);

-- Admin access control
CREATE TABLE admin_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('super_admin', 'product_admin', 'viewer') NOT NULL,
    permissions JSON,
    is_active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    INDEX idx_email (email),
    INDEX idx_active (is_active)
);

-- Product metadata cache
CREATE TABLE product_metadata_cache (
    stripe_product_id VARCHAR(255) PRIMARY KEY,
    metadata_json TEXT NOT NULL,
    features_json TEXT,
    ai_quotas_json TEXT,
    pricing_json TEXT,
    last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status ENUM('synced', 'pending', 'error') DEFAULT 'pending',
    INDEX idx_sync_status (sync_status, last_synced)
);
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. Create directory structure
2. Set up admin authentication
3. Build basic product listing
4. Implement product CRUD APIs
5. Create audit logging system

### Phase 2: Metadata Management (Week 2)
1. Build metadata editor component
2. Implement validation system
3. Create metadata schema
4. Add bulk update capabilities
5. Implement change tracking

### Phase 3: V3 Recovery (Week 3)
1. Build recovery wizard
2. Implement audit endpoints
3. Create recovery execution
4. Add verification system
5. Test with development data

### Phase 4: AI Integration (Week 4)
1. Build AI package management
2. Create quota configuration
3. Implement package validation
4. Add compatibility checks
5. Test quota calculations

### Phase 5: Advanced Features (Week 5)
1. Implement cross-sell configuration
2. Build pricing matrix visualization
3. Add bulk operations
4. Create export/import tools
5. Implement advanced search

### Phase 6: Testing & Deployment (Week 6)
1. Complete integration testing
2. Performance optimization
3. Security hardening
4. Documentation
5. Production deployment

## Security Considerations

1. **Authentication**: Admin-only access with role-based permissions
2. **Audit Trail**: Complete logging of all changes
3. **Validation**: Server-side validation of all metadata
4. **Stripe Sync**: Webhook signature verification
5. **Data Integrity**: Transaction-based updates
6. **Rate Limiting**: API rate limits for admin endpoints

## Success Metrics

1. **V3 Recovery**: 100% of naming issues resolved
2. **Data Consistency**: Stripe and local DB in sync
3. **Admin Efficiency**: 80% reduction in manual Stripe dashboard usage
4. **Error Reduction**: 90% fewer metadata-related issues
5. **Audit Coverage**: 100% of changes tracked

## Conclusion

The MedPro Admin Product Catalog provides a comprehensive solution for managing the complex product structure, metadata requirements, and recovery from existing issues. By implementing this system, MedPro will have complete control over its subscription products, AI quotas, and feature configurations, while maintaining data integrity and providing excellent administrative tools for ongoing management.