const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { executeQuery, adminPool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(verifyToken);

// Validation middleware
const newsValidation = [
    body('title').notEmpty().trim().isLength({ min: 1, max: 255 }).withMessage('Title is required and must be less than 255 characters'),
    body('summary').optional().trim().isLength({ max: 1000 }).withMessage('Summary must be less than 1000 characters'),
    body('content').optional().trim(),
    body('category').optional().trim().isLength({ max: 100 }).withMessage('Category must be less than 100 characters'),
    body('type').optional().isIn(['feature', 'update', 'fix', 'security', 'maintenance']).withMessage('Invalid news type'),
    body('featured').optional().isBoolean().withMessage('Featured must be a boolean'),
    body('active').optional().isBoolean().withMessage('Active must be a boolean'),
    body('target_audience').optional().isIn(['all', 'practitioners', 'patients']).withMessage('Invalid target audience'),
    body('link_url').optional().isURL().withMessage('Link URL must be valid'),
    body('link_text').optional().trim().isLength({ max: 100 }).withMessage('Link text must be less than 100 characters'),
    body('image_url').optional().isURL().withMessage('Image URL must be valid'),
    body('publish_date').optional().isISO8601().withMessage('Publish date must be valid ISO8601 format'),
    body('expiry_date').optional().isISO8601().withMessage('Expiry date must be valid ISO8601 format')
];

// List news articles with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            type,
            status,
            target_audience,
            search,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        // Validate pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20)); // Max 100 items per page
        const offset = (pageNum - 1) * limitNum;

        // Validate sort parameters
        const allowedSortBy = ['created_at', 'updated_at', 'publish_date', 'title', 'category', 'type'];
        const allowedSortOrder = ['ASC', 'DESC'];
        const sortBy = allowedSortBy.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = allowedSortOrder.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];

        if (category) {
            whereConditions.push('category = ?');
            queryParams.push(category);
        }

        if (type) {
            whereConditions.push('type = ?');
            queryParams.push(type);
        }

        if (status) {
            if (status === 'active') {
                whereConditions.push('active = 1');
            } else if (status === 'inactive') {
                whereConditions.push('active = 0');
            }
        }

        if (target_audience) {
            whereConditions.push('target_audience = ?');
            queryParams.push(target_audience);
        }

        if (search) {
            whereConditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as total FROM news_articles ${whereClause}`;
        const countResult = await executeQuery(adminPool, countQuery, queryParams);
        const total = countResult[0].total;

        // Get articles
        const articlesQuery = `
            SELECT 
                id, title, summary, category, type, featured, active, target_audience,
                link_url, link_text, image_url, publish_date, expiry_date, author_email,
                created_at, updated_at
            FROM news_articles 
            ${whereClause}
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ${parseInt(limitNum)} OFFSET ${parseInt(offset)}
        `;

        const articles = await executeQuery(adminPool, articlesQuery, queryParams);

        // Calculate pagination info
        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            data: {
                articles,
                pagination: {
                    current_page: pageNum,
                    per_page: limitNum,
                    total_items: total,
                    total_pages: totalPages,
                    has_prev: pageNum > 1,
                    has_next: pageNum < totalPages
                }
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News articles listed', {
            user: req.user.email,
            filters: { category, type, status, target_audience, search },
            pagination: { page: pageNum, limit: limitNum, total }
        });

    } catch (error) {
        logger.error('Error listing news articles', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve news articles',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get single news article
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid article ID'
            });
        }

        const query = `
            SELECT 
                id, title, summary, content, category, type, featured, active, 
                target_audience, link_url, link_text, image_url, publish_date, 
                expiry_date, author_email, created_at, updated_at
            FROM news_articles 
            WHERE id = ?
        `;

        const articles = await executeQuery(adminPool, query, [id]);

        if (articles.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article not found'
            });
        }

        res.json({
            success: true,
            data: {
                article: articles[0]
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News article retrieved', {
            user: req.user.email,
            articleId: id
        });

    } catch (error) {
        logger.error('Error retrieving news article', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve news article',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create new news article
router.post('/', newsValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const {
            title,
            summary = null,
            content = null,
            category = null,
            type = 'update',
            featured = false,
            active = true,
            target_audience = 'all',
            link_url = null,
            link_text = null,
            image_url = null,
            publish_date = null,
            expiry_date = null
        } = req.body;

        const author_email = req.user.email;

        const query = `
            INSERT INTO news_articles 
            (title, summary, content, category, type, featured, active, target_audience, 
             link_url, link_text, image_url, publish_date, expiry_date, author_email)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            title, summary, content, category, type, featured, active, target_audience,
            link_url, link_text, image_url, publish_date, expiry_date, author_email
        ];

        const result = await executeQuery(adminPool, query, values);
        const articleId = result.insertId;

        // Log audit trail
        await logNewsAudit(articleId, 'create', author_email, { 
            title, summary, category, type, featured, active, target_audience 
        });

        res.status(201).json({
            success: true,
            data: {
                id: articleId,
                message: 'News article created successfully'
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News article created', {
            user: req.user.email,
            articleId,
            title,
            category,
            type
        });

    } catch (error) {
        logger.error('Error creating news article', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create news article',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update news article
router.put('/:id', newsValidation, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid article ID'
            });
        }

        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        // Check if article exists
        const existingArticle = await executeQuery(
            adminPool, 
            'SELECT * FROM news_articles WHERE id = ?', 
            [id]
        );

        if (existingArticle.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article not found'
            });
        }

        // Build update query dynamically based on provided fields
        const updateFields = [];
        const updateValues = [];
        const allowedFields = [
            'title', 'summary', 'content', 'category', 'type', 'featured', 
            'active', 'target_audience', 'link_url', 'link_text', 'image_url', 
            'publish_date', 'expiry_date'
        ];

        allowedFields.forEach(field => {
            if (req.body.hasOwnProperty(field)) {
                updateFields.push(`${field} = ?`);
                updateValues.push(req.body[field]);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields provided for update'
            });
        }

        // Add updated_at field
        updateFields.push('updated_at = CURRENT_TIMESTAMP');

        const query = `
            UPDATE news_articles 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;

        updateValues.push(id);

        await executeQuery(adminPool, query, updateValues);

        // Log audit trail
        await logNewsAudit(id, 'update', req.user.email, req.body);

        res.json({
            success: true,
            data: {
                id: parseInt(id),
                message: 'News article updated successfully'
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News article updated', {
            user: req.user.email,
            articleId: id,
            updatedFields: Object.keys(req.body)
        });

    } catch (error) {
        logger.error('Error updating news article', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update news article',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Delete news article
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid article ID'
            });
        }

        // Check if article exists
        const existingArticle = await executeQuery(
            adminPool,
            'SELECT * FROM news_articles WHERE id = ?',
            [id]
        );

        if (existingArticle.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article not found'
            });
        }

        // Log audit trail before deletion
        await logNewsAudit(id, 'delete', req.user.email, { 
            title: existingArticle[0].title,
            category: existingArticle[0].category 
        });

        // Delete the article
        await executeQuery(adminPool, 'DELETE FROM news_articles WHERE id = ?', [id]);

        res.json({
            success: true,
            data: {
                id: parseInt(id),
                message: 'News article deleted successfully'
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News article deleted', {
            user: req.user.email,
            articleId: id,
            title: existingArticle[0].title
        });

    } catch (error) {
        logger.error('Error deleting news article', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete news article',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Publish/unpublish news article
router.post('/:id/publish', async (req, res) => {
    try {
        const { id } = req.params;
        const { published } = req.body;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid article ID'
            });
        }

        if (typeof published !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Published field must be a boolean'
            });
        }

        // Check if article exists
        const existingArticle = await executeQuery(
            adminPool,
            'SELECT * FROM news_articles WHERE id = ?',
            [id]
        );

        if (existingArticle.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article not found'
            });
        }

        // Update the active status and publish date
        const query = `
            UPDATE news_articles 
            SET active = ?, 
                publish_date = CASE 
                    WHEN ? = 1 AND publish_date IS NULL THEN CURRENT_TIMESTAMP 
                    ELSE publish_date 
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        await executeQuery(adminPool, query, [published, published, id]);

        // Log audit trail
        const action = published ? 'publish' : 'unpublish';
        await logNewsAudit(id, action, req.user.email, { published });

        res.json({
            success: true,
            data: {
                id: parseInt(id),
                published,
                message: `News article ${published ? 'published' : 'unpublished'} successfully`
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

        logger.info('News article publish status changed', {
            user: req.user.email,
            articleId: id,
            published,
            title: existingArticle[0].title
        });

    } catch (error) {
        logger.error('Error changing publish status', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change publish status',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get article categories (for filter dropdowns)
router.get('/meta/categories', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT category 
            FROM news_articles 
            WHERE category IS NOT NULL AND category != ''
            ORDER BY category
        `;

        const result = await executeQuery(adminPool, query);
        const categories = result.map(row => row.category);

        res.json({
            success: true,
            data: {
                categories
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.id
            }
        });

    } catch (error) {
        logger.error('Error retrieving categories', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve categories'
        });
    }
});

// Helper function to log audit trail
async function logNewsAudit(articleId, action, adminEmail, changes) {
    try {
        const query = `
            INSERT INTO news_audit_log (news_article_id, action, admin_email, changes)
            VALUES (?, ?, ?, ?)
        `;

        await executeQuery(adminPool, query, [
            articleId,
            action,
            adminEmail,
            JSON.stringify(changes)
        ]);
    } catch (error) {
        logger.error('Failed to log news audit trail', error);
        // Don't throw error as this shouldn't fail the main operation
    }
}

module.exports = router;