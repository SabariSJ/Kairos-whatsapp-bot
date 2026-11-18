const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * In-memory / Environment backed Staff User Store
 * Implements secure authentication without modifying database schema without user approval.
 */
class StaffAuthStore {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'fallback_secret_change_in_production_min_32';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
  }

  /**
   * Retrieve active staff users configured in environment
   * @returns {Array<object>}
   */
  getStaffUsers() {
    const users = [];

    const paymentEmail = process.env.PAYMENT_STAFF_EMAIL || process.env.STAFF_PAYMENT_EMAIL;
    const paymentHash = process.env.PAYMENT_STAFF_PASSWORD_HASH || process.env.STAFF_PAYMENT_PASSWORD_HASH;

    if (paymentEmail && paymentHash) {
      users.push({
        id: 'staff-payment-001',
        email: paymentEmail.toLowerCase().trim(),
        displayName: process.env.STAFF_PAYMENT_DISPLAY_NAME || 'Payment Team',
        role: 'payment_staff',
        passwordHash: paymentHash,
        active: true
      });
    }

    const reportEmail = process.env.REPORT_STAFF_EMAIL || process.env.STAFF_REPORT_EMAIL;
    const reportHash = process.env.REPORT_STAFF_PASSWORD_HASH || process.env.STAFF_REPORT_PASSWORD_HASH;

    if (reportEmail && reportHash) {
      users.push({
        id: 'staff-report-001',
        email: reportEmail.toLowerCase().trim(),
        displayName: process.env.STAFF_REPORT_DISPLAY_NAME || 'Report Team',
        role: 'report_staff',
        passwordHash: reportHash,
        active: true
      });
    }

    return users;
  }

  /**
   * Find staff member by email
   * @param {string} email 
   * @returns {object|null}
   */
  findByEmail(email) {
    if (!email) return null;
    const normalized = String(email).toLowerCase().trim();
    return this.getStaffUsers().find(u => u.email === normalized) || null;
  }

  /**
   * Authenticate staff member using bcrypt and return signed JWT
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<{ user: object, token: string }>}
   */
  async authenticate(email, password) {
    const user = this.findByEmail(email);
    if (!user) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    if (!user.active) {
      const err = new Error('Your staff account is inactive or disabled.');
      err.statusCode = 403;
      throw err;
    }

    // Secure bcrypt hash verification
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // Generate signed JWT
    const payload = {
      uid: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      algorithm: 'HS256'
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      token
    };
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token 
   * @returns {object}
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (err) {
      const error = new Error(err.name === 'TokenExpiredError' ? 'Token expired. Please log in again.' : 'Invalid token signature.');
      error.statusCode = 401;
      throw error;
    }
  }
}

module.exports = new StaffAuthStore();
