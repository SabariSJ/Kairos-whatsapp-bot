/**
 * Firestore Registration Service
 * 
 * Free-Only Architecture (Firebase Spark Plan):
 * - Deterministic document ID: SHA-256 hash of normalized email
 * - Path: registrations/{emailHash}
 * - Direct check/write strategy to minimize Firestore read/write quotas
 * - Zero dependency on Cloud Functions or Blaze paid plans
 * - All user-facing error messages are strictly in French
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { normalizeEmail, hashEmail } from '../utils/emailHash';

/**
 * Registers a new user into Cloud Firestore.
 *
 * @param {{
 *   name: string,
 *   phone: string,
 *   email: string,
 *   city: string,
 *   occupation: string
 * }} rawFormData
 * @returns {Promise<{
 *   success: boolean,
 *   errorType?: 'VALIDATION' | 'DUPLICATE' | 'NETWORK' | 'UNKNOWN',
 *   message?: string,
 *   emailHash?: string
 * }>}
 */
export async function registerUser(normalizedData) {
  const { name, phone, email, city, occupation } = normalizedData;

  try {
    // 2. Generate deterministic SHA-256 hash from normalized email
    const emailHash = await hashEmail(email);
    const registrationRef = doc(db, 'registrations', emailHash);

    // 3. Duplicate check & registration write
    // Attempt single-document read to check if already registered
    let alreadyExists = false;
    try {
      const docSnapshot = await getDoc(registrationRef);
      if (docSnapshot.exists()) {
        alreadyExists = true;
      }
    } catch (readError) {
      // If getDoc is blocked by strict security rules ('allow read: if false'),
      // we proceed directly to setDoc. If the document already exists, the
      // Firestore security rule (!exists) will deny the write and trigger
      // a 'permission-denied' error below.
      console.debug('[registrationService] getDoc existence check skipped or restricted:', readError.code);
    }

    if (alreadyExists) {
      return {
        success: false,
        errorType: 'DUPLICATE',
        message: 'Cette adresse e-mail est déjà enregistrée.',
      };
    }

    // 4. Create registration document with serverTimestamp and clientSystemTime
    await setDoc(registrationRef, {
      name,
      phone,
      email,
      city,
      occupation,
      createdAt: serverTimestamp(),
      clientSystemTime: new Date().toISOString(),
    });

    return {
      success: true,
      emailHash,
    };
  } catch (error) {
    console.error('[registrationService] Erreur lors de l\'inscription:', error);

    // Handle security rule rejection (e.g. !exists check or update denied on duplicate)
    if (
      error.code === 'permission-denied' ||
      (error.message && error.message.toLowerCase().includes('permission-denied'))
    ) {
      return {
        success: false,
        errorType: 'DUPLICATE',
        message: 'Cette adresse e-mail est déjà enregistrée.',
      };
    }

    // Handle network / offline connectivity errors
    if (
      error.code === 'unavailable' ||
      error.code === 'failed-precondition' ||
      !navigator.onLine
    ) {
      return {
        success: false,
        errorType: 'NETWORK',
        message: 'Impossible de se connecter au serveur. Vérifiez votre connexion Internet et réessayez.',
      };
    }

    // Fallback unexpected error
    return {
      success: false,
      errorType: 'UNKNOWN',
      message: "Une erreur est survenue lors de l'inscription. Veuillez réessayer.",
    };
  }
}
