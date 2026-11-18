const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticateStaff } = require('../middleware/authMiddleware');

// Login rate limiter: 10 attempts per 15 minutes window
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  }
});

router.post('/login', loginLimiter, authController.login);
router.get('/me', authenticateStaff, authController.getMe);

module.exports = router;
