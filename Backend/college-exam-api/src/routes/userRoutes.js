const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleCheck');

const router = express.Router();

router.use(protect);
router.get('/', restrictTo('admin', 'teacher'), authController.getUsers);

module.exports = router;
