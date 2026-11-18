/**
 * Automated Test Suite for Validation, Normalization, and Hashing
 * Runs standalone with Node.js to verify all business rules.
 */

import {
  validateName,
  validateAndNormalizePhone,
  validateEmail,
  validateCity,
  validateOccupation,
  validateRegistrationForm,
  ALLOWED_OCCUPATIONS,
} from '../src/utils/validation.js';
import { normalizeEmail, hashEmail } from '../src/utils/emailHash.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- 1. NOM (FULL NAME) VALIDATION ---');
  assert(validateName('Jean Dupont').isValid === true, 'Valid name: Jean Dupont');
  assert(validateName('Éléonore François-Martin').isValid === true, 'French accented name with hyphen: Éléonore François-Martin');
  assert(validateName("Jeanne d'Arc").isValid === true, "French name with apostrophe: Jeanne d'Arc");
  assert(validateName('A').isValid === false, 'Name too short: single char rejected');
  assert(validateName('   ').isValid === false, 'Name with only spaces rejected');
  assert(validateName('Jean123').isValid === false, 'Name with digits rejected');

  console.log('\n--- 2. NUMÉRO DE TÉLÉPHONE (PHONE) VALIDATION & NORMALIZATION ---');
  // 06 mobile
  const p1 = validateAndNormalizePhone('06 12 34 56 78');
  assert(p1.isValid && p1.normalized === '+33612345678', '06 with spaces normalized to +33612345678');

  // 07 mobile
  const p2 = validateAndNormalizePhone('07.12.34.56.78');
  assert(p2.isValid && p2.normalized === '+33712345678', '07 with dots normalized to +33712345678');

  // +33 6 international
  const p3 = validateAndNormalizePhone('+33 6 12 34 56 78');
  assert(p3.isValid && p3.normalized === '+33612345678', '+33 6 with spaces normalized to +33612345678');

  // +33 7 international
  const p4 = validateAndNormalizePhone('+33 7 12 34 56 78');
  assert(p4.isValid && p4.normalized === '+33712345678', '+33 7 with spaces normalized to +33712345678');

  // Invalid cases
  assert(validateAndNormalizePhone('06 12 34 ab cd').isValid === false, 'Alphabetical characters rejected');
  assert(validateAndNormalizePhone('01 23 45 67 89').isValid === false, 'Non-mobile (01) rejected per mobile requirement');
  assert(validateAndNormalizePhone('0612345').isValid === false, 'Too short number rejected');
  assert(validateAndNormalizePhone('').isValid === false, 'Empty phone rejected');

  console.log('\n--- 3. ADRESSE E-MAIL (EMAIL) VALIDATION & NORMALIZATION ---');
  const e1 = validateEmail('Jean.Dupont@Example.COM');
  assert(e1.isValid && e1.normalized === 'jean.dupont@example.com', 'Mixed case email normalized to lowercase');
  assert(validateEmail('invalid-email').isValid === false, 'Invalid email format rejected');
  assert(validateEmail('test@').isValid === false, 'Incomplete email rejected');

  console.log('\n--- 4. VILLE (CITY) VALIDATION ---');
  assert(validateCity('Paris').isValid === true, 'Valid city: Paris');
  assert(validateCity('Saint-Étienne').isValid === true, 'French accented city: Saint-Étienne');
  assert(validateCity("L'Haÿ-les-Roses").isValid === true, "City with apostrophe & tréma: L'Haÿ-les-Roses");
  assert(validateCity('P').isValid === false, 'City too short rejected');
  assert(validateCity('   ').isValid === false, 'Blank city rejected');

  console.log('\n--- 5. PROFESSION VALIDATION ---');
  for (const occ of ALLOWED_OCCUPATIONS) {
    assert(validateOccupation(occ).isValid === true, `Valid occupation: ${occ}`);
  }
  assert(validateOccupation('Sélectionnez votre profession').isValid === false, 'Placeholder occupation rejected');
  assert(validateOccupation('').isValid === false, 'Empty occupation rejected');
  assert(validateOccupation('Astronaute').isValid === false, 'Unlisted occupation rejected');

  console.log('\n--- 6. EMAIL DETERMINISTIC HASHING (WEB CRYPTO / SHA-256) ---');
  const emailA = 'Jean.Dupont@Example.COM';
  const emailB = 'jean.dupont@example.com';
  const hashA = await hashEmail(emailA);
  const hashB = await hashEmail(emailB);

  assert(hashA === hashB, 'Hashes of "Jean.Dupont@Example.COM" and "jean.dupont@example.com" match identically');
  assert(hashA.length === 64, 'SHA-256 hash length is exactly 64 hexadecimal characters');
  assert(/^[a-f0-9]{64}$/.test(hashA), 'SHA-256 hash contains only lowercase hex digits');

  console.log('\n--- 7. FULL REGISTRATION FORM VALIDATION ---');
  const validData = {
    name: 'Marie Curie',
    phone: '06 12 34 56 78',
    email: 'Marie.Curie@Example.COM',
    city: 'Paris',
    occupation: 'Enseignant(e)',
  };
  const formValidation = validateRegistrationForm(validData);
  assert(formValidation.isValid === true, 'Valid full form passes');
  assert(formValidation.normalizedData.phone === '+33612345678', 'Full form normalizes phone');
  assert(formValidation.normalizedData.email === 'marie.curie@example.com', 'Full form normalizes email');

  console.log(`\n========================================`);
  console.log(`RÉSULTATS : ${passed} réussis, ${failed} échoués`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
