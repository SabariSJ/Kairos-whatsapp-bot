/**
 * API Registration Service
 * Communicates with the Kairos Common Backend API (Node.js/Express)
 * Target endpoint: POST /api/registrations
 * 
 * Free of third-party network libraries (pure native fetch)
 * Compatible with React 19 & Vite
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Registers a student via the backend API.
 * 
 * @param {object} studentData
 * @param {string} studentData.fullName - Full name of the student
 * @param {string} studentData.countryCode - Dial code (e.g. +91, +213)
 * @param {string} studentData.phoneNumber - Local phone number digits
 * @param {string} studentData.email - Email address
 * @param {string} studentData.city - City
 * @param {string} studentData.profession - Profession / Occupation
 * @param {string} studentData.language - 'en' or 'fr'
 * @returns {Promise<{
 *   success: boolean,
 *   data?: object,
 *   errorType?: string,
 *   message?: string
 * }>}
 */
export async function registerStudent(studentData) {
  try {
    const payload = {
      full_name: (studentData.fullName || studentData.full_name || studentData.name || '').trim(),
      country_code: (studentData.countryCode || studentData.country_code || '').trim(),
      phone_number: String(studentData.phoneNumber || studentData.phone_number || studentData.phone || '').trim(),
      email: (studentData.email || '').trim().toLowerCase(),
      city: (studentData.city || '').trim(),
      profession: (studentData.profession || studentData.occupation || '').trim(),
      language: (studentData.language || 'en').trim().toLowerCase(),
    };

    const response = await fetch(`${API_BASE_URL}/registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);

    if (response.ok && result?.success) {
      return {
        success: true,
        data: result.registration,
        message: result.message,
      };
    }

    if (response.status === 409) {
      return {
        success: false,
        errorType: 'DUPLICATE',
        message: result?.error || (payload.language === 'fr' 
          ? 'Ce numéro de téléphone est déjà enregistré.' 
          : 'This phone number is already registered.'),
      };
    }

    if (response.status === 400) {
      return {
        success: false,
        errorType: 'VALIDATION',
        message: result?.error || 'Validation failed. Please check the information entered.',
      };
    }

    return {
      success: false,
      errorType: result?.errorType || 'SERVER_ERROR',
      message: result?.error || 'An error occurred during registration. Please try again.',
    };
  } catch (error) {
    console.error('[apiRegistrationService] Connection error:', error);
    return {
      success: false,
      errorType: 'NETWORK',
      message: 'Unable to connect to the server. Check your internet connection and try again.',
    };
  }
}
