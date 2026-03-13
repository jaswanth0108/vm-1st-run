const authService = require('../services/authService');

const register = async (req, res, next) => {
    try {
        const { name, username, password, role, branch, year, section, batch } = req.body;
        const user = await authService.registerUser(name, username, password, role, { branch, year, section, batch });

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { username, password, role } = req.body;
        const { user, token } = await authService.loginUser(username, password, role);

        res.status(200).json({
            success: true,
            data: { user, token }
        });
    } catch (error) {
        next(error);
    }
};

const bulkRegister = async (req, res, next) => {
    try {
        const { users } = req.body;
        const result = await authService.bulkRegisterUsers(users);

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    bulkRegister,
    login
};
