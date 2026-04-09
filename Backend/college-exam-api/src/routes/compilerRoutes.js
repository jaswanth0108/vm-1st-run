const express = require('express');
const { runCode } = require('../services/compilerService');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/compile
 * Body: { language: string, code: string, input: string }
 * Response: { success: true, output: string, error: string|null }
 * 
 * Security: Requires JWT authentication
 */
router.post('/', protect, async (req, res) => {
    const { language, code, input } = req.body;

    if (!language || !code) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: language and code are required.'
        });
    }

    try {
        const result = await runCode(language, code, input || '');
        return res.json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            output: '',
            error: err.message
        });
    }
});

module.exports = router;
