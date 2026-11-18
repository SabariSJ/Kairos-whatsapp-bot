const { query } = require('../config/db');

/**
 * Retrieve active courses from wa_courses
 * @param {string} [language] 'en' | 'fr' | 'all'
 * @returns {Promise<Array<object>>}
 */
async function getActiveCourses(language) {
  let sql = `
    SELECT 
      course_id AS "courseId",
      course_name AS "courseName",
      language,
      is_active AS "isActive"
    FROM public.wa_courses
    WHERE is_active = true
  `;
  const params = [];

  if (language && language !== 'all') {
    params.push(language.toLowerCase());
    sql += ` AND language = $${params.length}`;
  }

  sql += ` ORDER BY course_id ASC`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Find course by ID
 * @param {number|string} courseId 
 * @returns {Promise<object|null>}
 */
async function getCourseById(courseId) {
  const result = await query(`
    SELECT 
      course_id AS "courseId",
      course_name AS "courseName",
      language,
      is_active AS "isActive"
    FROM public.wa_courses
    WHERE course_id = $1
  `, [courseId]);

  return result.rows[0] || null;
}

module.exports = {
  getActiveCourses,
  getCourseById
};
