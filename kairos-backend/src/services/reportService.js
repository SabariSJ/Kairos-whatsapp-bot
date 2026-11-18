const { query } = require('../config/db');

/**
 * Retrieve aggregated statistics and chart data for Report Staff
 * @param {object} filters 
 * @returns {Promise<object>}
 */
async function getSummaryReport(filters = {}) {
  const { language = 'all', startDate, endDate } = filters;

  const baseParams = [];
  let whereClauses = [];

  if (language && language !== 'all') {
    baseParams.push(language.toLowerCase().trim());
    whereClauses.push(`r.language = $${baseParams.length}`);
  }

  if (startDate) {
    baseParams.push(startDate.trim());
    whereClauses.push(`DATE(r.registered_at) >= $${baseParams.length}::date`);
  }

  if (endDate) {
    baseParams.push(endDate.trim());
    whereClauses.push(`DATE(r.registered_at) <= $${baseParams.length}::date`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. KPI Counts
  const kpiSql = `
    SELECT 
      COUNT(*)::int AS total,
      COUNT(CASE WHEN r.language = 'en' THEN 1 END)::int AS "englishCount",
      COUNT(CASE WHEN r.language = 'fr' THEN 1 END)::int AS "frenchCount",
      COUNT(CASE WHEN DATE(r.registered_at) = CURRENT_DATE THEN 1 END)::int AS "today",
      COUNT(CASE WHEN DATE(r.registered_at) = CURRENT_DATE - INTERVAL '1 day' THEN 1 END)::int AS "yesterday",
      COUNT(CASE WHEN r.registered_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 END)::int AS "thisWeek",
      COUNT(CASE WHEN r.registered_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week' AND r.registered_at < DATE_TRUNC('week', CURRENT_DATE) THEN 1 END)::int AS "lastWeek",
      COUNT(CASE WHEN r.registered_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END)::int AS "thisMonth"
    FROM public.wa_registrations r
    ${whereSql};
  `;
  const kpiRes = await query(kpiSql, baseParams);
  const kpis = kpiRes.rows[0] || {};

  // 2. Status Breakdown
  const statusSql = `
    SELECT 
      COALESCE(p.status, 'Pending') AS status,
      COUNT(r.registration_id)::int AS count
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON r.registration_id = p.registration_id
    ${whereSql}
    GROUP BY COALESCE(p.status, 'Pending')
    ORDER BY count DESC;
  `;
  const statusRes = await query(statusSql, baseParams);
  const statusCounts = {
    Pending: 0,
    Contacted: 0,
    Confirmed: 0,
    Paid: 0,
    Cancelled: 0
  };
  statusRes.rows.forEach(r => {
    statusCounts[r.status] = r.count;
  });

  // 3. Profession Breakdown (Top Occupations)
  const professionSql = `
    SELECT 
      r.profession,
      COUNT(r.registration_id)::int AS count
    FROM public.wa_registrations r
    ${whereSql}
    GROUP BY r.profession
    ORDER BY count DESC;
  `;
  const professionRes = await query(professionSql, baseParams);

  // 4. Daily Registrations Trend (Time-Series for Chart.js Line Chart)
  const dailySql = `
    SELECT 
      TO_CHAR(r.registered_at, 'YYYY-MM-DD') AS date,
      COUNT(r.registration_id)::int AS count
    FROM public.wa_registrations r
    ${whereSql}
    GROUP BY TO_CHAR(r.registered_at, 'YYYY-MM-DD')
    ORDER BY date ASC;
  `;
  const dailyRes = await query(dailySql, baseParams);

  // 5. Course Breakdown
  const courseSql = `
    SELECT 
      COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS "courseName",
      COUNT(r.registration_id)::int AS count
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON r.registration_id = p.registration_id
    LEFT JOIN public.wa_courses c ON p.course_id = c.course_id
    ${whereSql}
    GROUP BY 1
    ORDER BY count DESC;
  `;
  const courseRes = await query(courseSql, baseParams);

  return {
    kpis,
    statusCounts,
    professionBreakdown: professionRes.rows,
    dailyTrend: dailyRes.rows,
    courseBreakdown: courseRes.rows
  };
}

/**
 * Retrieve raw registration records formatted for Excel/CSV export
 * @param {object} filters 
 * @returns {Promise<Array<object>>}
 */
async function getExportRecords(filters = {}) {
  const { language = 'all', startDate, endDate } = filters;

  const baseParams = [];
  let whereClauses = [];

  if (language && language !== 'all') {
    baseParams.push(language.toLowerCase().trim());
    whereClauses.push(`r.language = $${baseParams.length}`);
  }

  if (startDate) {
    baseParams.push(startDate.trim());
    whereClauses.push(`DATE(r.registered_at) >= $${baseParams.length}::date`);
  }

  if (endDate) {
    baseParams.push(endDate.trim());
    whereClauses.push(`DATE(r.registered_at) <= $${baseParams.length}::date`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT 
      r.registration_id AS "registrationId",
      r.full_name AS "fullName",
      r.country_code AS "countryCode",
      r.phone_number AS "phoneNumber",
      r.email,
      r.city,
      r.profession,
      r.language,
      r.registered_at AS "registeredAt",
      COALESCE(p.status, 'Pending') AS "paymentStatus",
      p.updated_by AS "statusUpdatedBy",
      p.updated_at AS "statusUpdatedAt",
      COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS "courseName"
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON r.registration_id = p.registration_id
    LEFT JOIN public.wa_courses c ON p.course_id = c.course_id
    ${whereSql}
    ORDER BY r.registered_at DESC;
  `;

  const result = await query(sql, baseParams);
  return result.rows;
}

module.exports = {
  getSummaryReport,
  getExportRecords
};
