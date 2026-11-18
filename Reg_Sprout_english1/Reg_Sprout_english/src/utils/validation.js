/**
 * French Form Validation & Normalization Rules
 * All user-facing error messages are strictly in French.
 */

// Occupations are now handled via i18n dictionaries

/**
 * Validates and trims the Full Name (Nom complet).
 * Supports standard French accents, apostrophes, and hyphens.
 *
 * @param {string} name
 * @returns {{ isValid: boolean, error?: string, value: string }}
 */
export function validateName(name) {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Veuillez saisir votre nom complet.', value: '' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2 || trimmed.length > 100) {
    return { isValid: false, error: 'Veuillez saisir votre nom complet.', value: trimmed };
  }

  // Regex allowing letters (including full French unicode/accented letters), hyphens, spaces, apostrophes
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’\s\-]+$/;
  if (!nameRegex.test(trimmed)) {
    return { isValid: false, error: 'Veuillez saisir votre nom complet.', value: trimmed };
  }

  return { isValid: true, value: trimmed };
}

export function validateAndNormalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      error: 'phone', // key for i18n
      normalized: '',
    };
  }

  const trimmed = phone.trim();

  // Strip all non-digit characters except leading '+'
  let cleaned = trimmed.replace(/[\s.\-_()]/g, '');

  if (!cleaned.startsWith('+')) {
     return {
      isValid: false,
      error: 'phone',
      normalized: '',
    };
  }

  // Basic sanity check: an international number usually has between 8 and 15 digits total
  const digitCount = cleaned.replace('+', '').length;
  if (digitCount < 8 || digitCount > 15 || /[a-zA-Z]/.test(cleaned)) {
    return {
      isValid: false,
      error: 'phone',
      normalized: '',
    };
  }

  return {
    isValid: true,
    normalized: cleaned,
  };
}

/**
 * Validates and normalizes Email address.
 *
 * @param {string} email
 * @returns {{ isValid: boolean, error?: string, normalized: string }}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      error: 'Veuillez saisir une adresse e-mail valide.',
      normalized: '',
    };
  }

  const trimmed = email.trim().toLowerCase();

  // RFC 5322 compliant regex for standard email validation
  const emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

  if (!emailRegex.test(trimmed) || trimmed.length > 254) {
    return {
      isValid: false,
      error: 'Veuillez saisir une adresse e-mail valide.',
      normalized: trimmed,
    };
  }

  return {
    isValid: true,
    normalized: trimmed,
  };
}

/**
 * Validates City (Ville).
 * Supports French accents, spaces, hyphens, and apostrophes (e.g. Aix-en-Provence, L'Haÿ-les-Roses).
 *
 * @param {string} city
 * @returns {{ isValid: boolean, error?: string, value: string }}
 */
export function validateCity(city) {
  if (!city || typeof city !== 'string') {
    return { isValid: false, error: 'Veuillez saisir votre ville.', value: '' };
  }

  const trimmed = city.trim();

  if (trimmed.length < 2 || trimmed.length > 100) {
    return { isValid: false, error: 'Veuillez saisir votre ville.', value: trimmed };
  }

  const cityRegex = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’\s\-]+$/;
  if (!cityRegex.test(trimmed)) {
    return { isValid: false, error: 'Veuillez saisir votre ville.', value: trimmed };
  }

  return { isValid: true, value: trimmed };
}

export function validateOccupation(occupation, allowedList) {
  if (!occupation || typeof occupation !== 'string') {
    return { isValid: false, error: 'occupation', value: '' };
  }

  const trimmed = occupation.trim();

  if (!allowedList.includes(trimmed)) {
    return { isValid: false, error: 'occupation', value: '' };
  }

  return { isValid: true, value: trimmed };
}

export function validateRegistrationForm(data, allowedOccupations) {
  const nameResult = validateName(data.name);
  const phoneResult = validateAndNormalizePhone(data.phone);
  const emailResult = validateEmail(data.email);
  const cityResult = validateCity(data.city);
  const occupationResult = validateOccupation(data.occupation, allowedOccupations);

  const errors = {};
  if (!nameResult.isValid) errors.name = 'name';
  if (!phoneResult.isValid) errors.phone = 'phone';
  if (!emailResult.isValid) errors.email = 'email';
  if (!cityResult.isValid) errors.city = 'city';
  if (!occupationResult.isValid) errors.occupation = 'occupation';

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    normalizedData: {
      name: nameResult.value,
      phone: phoneResult.normalized,
      email: emailResult.normalized,
      city: cityResult.value,
      occupation: occupationResult.value,
    },
  };
}
