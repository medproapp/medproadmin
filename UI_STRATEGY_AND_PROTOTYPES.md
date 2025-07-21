# MedPro Product Catalog - UI Strategy and Prototypes

## UI Design Philosophy

### Core Principles

1. **Consistency with MedPro**: Follow existing MedPro design patterns
2. **Simplicity First**: Clean, uncluttered interfaces
3. **Progressive Disclosure**: Show advanced features only when needed
4. **Visual Feedback**: Clear status indicators and confirmations
5. **Efficiency**: Minimize clicks for common tasks

### Design System

**Colors:**
```css
/* MedPro Standard Palette */
--primary: #0066CC;        /* Primary actions */
--secondary: #6C757D;      /* Secondary actions */
--success: #28A745;        /* Success states */
--warning: #FFC107;        /* Warnings, V3 issues */
--danger: #DC3545;         /* Errors, destructive actions */
--info: #17A2B8;          /* Information */

/* Admin Specific */
--admin-bg: #F8F9FA;      /* Light background */
--admin-sidebar: #343A40;  /* Dark sidebar */
--admin-border: #DEE2E6;   /* Borders */
```

**Typography:**
```css
/* Font Stack */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;

/* Sizes */
--font-size-h1: 2rem;
--font-size-h2: 1.5rem;
--font-size-h3: 1.25rem;
--font-size-body: 1rem;
--font-size-small: 0.875rem;
```

**Spacing:**
```css
/* Consistent spacing scale */
--space-xs: 0.25rem;  /* 4px */
--space-sm: 0.5rem;   /* 8px */
--space-md: 1rem;     /* 16px */
--space-lg: 1.5rem;   /* 24px */
--space-xl: 2rem;     /* 32px */
```

## Layout Structure

### Admin Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│                        Header Bar                            │
│  Logo    Product Catalog                    User ▼  Logout  │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                            │
│   Sidebar       │            Main Content Area              │
│                 │                                            │
│ ▸ Dashboard     │  ┌─────────────────────────────────────┐ │
│ ▾ Products      │  │      Page Header with Actions       │ │
│   • Catalog     │  ├─────────────────────────────────────┤ │
│   • Recovery    │  │                                     │ │
│   • Templates   │  │         Content Area                │ │
│ ▸ Settings      │  │                                     │ │
│ ▸ Audit Log     │  │                                     │ │
│                 │  └─────────────────────────────────────┘ │
│                 │                                            │
└─────────────────┴───────────────────────────────────────────┘
```

## Page Prototypes

### 1. Product List Page

```
┌─────────────────────────────────────────────────────────────┐
│ Product Catalog                      [+ New] [⚡ V3] [🔄 Sync]│
├─────────────────────────────────────────────────────────────┤
│ Filters:                                                     │
│ [Plan Type ▼] [User Tier ▼] [Status ▼] [🔍 Search...]      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│ │ CLINIC - 10 Users│ │SCHEDULING - 5  │ │ CLINIC - 20    ││
│ │ ● Active  ⚠️ 2   │ │ ● Active       │ │ ● Active       ││
│ │                  │ │                │ │                ││
│ │ 1000 patients    │ │ 500 patients   │ │ 2000 patients  ││
│ │ 500k AI tokens   │ │ 250k AI tokens │ │ 1M AI tokens   ││
│ │                  │ │                │ │                ││
│ │ Prices: 3        │ │ Prices: 3      │ │ Prices: 3      ││
│ │ R$ 531.25/mo     │ │ R$ 265.00/mo   │ │ R$ 850.00/mo   ││
│ │                  │ │                │ │                ││
│ │ [Edit] [Clone]   │ │ [Edit] [Clone] │ │ [Edit] [Clone] ││
│ └─────────────────┘ └─────────────────┘ └─────────────────┘│
│                                                              │
│ ◀ 1 2 3 4 5 ▶                              Showing 1-9 of 45│
└─────────────────────────────────────────────────────────────┘

Legend:
● Active status
⚠️ Has issues (hover for details)
```

### 2. Product Editor Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Product                                      [X] │
├─────────────────────────────────────────────────────────────┤
│ Basic Information                                           │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Product Name *                                        │  │
│ │ [MedPro v3 - Plano Clínica - 10 usuários           ] │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Description                                           │  │
│ │ [Sistema completo de gestão...                      ] │  │
│ │ [                                                   ] │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ Plan Type *        User Tier *         Status              │
│ [CLINIC    ▼]     [10 Users  ▼]      [✓] Active          │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [General] [Limits] [Features] [AI] [Pricing]           ││
│ ├─────────────────────────────────────────────────────────┤│
│ │                                                         ││
│ │ Subscription Limits                                    ││
│ │                                                         ││
│ │ Max Patients      Max Locations    Storage (GB)        ││
│ │ [1000        ]    [3          ]    [50         ]      ││
│ │                                                         ││
│ │ User Limits                                            ││
│ │ Practitioners     Assistants       Admins              ││
│ │ [10         ]     [5          ]    [2          ]      ││
│ │                                                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Use Template ▼]            [Cancel] [Save & Continue]     │
└─────────────────────────────────────────────────────────────┘
```

