const studentLookupService = require('../services/studentLookupService');

/**
 * Handle Authoritative Student Lookup by Phone
 * GET /api/internal/students/by-phone
 * Protected by requireInternalServiceAuth
 */
async function getStudentByPhone(req, res, next) {
  try {
    const countryCode = req.query.country_code || req.query.countryCode;
    const phoneNumber = req.query.phone_number || req.query.phoneNumber;
    const rawPhone = req.query.raw_phone || req.query.rawPhone || req.query.phone;

    if (!rawPhone && (!countryCode || !phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Either (country_code and phone_number) or raw_phone query parameter is required.'
      });
    }

    const student = await studentLookupService.lookupStudentByPhone({
      countryCode,
      phoneNumber,
      rawPhone
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found with specified phone number.',
        student: null
      });
    }

    return res.status(200).json({
      success: true,
      student
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
}

module.exports = {
  getStudentByPhone
};
