const staffAuthStore = require('../services/staffAuthStore');

/**
 * Handle staff login
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const result = await staffAuthStore.authenticate(email, password);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get currently authenticated staff profile
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  getMe
};