### 3. Metadata Editor (Advanced View)

```
┌─────────────────────────────────────────────────────────────┐
│ Product Metadata                                        [X] │
├─────────────────────────────────────────────────────────────┤
│ [Visual Editor] [JSON Editor] [Templates] [Validate]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Features Configuration                                      │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Clinical Features                                       ││
│ │ [✓] Electronic Prescriptions                           ││
│ │ [✓] Lab Integrations                                   ││
│ │ [✓] Imaging Viewer                                     ││
│ │ [ ] Advanced Protocols                                 ││
│ │                                                         ││
│ │ Scheduling Features                                    ││
│ │ [✓] Online Booking                                     ││
│ │ [✓] Recurring Appointments                             ││
│ │ [✓] SMS Reminders          Cost: R$ 0.10/SMS          ││
│ │ [✓] WhatsApp Integration                               ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ AI Configuration                                            │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Monthly Token Limit        Daily Token Limit           ││
│ │ [500,000         ]         [20,000          ]         ││
│ │ ████████████░░░░░          ████████░░░░░░░░           ││
│ │                                                         ││
│ │ Audio Minutes/Month        Models Access               ││
│ │ [600             ]         [✓] GPT-4o                  ││
│ │                            [✓] GPT-4o-mini             ││
│ │                            [ ] Claude-3                ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ⓘ Validation: 2 warnings                                    │
│                                        [Cancel] [Save]      │
└─────────────────────────────────────────────────────────────┘
```

### 4. Price Management Interface

```
┌─────────────────────────────────────────────────────────────┐
│ Price Configuration - CLINIC 10 Users                   [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Current Prices                              [+ Add Price]   │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Period    │ Amount      │ Currency │ Status │ Actions   ││
│ ├───────────┼─────────────┼──────────┼────────┼───────────┤│
│ │ Monthly   │ R$ 531.25   │ BRL      │ Active │ [Edit] 🗑 ││
│ │ Semester  │ R$ 2,868.75 │ BRL      │ Active │ [Edit] 🗑 ││
│ │ Annual    │ R$ 5,100.00 │ BRL      │ Active │ [Edit] 🗑 ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Price Calculator                                            │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Base Monthly Price: R$ [531.25    ]                    ││
│ │                                                         ││
│ │ Billing Period     Discount    Final Price             ││
│ │ Monthly            0%          R$ 531.25               ││
│ │ Semester (6mo)     10%         R$ 2,868.75             ││
│ │ Annual (12mo)      20%         R$ 5,100.00             ││
│ │                                                         ││
│ │ Trial Period: [15] days                                ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Apply Bulk Discount]                   [Cancel] [Save All] │
└─────────────────────────────────────────────────────────────┘
```

### 5. V3 Recovery Wizard

```
┌─────────────────────────────────────────────────────────────┐
│ V3 Recovery Wizard                                      [X] │
├─────────────────────────────────────────────────────────────┤
│  Step 1       Step 2        Step 3        Step 4           │
│   Audit    →  Review    →  Execute   →   Verify            │
│    ●           ○            ○             ○                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Audit Results                                               │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 🔍 Scan Complete                                        ││
│ │                                                         ││
│ │ Issues Found: 22                                        ││
│ │                                                         ││
│ │ ⚠️  15 products with incorrect naming                   ││
│ │    Missing 'v3' prefix in product names                ││
│ │                                                         ││
│ │ 🔑  7 prices with wrong lookup keys                     ││
│ │    Lookup keys missing 'v3_' prefix                    ││
│ │                                                         ││
│ │ 🗑️  3 orphaned prices                                   ││
│ │    Prices linked to deleted products                   ││
│ │                                                         ││
│ │ ➕  5 missing price configurations                      ││
│ │    Products missing semester/annual prices             ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Estimated fix time: ~15 minutes                             │
│                                                             │
│ [← Back]  [Skip]                      [Review Fix Plan →]  │
└─────────────────────────────────────────────────────────────┘
```

