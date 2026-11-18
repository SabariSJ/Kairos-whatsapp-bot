/**
 * Internal Service Authentication Middleware
 * Protects server-to-service internal APIs (e.g. WhatsApp Bot -> Common Backend)
 * Requires valid x-service-key header or Bearer token matching INTERNAL_SERVICE_KEY
 */

function requireInternalServiceAuth(req, res, next) {
  const configuredKey = process.env.INTERNAL_SERVICE_KEY || 'kairos_internal_service_key_2026_bot_auth_secret';
  
  // Accept key from x-service-key header or Authorization: Bearer <key>
  const serviceKeyHeader = req.headers['x-service-key'];
  const authHeader = req.headers['authorization'];
  let bearerKey = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerKey = authHeader.split(' ')[1];
  }

  const providedKey = serviceKeyHeader || bearerKey;

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized internal service request. Invalid or missing service key.'
    });
  }

  req.isInternalService = true;
  next();
}

module.exports = {
  requireInternalServiceAuth
};
