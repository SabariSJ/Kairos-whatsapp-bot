const { query, getClient } = require('../config/db');

const VALID_STATUSES = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

/**
 * Retrieve payments list with joined registration, course, and enrollment details
 * @param {object} filters 
 * @returns {Promise<Array<object>>}
 */
async function getPayments(filters = {}) {
  const { language = 'all', status, search, date } = filters;

  let sql = `
    SELECT 
      COALESCE(p.payment_id, 0) AS "paymentId",
      r.registration_id AS "registrationId",
      r.full_name AS "fullName",
      r.country_code AS "countryCode",
      r.phone_number AS "phoneNumber",
      r.email,
      r.city,
      r.profession,
      r.language,
      r.registered_at AS "registeredAt",
      COALESCE(p.status, 'Pending') AS "status",
      p.updated_by AS "updatedBy",
      p.updated_at AS "updatedAt",
      c.course_id AS "courseId",
      COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS "courseName",
      e.enrollment_id AS "enrollmentId",
      e.enrollment_status AS "enrollmentStatus"
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON r.registration_id = p.registration_id
    LEFT JOIN public.wa_courses c ON p.course_id = c.course_id
    LEFT JOIN public.wa_enrollments e ON p.payment_id = e.payment_id
    WHERE 1=1
  `;
  const params = [];

  if (language && language !== 'all') {
    params.push(language.toLowerCase().trim());
    sql += ` AND r.language = $${params.length}`;
  }

  if (status && status !== 'all') {
    params.push(status.trim());
    sql += ` AND COALESCE(p.status, 'Pending') = $${params.length}`;
  }

  if (date) {
    params.push(date.trim());
    sql += ` AND DATE(r.registered_at) = $${params.length}::date`;
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    const sIdx = params.length;
    sql += ` AND (
      r.full_name ILIKE $${sIdx} OR 
      r.email ILIKE $${sIdx} OR 
      r.phone_number ILIKE $${sIdx} OR 
      r.city ILIKE $${sIdx}
    )`;
  }

  sql += ` ORDER BY COALESCE(p.updated_at, r.registered_at) DESC, r.registered_at DESC`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Update payment status transactionally
 * @param {number|string} paymentId 
 * @param {string} newStatus 
 * @param {string} staffEmail 
 * @returns {Promise<object>}
 */
async function updatePaymentStatus(paymentId, newStatus, staffEmail) {
  if (!VALID_STATUSES.includes(newStatus)) {
    const err = new Error(`Invalid status. Permitted values: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const client = await getClient();
  let payment;

  try {
    await client.query('BEGIN');

    // 1. Locate payment record
    let payRes = await client.query(
      `SELECT * FROM public.wa_payments WHERE payment_id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (payRes.rowCount === 0) {
      // Check if paymentId was passed as a registrationId fallback
      const regCheck = await client.query(
        `SELECT * FROM public.wa_registrations WHERE registration_id = $1 FOR UPDATE`,
        [paymentId]
      );

      if (regCheck.rowCount === 0) {
        const err = new Error(`Payment record with ID ${paymentId} not found.`);
        err.statusCode = 404;
        throw err;
      }

      const reg = regCheck.rows[0];
      const courseRes = await client.query(
        `SELECT course_id FROM public.wa_courses WHERE language = $1 AND is_active = true LIMIT 1`,
        [reg.language]
      );

      const courseId = courseRes.rowCount > 0 ? courseRes.rows[0].course_id : 1;

      const newPayRes = await client.query(`
        INSERT INTO public.wa_payments (registration_id, course_id, status, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *;
      `, [reg.registration_id, courseId, newStatus, staffEmail || 'staff@sprout.com']);

      payment = newPayRes.rows[0];
    } else {
      const updateRes = await client.query(`
        UPDATE public.wa_payments
        SET 
          status = $1,
          updated_by = $2,
          updated_at = NOW()
        WHERE payment_id = $3
        RETURNING *;
      `, [newStatus, staffEmail || 'staff@sprout.com', paymentId]);

      payment = updateRes.rows[0];
    }

    // 2. Synchronize enrollment record if status changed
    if (newStatus === 'Paid') {
      const enrollCheck = await client.query(
        `SELECT * FROM public.wa_enrollments WHERE payment_id = $1`,
        [payment.payment_id]
      );

      if (enrollCheck.rowCount === 0) {
        await client.query(`
          INSERT INTO public.wa_enrollments (payment_id, registration_id, course_id, enrollment_status, enrolled_at)
          VALUES ($1, $2, $3, 'Active', NOW());
        `, [payment.payment_id, payment.registration_id, payment.course_id]);
      } else {
        await client.query(`
          UPDATE public.wa_enrollments
          SET enrollment_status = 'Active'
          WHERE payment_id = $1;
        `, [payment.payment_id]);
      }
    } else if (newStatus === 'Cancelled') {
      await client.query(`
        UPDATE public.wa_enrollments
        SET enrollment_status = 'Cancelled'
        WHERE payment_id = $1;
      `, [payment.payment_id]);
    }

    await client.query('COMMIT');

    // Invalidate chatbot memory cache so updated status takes effect immediately
    try {
      const backendStudentService = require('./backendStudentService');
      backendStudentService.clearCache();
    } catch (_) {}

    return payment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPayments,
  updatePaymentStatus
};
