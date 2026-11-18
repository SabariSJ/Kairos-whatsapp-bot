const staffAuthStore = require('../services/staffAuthStore');

/**
 * JWT Authentication Middleware for Staff APIs
 */
function authenticateStaff(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Authorization header missing or format invalid (expected: Bearer <token>).'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = staffAuthStore.verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(err.statusCode || 401).json({
      success: false,
      error: err.message
    });
  }
}

module.exports = {
  authenticateStaff
};
