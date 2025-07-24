const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class HtmlTemplateEngine {
    constructor() {
        this.templatePath = path.join(process.cwd(), '../../medprofront/planos/index.html');
    }
    
    async generateStaticPage(pricingData) {
        try {
            logger.info('Generating static page with new pricing data - surgical update only');
            
            // Read the current template (preserving all structure)
            const template = await fs.readFile(this.templatePath, 'utf8');
            
            // ONLY replace pricing values, nothing else
            let updatedHtml = await this.surgicalPricingUpdate(template, pricingData);
            
            // Add generation metadata comment (minimal change)
            updatedHtml = this.addGenerationMetadata(updatedHtml);
            
            logger.info('Static page generated successfully with surgical updates');
            return updatedHtml;
            
        } catch (error) {
            logger.error('Failed to generate static page', { 
                error: error.message,
                stack: error.stack 
            });
            throw error;
        }
    }
    
    async surgicalPricingUpdate(html, pricingData) {
        try {
            let updatedHtml = html;
            
            // STEP 1: Completely rebuild the price toggle buttons based on selected products
            updatedHtml = this.rebuildPriceToggleButtons(updatedHtml, pricingData);
            
            // STEP 2: Completely rebuild the pricing sections based on selected products  
            updatedHtml = this.rebuildPricingSections(updatedHtml, pricingData);
            
            // STEP 3: Update JavaScript to handle only the selected tiers
            updatedHtml = this.rebuildPricingJavaScript(updatedHtml, pricingData);
            
            return updatedHtml;
            
        } catch (error) {
            logger.error('Failed to perform surgical pricing update', { error: error.message });
            throw error;
        }
    }
    
    replaceAllProductData(html, planType, productData) {
        let updatedHtml = html;
        
        // Replace ALL pricing data for all tiers
        updatedHtml = this.replacePricingForAllTiers(updatedHtml, planType, productData.pricing);
        
        // Replace product title/name if available
        if (productData.product.name) {
            updatedHtml = this.replaceProductTitle(updatedHtml, planType, productData.product.name);
        }
        
        // Replace product description if available
        if (productData.product.description) {
            updatedHtml = this.replaceProductDescription(updatedHtml, planType, productData.product.description);
        }
        
        // Note: Features will be handled in JavaScript replacement
        
        return updatedHtml;
    }
    
    replacePricingForAllTiers(html, planType, pricing) {
        let updatedHtml = html;
        
        // Define the pricing tiers to replace
        const tiers = [
            { key: '1Users', class: 'one-user-price' },
            { key: '5Users', class: 'five-users-price' },
            { key: '10Users', class: 'ten-users-price' },
            { key: '20Users', class: 'twenty-users-price' },
            { key: '50Users', class: 'fifty-users-price' }
        ];
        
        // Determine which tier section we're updating by plan container
        const planSectionId = planType === 'agendamento' ? 'tier-agendamento' : 'tier-clinica';
        
        for (const tier of tiers) {
            const tierData = pricing[tier.key];
            if (!tierData) continue;
            
            // Create the pricing HTML content (inner HTML only)
            const pricingContent = this.generatePricingContent(tierData, tier.key);
            
            // Find and replace content within the specific plan section
            // Look for the tier container first, then find the pricing div within it
            const planSectionRegex = new RegExp(
                `(<div[^>]*id="${planSectionId}"[\\s\\S]*?)(<div class="price ${tier.class}"[^>]*>)([\\s\\S]*?)(<\\/div>)([\\s\\S]*?<\\/div>\\s*<\\/div>)`,
                'g'
            );
            
            updatedHtml = updatedHtml.replace(planSectionRegex, (match, beforeDiv, openDiv, oldContent, closeDiv, afterDiv) => {
                return `${beforeDiv}${openDiv}${pricingContent}${closeDiv}${afterDiv}`;
            });
        }
        
        return updatedHtml;
    }
    
    generatePricingContent(tierData, tierKey) {
        const userCount = parseInt(tierKey.replace('Users', ''));
        
        // Handle free plan (1 user Agendamento)
        if (tierData.monthly === 0 || tierData.monthly < 1) {
            return `
                            <p class="line1-price">Grátis</p>`;
        }
        
        // Format currency values
        const monthly = this.formatCurrency(tierData.monthly);
        const annual = this.formatCurrency(tierData.annual);
        const perUser = this.formatCurrency(tierData.perUser);
        
        return `
                            <p class="line1-price"><span>${monthly}</span> / mês (plano anual)</p>
                            <div class="line2-price">${annual} / ano</div>
                            <div class="line3-price">${perUser} / usuário / mês</div>`;
    }
    
    generatePricingBlock(tierData, tierKey) {
        // Legacy method - kept for compatibility
        return this.generatePricingContent(tierData, tierKey);
    }
    
    formatCurrency(amount) {
        if (amount === 0 || amount < 1) return 'Grátis';
        
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(amount);
    }
    
    replaceProductTitle(html, planType, productName) {
        // For now, titles are handled by the existing static content
        // Could be extended to replace plan titles if needed
        return html;
    }
    
    replaceProductDescription(html, planType, description) {
        // For now, descriptions are handled by the existing static content
        // Could be extended to replace plan descriptions if needed
        return html;
    }
    
    replaceJavaScriptSection(html, pricingData) {
        try {
            // Don't replace JavaScript section - features are already in the restored HTML
            // The original page has proper feature lists that work correctly
            logger.info('Skipping JavaScript section replacement - using original feature lists');
            return html;
            
        } catch (error) {
            logger.error('Failed to replace JavaScript section', { error: error.message });
            return html; // Return original if replacement fails
        }
    }
    
    generateFeaturesJavaScript(pricingData) {
        const agendamentoFeatures = pricingData.agendamento?.features || [];
        const clinicaFeatures = pricingData.clinica?.features || [];
        
        return `if (period === "one-user") {
                                if (currentUl.id === "ul-plan-a-features") {
                                    currentUl.innerHTML = \`
                                        ${agendamentoFeatures.map(f => `<li>${this.escapeHtml(f)}</li>`).join('\n                                        ')}\`;
                                } else if (currentUl.id === "ul-plan-b-features") {
                                    currentUl.innerHTML = \`
                                        ${clinicaFeatures.map(f => `<li>${this.escapeHtml(f)}</li>`).join('\n                                        ')}\`;
                                }
                            } else { 
                                if (currentUl.id === "ul-plan-a-features") {
                                    currentUl.innerHTML = \`
                                        ${agendamentoFeatures.map(f => `<li>${this.escapeHtml(f)}</li>`).join('\n                                        ')}\`;
                                } else if (currentUl.id === "ul-plan-b-features") {
                                    currentUl.innerHTML = \`
                                        ${clinicaFeatures.map(f => `<li>${this.escapeHtml(f)}</li>`).join('\n                                        ')}\`;
                                }
                            }
                        }
                    }
                };`;
    }
    
    replacePlanFeatures(html, planId, features) {
        // Generate features HTML
        const featuresHtml = features.map(feature => `<li>${this.escapeHtml(feature)}</li>`).join('\n                                        ');
        
        // Create the JavaScript code to update features
        const jsCode = `
                                if (currentUl.id === "${planId}") {
                                    currentUl.innerHTML = \`
                                        ${featuresHtml}\`;
                                }`;
        
        // Replace in both one-user and multi-user feature sections
        const oneUserRegex = new RegExp(
            `(if \\(currentUl\\.id === "${planId}"\\) \\{[\\s\\S]*?currentUl\\.innerHTML = \`[\\s\\S]*?\`;[\\s\\S]*?\\})`,
            'g'
        );
        
        return html.replace(oneUserRegex, jsCode.trim());
    }
    
    addGenerationMetadata(html) {
        const timestamp = new Date().toISOString();
        const comment = `\n<!-- Generated by MedPro Static Sync at ${timestamp} -->\n`;
        
        // Check if a generation comment already exists and replace it
        const existingCommentRegex = /\n<!-- Generated by MedPro Static Sync at [\d\-T:\.Z]+ -->\n/g;
        
        if (existingCommentRegex.test(html)) {
            // Replace existing comment
            return html.replace(existingCommentRegex, comment);
        } else {
            // Add new comment after the opening html tag
            return html.replace(/(<html[^>]*>)/, `$1${comment}`);
        }
    }
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
    
    async validateGeneratedHtml(html) {
        try {
            // Basic HTML structure validation
            const issues = [];
            
            // Check for required sections
            if (!html.includes('class="price one-user-price"')) {
                issues.push('Missing one-user pricing section');
            }
            
            if (!html.includes('class="price five-users-price"')) {
                issues.push('Missing five-users pricing section');
            }
            
            if (!html.includes('id="ul-plan-a-features"')) {
                issues.push('Missing Agendamento features section');
            }
            
            if (!html.includes('id="ul-plan-b-features"')) {
                issues.push('Missing Clínica features section');
            }
            
            // Check for balanced HTML tags
            const openTags = (html.match(/</g) || []).length;
            const closeTags = (html.match(/>/g) || []).length;
            
            if (openTags !== closeTags) {
                issues.push('Unbalanced HTML tags detected');
            }
            
            // Check for JavaScript integrity
            if (!html.includes('function setPricing(period)')) {
                issues.push('Missing setPricing function');
            }
            
            return {
                isValid: issues.length === 0,
                issues
            };
            
        } catch (error) {
            logger.error('HTML validation failed', { error: error.message });
            return {
                isValid: false,
                issues: ['Validation process failed']
            };
        }
    }
    
    async createPreviewHtml(pricingData) {
        try {
            // Generate full HTML
            const fullHtml = await this.generateStaticPage(pricingData);
            
            // Extract just the pricing section for preview
            const pricingRegex = /<div class="pricing-outer-container[^>]*>[\s\S]*?<\/div>\s*<\/main>/;
            const match = fullHtml.match(pricingRegex);
            
            if (match) {
                // Create a minimal preview HTML
                return `
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Pricing Preview</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                        <style>
                            ${this.getPreviewStyles()}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2 class="my-4">Preview - Pricing Section</h2>
                            ${match[0]}
                        </div>
                        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
                        <script>
                            ${this.getPreviewScript()}
                        </script>
                    </body>
                    </html>
                `;
            }
            
            return fullHtml; // Return full HTML if section extraction fails
            
        } catch (error) {
            logger.error('Failed to create preview HTML', { error: error.message });
            throw error;
        }
    }
    
    getPreviewStyles() {
        // Return essential CSS for preview
        return `
            .pricing-outer-container { 
                margin: 1vw auto; 
                max-width: 90%; 
                text-align: center;
                background-color: #f8f9fa; 
                padding: 2rem;
                margin-top: 3rem;
                border-radius: 20px;
                box-shadow: 0px 10px 15px -5px rgba(0, 0, 0, 0.1);
            }
            .price-toggle {
                margin: 20px 0;
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
            }
            .toggle-btn {
                background-color: #e9ecef; 
                border: 1px solid #ced4da; 
                padding: 0.5rem 1rem;
                cursor: pointer;
                border-radius: 0.375rem; 
            }
            .toggle-btn.active {
                background-color: var(--bs-primary); 
                color: white;
            }
            .tier-card { 
                border: 1px solid #dee2e6; 
                border-radius: 0.75rem; 
                background-color: #fff;
                box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
                height: 100%; 
            }
            .price {
                font-size: 1.5rem; 
                font-weight: bold;
                margin-bottom: 1rem;
                min-height: 70px; 
            }
            .hidden { 
                display: none !important; 
            }
        `;
    }
    
    getPreviewScript() {
        // Return essential JavaScript for preview
        return `
            function setPricing(period) {
                // Simplified version for preview
                document.querySelectorAll('.price').forEach(p => p.classList.add('hidden'));
                document.querySelectorAll('.' + period + '-price').forEach(p => p.classList.remove('hidden'));
                
                document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelector('.' + period).classList.add('active');
            }
            
            // Initialize with one-user pricing
            document.addEventListener('DOMContentLoaded', function() {
                setPricing('one-user');
            });
        `;
    }
    
    rebuildPriceToggleButtons(html, pricingData) {
        // Determine which tiers to show based on selected products
        const availableTiers = this.getAvailableTiers(pricingData);
        
        // Generate new toggle buttons HTML
        const toggleButtonsHtml = availableTiers.map(tier => {
            const label = this.getTierLabel(tier);
            return `<button class="toggle-btn ${tier}" onclick="setPricing('${tier}')">${label}</button>`;
        }).join('\n						');
        
        // Replace the entire price-toggle section
        const toggleRegex = /(<div class="price-toggle">)[\s\S]*?(<\/div>)/;
        return html.replace(toggleRegex, `$1\n						${toggleButtonsHtml}\n					$2`);
    }
    
    rebuildPricingSections(html, pricingData) {
        let updatedHtml = html;
        
        // Get available tiers from the selected products
        const availableTiers = this.getAvailableTiers(pricingData);
        
        // Rebuild Agendamento pricing section
        if (pricingData.agendamento) {
            const agendamentoPricing = this.generatePricingSection('agendamento', pricingData.agendamento, availableTiers);
            updatedHtml = this.replacePricingSection(updatedHtml, 'tier-agendamento', agendamentoPricing);
        }
        
        // Rebuild Clínica pricing section  
        if (pricingData.clinica) {
            const clinicaPricing = this.generatePricingSection('clinica', pricingData.clinica, availableTiers);
            updatedHtml = this.replacePricingSection(updatedHtml, 'tier-clinica', clinicaPricing);
        }
        
        return updatedHtml;
    }
    
    rebuildPricingJavaScript(html, pricingData) {
        // For now, skip JavaScript replacement and use original feature lists
        logger.info('Skipping JavaScript section replacement - using original feature lists');
        return html;
    }
    
    getAvailableTiers(pricingData) {
        // Determine which tiers have actual pricing data (not missing) from ANY product
        const tiers = new Set();
        
        // Check both products for available pricing tiers
        [pricingData.agendamento, pricingData.clinica].forEach((productData, index) => {
            const productName = index === 0 ? 'agendamento' : 'clinica';
            console.log(`🔍 Checking ${productName} for available tiers...`);
            
            if (productData && productData.pricing) {
                Object.keys(productData.pricing).forEach(tierKey => {
                    const tierData = productData.pricing[tierKey];
                    console.log(`  - ${tierKey}: monthly=${tierData.monthly}, missing=${tierData.missing}`);
                    
                    // Include tiers that have real pricing data from at least one product
                    // A tier is valid if: not missing AND (monthly > 0 OR monthly === 0 for free plans)
                    if (tierData && tierData.missing !== true && (tierData.monthly > 0 || tierData.monthly === 0)) {
                        const tierClass = tierKey.replace('Users', '-user') + (tierKey === '1Users' ? '' : 's');
                        tiers.add(tierClass);
                        console.log(`    ✅ Added tier: ${tierClass}`);
                    } else {
                        console.log(`    ❌ Rejected tier: missing=${tierData.missing}, monthly=${tierData.monthly}`);
                    }
                });
            }
        });
        
        // Return in proper order
        const orderedTiers = ['one-user', 'five-users', 'ten-users', 'twenty-users', 'fifty-users'];
        const availableTiers = orderedTiers.filter(tier => tiers.has(tier));
        
        console.log(`🎯 Available tiers detected: ${availableTiers.join(', ')}`);
        console.log(`📊 Tiers set contains: ${Array.from(tiers).join(', ')}`);
        return availableTiers;
    }
    
    getTierLabel(tier) {
        const labels = {
            'one-user': '1 usuário',
            'five-users': '5 usuários', 
            'ten-users': '10 usuários',
            'twenty-users': '20 usuários',
            'fifty-users': '50 usuários'
        };
        return labels[tier] || tier;
    }
    
    generatePricingSection(planType, productData, availableTiers) {
        // Generate pricing divs only for available tiers
        const pricingDivs = availableTiers.map((tier, index) => {
            const tierKey = tier.replace('-user', 'User').replace('s', '') + 's';
            const tierData = productData.pricing[tierKey];
            
            if (!tierData) return '';
            
            const hiddenClass = index === 0 ? '' : ' hidden';
            const pricingContent = this.generatePricingContent(tierData, tierKey);
            
            return `                                        <div class="price ${tier}-price${hiddenClass}">
${pricingContent}
                                        </div>`;
        }).join('\n');
        
        return pricingDivs;
    }
    
    replacePricingSection(html, sectionId, newPricingContent) {
        // Replace the entire price-content-wrapper section
        const regex = new RegExp(
            `(<div[^>]*id="${sectionId}"[\\s\\S]*?<div class="price-content-wrapper">)[\\s\\S]*?(<\\/div>\\s*<ul id="ul-plan-[ab]-features">)`,
            'g'
        );
        
        return html.replace(regex, `$1\n${newPricingContent}\n                                    $2`);
    }
}

module.exports = HtmlTemplateEngine;