/**
 * Role-Based Access Control (RBAC) Middleware
 * Restricts access based on staff role (e.g. 'payment_staff', 'report_staff')
 * 
 * Rules:
 * - Payment Staff login MUST NOT access report APIs
 * - Report Staff login MUST NOT update payment status
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User role not found in authentication context.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access denied. Required role(s): [${allowedRoles.join(', ')}]. Your role: '${req.user.role}'.`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};
