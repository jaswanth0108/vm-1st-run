const express = require('express');
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleCheck');

const router = express.Router();

router.use(protect);

router.get('/student/:examId', restrictTo('Student'), reportController.getStudentReport);
router.get('/class/:examId', restrictTo('Teacher'), reportController.getClassResults);
router.post('/generate/:submissionId', restrictTo('Teacher'), reportController.generateReport);

module.exports = router;
