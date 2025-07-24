require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkAllPrices() {
  try {
    console.log('=== ANALYZING ALL STRIPE PRICES ===');
    
    const prices = await stripe.prices.list({
      limit: 100,
      expand: ['data.product']
    });
    
    console.log('Total prices found:', prices.data.length);
    console.log('\n=== BILLING PATTERNS ANALYSIS ===');
    
    const patterns = {};
    
    prices.data.forEach((price, index) => {
      const interval = price.recurring ? price.recurring.interval : 'one_time';
      const count = price.recurring ? price.recurring.interval_count : 1;
      const key = `${interval}_${count}`;
      
      if (!patterns[key]) {
        patterns[key] = [];
      }
      patterns[key].push({
        id: price.id,
        product_name: price.product ? price.product.name : 'Unknown',
        unit_amount: price.unit_amount,
        lookup_key: price.lookup_key,
        nickname: price.nickname,
        trial_period_days: price.recurring ? price.recurring.trial_period_days : null,
        interval: interval,
        interval_count: count
      });
    });
    
    console.log('\nBilling Patterns Found:');
    Object.keys(patterns).forEach(pattern => {
      console.log(`\n--- ${pattern} ---`);
      console.log(`Count: ${patterns[pattern].length} prices`);
      console.log('Examples:');
      patterns[pattern].slice(0, 3).forEach(price => {
        const lookupInfo = price.lookup_key ? ` (lookup: ${price.lookup_key})` : '';
        console.log(`  • ${price.product_name}: ${price.unit_amount}${lookupInfo}`);
      });
    });
    
    console.log('\n=== LOOKUP KEY PATTERNS ===');
    const lookupKeys = prices.data.filter(p => p.lookup_key).map(p => p.lookup_key);
    console.log('Sample lookup keys:');
    lookupKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`));
    
  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkAllPrices();
