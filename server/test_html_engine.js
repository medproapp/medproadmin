#!/usr/bin/env node

const HtmlTemplateEngine = require('./services/htmlTemplateEngine');
const logger = require('./utils/logger');

async function testHtmlEngine() {
    try {
        const engine = new HtmlTemplateEngine();
        
        // Test data
        const pricingData = {
            agendamento: {
                product: {
                    id: 'prod_test_agendamento',
                    name: 'Plano Agendamento',
                    description: 'Agendamento básico'
                },
                pricing: {
                    '1Users': {
                        monthly: 0,
                        annual: 0,
                        perUser: 0,
                        currency: 'brl',
                        priceId: 'price_free'
                    },
                    '5Users': {
                        monthly: 50.00,
                        annual: 600.00,
                        perUser: 10.00,
                        currency: 'brl',
                        priceId: 'price_5users'
                    },
                    '10Users': {
                        monthly: 80.00,
                        annual: 960.00,
                        perUser: 8.00,
                        currency: 'brl',
                        priceId: 'price_10users'
                    },
                    '20Users': {
                        monthly: 140.00,
                        annual: 1680.00,
                        perUser: 7.00,
                        currency: 'brl',
                        priceId: 'price_20users'
                    },
                    '50Users': {
                        monthly: 300.00,
                        annual: 3600.00,
                        perUser: 6.00,
                        currency: 'brl',
                        priceId: 'price_50users'
                    }
                },
                features: [
                    'Pacientes e Profissionais',
                    'Cadastro de Pacientes',
                    'Agendamento pelo Médico/Assistente',
                    'Agendamento pelo Paciente'
                ]
            },
            clinica: {
                product: {
                    id: 'prod_test_clinica',
                    name: 'Plano Clínica',
                    description: 'Funcionalidades completas'
                },
                pricing: {
                    '1Users': {
                        monthly: 30.00,
                        annual: 360.00,
                        perUser: 30.00,
                        currency: 'brl',
                        priceId: 'price_clinica_1'
                    },
                    '5Users': {
                        monthly: 120.00,
                        annual: 1440.00,
                        perUser: 24.00,
                        currency: 'brl',
                        priceId: 'price_clinica_5'
                    },
                    '10Users': {
                        monthly: 200.00,
                        annual: 2400.00,
                        perUser: 20.00,
                        currency: 'brl',
                        priceId: 'price_clinica_10'
                    },
                    '20Users': {
                        monthly: 360.00,
                        annual: 4320.00,
                        perUser: 18.00,
                        currency: 'brl',
                        priceId: 'price_clinica_20'
                    },
                    '50Users': {
                        monthly: 800.00,
                        annual: 9600.00,
                        perUser: 16.00,
                        currency: 'brl',
                        priceId: 'price_clinica_50'
                    }
                },
                features: [
                    'Todas as funções do plano Agendamento +',
                    'Prontuário Eletrônico',
                    'Gravação de Encontros',
                    'Inteligência Artificial'
                ]
            }
        };

        console.log('🔧 Testing HTML Template Engine...');
        
        // Test currency formatting
        console.log('💰 Currency formatting test:');
        console.log('  0 =>', engine.formatCurrency(0));
        console.log('  50.00 =>', engine.formatCurrency(50.00));
        console.log('  1250.50 =>', engine.formatCurrency(1250.50));
        
        // Test pricing block generation
        console.log('\n📋 Pricing block generation test:');
        const pricingBlock = engine.generatePricingBlock(pricingData.agendamento.pricing['5Users'], '5Users');
        console.log('5 Users pricing block:', pricingBlock);
        
        // Test free plan
        const freePricingBlock = engine.generatePricingBlock(pricingData.agendamento.pricing['1Users'], '1Users');
        console.log('Free plan pricing block:', freePricingBlock);
        
        // Test HTML validation (without actual file)
        console.log('\n✅ HTML validation test:');
        const testHtml = `
            <html>
                <head><title>Test</title></head>
                <body>
                    <div class="price one-user-price">Test</div>
                    <div class="price five-users-price">Test</div>
                    <ul id="ul-plan-a-features">
                        <li>Feature 1</li>
                    </ul>
                    <ul id="ul-plan-b-features">
                        <li>Feature 1</li>
                    </ul>
                    <script>
                        function setPricing(period) { return period; }
                    </script>
                </body>
            </html>
        `;
        
        const validation = await engine.validateGeneratedHtml(testHtml);
        console.log('Validation result:', validation);
        
        console.log('\n✅ HTML Template Engine tests completed successfully!');
        
    } catch (error) {
        console.error('❌ HTML Template Engine test failed:', error.message);
        logger.error('Template engine test error', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

testHtmlEngine();