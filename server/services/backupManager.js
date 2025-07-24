const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class BackupManager {
    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups', 'static-pages');
        this.maxBackups = 10; // Keep only last 10 backups
        this.ensureBackupDirectory();
    }
    
    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            logger.error('Failed to create backup directory', { 
                backupDir: this.backupDir,
                error: error.message 
            });
        }
    }
    
    async createBackup(relativePath) {
        try {
            const sourcePath = path.join(process.cwd(), '../../medprofront', relativePath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `${path.basename(relativePath, '.html')}_${timestamp}.html`;
            const backupPath = path.join(this.backupDir, backupFileName);
            
            // Check if source file exists
            try {
                await fs.access(sourcePath);
            } catch (error) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }
            
            // Copy file to backup location
            await fs.copyFile(sourcePath, backupPath);
            
            // Clean up old backups
            await this.cleanupOldBackups(path.basename(relativePath, '.html'));
            
            logger.info('Backup created successfully', { 
                sourcePath,
                backupPath,
                backupFileName 
            });
            
            return {
                id: path.basename(backupPath, '.html'),
                path: backupPath,
                filename: backupFileName,
                createdAt: new Date(),
                size: (await fs.stat(backupPath)).size
            };
            
        } catch (error) {
            logger.error('Backup creation failed', { 
                relativePath,
                error: error.message 
            });
            throw error;
        }
    }
    
    async listBackups(filePrefix) {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files
                .filter(file => file.startsWith(filePrefix) && file.endsWith('.html'))
                .sort((a, b) => b.localeCompare(a)); // Sort by filename (newest first)
            
            const backups = [];
            for (const filename of backupFiles) {
                const filePath = path.join(this.backupDir, filename);
                try {
                    const stats = await fs.stat(filePath);
                    backups.push({
                        id: path.basename(filename, '.html'),
                        filename,
                        path: filePath,
                        size: stats.size,
                        createdAt: stats.mtime,
                        formattedSize: this.formatFileSize(stats.size)
                    });
                } catch (statError) {
                    logger.warn('Failed to get backup file stats', { 
                        filename,
                        error: statError.message 
                    });
                }
            }
            
            return backups;
            
        } catch (error) {
            logger.error('Failed to list backups', { 
                filePrefix,
                error: error.message 
            });
            return [];
        }
    }
    
    async restoreBackup(backupId, targetRelativePath) {
        try {
            const backups = await this.listBackups('planos');
            const backup = backups.find(b => b.id === backupId);
            
            if (!backup) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            
            const targetPath = path.join(process.cwd(), '../../medprofront', targetRelativePath);
            
            // Create backup of current file before restoring
            try {
                await this.createBackup(targetRelativePath);
            } catch (backupError) {
                logger.warn('Failed to create backup before restore', { 
                    error: backupError.message 
                });
                // Continue with restore even if backup fails
            }
            
            // Copy backup file to target location
            await fs.copyFile(backup.path, targetPath);
            
            logger.info('Backup restored successfully', { 
                backupId,
                backupPath: backup.path,
                targetPath 
            });
            
            return true;
            
        } catch (error) {
            logger.error('Backup restore failed', { 
                backupId,
                targetRelativePath,
                error: error.message 
            });
            throw error;
        }
    }
    
    async deleteBackup(backupId) {
        try {
            const backups = await this.listBackups('planos');
            const backup = backups.find(b => b.id === backupId);
            
            if (!backup) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            
            await fs.unlink(backup.path);
            
            logger.info('Backup deleted successfully', { 
                backupId,
                backupPath: backup.path 
            });
            
            return true;
            
        } catch (error) {
            logger.error('Backup deletion failed', { 
                backupId,
                error: error.message 
            });
            throw error;
        }
    }
    
    async cleanupOldBackups(filePrefix) {
        try {
            const backups = await this.listBackups(filePrefix);
            
            if (backups.length > this.maxBackups) {
                const backupsToDelete = backups.slice(this.maxBackups);
                
                for (const backup of backupsToDelete) {
                    try {
                        await fs.unlink(backup.path);
                        logger.info('Old backup cleaned up', { 
                            backupId: backup.id,
                            backupPath: backup.path 
                        });
                    } catch (deleteError) {
                        logger.warn('Failed to delete old backup', { 
                            backupId: backup.id,
                            error: deleteError.message 
                        });
                    }
                }
            }
            
        } catch (error) {
            logger.error('Backup cleanup failed', { 
                filePrefix,
                error: error.message 
            });
        }
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async getBackupContent(backupId) {
        try {
            const backups = await this.listBackups('planos');
            const backup = backups.find(b => b.id === backupId);
            
            if (!backup) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            
            const content = await fs.readFile(backup.path, 'utf8');
            return content;
            
        } catch (error) {
            logger.error('Failed to get backup content', { 
                backupId,
                error: error.message 
            });
            throw error;
        }
    }
}

module.exports = BackupManager;