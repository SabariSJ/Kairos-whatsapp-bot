const registrationService = require('../services/registrationService');

/**
 * Handle new student registration
 * POST /api/registrations
 */
async function registerStudent(req, res, next) {
  try {
    const student = await registrationService.createRegistration(req.body);

    return res.status(201).json({
      success: true,
      message: student.language === 'fr' 
        ? 'Inscription effectuée avec succès.' 
        : 'Registration completed successfully.',
      registration: student
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        errorType: err.errorType || 'ERROR',
        error: err.message
      });
    }
    next(err);
  }
}

module.exports = {
  registerStudent
};