### 6. Sync Status Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ Stripe Synchronization                                  [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Sync Overview                                               │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Last Sync: 2 hours ago         Next: In 4 hours        ││
│ │ Status: ✅ Healthy              Mode: Automatic         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Sync Status by Type                                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Products  ████████████████████░ 45/46  ✅              ││
│ │ Prices    ████████████████████  135/135 ✅             ││
│ │ Metadata  ███████████████████░  44/46  ⚠️              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Recent Sync Activity                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 14:32  ✅ Product updated: CLINIC-10USER               ││
│ │ 14:28  ✅ Price created: CLINIC-10USER-semester        ││
│ │ 14:15  ⚠️  Metadata conflict: SCHEDULING-5USER         ││
│ │ 13:45  ✅ Webhook processed: product.updated           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Conflicts (1)                      [Resolve All] [Manual]   │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ SCHEDULING-5USER: Local and Stripe metadata differ     ││
│ │ Local:  ai_tokens = 250000                             ││
│ │ Stripe: ai_tokens = 200000                             ││
│ │ [Use Local] [Use Stripe] [Compare]                     ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Force Full Sync]                    [Settings] [Close]     │
└─────────────────────────────────────────────────────────────┘
```

## Interactive Components

### 1. Product Card States

```css
/* Normal State */
.product-card {
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  padding: 16px;
  background: white;
  transition: all 0.2s ease;
}

/* Hover State */
.product-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

/* Selected State */
.product-card.selected {
  border-color: var(--primary);
  background: #F0F8FF;
}

/* Has Issues */
.product-card.has-issues {
  border-left: 4px solid var(--warning);
}

/* Inactive */
.product-card.inactive {
  opacity: 0.6;
  background: var(--admin-bg);
}
```

### 2. Form Validation States

```
/* Valid Input */
┌─────────────────────────────┐
│ Product Name               │
│ [Valid Product Name    ] ✓ │
└─────────────────────────────┘

/* Invalid Input */
┌─────────────────────────────┐
│ Product Name               │
│ [                      ] ✗ │
│ This field is required     │
└─────────────────────────────┘

/* Warning State */
┌─────────────────────────────┐
│ Monthly Tokens             │
│ [50000                 ] ⚠ │
│ Low for this plan type     │
└─────────────────────────────┘
```

### 3. Loading States

```
/* Skeleton Loading */
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ░░░░░░░░░░░░░░░ │ │ ░░░░░░░░░░░░░░░ │ │ ░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░     │ │ ░░░░░░░░░░░     │ │ ░░░░░░░░░░░     │
│                 │ │                 │ │                 │
│ ░░░░░░░░░       │ │ ░░░░░░░░░       │ │ ░░░░░░░░░       │
│ ░░░░░░░░░░░     │ │ ░░░░░░░░░░░     │ │ ░░░░░░░░░░░     │
└─────────────────┘ └─────────────────┘ └─────────────────┘

/* Progress Indicator */
┌─────────────────────────────────────────────────────────────┐
│ Syncing Products...                                         │
│ ████████████████████████░░░░░░░░░░░░  67%                 │
│ Processing: CLINIC-20USER                                   │
└─────────────────────────────────────────────────────────────┘
```

### 4. Empty States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     No Products Found                       │
│                                                             │
│                   🗂️  (Empty folder icon)                   │
│                                                             │
│         No products match your current filters.             │
│         Try adjusting your search criteria or               │
│         create a new product to get started.                │
│                                                             │
│                    [Create New Product]                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Responsive Design

### Mobile Breakpoints

```css
/* Desktop: > 1200px - Full layout */
/* Tablet: 768px - 1200px - Condensed sidebar */
/* Mobile: < 768px - Stacked layout */

@media (max-width: 768px) {
  .product-grid {
    grid-template-columns: 1fr;
  }
  
  .admin-sidebar {
    position: fixed;
    transform: translateX(-100%);
  }
  
  .admin-sidebar.open {
    transform: translateX(0);
  }
}
```

### Mobile Product Card

```
┌─────────────────────────┐
│ CLINIC - 10 Users    ● │
│ ─────────────────────── │
│ 1000 patients          │
│ 500k AI tokens         │
│ R$ 531.25/mo          │
│                        │
│ [Edit] [•••]          │
└─────────────────────────┘
```

## Interaction Patterns

### 1. Inline Editing

```javascript
// Quick edit for simple fields
<span class="editable" data-field="name">
  Product Name
  <i class="edit-icon">✏️</i>
</span>

// On click, transform to input
<input type="text" value="Product Name" class="inline-edit">
```

### 2. Drag and Drop

```javascript
// Reorder prices or features
.draggable {
  cursor: move;
}

.drag-over {
  border-top: 2px solid var(--primary);
}

// Visual feedback during drag
.dragging {
  opacity: 0.5;
}
```

### 3. Keyboard Shortcuts

```
Ctrl/Cmd + N    : New Product
Ctrl/Cmd + S    : Save Changes  
Ctrl/Cmd + F    : Focus Search
Ctrl/Cmd + /    : Show Shortcuts
Escape          : Close Modal
Tab             : Next Field
Shift + Tab     : Previous Field
```

### 4. Tooltips and Help

```html
<!-- Contextual help -->
<label>
  Monthly Token Limit
  <span class="help-icon" 
        data-tooltip="Maximum AI tokens per month. 
                     Recommended: 250k for small clinics, 
                     500k for medium, 1M+ for large.">
    ?
  </span>
