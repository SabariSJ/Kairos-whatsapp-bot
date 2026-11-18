const { query, getClient } = require('../config/db');
const notificationService = require('./notificationService');

const VALID_STATUSES = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

/**
 * Retrieve payments list with joined registration, course, and notification details
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
      e.enrollment_status AS "enrollmentStatus",
      n.notification_id AS "notificationId",
      COALESCE(n.status, CASE WHEN p.status = 'Paid' THEN 'Pending' ELSE 'Not Triggered' END) AS "notificationStatus",
      n.meta_message_id AS "metaMessageId",
      n.error_message AS "notificationError",
      COALESCE(n.attempt_count, 0) AS "notificationAttempts",
      COALESCE(n.consent_status, 'opted_in') AS "consentStatus"
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON r.registration_id = p.registration_id
    LEFT JOIN public.wa_courses c ON p.course_id = c.course_id
    LEFT JOIN public.wa_enrollments e ON p.payment_id = e.payment_id
    LEFT JOIN public.wa_notifications n ON p.payment_id = n.payment_id
    WHERE 1=1
  `;
  const params = [];

  if (language && language !== 'all') {
    params.push(language.toLowerCase().trim());
    sql += ` AND r.language = $${params.length}`;
  }

  if (status) {
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
 * Update payment status using a transactional workflow
 * Safely creates or activates enrollment when status = 'Paid'
 * Automatically triggers WhatsApp confirmation notification after successful commit
 * 
 * @param {number|string} paymentId 
 * @param {string} newStatus 
 * @param {string} staffEmail 
 * @param {object} [options] { forceNotification: boolean, hasConsent: boolean, consent: string }
 * @returns {Promise<object>}
 */
async function updatePaymentStatus(paymentId, newStatus, staffEmail, options = {}) {
  if (!VALID_STATUSES.includes(newStatus)) {
    const err = new Error(`Invalid status. Permitted values: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const client = await getClient();
  let payment;
  let enrollment = null;
  let previousStatus = null;

  try {
    await client.query('BEGIN');

    // 1. Locate payment record with row lock
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
      // Find course for student's language
      const courseRes = await client.query(
        `SELECT course_id FROM public.wa_courses WHERE language = $1 AND is_active = true LIMIT 1`,
        [reg.language]
      );

      if (courseRes.rowCount === 0) {
        const err = new Error(`No active course found for language '${reg.language}'.`);
        err.statusCode = 400;
        throw err;
      }

      const courseId = courseRes.rows[0].course_id;

      // Insert new payment record
      const newPayRes = await client.query(`
        INSERT INTO public.wa_payments (registration_id, course_id, status, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *;
      `, [reg.registration_id, courseId, newStatus, staffEmail]);

      payment = newPayRes.rows[0];
    } else {
      previousStatus = payRes.rows[0].status;

      // Update existing payment
      const updateRes = await client.query(`
        UPDATE public.wa_payments
        SET 
          status = $1,
          updated_by = $2,
          updated_at = NOW()
        WHERE payment_id = $3
        RETURNING *;
      `, [newStatus, staffEmail, paymentId]);

      payment = updateRes.rows[0];
    }

    // 2. Transactional Enrolment Workflow
    if (newStatus === 'Paid') {
      // Check if enrollment exists
      const enrCheck = await client.query(`
        SELECT * FROM public.wa_enrollments
        WHERE registration_id = $1 AND course_id = $2
        FOR UPDATE;
      `, [payment.registration_id, payment.course_id]);

      if (enrCheck.rowCount > 0) {
        // Activate existing enrollment
        const enrUpdate = await client.query(`
          UPDATE public.wa_enrollments
          SET 
            enrollment_status = 'Active',
            payment_id = $1,
            enrolled_at = NOW()
          WHERE enrollment_id = $2
          RETURNING *;
        `, [payment.payment_id, enrCheck.rows[0].enrollment_id]);
        enrollment = enrUpdate.rows[0];
      } else {
        // Create new enrollment
        const enrInsert = await client.query(`
          INSERT INTO public.wa_enrollments (
            registration_id,
            course_id,
            payment_id,
            course_start_date,
            enrollment_status,
            enrolled_at
          )
          VALUES ($1, $2, $3, CURRENT_DATE, 'Active', NOW())
          RETURNING *;
        `, [payment.registration_id, payment.course_id, payment.payment_id]);
        enrollment = enrInsert.rows[0];
      }
    } else {
      // For non-Paid statuses (e.g. Cancelled), update enrollment if exists
      const enrCheck = await client.query(`
        SELECT enrollment_id FROM public.wa_enrollments
        WHERE registration_id = $1 AND course_id = $2
        FOR UPDATE;
      `, [payment.registration_id, payment.course_id]);

      if (enrCheck.rowCount > 0) {
        const enrUpdate = await client.query(`
          UPDATE public.wa_enrollments
          SET enrollment_status = $1
          WHERE enrollment_id = $2
          RETURNING *;
        `, [newStatus, enrCheck.rows[0].enrollment_id]);
        enrollment = enrUpdate.rows[0];
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 3. Automatic WhatsApp Notification (Only AFTER database transaction commit)
  let notificationResult = null;
  if (newStatus === 'Paid') {
    if (previousStatus === 'Paid' && !options.forceNotification) {
      // Repeated selection of Paid does not re-trigger notification
      notificationResult = {
        triggered: false,
        duplicate: true,
        reason: 'Payment was already Paid. Repeated selection does not re-trigger notification.'
      };
    } else {
      // Automatically trigger payment confirmation notification
      try {
        notificationResult = await notificationService.triggerPaymentNotification(
          payment.payment_id,
          { staffEmail, ...options }
        );
      } catch (notifErr) {
        console.error(`[Automatic Notification Error] Failed to trigger notification for payment #${payment.payment_id}:`, notifErr.message);
        notificationResult = {
          triggered: false,
          status: 'Failed',
          error: notifErr.message
        };
      }
    }
  }

  return {
    payment: {
      paymentId: payment.payment_id,
      registrationId: payment.registration_id,
      courseId: payment.course_id,
      status: payment.status,
      updatedBy: payment.updated_by,
      updatedAt: payment.updated_at
    },
    enrollment: enrollment ? {
      enrollmentId: enrollment.enrollment_id,
      status: enrollment.enrollment_status,
      courseStartDate: enrollment.course_start_date,
      enrolledAt: enrollment.enrolled_at
    } : null,
    notification: notificationResult
  };
}

module.exports = {
  getPayments,
  updatePaymentStatus
};
