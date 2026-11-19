const { query, getClient } = require('../config/db');

/**
 * Normalizes email address to lowercase trimmed string
 * @param {string} email 
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

/**
 * Normalizes phone number by removing spaces, dashes, parentheses
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  return String(phone || '').replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * Normalizes country code ensuring leading plus sign
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
 * Validate registration input fields
 * Supports both camelCase and snake_case field names
 * @param {object} data 
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateRegistrationData(data) {
  const fullName = data.fullName || data.full_name || data.name;
  const countryCode = data.countryCode || data.country_code;
  const phoneNumber = data.phoneNumber || data.phone_number || data.phone;
  const email = data.email;
  const city = data.city;
  const profession = data.profession || data.occupation;
  const language = data.language;

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return { isValid: false, error: 'Full name is required (minimum 2 characters).' };
  }

  if (!countryCode || typeof countryCode !== 'string' || !/^\+\d{1,4}$/.test(countryCode.trim())) {
    return { isValid: false, error: 'Valid country dial code is required (e.g. +91, +225, +234).' };
  }

  const cleanPhone = normalizePhoneNumber(phoneNumber);
  if (!cleanPhone || !/^\d{5,15}$/.test(cleanPhone)) {
    return { isValid: false, error: 'Valid local phone number is required (5 to 15 digits).' };
  }

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { isValid: false, error: 'Valid email address is required.' };
  }

  if (!city || typeof city !== 'string' || city.trim().length < 2) {
    return { isValid: false, error: 'City is required.' };
  }

  if (!profession || typeof profession !== 'string' || profession.trim().length < 2) {
    return { isValid: false, error: 'Profession is required.' };
  }

  const lang = String(language || 'en').toLowerCase().trim();
  if (!['en', 'fr'].includes(lang)) {
    return { isValid: false, error: "Invalid language. Permitted values: 'en' or 'fr'." };
  }

  return { isValid: true };
}

/**
 * Register a new student into wa_registrations and create corresponding wa_payments record atomically
 * Uses PostgreSQL transaction (BEGIN ... COMMIT / ROLLBACK)
 * 
 * @param {object} studentData 
 * @returns {Promise<object>}
 */
async function createRegistration(studentData) {
  const validation = validateRegistrationData(studentData);
  if (!validation.isValid) {
    const err = new Error(validation.error);
    err.statusCode = 400;
    err.errorType = 'VALIDATION';
    throw err;
  }

  const fullName = (studentData.fullName || studentData.full_name || studentData.name).trim();
  const countryCode = normalizeCountryCode(studentData.countryCode || studentData.country_code);
  const phoneNumber = normalizePhoneNumber(studentData.phoneNumber || studentData.phone_number || studentData.phone);
  const email = normalizeEmail(studentData.email);
  const city = studentData.city.trim();
  const profession = (studentData.profession || studentData.occupation).trim();
  const language = String(studentData.language || 'en').toLowerCase().trim();

  // 1. Identify the default active course for the student's language
  const courseRes = await query(
    `SELECT course_id, course_name, language FROM public.wa_courses WHERE language = $1 AND is_active = true ORDER BY course_id ASC LIMIT 1`,
    [language]
  );

  let assignedCourse = courseRes.rowCount > 0 ? courseRes.rows[0] : null;
  if (!assignedCourse) {
    // Fallback to first active course or default course ID 1
    const fallbackCourse = await query(`SELECT course_id, course_name, language FROM public.wa_courses ORDER BY course_id ASC LIMIT 1`);
    assignedCourse = fallbackCourse.rowCount > 0 ? fallbackCourse.rows[0] : { course_id: 1, course_name: language === 'fr' ? 'Cours de Réussite Commerciale' : 'Business Success Class' };
  }

  // 2. Perform atomic insert of registration + payment record using transaction
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Check duplicate phone first inside transaction
    const dupCheck = await client.query(
      `SELECT registration_id FROM public.wa_registrations WHERE country_code = $1 AND phone_number = $2 LIMIT 1`,
      [countryCode, phoneNumber]
    );

    if (dupCheck.rowCount > 0) {
      const err = new Error(
        language === 'fr' 
          ? 'Ce numéro de téléphone est déjà enregistré.' 
          : 'This phone number is already registered.'
      );
      err.statusCode = 409;
      err.errorType = 'DUPLICATE_PHONE';
      throw err;
    }

    // Insert student registration
    const insertRegSql = `
      INSERT INTO public.wa_registrations (
        full_name,
        country_code,
        phone_number,
        email,
        city,
        profession,
        language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        registration_id,
        full_name,
        country_code,
        phone_number,
        email,
        city,
        profession,
        language,
        registered_at;
    `;

    const regResult = await client.query(insertRegSql, [
      fullName,
      countryCode,
      phoneNumber,
      email,
      city,
      profession,
      language
    ]);

    const newReg = regResult.rows[0];

    // Insert corresponding initial payment record (Pending status)
    const insertPaymentSql = `
      INSERT INTO public.wa_payments (
        registration_id,
        course_id,
        status,
        updated_by,
        updated_at
      )
      VALUES ($1, $2, 'Pending', NULL, NOW())
      RETURNING 
        payment_id,
        registration_id,
        course_id,
        status,
        updated_by,
        updated_at;
    `;

    const payResult = await client.query(insertPaymentSql, [
      newReg.registration_id,
      assignedCourse.course_id
    ]);

    const newPayment = payResult.rows[0];

    await client.query('COMMIT');

    return {
      registration_id: newReg.registration_id,
      registrationId: newReg.registration_id,
      full_name: newReg.full_name,
      fullName: newReg.full_name,
      country_code: newReg.country_code,
      countryCode: newReg.country_code,
      phone_number: newReg.phone_number,
      phoneNumber: newReg.phone_number,
      email: newReg.email,
      city: newReg.city,
      profession: newReg.profession,
      language: newReg.language,
      registered_at: newReg.registered_at,
      registeredAt: newReg.registered_at,
      course_id: assignedCourse.course_id,
      courseId: assignedCourse.course_id,
      course_name: assignedCourse.course_name,
      courseName: assignedCourse.course_name,
      payment_id: newPayment.payment_id,
      paymentId: newPayment.payment_id,
      payment_status: newPayment.status,
      paymentStatus: newPayment.status
    };
  } catch (dbErr) {
    await client.query('ROLLBACK');

    if (dbErr.code === '23505') {
      const err = new Error(
        language === 'fr' 
          ? 'Ce numéro de téléphone est déjà enregistré.' 
          : 'This phone number is already registered.'
      );
      err.statusCode = 409;
      err.errorType = 'DUPLICATE_PHONE';
      throw err;
    }

    throw dbErr;
  } finally {
    client.release();
  }
}

module.exports = {
  createRegistration,
  validateRegistrationData
};
