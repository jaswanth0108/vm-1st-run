const { z } = require('zod');

const registerSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters long"),
    username: z.string().min(3, "Username must be provided"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    role: z.enum(['Student', 'Teacher'], {
        errorMap: () => ({ message: "Role must be either 'Student' or 'Teacher'" })
    }),
    branch: z.string().optional(),
    year: z.string().optional(),
    section: z.string().optional(),
    batch: z.string().optional()
});

const bulkRegisterSchema = z.object({
    users: z.array(registerSchema).min(1, "At least one user is required")
});

const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
    role: z.enum(['student', 'admin', 'Student', 'Teacher', 'admin', 'Admin']).optional()
});

const validate = (schema) => (req, res, next) => {
    try {
        const parsed = schema.parse(req.body);
        req.body = parsed;
        next();
    } catch (err) {
        let message = 'Validation Failed';
        if (err.errors && Array.isArray(err.errors)) {
            message = err.errors.map(e => e.message).join(', ');
        } else if (err.message) {
            message = err.message;
        }
        
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: message
            }
        });
    }
};

module.exports = {
    registerSchema,
    bulkRegisterSchema,
    loginSchema,
    validate
};
