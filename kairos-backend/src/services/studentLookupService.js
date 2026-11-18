const { query } = require('../config/db');

/**
 * Normalizes dialing country code
 * @param {string} code 
 * @returns {string}
 */
function normalizeCountryCode(code) {
  let cleaned = String(code || '').trim();
  if (cleaned && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

/**
 * Normalizes phone number digits
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  return String(phone || '').replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * Authoritative Student Lookup for WhatsApp Bot & Internal Services
 * Queries AWS RDS PostgreSQL wa_registrations joined with wa_payments, wa_courses, and wa_enrollments
 * 
 * @param {object} params
 * @param {string} [params.countryCode] e.g. +91, +33
 * @param {string} [params.phoneNumber] e.g. 9876540001
 * @param {string} [params.rawPhone] e.g. 919876540001 or +919876540001
 * @returns {Promise<object|null>}
 */
async function lookupStudentByPhone({ countryCode, phoneNumber, rawPhone }) {
  const normCC = countryCode ? normalizeCountryCode(countryCode) : null;
  const normPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  const normRaw = rawPhone ? String(rawPhone).replace(/\D/g, '').trim() : null;

  if (!normRaw && (!normCC || !normPhone)) {
    const err = new Error('Either (country_code and phone_number) or raw_phone is required.');
    err.statusCode = 400;
    throw err;
  }

  let sql = `
    SELECT 
      r.registration_id,
      r.full_name,
      r.country_code,
      r.phone_number,
      r.email,
      r.city,
      r.profession,
      r.language,
      r.registered_at,
      c.course_id,
      COALESCE(c.course_name, (CASE WHEN r.language = 'fr' THEN 'Cours de Réussite Commerciale' ELSE 'Business Success Class' END)) AS course_name,
      COALESCE(p.payment_id, 0) AS payment_id,
      COALESCE(p.status, 'Pending') AS payment_status,
      p.updated_at AS payment_updated_at,
      COALESCE(e.enrollment_id, 0) AS enrollment_id,
      COALESCE(e.enrollment_status, 'Pending') AS enrollment_status
    FROM public.wa_registrations r
    LEFT JOIN public.wa_payments p ON p.registration_id = r.registration_id
    LEFT JOIN public.wa_courses c ON c.course_id = p.course_id
    LEFT JOIN public.wa_enrollments e ON e.payment_id = p.payment_id
    WHERE 
  `;

  const queryParams = [];

  if (normCC && normPhone) {
    queryParams.push(normCC);
    queryParams.push(normPhone);
    sql += ` r.country_code = $1 AND r.phone_number = $2 `;
  } else if (normRaw) {
    // Match raw concatenation e.g. '919876540001' or '+919876540001'
    queryParams.push(normRaw);
    queryParams.push('+' + normRaw);
    sql += ` (
      REPLACE(r.country_code, '+', '') || r.phone_number = $1 OR
      '+' || REPLACE(r.country_code, '+', '') || r.phone_number = $2 OR
      (r.phone_number = $1 AND LENGTH($1) <= 10)
    ) `;
  }

  sql += ` ORDER BY p.updated_at DESC NULLS LAST, r.registered_at DESC LIMIT 1; `;

  const result = await query(sql, queryParams);

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    registration_id: row.registration_id,
    registrationId: row.registration_id,
    full_name: row.full_name,
    fullName: row.full_name,
    country_code: row.country_code,
    countryCode: row.country_code,
    phone_number: row.phone_number,
    phoneNumber: row.phone_number,
    email: row.email,
    city: row.city,
    profession: row.profession,
    language: row.language,
    course_id: row.course_id,
    course_name: row.course_name,
    courseName: row.course_name,
    payment_id: row.payment_id,
    payment_status: row.payment_status,
    paymentStatus: row.payment_status,
    enrollment_id: row.enrollment_id,
    enrollment_status: row.enrollment_status,
    enrollmentStatus: row.enrollment_status,
    registered_at: row.registered_at,
    registeredAt: row.registered_at
  };
}

module.exports = {
  lookupStudentByPhone,
  normalizeCountryCode,
  normalizePhoneNumber
};
