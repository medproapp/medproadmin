#!/usr/bin/env node

const { adminPool, executeQuery } = require('./config/database');
const StaticPageSyncService = require('./services/staticPageSync');
const BackupManager = require('./services/backupManager');
const HtmlTemplateEngine = require('./services/htmlTemplateEngine');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

async function testFullSyncWorkflow() {
    try {
        console.log('🚀 Testing Full Static Sync Workflow...');
        
        // Get command line arguments for specific product IDs
        const args = process.argv.slice(2);
        const agendamentoId = args[0];
        const clinicaId = args[1];
        
        // Initialize services
        const syncService = new StaticPageSyncService();
        const backupManager = new BackupManager();
        const templateEngine = new HtmlTemplateEngine();
        
        console.log('\n📊 Step 1: Get products from database...');
        
        let query, products;
        if (agendamentoId && clinicaId) {
            console.log(`🎯 Using specific product IDs: ${agendamentoId}, ${clinicaId}`);
            query = `
                SELECT stripe_product_id, name, active, plan_type, max_users, ai_quota_monthly, metadata
                FROM product_catalog 
                WHERE active = 1 AND stripe_product_id IN (?, ?)
            `;
            products = await executeQuery(adminPool, query, [agendamentoId, clinicaId]);
        } else {
            console.log('🔍 Auto-selecting products...');
            query = `
                SELECT stripe_product_id, name, active, plan_type, max_users, ai_quota_monthly, metadata
                FROM product_catalog 
                WHERE active = 1 
                AND (plan_type = 'SCHEDULING' OR plan_type = 'CLINIC' OR name LIKE '%Agendamento%' OR name LIKE '%Clínica%')
                LIMIT 4
            `;
            products = await executeQuery(adminPool, query);
        }
        
        console.log(`Found ${products.length} active products:`);
        products.forEach(p => console.log(`  - ${p.name} (${p.stripe_product_id})`));
        
        // Select products for sync
        const selectedProducts = {};
        
        let agendamentoProduct, clinicaProduct;
        
        if (agendamentoId && clinicaId) {
            // Use specific products by ID
            agendamentoProduct = products.find(p => p.stripe_product_id === agendamentoId);
            clinicaProduct = products.find(p => p.stripe_product_id === clinicaId);
        } else {
            // Auto-select by type
            agendamentoProduct = products.find(p => 
                p.plan_type === 'SCHEDULING' || 
                p.name.toLowerCase().includes('agendamento')
            );
            
            clinicaProduct = products.find(p => 
                p.plan_type === 'CLINIC' || 
                p.name.toLowerCase().includes('clínica')
            );
        }
        
        if (agendamentoProduct) {
            selectedProducts.agendamento = agendamentoProduct;
            console.log(`✅ Selected for Agendamento: ${agendamentoProduct.name}`);
        }
        
        if (clinicaProduct) {
            selectedProducts.clinica = clinicaProduct;
            console.log(`✅ Selected for Clínica: ${clinicaProduct.name}`);
        }
        
        if (Object.keys(selectedProducts).length === 0) {
            // Fallback: use first two products
            if (products.length >= 1) {
                selectedProducts.agendamento = products[0];
                console.log(`⚠️  Fallback Agendamento: ${products[0].name}`);
            }
            if (products.length >= 2) {
                selectedProducts.clinica = products[1];
                console.log(`⚠️  Fallback Clínica: ${products[1].name}`);
            }
        }
        
        console.log('\n🔍 Step 2: Validate selected products...');
        const validation = await syncService.validateProducts(selectedProducts);
        console.log('Validation result:', {
            isValid: validation.isValid,
            totalProducts: validation.summary.totalProducts,
            validProducts: validation.summary.validProducts,
            issues: validation.issues.length
        });
        
        if (validation.issues.length > 0) {
            console.log('Issues found:');
            validation.issues.forEach(issue => {
                console.log(`  - ${issue.type}: ${issue.message}`);
            });
        }
        
        console.log('\n📦 Step 3: Extract pricing data...');
        const pricingData = await syncService.extractPricingData(selectedProducts);
        console.log('Pricing data extracted for:', Object.keys(pricingData));
        
        // Log sample pricing data
        Object.entries(pricingData).forEach(([planType, data]) => {
            console.log(`${planType}:`, {
                product: data.product.name,
                pricingTiers: Object.keys(data.pricing),
                features: data.features.length
            });
        });
        
        console.log('\n💾 Step 4: Create backup of current static page...');
        const backup = await backupManager.createBackup('planos/index.html');
        console.log('Backup created:', {
            id: backup.id,
            filename: backup.filename,
            size: backup.size
        });
        
        console.log('\n🎨 Step 5: Generate new HTML content...');
        const newHtml = await templateEngine.generateStaticPage(pricingData);
        console.log(`Generated HTML size: ${newHtml.length} characters`);
        
        console.log('\n✅ Step 6: Validate generated HTML...');
        const htmlValidation = await templateEngine.validateGeneratedHtml(newHtml);
        console.log('HTML validation:', htmlValidation);
        
        console.log('\n💾 Step 7: Write new content to static page...');
        const staticPagePath = path.join(process.cwd(), '../../medprofront/planos/index.html');
        await fs.writeFile(staticPagePath, newHtml, 'utf8');
        console.log('✅ Static page updated successfully!');
        
        console.log('\n📋 Step 8: List available backups...');
        const backups = await backupManager.listBackups('index');
        console.log(`Found ${backups.length} backups:`);
        backups.forEach(b => console.log(`  - ${b.filename} (${b.formattedSize})`));
        
        console.log('\n🎉 Full sync workflow completed successfully!');
        console.log('\n📍 What was synced:');
        console.log('  - Static page: /medprofront/planos/index.html');
        console.log('  - Products synced:', Object.keys(selectedProducts).join(', '));
        console.log('  - Backup created:', backup.filename);
        console.log('  - HTML validation passed:', htmlValidation.isValid);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Full sync workflow failed:', error.message);
        logger.error('Full sync test error', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

testFullSyncWorkflow();