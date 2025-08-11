-- Migration: Create news management tables
-- Date: 2025-08-11
-- Description: Add news articles table and audit log for admin portal
-- Author: Claude Code

-- Create news articles table
CREATE TABLE IF NOT EXISTS news_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  content LONGTEXT,
  category VARCHAR(100),
  type ENUM('feature', 'update', 'fix', 'security', 'maintenance') DEFAULT 'update',
  featured BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  target_audience ENUM('all', 'practitioners', 'patients') DEFAULT 'all',
  link_url VARCHAR(500),
  link_text VARCHAR(100),
  image_url VARCHAR(500),
  publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiry_date TIMESTAMP NULL,
  author_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_active_published (active, publish_date),
  INDEX idx_target_audience (target_audience),
  INDEX idx_category (category),
  INDEX idx_type (type),
  INDEX idx_author (author_email),
  INDEX idx_featured (featured),
  INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create audit log table for news changes
CREATE TABLE IF NOT EXISTS news_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  news_article_id INT,
  action ENUM('create', 'update', 'delete', 'publish', 'unpublish') NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  changes JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (news_article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
  INDEX idx_article_action (news_article_id, action),
  INDEX idx_admin_time (admin_email, created_at),
  INDEX idx_action_time (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample news articles for testing and demonstration
INSERT IGNORE INTO news_articles (
  id, title, summary, content, category, type, featured, target_audience, author_email
) VALUES
(1, 
  'Welcome to MedPro Platform News', 
  'Stay updated with the latest MedPro platform developments, new features, and important announcements.',
  'We are excited to launch the MedPro Platform News system! This dedicated news section will keep you informed about:\n\n• New feature releases and updates\n• System maintenance and improvements\n• Security enhancements\n• Platform announcements\n• Tips and best practices\n\nStay tuned for regular updates and make sure to check back frequently for the latest news about your MedPro platform.',
  'Platform Updates',
  'feature',
  TRUE,
  'all',
  'admin@medpro.com'
),
(2,
  'Enhanced Practitioner Dashboard Released',
  'New analytics, improved patient management, and enhanced reporting capabilities now available.',
  'We have significantly enhanced the practitioner dashboard with powerful new features:\n\n**New Analytics Dashboard**\n• Real-time patient metrics\n• Appointment analytics\n• Revenue tracking\n• Performance indicators\n\n**Improved Patient Management**\n• Enhanced search and filtering\n• Batch operations for efficiency\n• Quick action buttons\n• Streamlined patient registration\n\n**Enhanced Reporting**\n• Customizable report templates\n• Export to multiple formats\n• Automated report scheduling\n• Data visualization improvements\n\nThese improvements are designed to help practitioners manage their practice more efficiently and make data-driven decisions.',
  'Features',
  'update',
  FALSE,
  'practitioners',
  'admin@medpro.com'
),
(3,
  'Security Update: Enhanced Authentication System',
  'Important security improvements to protect your practice data with multi-factor authentication.',
  'We have implemented significant security enhancements to protect your practice:\n\n**Enhanced Authentication**\n• Multi-factor authentication (MFA) support\n• Improved password policies\n• Session management improvements\n• Login attempt monitoring\n\n**Data Protection**\n• Enhanced encryption protocols\n• Secure data transmission\n• Regular security audits\n• HIPAA compliance improvements\n\n**Access Control**\n• Role-based permissions\n• Audit trail logging\n• Suspicious activity alerts\n• Automatic security updates\n\nYour data security is our top priority. Please update your passwords and enable MFA in your account settings.',
  'Security',
  'security',
  TRUE,
  'all',
  'admin@medpro.com'
),
(4,
  'Mobile App Beta Now Available',
  'Test the new MedPro mobile application for iOS and Android devices.',
  'We are thrilled to announce the beta release of the MedPro mobile application!\n\n**Available Features**\n• Patient dashboard access\n• Appointment scheduling\n• Secure messaging\n• Document viewing\n• Notification management\n\n**Beta Testing Program**\n• Limited to 100 participants initially\n• Feedback collection through in-app surveys\n• Weekly updates based on user feedback\n• Direct line to development team\n\n**How to Join**\n1. Contact your practice administrator\n2. Complete the beta testing agreement\n3. Receive download instructions\n4. Install and start testing\n\nWe value your feedback to make the mobile experience as smooth as possible. Contact support@medpro.com to join the beta program.',
  'Mobile',
  'feature',
  FALSE,
  'patients',
  'admin@medpro.com'
);

-- Update table statistics for query optimization
ANALYZE TABLE news_articles;
ANALYZE TABLE news_audit_log;