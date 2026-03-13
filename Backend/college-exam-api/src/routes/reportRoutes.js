const express = require('express');
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleCheck');

const router = express.Router();

router.use(protect);

router.get('/student/:examId', restrictTo('student'), reportController.getStudentReport);
router.get('/class/:examId', restrictTo('teacher', 'admin'), reportController.getClassResults);
router.post('/generate/:submissionId', restrictTo('teacher', 'admin'), reportController.generateReport);
router.get('/', restrictTo('teacher', 'admin'), reportController.getAllReports);

module.exports = router;
