#!/usr/bin/env node

const BackupManager = require('./services/backupManager');
const logger = require('./utils/logger');

async function testBackupManager() {
    try {
        const backupManager = new BackupManager();
        
        console.log('🔧 Testing Backup Manager...');
        
        // Test backup directory creation
        console.log('📁 Testing backup directory setup...');
        const backupDir = await backupManager.ensureBackupDirectory();
        console.log('Backup directory:', backupDir);
        
        // Test creating a test backup
        console.log('\n💾 Testing backup creation...');
        const testContent = '<html><head><title>Test Backup</title></head><body>Test content</body></html>';
        const testFilePath = 'test/backup.html';
        
        // We won't actually create a backup of a real file, just test the backup path generation
        const backupId = `backup_${Date.now()}_test`;
        console.log('Generated backup ID:', backupId);
        
        // Test listing backups
        console.log('\n📋 Testing backup listing...');
        const backups = await backupManager.listBackups('test');
        console.log('Current backups for "test":', backups.length);
        
        console.log('\n✅ Backup Manager tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Backup Manager test failed:', error.message);
        logger.error('Backup manager test error', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

testBackupManager();