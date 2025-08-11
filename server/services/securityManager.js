const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');

class SecurityManager {
    constructor() {
        // Security configuration
        this.config = {
            keyRotationInterval: 24 * 60 * 60 * 1000, // 24 hours
            keyBackupRetention: 7, // Keep 7 previous key versions
            encryptionAlgorithm: 'aes-256-gcm',
            keyDerivationIterations: 100000,
            saltLength: 32,
            ivLength: 16,
            tagLength: 16,
            keyLength: 32
        };
        
        // In-memory key cache (in production, this would be managed by Vault)
        this.keyCache = new Map();
        this.masterKey = null; // Derived from environment secrets
        
        // Security patterns for command validation
        this.dangerousPatterns = [
            // Dangerous commands
            /\b(rm\s+-rf|mkfs|fdisk|dd\s+if=.*of=\/dev|format|deltree)\b/i,
            // Network access attempts
            /\b(wget|curl|nc|netcat|telnet|ssh)\s+(?!localhost|127\.0\.0\.1)/i,
            // System modification
            /\b(chmod\s+777|chown\s+root|sudo\s+su|passwd|useradd|userdel)\b/i,
            // File system traversal
            /\.\.\//g,
            // Code injection attempts
            /[;&|`$(){}]/,
            // Sensitive file access
            /\b(\/etc\/passwd|\/etc\/shadow|\/root|\/home\/.*\/\.ssh)\b/i
        ];
        
        // Allowed command patterns for general operations
        this.allowedPatterns = [
            /^node\s+[a-zA-Z0-9\/_\-\.]+\.js(\s+--[a-zA-Z0-9\-]+(=[\w\-\/\.]+)?)*$/,
            /^npm\s+(install|run\s+[a-zA-Z0-9\-]+)$/,
            /^echo\s+["'][^"']*["']$/,
            /^ls\s+-[la]+\s+[a-zA-Z0-9\/_\-\.]+$/,
            /^pwd$/,
            /^cat\s+[a-zA-Z0-9\/_\-\.]+\.(log|txt|json)$/,
            /^mkdir\s+-p\s+[a-zA-Z0-9\/_\-\.]+$/,
            /^cp\s+[a-zA-Z0-9\/_\-\.]+\s+[a-zA-Z0-9\/_\-\.]+$/
        ];
        
        // Initialize security systems
        this.initializeSecurity();
    }

    /**
     * Initialize security systems
     */
    async initializeSecurity() {
        try {
            await this.initializeMasterKey();
            await this.loadSSHKeys();
            this.startKeyRotationSchedule();
            
            logger.info('Security Manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Security Manager:', error);
            throw error;
        }
    }

    /**
     * Encrypt sensitive data
     * @param {string} plaintext - Data to encrypt
     * @param {string} keyId - Key identifier (optional, uses default if not provided)
     * @returns {Promise<Object>} Encrypted data with metadata
     */
    async encrypt(plaintext, keyId = 'default') {
        try {
            const key = await this.getEncryptionKey(keyId);
            const iv = crypto.randomBytes(this.config.ivLength);
            const salt = crypto.randomBytes(this.config.saltLength);
            
            // Derive key with salt
            const derivedKey = crypto.pbkdf2Sync(key, salt, this.config.keyDerivationIterations, this.config.keyLength, 'sha256');
            
            // Encrypt data
            const cipher = crypto.createCipher(this.config.encryptionAlgorithm, derivedKey);
            cipher.setAAD(Buffer.from(keyId));
            
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            const result = {
                keyId,
                algorithm: this.config.encryptionAlgorithm,
                iv: iv.toString('hex'),
                salt: salt.toString('hex'),
                tag: tag.toString('hex'),
                data: encrypted,
                timestamp: new Date().toISOString()
            };
            
            logger.debug(`Data encrypted with key ${keyId}`);
            return result;
            
        } catch (error) {
            logger.error(`Encryption failed for key ${keyId}:`, error);
            throw error;
        }
    }

    /**
     * Decrypt sensitive data
     * @param {Object} encryptedData - Encrypted data object
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decrypt(encryptedData) {
        try {
            const { keyId, algorithm, iv, salt, tag, data } = encryptedData;
            
            const key = await this.getEncryptionKey(keyId);
            const derivedKey = crypto.pbkdf2Sync(
                key, 
                Buffer.from(salt, 'hex'), 
                this.config.keyDerivationIterations, 
                this.config.keyLength, 
                'sha256'
            );
            
            const decipher = crypto.createDecipher(algorithm, derivedKey);
            decipher.setAAD(Buffer.from(keyId));
            decipher.setAuthTag(Buffer.from(tag, 'hex'));
            
            let decrypted = decipher.update(data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            logger.debug(`Data decrypted with key ${keyId}`);
            return decrypted;
            
        } catch (error) {
            logger.error(`Decryption failed:`, error);
            throw error;
        }
    }

    /**
     * Generate new SSH key pair
     * @param {string} environmentId - Environment identifier
     * @param {Object} options - Key generation options
     * @returns {Promise<Object>} Generated key pair information
     */
    async generateSSHKeyPair(environmentId, options = {}) {
        try {
            const keyType = options.type || 'rsa';
            const keyBits = options.bits || 2048;
            const comment = options.comment || `medpro-operation-${environmentId}-${Date.now()}`;
            
            logger.info(`Generating SSH key pair for ${environmentId}`);
            
            // Generate key pair using crypto module
            const { publicKey, privateKey } = crypto.generateKeyPairSync(keyType, {
                modulusLength: keyBits,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });
            
            // Store encrypted private key
            const encryptedPrivateKey = await this.encrypt(privateKey, `ssh-${environmentId}`);
            
            // Calculate key fingerprint
            const fingerprint = crypto.createHash('sha256')
                .update(publicKey)
                .digest('base64');
            
            const keyInfo = {
                environmentId,
                keyType,
                keyBits,
                comment,
                fingerprint: `SHA256:${fingerprint}`,
                publicKey,
                encryptedPrivateKey,
                generatedAt: new Date(),
                status: 'active'
            };
            
            // Store in database
            await this.storeSSHKey(keyInfo);
            
            // Cache for immediate use
            this.keyCache.set(`ssh-${environmentId}`, {
                ...keyInfo,
                privateKey // Keep decrypted in cache temporarily
            });
            
            logger.info(`SSH key pair generated for ${environmentId} with fingerprint ${keyInfo.fingerprint}`);
            
            return keyInfo;
            
        } catch (error) {
            logger.error(`SSH key generation failed for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Get SSH private key for environment
     * @param {string} environmentId - Environment identifier
     * @returns {Promise<string>} Decrypted private key
     */
    async getSSHPrivateKey(environmentId) {
        try {
            // Check cache first
            const cached = this.keyCache.get(`ssh-${environmentId}`);
            if (cached && cached.privateKey) {
                return cached.privateKey;
            }
            
            // Load from database
            const keyInfo = await this.loadSSHKey(environmentId);
            if (!keyInfo) {
                throw new Error(`No SSH key found for environment ${environmentId}`);
            }
            
            // Decrypt private key
            const privateKey = await this.decrypt(keyInfo.encryptedPrivateKey);
            
            // Cache temporarily
            this.keyCache.set(`ssh-${environmentId}`, {
                ...keyInfo,
                privateKey
            });
            
            return privateKey;
            
        } catch (error) {
            logger.error(`Failed to get SSH private key for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Rotate SSH key for environment
     * @param {string} environmentId - Environment identifier
     * @param {Object} options - Rotation options
     * @returns {Promise<Object>} New key information
     */
    async rotateSSHKey(environmentId, options = {}) {
        try {
            logger.info(`Starting SSH key rotation for ${environmentId}`);
            
            // Mark current key as pending rotation
            await this.markKeyForRotation(environmentId);
            
            // Generate new key
            const newKeyInfo = await this.generateSSHKeyPair(environmentId, options);
            
            // Archive old key
            await this.archiveOldKey(environmentId, newKeyInfo.fingerprint);
            
            // Clear cache to force reload
            this.keyCache.delete(`ssh-${environmentId}`);
            
            // Log rotation event
            await this.logSecurityEvent({
                type: 'ssh_key_rotation',
                environmentId,
                details: {
                    newFingerprint: newKeyInfo.fingerprint,
                    rotatedAt: new Date()
                }
            });
            
            logger.info(`SSH key rotation completed for ${environmentId}`);
            
            return newKeyInfo;
            
        } catch (error) {
            logger.error(`SSH key rotation failed for ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Validate command for security compliance
     * @param {string} command - Command to validate
     * @param {Object} context - Execution context
     * @returns {Object} Validation result
     */
    validateCommand(command, context = {}) {
        const result = {
            allowed: false,
            risk: 'low',
            violations: [],
            sanitizedCommand: command
        };
        
        try {
            // Check for dangerous patterns
            for (const pattern of this.dangerousPatterns) {
                if (pattern.test(command)) {
                    result.violations.push({
                        type: 'dangerous_pattern',
                        pattern: pattern.toString(),
                        severity: 'high'
                    });
                    result.risk = 'high';
                }
            }
            
            // Check against allowed patterns
            let matchesAllowed = false;
            for (const pattern of this.allowedPatterns) {
                if (pattern.test(command)) {
                    matchesAllowed = true;
                    break;
                }
            }
            
            if (!matchesAllowed) {
                result.violations.push({
                    type: 'unauthorized_command',
                    severity: 'medium'
                });
                result.risk = result.risk === 'high' ? 'high' : 'medium';
            }
            
            // Additional security checks
            if (command.length > 1000) {
                result.violations.push({
                    type: 'command_too_long',
                    severity: 'medium'
                });
            }
            
            if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(command)) {
                result.violations.push({
                    type: 'control_characters',
                    severity: 'high'
                });
                result.risk = 'high';
            }
            
            // Allow command if no high-risk violations and matches allowed patterns
            result.allowed = result.risk !== 'high' && matchesAllowed;
            
            // Sanitize command (basic sanitization)
            result.sanitizedCommand = command
                .replace(/[;&|`]/g, '') // Remove dangerous characters
                .trim();
            
            logger.debug(`Command validation: ${result.allowed ? 'ALLOWED' : 'BLOCKED'} (${result.risk} risk)`, {
                command: command.substring(0, 100),
                violations: result.violations.length
            });
            
            return result;
            
        } catch (error) {
            logger.error('Command validation error:', error);
            return {
                allowed: false,
                risk: 'high',
                violations: [{ type: 'validation_error', severity: 'high' }],
                sanitizedCommand: ''
            };
        }
    }

    /**
     * Generate secure token
     * @param {number} length - Token length in bytes
     * @returns {string} Secure random token
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash password with salt
     * @param {string} password - Password to hash
     * @param {string} salt - Salt (optional, generates if not provided)
     * @returns {Object} Hash result with salt
     */
    hashPassword(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(16).toString('hex');
        }
        
        const hash = crypto.pbkdf2Sync(password, salt, this.config.keyDerivationIterations, 64, 'sha256');
        
        return {
            hash: hash.toString('hex'),
            salt: salt,
            algorithm: 'pbkdf2',
            iterations: this.config.keyDerivationIterations
        };
    }

    /**
     * Verify password against hash
     * @param {string} password - Password to verify
     * @param {Object} hashData - Stored hash data
     * @returns {boolean} Verification result
     */
    verifyPassword(password, hashData) {
        const { hash, salt } = hashData;
        const verifyHash = crypto.pbkdf2Sync(password, salt, this.config.keyDerivationIterations, 64, 'sha256');
        
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), verifyHash);
    }

    /**
     * Log security event
     * @param {Object} event - Security event data
     */
    async logSecurityEvent(event) {
        try {
            const query = `
                INSERT INTO security_events (
                    event_type, environment_id, severity, details, 
                    ip_address, user_agent, user_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                event.type,
                event.environmentId || null,
                event.severity || 'info',
                JSON.stringify(event.details || {}),
                event.ipAddress || null,
                event.userAgent || null,
                event.userId || null,
                new Date()
            ];
            
            await executeQuery(adminPool, query, params);
            
        } catch (error) {
            logger.error('Failed to log security event:', error);
        }
    }

    // Private methods

    async initializeMasterKey() {
        // In production, this would retrieve from HashiCorp Vault or secure key store
        const keyMaterial = process.env.MASTER_KEY_MATERIAL || 'default-development-key-change-in-production';
        this.masterKey = crypto.createHash('sha256').update(keyMaterial).digest();
        
        logger.debug('Master key initialized');
    }

    async getEncryptionKey(keyId) {
        // Check cache first
        if (this.keyCache.has(keyId)) {
            return this.keyCache.get(keyId);
        }
        
        // For now, derive from master key + keyId
        // In production, this would query HashiCorp Vault
        const keyMaterial = Buffer.concat([this.masterKey, Buffer.from(keyId)]);
        const key = crypto.createHash('sha256').update(keyMaterial).digest();
        
        // Cache the key
        this.keyCache.set(keyId, key);
        
        return key;
    }

    async loadSSHKeys() {
        try {
            const query = `
                SELECT environment_id, fingerprint, key_type, encrypted_private_key, public_key, status
                FROM ssh_keys 
                WHERE status = 'active'
            `;
            
            const keys = await executeQuery(adminPool, query);
            
            for (const key of keys) {
                this.keyCache.set(`ssh-${key.environment_id}`, {
                    environmentId: key.environment_id,
                    fingerprint: key.fingerprint,
                    keyType: key.key_type,
                    publicKey: key.public_key,
                    encryptedPrivateKey: JSON.parse(key.encrypted_private_key),
                    status: key.status
                });
            }
            
            logger.info(`Loaded ${keys.length} SSH keys from database`);
            
        } catch (error) {
            logger.warn('Failed to load SSH keys from database:', error);
        }
    }

    async storeSSHKey(keyInfo) {
        const query = `
            INSERT INTO ssh_keys (
                environment_id, key_type, key_bits, fingerprint, public_key,
                encrypted_private_key, comment, status, generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                status = 'archived',
                archived_at = NOW()
        `;
        
        const params = [
            keyInfo.environmentId,
            keyInfo.keyType,
            keyInfo.keyBits,
            keyInfo.fingerprint,
            keyInfo.publicKey,
            JSON.stringify(keyInfo.encryptedPrivateKey),
            keyInfo.comment,
            keyInfo.status,
            keyInfo.generatedAt
        ];
        
        await executeQuery(adminPool, query, params);
    }

    async loadSSHKey(environmentId) {
        const query = `
            SELECT * FROM ssh_keys 
            WHERE environment_id = ? AND status = 'active'
            ORDER BY generated_at DESC 
            LIMIT 1
        `;
        
        const results = await executeQuery(adminPool, query, [environmentId]);
        
        if (results.length === 0) {
            return null;
        }
        
        const key = results[0];
        return {
            environmentId: key.environment_id,
            keyType: key.key_type,
            keyBits: key.key_bits,
            fingerprint: key.fingerprint,
            publicKey: key.public_key,
            encryptedPrivateKey: JSON.parse(key.encrypted_private_key),
            comment: key.comment,
            status: key.status,
            generatedAt: key.generated_at
        };
    }

    async markKeyForRotation(environmentId) {
        const query = `
            UPDATE ssh_keys 
            SET status = 'pending_rotation' 
            WHERE environment_id = ? AND status = 'active'
        `;
        
        await executeQuery(adminPool, query, [environmentId]);
    }

    async archiveOldKey(environmentId, newFingerprint) {
        const query = `
            UPDATE ssh_keys 
            SET status = 'archived', archived_at = NOW()
            WHERE environment_id = ? AND fingerprint != ? AND status IN ('active', 'pending_rotation')
        `;
        
        await executeQuery(adminPool, query, [environmentId, newFingerprint]);
    }

    startKeyRotationSchedule() {
        // Schedule automatic key rotation (if enabled)
        if (process.env.ENABLE_AUTO_KEY_ROTATION === 'true') {
            setInterval(async () => {
                try {
                    await this.performScheduledKeyRotation();
                } catch (error) {
                    logger.error('Scheduled key rotation failed:', error);
                }
            }, this.config.keyRotationInterval);
            
            logger.info('Automatic SSH key rotation scheduled');
        }
    }

    async performScheduledKeyRotation() {
        try {
            // Get environments that need key rotation
            const query = `
                SELECT DISTINCT environment_id 
                FROM ssh_keys 
                WHERE status = 'active' 
                AND generated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            
            const environments = await executeQuery(adminPool, query);
            
            for (const env of environments) {
                try {
                    await this.rotateSSHKey(env.environment_id);
                    logger.info(`Scheduled key rotation completed for ${env.environment_id}`);
                } catch (error) {
                    logger.error(`Scheduled key rotation failed for ${env.environment_id}:`, error);
                }
            }
            
        } catch (error) {
            logger.error('Scheduled key rotation process failed:', error);
        }
    }
}

// Export singleton instance
module.exports = new SecurityManager();