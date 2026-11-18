/**
 * Email Normalization and Deterministic SHA-256 Hashing
 * 
 * Runs entirely in the client's browser using the Web Crypto API
 * to prevent storing raw email addresses as Firestore document IDs.
 * Free/Spark plan compatible: does not require backend or Cloud Functions.
 */

/**
 * Normalizes an email address according to standard specifications:
 * - Trims leading and trailing whitespace
 * - Converts all characters to lowercase
 *
 * @param {string} email
 * @returns {string} Normalized email
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Generates a SHA-256 hex digest of the normalized email address using
 * the browser's native Web Crypto API (crypto.subtle.digest).
 *
 * @param {string} email
 * @returns {Promise<string>} Hexadecimal SHA-256 hash string (64 characters)
 */
export async function hashEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error('Adresse e-mail requise pour le hachage.');
  }

  // Ensure Web Crypto API is available
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for non-browser / test environments if needed
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error("L'API Web Crypto n'est pas prise en charge par ce navigateur.");
}
