const reportService = require('../services/reportService');

const generateReport = async (req, res, next) => {
    try {
        const submissionId = req.params.submissionId;
        const data = await reportService.generateReport(submissionId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getStudentReport = async (req, res, next) => {
    try {
        const studentId = req.user.userId;
        const examId = req.params.examId;
        const data = await reportService.getStudentReport(studentId, examId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getClassResults = async (req, res, next) => {
    try {
        const examId = req.params.examId;
        const data = await reportService.getClassResults(examId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getAllReports = async (req, res, next) => {
    try {
        const data = await reportService.getAllReports();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    generateReport,
    getStudentReport,
    getClassResults,
    getAllReports
};
