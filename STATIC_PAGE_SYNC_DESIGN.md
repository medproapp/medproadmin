# Static Page Sync Feature - Design Document

## Overview

This document outlines the design for a new feature in the Product Catalog Admin that allows synchronizing selected products to the static pricing page (`/medprofront/planos/index.html`). This ensures the public-facing pricing page stays in sync with the actual product catalog data.

## Problem Statement

The static pricing page `/medprofront/planos/index.html` contains hardcoded pricing and plan information that needs manual updates when product catalog changes. This creates:
- Inconsistency between admin product data and public pricing
- Manual maintenance overhead
- Risk of outdated pricing information for visitors
- No direct connection between product catalog and website pricing

## Solution Architecture

### 1. Frontend Components

#### 1.1 Product Selection Interface
```
Location: /product-catalog/js/components/staticPageSync.js
```

**Features:**
- Multi-select product interface with checkboxes
- Filter products by plan type (Agendamento, Clínica)
- Preview selected products before sync
- Validation of selected products (ensure proper pricing structure)

**UI Elements:**
- Modal dialog titled "Sync to Static Page"
- Product selection grid with:
  - Product name and type
  - Current pricing tiers (1, 5, 10, 20, 50 users)
  - Selection checkboxes
  - Preview button

#### 1.2 Sync Configuration Panel
**Features:**
- Map products to pricing tiers (Agendamento vs Clínica)
- Configure user tier pricing (1, 5, 10, 20, 50 users)
- Preview generated HTML before applying
- Backup current static page option

### 2. Backend API Endpoints

#### 2.1 Sync Configuration API
```
POST /api/v1/static-sync/configure
```
**Purpose:** Process selected products and generate HTML configuration
**Request:**
```json
{
  "selectedProducts": ["prod_123", "prod_456"],
  "tierMapping": {
    "agendamento": "prod_123",
    "clinica": "prod_456"
  },
  "backupCurrent": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedHtml": "...",
    "backupPath": "/backups/planos_2025-07-23.html",
    "previewUrl": "/api/v1/static-sync/preview"
  }
}
```

#### 2.2 Apply Sync API
```
POST /api/v1/static-sync/apply
```
**Purpose:** Apply the generated HTML to the static page
**Request:**
```json
{
  "configurationId": "sync_config_123",
  "confirmApply": true
}
```

#### 2.3 Preview API
```
GET /api/v1/static-sync/preview/:configId
```
**Purpose:** Serve preview of generated HTML

### 3. Data Transformation Logic

#### 3.1 Product Data Mapping
```javascript
// Transform product catalog data to static page format
const transformProductData = (products) => {
  return products.map(product => ({
    name: product.name,
    planType: product.plan_type, // CLINIC, SCHEDULING
    pricing: {
      oneUser: extractPricing(product, 1),
      fiveUsers: extractPricing(product, 5),
      tenUsers: extractPricing(product, 10),
      twentyUsers: extractPricing(product, 20),
      fiftyUsers: extractPricing(product, 50)
    },
    features: extractFeatures(product),
    isActive: product.active
  }));
};
```

#### 3.2 HTML Template Generation
```javascript
// Generate pricing section HTML
const generatePricingHTML = (agendamentoProduct, clinicaProduct) => {
  // Extract current static page structure
  // Replace pricing values and features
  // Maintain existing JavaScript functionality
  // Preserve styling and animations
};
```

### 4. File Structure

```
/medproadmin/
├── product-catalog/
│   ├── js/
│   │   ├── components/
│   │   │   ├── staticPageSync.js          # Main sync component
│   │   │   └── syncPreview.js             # Preview component
│   │   ├── services/
│   │   │   └── staticSyncApi.js           # API service
│   │   └── utils/
│   │       └── htmlGenerator.js           # HTML generation utilities
├── server/
│   ├── routes/
│   │   └── staticSync.js                  # Sync API routes
│   ├── services/
│   │   ├── staticPageSync.js              # Core sync logic
│   │   ├── htmlTemplateEngine.js          # HTML template processing
│   │   └── backupManager.js               # Backup management
│   └── templates/
│       └── planos-template.html           # Base template for generation
```

### 5. Implementation Steps

#### Phase 1: Foundation (Week 1)
1. **Create base sync component UI**
   - Product selection modal
   - Basic product listing with checkboxes
   - Filter by plan type

2. **Setup backend API structure**
   - Create routes for static sync
   - Basic product data retrieval
   - File backup functionality

#### Phase 2: Core Logic (Week 2)  
3. **Implement data transformation**
   - Product to pricing data mapping
   - HTML template engine
   - Price calculation for different user tiers

4. **Build HTML generation**
   - Parse existing static page structure
   - Replace pricing sections dynamically
   - Preserve existing JavaScript and styling

#### Phase 3: Integration (Week 3)
5. **Add sync controls to product catalog**
   - New "Sync to Website" button in main toolbar
   - Integration with existing product selection
   - Success/error feedback system

6. **Implement preview functionality**
   - Generate preview HTML
   - Modal preview window
   - Side-by-side comparison (current vs new)

