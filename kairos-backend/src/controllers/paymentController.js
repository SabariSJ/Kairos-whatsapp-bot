const paymentService = require('../services/paymentService');

/**
 * GET /api/staff/payments?language=all|en|fr&status=...&search=...&date=...
 * Protected: requires 'payment_staff' role
 */
async function getPayments(req, res, next) {
  try {
    const { language = 'all', status, search, date } = req.query;

    if (language && !['all', 'en', 'fr'].includes(language.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: "Invalid language parameter. Permitted values: 'all', 'en', 'fr'."
      });
    }

    const payments = await paymentService.getPayments({
      language,
      status,
      search,
      date
    });

    return res.status(200).json({
      success: true,
      count: payments.length,
      filters: { language, status: status || 'all', search: search || '', date: date || '' },
      payments
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/staff/payments/:paymentId/status
 * Protected: requires 'payment_staff' role
 */
async function updateStatus(req, res, next) {
  try {
    const { paymentId } = req.params;
    const { status, consent, hasConsent, forceNotification } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "New payment 'status' is required in request body."
      });
    }

    const staffEmail = req.user.email || 'staff@kairos.app';
    const result = await paymentService.updatePaymentStatus(paymentId, status, staffEmail, {
      consent,
      hasConsent,
      forceNotification
    });

    return res.status(200).json({
      success: true,
      message: `Payment status updated to '${status}' successfully.`,
      payment: result.payment,
      enrollment: result.enrollment,
      notification: result.notification
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/staff/payments/:paymentId/retry-notification
 * Protected: requires 'payment_staff' role
 * Retries an eligible failed WhatsApp confirmation
 */
async function retryNotification(req, res, next) {
  try {
    const { paymentId } = req.params;
    const notificationService = require('../services/notificationService');
    const staffEmail = req.user.email || 'staff@kairos.app';

    const result = await notificationService.retryNotification(paymentId, staffEmail);

    return res.status(200).json({
      success: true,
      message: 'Notification retry processed.',
      result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/staff/payments/:paymentId/send-whatsapp
 * Manual WhatsApp confirmation preparation for Payment Staff
 */
async function sendWhatsAppConfirmation(req, res, next) {
  try {
    const { paymentId } = req.params;
    const { query: dbQuery } = require('../config/db');

    const result = await dbQuery(`
      SELECT 
        p.payment_id,
        p.status,
        r.full_name,
        r.country_code,
        r.phone_number,
        r.language,
        COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS course_name,
        COALESCE(e.enrollment_status, 'Pending') AS enrollment_status
      FROM public.wa_payments p
      JOIN public.wa_registrations r ON r.registration_id = p.registration_id
      LEFT JOIN public.wa_courses c ON c.course_id = p.course_id
      LEFT JOIN public.wa_enrollments e ON e.payment_id = p.payment_id
      WHERE p.payment_id = $1;
    `, [paymentId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Payment record with ID ${paymentId} not found.`
      });
    }

    const row = result.rows[0];

    if (row.status !== 'Paid') {
      return res.status(400).json({
        success: false,
        error: `Cannot send WhatsApp confirmation for payment in '${row.status}' status. Payment must be 'Paid'.`
      });
    }

    const isFr = row.language === 'fr';
    const cleanPhone = (row.country_code || '').replace('+', '') + (row.phone_number || '');
    const messageText = isFr
      ? `🎉 Bonjour ${row.full_name} ! Votre paiement pour le cours "${row.course_name}" a été validé. Votre accès à la salle de classe est activé.`
      : `🎉 Hello ${row.full_name}! Your payment for "${row.course_name}" has been verified. Your classroom access is now active.`;

    return res.status(200).json({
      success: true,
      message: isFr 
        ? 'Confirmation WhatsApp préparée avec succès.' 
        : 'WhatsApp confirmation prepared successfully.',
      student: {
        paymentId: row.payment_id,
        name: row.full_name,
        phone: cleanPhone,
        countryCode: row.country_code,
        phoneNumber: row.phone_number,
        language: row.language,
        course: row.course_name,
        status: row.status,
        enrollmentStatus: row.enrollment_status
      },
      confirmationPayload: {
        recipientPhone: cleanPhone,
        message: messageText,
        templateName: isFr ? 'payment_confirmed_fr' : 'payment_confirmed_en'
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPayments,
  updateStatus,
  sendWhatsAppConfirmation,
  retryNotification
};
