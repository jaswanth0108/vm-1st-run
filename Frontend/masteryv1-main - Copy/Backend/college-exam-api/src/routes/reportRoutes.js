const express = require('express');
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleCheck');

const router = express.Router();

router.use(protect);

router.get('/student/:examId', restrictTo('student', 'Student'), reportController.getStudentReport);
router.get('/class/:examId', restrictTo('teacher', 'Teacher', 'admin', 'Admin'), reportController.getClassResults);
router.post('/generate/:submissionId', restrictTo('teacher', 'Teacher', 'admin', 'Admin'), reportController.generateReport);
router.get('/', restrictTo('teacher', 'Teacher', 'admin', 'Admin', 'student', 'Student'), reportController.getAllReports);

module.exports = router;
