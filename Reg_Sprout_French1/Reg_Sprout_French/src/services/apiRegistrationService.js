/**
 * API Registration Service
 * Communique avec le backend commun Kairos (Node.js/Express)
 * Point de terminaison cible : POST /api/registrations
 * 
 * Sans dépendance tierce (fetch natif)
 * Compatible avec React 19 et Vite
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Enregistre un étudiant via l'API backend commune.
 * 
 * @param {object} studentData
 * @param {string} studentData.fullName - Nom complet de l'étudiant
 * @param {string} studentData.countryCode - Indicatif téléphonique (+33, +225, etc.)
 * @param {string} studentData.phoneNumber - Numéro de téléphone local
 * @param {string} studentData.email - Adresse e-mail
 * @param {string} studentData.city - Ville
 * @param {string} studentData.profession - Profession / Occupation
 * @param {string} studentData.language - 'en' ou 'fr'
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
      language: (studentData.language || 'fr').trim().toLowerCase(),
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
        message: result?.error || 'Ce numéro de téléphone est déjà enregistré.',
      };
    }

    if (response.status === 400) {
      return {
        success: false,
        errorType: 'VALIDATION',
        message: result?.error || 'Échec de la validation. Veuillez vérifier les informations saisies.',
      };
    }

    return {
      success: false,
      errorType: result?.errorType || 'SERVER_ERROR',
      message: result?.error || "Une erreur est survenue lors de l'inscription. Veuillez réessayer.",
    };
  } catch (error) {
    console.error('[apiRegistrationService] Erreur de connexion:', error);
    return {
      success: false,
      errorType: 'NETWORK',
      message: 'Impossible de se connecter au serveur. Vérifiez votre connexion Internet et réessayez.',
    };
  }
}
