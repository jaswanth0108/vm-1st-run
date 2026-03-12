const { z } = require('zod');

const createExamSchema = z.object({
    title: z.string().min(3, "Title must be at least 3 characters long"),
    subject: z.string().optional(),
    description: z.string().optional(),
    // Frontend sends duration as string or number 
    duration: z.union([z.string(), z.number()]).optional(),
    duration_minutes: z.number().int().positive().optional(),
    // Optional timestamp fields (if not provided, backend defaults to now)
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    // Status field from admin dashboard
    status: z.string().optional(),
    branch: z.union([z.string(), z.array(z.string())]).optional(),
    batch: z.union([z.string(), z.array(z.string())]).optional(),
    year: z.string().optional(),
    attemptLimit: z.number().optional(),
    // Questions can be included in same payload
    questions: z.array(z.any()).optional()
});

const questionSchema = z.object({
    type: z.enum(['MCQ', 'Descriptive', 'Coding']),
    problem_statement: z.string().min(5, "Problem statement is too short"),
    mcq_options: z.record(z.string(), z.string()).optional().nullable(),
    correct_answer: z.string().optional().nullable(),
    marks: z.number().int().positive().default(1),
    test_cases: z.array(z.object({
        input: z.string(),
        expected_output: z.string()
    })).optional().nullable()
});

const addQuestionsSchema = z.object({
    questions: z.array(questionSchema).min(1, "At least one question is required")
});

const submitExamSchema = z.object({
    answers: z.array(z.object({
        question_id: z.number().int(),
        student_answer: z.string()
    }))
});

module.exports = {
    createExamSchema,
    addQuestionsSchema,
    submitExamSchema
};
