const courseService = require('../services/courseService');

/**
 * GET /api/courses?language=en|fr
 */
async function getCourses(req, res, next) {
  try {
    const { language } = req.query;

    if (language && !['en', 'fr', 'all'].includes(language.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: "Invalid language parameter. Permitted values: 'en', 'fr', or 'all'."
      });
    }

    const courses = await courseService.getActiveCourses(language);

    return res.status(200).json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCourses
};
