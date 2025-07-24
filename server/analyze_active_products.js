#!/usr/bin/env node

/**
 * Analyze active Stripe products and their metadata structure
 * Focus on the 11 active v3 products to understand metadata
 */

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function analyzeActiveProducts() {
    console.log('🔍 Analyzing Active Stripe Products and Metadata...\n');
    
    try {
        // Get all active products
        const products = await stripe.products.list({
            active: true,
            limit: 100
        });
        
        console.log(`📊 Found ${products.data.length} active products\n`);
        
        // Analyze each active product
        for (const product of products.data) {
            console.log(`🔹 ${product.name} (${product.id})`);
            console.log(`   Active: ${product.active}`);
            console.log(`   Created: ${new Date(product.created * 1000).toISOString().split('T')[0]}`);
            
            // Analyze metadata
            if (product.metadata && Object.keys(product.metadata).length > 0) {
                console.log(`   📋 Metadata:`, JSON.stringify(product.metadata, null, 4));
            } else {
                console.log(`   📋 Metadata: None`);
            }
            
            // Get prices for this product
            const prices = await stripe.prices.list({
                product: product.id,
                active: true,
                limit: 10
            });
            
            console.log(`   💰 Active Prices: ${prices.data.length}`);
            prices.data.forEach(price => {
                const period = price.recurring ? 
                    `${price.recurring.interval_count} ${price.recurring.interval}` : 
                    'one-time';
                console.log(`     - ${price.unit_amount/100} ${price.currency.toUpperCase()} per ${period}`);
                if (price.lookup_key) {
                    console.log(`       Lookup Key: ${price.lookup_key}`);
                }
            });
            
            console.log(''); // blank line
        }
        
        // Analyze metadata patterns
        console.log('\n📊 METADATA ANALYSIS:');
        const metadataFields = new Set();
        const metadataValues = {};
        
        products.data.forEach(product => {
            if (product.metadata) {
                Object.keys(product.metadata).forEach(key => {
                    metadataFields.add(key);
                    if (!metadataValues[key]) metadataValues[key] = new Set();
                    metadataValues[key].add(product.metadata[key]);
                });
            }
        });
        
        console.log('\nMetadata Fields Found:');
        metadataFields.forEach(field => {
            console.log(`  - ${field}: [${[...metadataValues[field]].join(', ')}]`);
        });
        
        // Analyze product naming patterns
        console.log('\n📊 PRODUCT NAMING PATTERNS:');
        const namePatterns = {
            planTypes: new Set(),
            userCounts: new Set()
        };
        
        products.data.forEach(product => {
            const name = product.name;
            
            // Extract plan type
            if (name.includes('Clínico') || name.includes('Clínica')) {
                namePatterns.planTypes.add('CLINIC');
            } else if (name.includes('Agendamento')) {
                namePatterns.planTypes.add('SCHEDULING');
            } else if (name.includes('Paciente')) {
                namePatterns.planTypes.add('PATIENT');
            } else if (name.includes('Gratuito')) {
                namePatterns.planTypes.add('FREE');
            }
            
            // Extract user count
            const userMatch = name.match(/(\d+)\s*usuários?/i);
            if (userMatch) {
                namePatterns.userCounts.add(parseInt(userMatch[1]));
            }
        });
        
        console.log('Plan Types (from names):', [...namePatterns.planTypes]);
        console.log('User Counts (from names):', [...namePatterns.userCounts].sort((a,b) => a-b));
        
    } catch (error) {
        console.error('❌ Error analyzing products:', error.message);
    }
}

// Run analysis
analyzeActiveProducts();