</label>
```

## Accessibility Features

### ARIA Labels

```html
<!-- Screen reader support -->
<div role="main" aria-label="Product Catalog">
  <button aria-label="Create new product" 
          aria-describedby="new-product-help">
    <i class="fas fa-plus" aria-hidden="true"></i>
    New Product
  </button>
</div>
```

### Keyboard Navigation

```css
/* Focus indicators */
:focus {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Skip links */
.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  left: 0;
  z-index: 9999;
}
```

### Color Contrast

```css
/* WCAG AA compliant */
.text-on-primary {
  color: white; /* 7:1 contrast ratio */
}

.text-on-light {
  color: #212529; /* 15:1 contrast ratio */
}
```

## Performance Optimizations

### 1. Virtual Scrolling

```javascript
// Only render visible items
class VirtualScroller {
  constructor(container, itemHeight) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.visibleRange = this.calculateVisibleRange();
  }
  
  render(items) {
    const visibleItems = items.slice(
      this.visibleRange.start,
      this.visibleRange.end
    );
    // Render only visible items
  }
}
```

### 2. Lazy Loading

```javascript
// Load images on demand
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      imageObserver.unobserve(img);
    }
  });
});
```

### 3. Debounced Search

```javascript
// Prevent excessive API calls
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(e.target.value);
  }, 300);
});
```

## Animation Guidelines

### Micro-interactions

```css
/* Subtle animations */
.button {
  transition: all 0.2s ease;
}

.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Loading spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}
```

### Page Transitions

```css
/* Fade in new content */
.page-enter {
  opacity: 0;
  transform: translateY(10px);
}

.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: all 0.3s ease;
}
```

## Error Handling UI

### Error Messages

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Error Creating Product                                   │
│                                                             │
│ The product could not be created due to the following      │
│ errors:                                                     │
│                                                             │
│ • Product name already exists                               │
│ • Monthly price is required                                 │
│ • AI token limit exceeds plan maximum                       │
│                                                             │
│ [View Details]                    [Try Again] [Cancel]      │
└─────────────────────────────────────────────────────────────┘
```

### Success Feedback

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Product Created Successfully                              │
│                                                             │
│ CLINIC-10USER has been created and synced with Stripe.     │
│                                                             │
│ [View Product]  [Create Another]  [Back to List]           │
└─────────────────────────────────────────────────────────────┘
```

## Design Tokens

```javascript
// design-tokens.js
export const tokens = {
  // Colors
  color: {
    primary: '#0066CC',
    secondary: '#6C757D',
    success: '#28A745',
    warning: '#FFC107',
    danger: '#DC3545',
    info: '#17A2B8'
  },
  
  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px'
  },
  
  // Border radius
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px'
  },
  
  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.15)'
  },
  
  // Transitions
  transition: {
    fast: '0.15s ease',
    base: '0.2s ease',
    slow: '0.3s ease'
  }
};
```

## Implementation Notes

### CSS Architecture

```css
/* BEM Naming Convention */
.product-card { }                    /* Block */
.product-card__header { }            /* Element */
.product-card--inactive { }          /* Modifier */

/* Component Structure */
/css/
  ├── base/
  │   ├── reset.css
  │   └── typography.css
  ├── components/
  │   ├── product-card.css
  │   ├── forms.css
  │   └── modals.css
  ├── layout/
  │   ├── admin-layout.css
  │   └── grid.css
  └── utilities/
      ├── spacing.css
      └── colors.css
```

### JavaScript Component Structure

```javascript
// Base Component Class
class Component {
  constructor(element, options = {}) {
    this.element = element;
    this.options = Object.assign({}, this.defaults, options);
    this.init();
  }
  
  init() {
    this.cacheElements();
    this.bindEvents();
    this.render();
  }
  
  destroy() {
    this.unbindEvents();
    this.element.innerHTML = '';
  }
}
```

## Conclusion

This UI strategy provides a comprehensive design system for the MedPro Product Catalog admin interface. The prototypes demonstrate clean, efficient interfaces that follow MedPro's design patterns while introducing admin-specific enhancements.

Key benefits:
- **Consistency**: Follows MedPro design patterns
- **Efficiency**: Optimized workflows for admin tasks
- **Clarity**: Clear visual hierarchy and feedback
- **Accessibility**: WCAG compliant
- **Performance**: Optimized for speed

The design is ready for implementation and can be adapted based on user feedback during development.