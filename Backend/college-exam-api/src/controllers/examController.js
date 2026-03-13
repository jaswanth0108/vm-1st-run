const examService = require('../services/examService');
const CustomError = require('../utils/customError');

const createExam = async (req, res, next) => {
    try {
        const teacherId = req.user.userId;
        const examData = req.body;

        const newExam = await examService.createExam(teacherId, examData);

        res.status(201).json({
            success: true,
            data: newExam
        });
    } catch (error) {
        next(error);
    }
};

const getExams = async (req, res, next) => {
    try {
        const exams = await examService.getExams();
        res.status(200).json({
            success: true,
            data: exams
        });
    } catch (error) {
        next(error);
    }
};

const getExamById = async (req, res, next) => {
    try {
        const exam = await examService.getExamById(req.params.id);
        res.status(200).json({
            success: true,
            data: exam
        });
    } catch (error) {
        next(error);
    }
};

const updateExam = async (req, res, next) => {
    try {
        const exam = await examService.updateExam(req.params.id, req.body);
        res.status(200).json({
            success: true,
            data: exam
        });
    } catch (error) {
        next(error);
    }
};

const deleteExam = async (req, res, next) => {
    try {
        const result = await examService.deleteExam(req.params.id);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const addQuestions = async (req, res, next) => {
    try {
        const examId = req.params.id;
        const { questions } = req.body;

        const result = await examService.addQuestions(examId, questions);

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const attemptExam = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const examId = req.params.id;
        const data = await examService.attemptExam(studentId, examId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const submitExam = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const examId = req.params.id;
        const { answers } = req.body;
        const data = await examService.submitExam(studentId, examId, answers);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createExam,
    getExams,
    getExamById,
    updateExam,
    deleteExam,
    addQuestions,
    attemptExam,
    submitExam
};
