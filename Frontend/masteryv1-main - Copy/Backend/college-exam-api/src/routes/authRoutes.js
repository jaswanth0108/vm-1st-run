const express = require('express');
const authController = require('../controllers/authController');
const { registerSchema, bulkRegisterSchema, loginSchema, validate } = require('../validators/authValidator');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/bulk-register', validate(bulkRegisterSchema), authController.bulkRegister);
router.post('/login', validate(loginSchema), authController.login);

module.exports = router;
