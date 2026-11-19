const { query, getClient } = require('../config/db');
const whatsappService = require('./whatsappService');

const VALID_STATUSES = ['Pending', 'Contacted', 'Confirmed', 'Paid', 'Cancelled'];

/**
 * Format phone to international E.164 digits without '+' (e.g. +91 9500406150 -> 919500406150)
 */
function formatE164Phone(countryCode, phoneNumber) {
  const cc = String(countryCode || '').replace(/\D/g, '');
  const phone = String(phoneNumber || '').replace(/\D/g, '');
  if (!phone) return '';
  if (cc && phone.startsWith(cc) && phone.length > 10) return phone;
  if (cc) return `${cc}${phone}`;
  if (phone.length === 10 && ['6', '7', '8', '9'].includes(phone[0])) return `91${phone}`;
  return phone;
}

/**
 * Dispatch one-time payment confirmation message to the student via WhatsApp
 * and record the dispatch in wa_notifications.
 * @param {object} payment
 */
async function dispatchPaymentConfirmationNotification(payment) {
  if (!payment || !payment.payment_id || !payment.registration_id) return;

  try {
    // 1. Check if a confirmation notification has already been successfully sent for this payment
    const notifCheck = await query(`
      SELECT notification_id FROM public.wa_notifications
      WHERE payment_id = $1 AND template_name = 'payment_confirmed' AND status = 'Sent'
      LIMIT 1
    `, [payment.payment_id]);

    if (notifCheck.rows.length > 0) {
      console.log(`[Payment Staff Notification] Payment confirmation already sent for payment #${payment.payment_id}. Skipping duplicate send.`);
      return;
    }

    // 2. Fetch student details and course details
    const studentRes = await query(`
      SELECT 
        r.registration_id,
        r.full_name,
        r.country_code,
        r.phone_number,
        r.language,
        COALESCE(
          c.course_name,
          (SELECT course_name FROM public.wa_courses WHERE language = r.language AND is_active = true LIMIT 1),
          (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)
        ) AS course_name
      FROM public.wa_registrations r
      LEFT JOIN public.wa_courses c ON c.course_id = $2
      WHERE r.registration_id = $1
    `, [payment.registration_id, payment.course_id]);

    if (studentRes.rows.length === 0) {
      console.warn(`[Payment Staff Notification] Registration record #${payment.registration_id} not found.`);
      return;
    }

    const student = studentRes.rows[0];
    const studentName = (student.full_name || 'Student').trim();
    const courseName = (student.course_name || (student.language === 'fr' ? 'Cours de Réussite Commerciale' : 'Business Success Class')).trim();
    const isFrench = String(student.language || '').toLowerCase().trim() === 'fr';

    // 3. Compose exact message template as requested
    let confirmationText = '';
    if (isFrench) {
      confirmationText = 
`Bonjour ${studentName} ! 🎉

Votre paiement pour ${courseName} a été confirmé avec succès.

Votre inscription est maintenant active. Vous pouvez accéder à votre formation via la plateforme d’apprentissage WhatsApp Kairos.

Bonne formation ! 📚✨

— L’équipe Kairos`;
    } else {
      confirmationText = 
`Hello ${studentName}! 🎉

Your payment for ${courseName} has been confirmed successfully.

Your enrolment is now active. You can access your course through the Kairos WhatsApp Learning Platform.

Happy Learning! 📚✨

— Team Kairos`;
    }

    // 4. Construct clean international phone number
    const targetPhone = formatE164Phone(student.country_code, student.phone_number);
    if (!targetPhone) {
      console.error(`[Payment Staff Notification] Invalid phone for student #${student.registration_id}`);
      return;
    }

    console.log(`[Payment Staff Notification] Sending one-time Paid confirmation WhatsApp message to +${targetPhone} (${student.language})...`);

    // 5. Send WhatsApp message
    let sendResult = null;
    let sendError = null;
    try {
      sendResult = await whatsappService.sendTextMessage(targetPhone, confirmationText);
    } catch (err) {
      sendError = err.message;
      console.error(`[Payment Staff Notification] WhatsApp send failed:`, err.message);
    }

    const sendSuccess = Boolean(sendResult && (sendResult.messages || sendResult.messaging_product));
    const metaMsgId = sendResult?.messages?.[0]?.id || null;

    // 6. Record notification attempt in wa_notifications
    try {
      await query(`
        INSERT INTO public.wa_notifications (
          payment_id, registration_id, phone_e164, template_name, language,
          consent_status, status, meta_message_id, error_message, attempt_count,
          last_attempt_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'payment_confirmed', $4, 'opted_in', $5, $6, $7, 1, NOW(), NOW(), NOW())
      `, [
        payment.payment_id,
        payment.registration_id,
        targetPhone,
        student.language || 'en',
        sendSuccess ? 'Sent' : 'Failed',
        metaMsgId,
        sendSuccess ? null : (sendError || 'Failed to dispatch via WhatsApp Cloud API')
      ]);

      console.log(`[Payment Staff Notification] Logged to wa_notifications: status = ${sendSuccess ? 'Sent' : 'Failed'}, metaId = ${metaMsgId}`);
    } catch (dbErr) {
      console.error(`[Payment Staff Notification] Failed to record in wa_notifications:`, dbErr.message);
    }
  } catch (err) {
    console.error(`[Payment Staff Notification Error]:`, err.message);
  }
}

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
  let previousStatus = null;

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
      previousStatus = 'Pending';
    } else {
      previousStatus = payRes.rows[0].status;
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

    // One-time WhatsApp confirmation dispatch when payment status becomes 'Paid'
    if (newStatus === 'Paid' && previousStatus !== 'Paid') {
      try {
        await dispatchPaymentConfirmationNotification(payment);
      } catch (notifErr) {
        console.error('[Payment Staff Notification Dispatch Error]:', notifErr.message);
      }
    }

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
