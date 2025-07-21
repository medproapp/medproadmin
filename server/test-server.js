// Simple test script to verify server is working
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 4040,
    path: '/api/v1/health',
    method: 'GET'
};

console.log('Testing MedPro Admin Server...');
console.log(`Checking health endpoint at http://localhost:4040/api/v1/health`);

const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('\n✅ Server is running!');
            console.log('Response:', json);
            console.log('\nYou can access the admin interface at:');
            console.log('http://localhost:4040/medproadmin');
        } catch (error) {
            console.error('❌ Invalid response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('\n❌ Server is not running or not accessible');
    console.error('Error:', error.message);
    console.log('\nMake sure to:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Setup environment: cp .env.example .env');
    console.log('3. Start the server: npm run dev');
});

req.end();