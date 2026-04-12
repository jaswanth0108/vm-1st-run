const jwt = require('jsonwebtoken');
const CustomError = require('../utils/customError');

const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new CustomError('You are not logged in! Please log in to get access.', 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            ...decoded,
            userId: decoded.userId,
            role: decoded.role ? String(decoded.role).toLowerCase() : null
        };
        next();
    } catch (error) {
        return next(new CustomError('Invalid token or token has expired. Please log in again.', 401));
    }
};

module.exports = { protect };