#### Phase 4: Testing & Refinement (Week 4)
7. **Testing and validation**
   - Test with different product combinations
   - Validate HTML output integrity
   - Ensure JavaScript functionality preserved

8. **Backup and recovery system**
   - Automatic backup before sync
   - Manual restore functionality
   - Backup file management

### 6. Technical Specifications

#### 6.1 Static Page Analysis
The current `/medprofront/planos/index.html` contains:

**Pricing Structure:**
- Two main plans: "Agendamento" and "Clínica"
- Five user tiers: 1, 5, 10, 20, 50 users
- Dynamic pricing display with JavaScript animations
- Features list that changes based on user tier selection

**Data Points to Sync:**
```javascript
// Agendamento Plan
{
  oneUser: { price: "Grátis", annual: null, perUser: null },
  fiveUsers: { price: "R$ 149,00", annual: "R$ 1740,00", perUser: "R$ 29,00" },
  tenUsers: { price: "R$ 280,00", annual: "R$ 2880,00", perUser: "R$ 24,00" },
  twentyUsers: { price: "R$ 550,00", annual: "R$ 4800,00", perUser: "R$ 20,00" },
  fiftyUsers: { price: "R$ 1300,00", annual: "R$ 10200,00", perUser: "R$ 17,00" }
}

// Clínica Plan  
{
  oneUser: { price: "R$ 49,00", annual: "R$ 588,00", perUser: "R$ 49,00" },
  fiveUsers: { price: "R$ 215,00", annual: "R$ 2580,00", perUser: "R$ 43,00" },
  tenUsers: { price: "R$ 400,00", annual: "R$ 4800,00", perUser: "R$ 40,00" },
  twentyUsers: { price: "R$ 720,00", annual: "R$ 8640,00", perUser: "R$ 36,00" },
  fiftyUsers: { price: "R$ 1950,00", annual: "R$ 19200,00", perUser: "R$ 32,00" }
}
```

#### 6.2 Sync Rules
1. **Product Selection Validation:**
   - Must select exactly one SCHEDULING plan for Agendamento
   - Must select exactly one CLINIC plan for Clínica  
   - Selected products must have pricing for all user tiers (1, 5, 10, 20, 50)
   - Only active products can be selected for sync

2. **Pricing Extraction Logic:**
   - Extract monthly pricing from product_prices table
   - Calculate annual pricing (monthly × 12)  
   - Calculate per-user pricing (monthly / user_count)
   - Handle special cases (free plans, patient plans)

3. **Feature Mapping:**
   - Map product metadata to feature lists
   - Maintain existing feature descriptions
   - Handle tier-specific feature variations

#### 6.3 Safety Measures
1. **Backup System:**
   - Automatic backup before any sync operation
   - Timestamped backup files in `/backups/static-pages/`
   - Quick restore functionality
   - Backup retention policy (keep last 10 backups)

2. **Validation:**
   - Validate generated HTML structure
   - Test JavaScript functionality in generated page
   - Verify all pricing data is present and correctly formatted
   - Preview mode before applying changes

3. **Rollback:**
   - One-click rollback to previous version
   - Audit log of all sync operations
   - User confirmation for destructive operations

### 7. User Experience Flow

#### 7.1 Sync Process
1. **Initiation:**
   - User clicks "Sync to Website" button in product catalog
   - Modal opens showing sync interface

2. **Product Selection:**
   - User selects products for Agendamento and Clínica plans
   - System validates selection (exactly 1 of each type)
   - Preview pricing data extracted from selected products

3. **Configuration:**
   - User reviews pricing mapping
   - Option to create backup (default: enabled)
   - Preview generated HTML

4. **Application:**
   - User confirms sync operation
   - System applies changes to static page
   - Success confirmation with rollback option

#### 7.2 Error Handling
- **Validation Errors:** Clear messaging about selection requirements
- **Sync Failures:** Automatic rollback with error details
- **Backup Failures:** Warning with option to proceed without backup
- **File Access Issues:** Clear instructions for fixing permissions

### 8. Monitoring and Maintenance

#### 8.1 Audit Trail
- Log all sync operations with timestamp and user
- Track which products were used for each sync
- Record backup file locations
- Monitor sync success/failure rates

#### 8.2 Health Checks
- Validate static page integrity after sync
- Monitor for broken JavaScript or CSS
- Check pricing data accuracy
- Verify all user tiers are properly configured

### 9. Future Enhancements

#### 9.1 Advanced Features
- **Scheduled Sync:** Automatic sync on product updates
- **Multi-language Support:** Sync to different language versions
- **A/B Testing:** Support for testing different pricing presentations
- **Analytics Integration:** Track conversion impact of pricing changes

#### 9.2 Scalability
- **Template System:** Support for multiple static page templates
- **Bulk Operations:** Sync multiple pages simultaneously
- **API Integration:** External systems can trigger sync operations
- **Webhook Support:** Notify external systems of sync events

## Conclusion

This static page sync feature will bridge the gap between the product catalog admin and the public-facing pricing page, ensuring consistency and reducing manual maintenance overhead. The phased implementation approach allows for iterative development and testing while maintaining system stability.

The design prioritizes safety through comprehensive backup and validation systems, while providing a user-friendly interface for non-technical administrators to manage pricing synchronization.