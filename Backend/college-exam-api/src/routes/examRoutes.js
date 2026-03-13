const express = require('express');
const examController = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleCheck');
const authValidator = require('../validators/authValidator');
const { createExamSchema, addQuestionsSchema, submitExamSchema } = require('../validators/examValidator');

const router = express.Router();

router.use(protect);

router.get('/', examController.getExams);
router.get('/:id', examController.getExamById);

router.post(
    '/',
    restrictTo('teacher', 'admin'),
    authValidator.validate(createExamSchema),
    examController.createExam
);

router.put(
    '/:id',
    restrictTo('teacher', 'admin'),
    examController.updateExam
);

router.delete(
    '/:id',
    restrictTo('teacher', 'admin'),
    examController.deleteExam
);

router.post(
    '/:id/questions',
    restrictTo('teacher', 'admin'),
    authValidator.validate(addQuestionsSchema),
    examController.addQuestions
);

router.post('/:id/attempt', restrictTo('student'), examController.attemptExam);
router.post('/:id/submit', restrictTo('student'), authValidator.validate(submitExamSchema), examController.submitExam);

module.exports = router;
