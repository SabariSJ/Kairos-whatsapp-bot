const { query } = require('../config/db');

function getBotUrl() {
  return process.env.BOT_API_URL || 'http://localhost:5001';
}
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'kairos_internal_service_key_2026_bot_auth_secret';

const TEMPLATES = {
  en: {
    name: 'kairos_payment_confirmation_en',
    languageCode: 'en_US'
  },
  fr: {
    name: 'kairos_payment_confirmation_fr',
    languageCode: 'fr'
  }
};

/**
 * Format phone to international E.164 digits without '+' (e.g., +91 9876540001 -> 919876540001)
 */
function formatE164(countryCode, phoneNumber) {
  if (!phoneNumber) return null;
  const cCode = String(countryCode || '').replace(/\D/g, '');
  const pNum = String(phoneNumber || '').replace(/\D/g, '');
  if (!pNum) return null;
  return cCode ? `${cCode}${pNum}` : pNum;
}

/**
 * Automatically trigger payment confirmation WhatsApp notification for a paid student
 * 
 * @param {number|string} paymentId 
 * @param {object} [options] { isRetry: boolean, staffEmail: string, overrideConsent: boolean }
 * @returns {Promise<object>} Result of the notification attempt
 */
async function triggerPaymentNotification(paymentId, options = {}) {
  const { isRetry = false, staffEmail = 'system', consent = 'opted_in' } = options;

  // 1. Fetch payment, registration, course, and enrollment data
  const dataRes = await query(`
    SELECT 
      p.payment_id,
      p.status AS payment_status,
      r.registration_id,
      r.full_name,
      r.country_code,
      r.phone_number,
      r.email,
      r.language,
      c.course_id,
      COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS course_name,
      e.enrollment_id,
      COALESCE(e.enrollment_status, 'Pending') AS enrollment_status
    FROM public.wa_payments p
    JOIN public.wa_registrations r ON r.registration_id = p.registration_id
    LEFT JOIN public.wa_courses c ON c.course_id = p.course_id
    LEFT JOIN public.wa_enrollments e ON e.payment_id = p.payment_id
    WHERE p.payment_id = $1;
  `, [paymentId]);

  if (dataRes.rowCount === 0) {
    throw new Error(`Payment record #${paymentId} not found.`);
  }

  const record = dataRes.rows[0];

  // Rule: Notification is only for Paid status
  if (record.payment_status !== 'Paid') {
    return {
      triggered: false,
      reason: `Payment is in '${record.payment_status}' status. Notification requires 'Paid'.`
    };
  }

  // 2. Check existing notification record (Idempotency and duplicate prevention)
  const existingRes = await query(`
    SELECT * FROM public.wa_notifications WHERE payment_id = $1;
  `, [paymentId]);

  let notification = existingRes.rows[0];

  if (notification) {
    // If already Sent, Delivered, or Read, prevent duplicate unless explicit verified retry
    if (['Sent', 'Delivered', 'Read'].includes(notification.status) && !isRetry) {
      console.log(`[Notification Service] Duplicate prevented for payment #${paymentId}. Status: ${notification.status}`);
      return {
        triggered: false,
        duplicate: true,
        notification
      };
    }

    // If currently Processing and not a retry, return existing
    if (notification.status === 'Processing' && !isRetry) {
      return {
        triggered: false,
        processing: true,
        notification
      };
    }
  }

  const rawLang = String(record.language || 'en').toLowerCase().trim();
  const langKey = rawLang.startsWith('fr') ? 'fr' : 'en';
  const templateConfig = TEMPLATES[langKey];
  const recipientPhone = formatE164(record.country_code, record.phone_number);

  // 3. Validation: Recipient phone number
  const rawLocalPhone = String(record.phone_number || '').replace(/\D/g, '');
  const isInvalidPhone = !recipientPhone || 
    recipientPhone.length < 8 || 
    recipientPhone.replace(/0/g, '').length === 0 || 
    rawLocalPhone.replace(/0/g, '').length === 0 || 
    rawLocalPhone.startsWith('0000') ||
    rawLocalPhone.length < 6;
  if (isInvalidPhone) {
    console.warn(`[Notification Warning] Invalid phone number for payment #${paymentId}: ${recipientPhone}`);
    const errMsg = 'Missing or invalid student destination phone number.';
    
    if (notification) {
      const upd = await query(`
        UPDATE public.wa_notifications
        SET 
          status = 'Failed',
          error_message = $1,
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          updated_at = NOW()
        WHERE notification_id = $2
        RETURNING *;
      `, [errMsg, notification.notification_id]);
      return { triggered: false, status: 'Failed', error: errMsg, notification: upd.rows[0] };
    } else {
      const ins = await query(`
        INSERT INTO public.wa_notifications (
          payment_id, registration_id, phone_e164, template_name, language, consent_status, status, error_message, attempt_count, last_attempt_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'Failed', $7, 1, NOW())
        RETURNING *;
      `, [paymentId, record.registration_id, recipientPhone || 'UNKNOWN', templateConfig.name, langKey, consent, errMsg]);
      return { triggered: false, status: 'Failed', error: errMsg, notification: ins.rows[0] };
    }
  }

  // 4. Validation: WhatsApp messaging consent
  if (consent === 'missing' || consent === 'revoked' || options.hasConsent === false) {
    console.warn(`[Notification Warning] Missing consent for student #${record.registration_id} (payment #${paymentId})`);
    const errMsg = 'Student has not provided required WhatsApp messaging consent (opt-in missing or revoked).';

    if (notification) {
      const upd = await query(`
        UPDATE public.wa_notifications
        SET 
          status = 'Failed',
          consent_status = $1,
          error_message = $2,
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          updated_at = NOW()
        WHERE notification_id = $2
        RETURNING *;
      `, [consent, errMsg, notification.notification_id]);
      return { triggered: false, status: 'Failed', error: errMsg, notification: upd.rows[0] };
    } else {
      const ins = await query(`
        INSERT INTO public.wa_notifications (
          payment_id, registration_id, phone_e164, template_name, language, consent_status, status, error_message, attempt_count, last_attempt_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'Failed', $7, 1, NOW())
        RETURNING *;
      `, [paymentId, record.registration_id, recipientPhone, templateConfig.name, langKey, consent, errMsg]);
      return { triggered: false, status: 'Failed', error: errMsg, notification: ins.rows[0] };
    }
  }

  // 5. Create or update notification row to 'Processing'
  if (notification) {
    const upd = await query(`
      UPDATE public.wa_notifications
      SET 
        status = 'Processing',
        template_name = $1,
        language = $2,
        phone_e164 = $3,
        attempt_count = attempt_count + 1,
        last_attempt_at = NOW(),
        updated_at = NOW()
      WHERE notification_id = $4
      RETURNING *;
    `, [templateConfig.name, langKey, recipientPhone, notification.notification_id]);
    notification = upd.rows[0];
  } else {
    const ins = await query(`
      INSERT INTO public.wa_notifications (
        payment_id, registration_id, phone_e164, template_name, language, consent_status, status, attempt_count, last_attempt_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'Processing', 1, NOW())
      RETURNING *;
    `, [paymentId, record.registration_id, recipientPhone, templateConfig.name, langKey, consent]);
    notification = ins.rows[0];
  }

  // 6. Dispatch message via WhatsApp Bot internal API
  const templateParams = [record.full_name, record.course_name];
  let sendResult = null;
  let sendError = null;

  try {
    const res = await fetch(`${getBotUrl()}/api/internal/send-payment-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': INTERNAL_SERVICE_KEY
      },
      body: JSON.stringify({
        paymentId,
        registrationId: record.registration_id,
        phone: recipientPhone,
        studentName: record.full_name,
        courseName: record.course_name,
        templateName: templateConfig.name,
        languageCode: templateConfig.languageCode,
        parameters: templateParams,
        language: langKey
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      sendError = data?.error || `HTTP ${res.status}`;
    } else {
      sendResult = data;
    }
  } catch (err) {
    const errorDetails = err.message;
    console.error(`[Notification Service] Dispatch failed for payment #${paymentId}:`, errorDetails);
    sendError = errorDetails;
  }

  // 7. Update notification record with final delivery result
  if (sendResult && sendResult.success) {
    const metaMessageId = sendResult.messageId || `wamid.STAGING_${Date.now()}`;
    const updSuccess = await query(`
      UPDATE public.wa_notifications
      SET 
        status = 'Sent',
        meta_message_id = $1,
        error_message = NULL,
        updated_at = NOW()
      WHERE notification_id = $2
      RETURNING *;
    `, [metaMessageId, notification.notification_id]);

    return {
      triggered: true,
      status: 'Sent',
      messageId: metaMessageId,
      notification: updSuccess.rows[0]
    };
  } else {
    const updFail = await query(`
      UPDATE public.wa_notifications
      SET 
        status = 'Failed',
        error_message = $1,
        updated_at = NOW()
      WHERE notification_id = $2
      RETURNING *;
    `, [sendError || 'Unknown dispatch failure', notification.notification_id]);

    return {
      triggered: false,
      status: 'Failed',
      error: sendError,
      notification: updFail.rows[0]
    };
  }
}

/**
 * Update delivery status from Meta Webhook event (sent, delivered, read, failed)
 * 
 * @param {string} metaMessageId 
 * @param {string} metaStatus ('sent', 'delivered', 'read', 'failed')
 * @param {object} [details]
 * @returns {Promise<object|null>}
 */
async function updateDeliveryStatus(metaMessageId, metaStatus, details = {}) {
  if (!metaMessageId) return null;

  const notifRes = await query(`
    SELECT * FROM public.wa_notifications WHERE meta_message_id = $1;
  `, [metaMessageId]);

  if (notifRes.rowCount === 0) {
    console.warn(`[Delivery Webhook] No notification record found for metaMessageId: ${metaMessageId}`);
    return null;
  }

  const current = notifRes.rows[0];

  // Define status precedence so out-of-order webhooks do not downgrade states
  const PRECEDENCE = {
    'Pending': 1,
    'Processing': 2,
    'Sent': 3,
    'Delivered': 4,
    'Read': 5,
    'Failed': 0
  };

  const statusMap = {
    'sent': 'Sent',
    'delivered': 'Delivered',
    'read': 'Read',
    'failed': 'Failed'
  };

  const newStatus = statusMap[metaStatus.toLowerCase()] || current.status;
  const currentLevel = PRECEDENCE[current.status] || 0;
  const newLevel = PRECEDENCE[newStatus] || 0;

  // Never downgrade Delivered or Read back to Sent
  if (newLevel < currentLevel && newStatus !== 'Failed') {
    console.log(`[Delivery Webhook] Ignored out-of-order transition from ${current.status} to ${newStatus}`);
    return current;
  }

  const upd = await query(`
    UPDATE public.wa_notifications
    SET 
      status = $1,
      error_message = $2,
      updated_at = NOW()
    WHERE notification_id = $3
    RETURNING *;
  `, [
    newStatus,
    newStatus === 'Failed' ? (details.errorMessage || 'Meta delivery failed') : current.error_message,
    current.notification_id
  ]);

  console.log(`[Delivery Webhook SUCCESS] Updated notification #${current.notification_id} -> ${newStatus} (msgId: ${metaMessageId})`);
  return upd.rows[0];
}

/**
 * Retry an eligible failed notification
 * 
 * @param {number|string} paymentId 
 * @param {string} staffEmail 
 * @returns {Promise<object>}
 */
async function retryNotification(paymentId, staffEmail = 'staff@kairos.app') {
  const notifRes = await query(`
    SELECT * FROM public.wa_notifications WHERE payment_id = $1;
  `, [paymentId]);

  if (notifRes.rowCount === 0) {
    // If no notification row exists yet, trigger a new one
    return triggerPaymentNotification(paymentId, { isRetry: true, staffEmail });
  }

  const notif = notifRes.rows[0];

  // If already successfully Delivered or Read, block blind duplicate resending
  if (['Delivered', 'Read'].includes(notif.status)) {
    const err = new Error(`Cannot retry: Notification is already '${notif.status}'. Duplicate message prevented.`);
    err.statusCode = 400;
    throw err;
  }

  return triggerPaymentNotification(paymentId, { isRetry: true, staffEmail });
}

/**
 * Retrieve notification details for a payment
 */
async function getNotificationByPaymentId(paymentId) {
  const res = await query(`
    SELECT * FROM public.wa_notifications WHERE payment_id = $1;
  `, [paymentId]);
  return res.rows[0] || null;
}

module.exports = {
  triggerPaymentNotification,
  updateDeliveryStatus,
  retryNotification,
  getNotificationByPaymentId,
  TEMPLATES
};
