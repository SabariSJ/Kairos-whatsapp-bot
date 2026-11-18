import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validateName,
  validateAndNormalizePhone,
  validateEmail,
  validateCity,
  validateOccupation,
  validateRegistrationForm,
} from '../utils/validation';
import { registerStudent } from '../services/apiRegistrationService';
// Preserved for legacy reference per Phase 4 protection rules
import { registerUser } from '../firebase/registrationService';

import { AFRICAN_COUNTRIES } from '../utils/africanCountries';

export default function RegistrationForm({ lang, t }) {
  const navigate = useNavigate();

  // Form input state
  const [formData, setFormData] = useState({
    name: '',
    phoneLocal: '',
    email: '',
    city: '',
    occupation: '',
  });

  const [countryCode, setCountryCode] = useState('+213'); // Default Algeria

  // Validation errors state (field-specific)
  const [fieldErrors, setFieldErrors] = useState({});

  // Field touched/blur state
  const [touched, setTouched] = useState({});

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Global alert message (e.g. duplicate, network, or server error)
  const [globalError, setGlobalError] = useState(null);

  /**
   * Handle text changes
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear field-specific error as user types if already displayed
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }

    // Clear global error when user modifies form
    if (globalError) {
      setGlobalError(null);
    }
  };

  /**
   * Validate individual field on blur
   */
  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    let result = { isValid: true };
    switch (name) {
      case 'name':
        result = validateName(value);
        break;
      case 'phoneLocal':
        result = validateAndNormalizePhone(countryCode + value);
        break;
      case 'email':
        result = validateEmail(value);
        break;
      case 'city':
        result = validateCity(value);
        break;
      case 'occupation':
        result = validateOccupation(value, t.occupations);
        break;
      default:
        break;
    }

    if (!result.isValid) {
      setFieldErrors((prev) => ({ ...prev, [name]: result.error }));
    } else {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    // Run complete validation
    const fullData = { ...formData, phone: countryCode + formData.phoneLocal };
    const validation = validateRegistrationForm(fullData, t.occupations);

    if (!validation.isValid) {
      // For phone, validation returns errors.phone, map it to fieldErrors.phoneLocal
      const mappedErrors = { ...validation.errors };
      if (mappedErrors.phone) {
        mappedErrors.phoneLocal = mappedErrors.phone;
        delete mappedErrors.phone;
      }

      setFieldErrors(mappedErrors);
      setTouched({
        name: true,
        phoneLocal: true,
        email: true,
        city: true,
        occupation: true,
      });
      setGlobalError(t.errors.checkFields);
      return;
    }

    setIsSubmitting(true);
    setGlobalError(null);

    try {
      const result = await registerStudent({
        fullName: validation.normalizedData.name,
        countryCode: countryCode,
        phoneNumber: formData.phoneLocal.trim(),
        email: validation.normalizedData.email,
        city: validation.normalizedData.city,
        profession: validation.normalizedData.occupation,
        language: lang || 'en',
      });

      if (result.success) {
        // Navigate to the Thank You screen and pass the language state & registration data
        navigate('/thank-you', { state: { lang: lang || 'en', registration: result.data } });
      } else {
        // Display specific error message
        if (result.errorType === 'DUPLICATE') {
          setGlobalError(result.message || t.errors.duplicate);
        } else if (result.errorType === 'NETWORK') {
          setGlobalError(t.errors.network);
        } else {
          setGlobalError(result.message || t.errors.generic);
        }
      }
    } catch (err) {
      console.error('[RegistrationForm] Exception:', err);
      setGlobalError(t.errors.generic);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="registration-form">
      {/* Global Error Banner */}
      {globalError && (
        <div className="custom-alert custom-alert-danger" role="alert">
          <i className="fa-solid fa-circle-exclamation fs-5 flex-shrink-0 mt-1"></i>
          <div>{globalError}</div>
        </div>
      )}

      {/* Row 1: Nom complet */}
      <div className="mb-3">
        <label htmlFor="nameInput" className="form-label">
          {t.nameLabel} <span className="required-indicator">*</span>
        </label>
        <div className="input-icon-group">
          <i className="fa-solid fa-user input-icon"></i>
          <input
            id="nameInput"
            name="name"
            type="text"
            autoComplete="name"
            className={`form-control input-with-icon ${
              touched.name && fieldErrors.name ? 'is-invalid' : ''
            }`}
            placeholder={t.namePlaceholder}
            value={formData.name}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSubmitting}
            required
          />
        </div>
        {touched.name && fieldErrors.name && (
          <div className="invalid-feedback">{t.errors.name}</div>
        )}
      </div>

      {/* Numéro de téléphone */}
      <div className="mb-3">
        <label htmlFor="phoneInput" className="form-label">
          {t.phoneLabel} <span className="required-indicator">*</span>
        </label>
        <div className="input-group shadow-sm rounded-pill overflow-hidden border">
          <select
            className="form-select bg-light border-0"
            style={{ maxWidth: '145px', cursor: 'pointer', fontWeight: '500' }}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            disabled={isSubmitting}
          >
            {AFRICAN_COUNTRIES.map((c) => (
              <option key={c.country} value={c.code}>
                {c.code} ({c.country.substring(0, 3)})
              </option>
            ))}
          </select>
          <input
            id="phoneInput"
            name="phoneLocal"
            type="tel"
            autoComplete="tel"
            className={`form-control border-0 ${
              touched.phoneLocal && fieldErrors.phoneLocal ? 'is-invalid' : ''
            }`}
            style={{ paddingLeft: '1rem', backgroundColor: '#fff' }}
            placeholder={t.phonePlaceholder}
            value={formData.phoneLocal}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSubmitting}
            required
          />
        </div>
        {touched.phoneLocal && fieldErrors.phoneLocal && (
          <div className="invalid-feedback d-block mt-1">{t.errors.phone}</div>
        )}
      </div>

      {/* Row 2: Adresse e-mail (Full width) */}
      <div className="mb-3">
        <label htmlFor="emailInput" className="form-label">
          {t.emailLabel} <span className="required-indicator">*</span>
        </label>
        <div className="input-icon-group">
          <i className="fa-solid fa-envelope input-icon"></i>
          <input
            id="emailInput"
            name="email"
            type="email"
            autoComplete="email"
            className={`form-control input-with-icon ${
              touched.email && fieldErrors.email ? 'is-invalid' : ''
            }`}
            placeholder={t.emailPlaceholder}
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSubmitting}
            required
          />
        </div>
        {touched.email && fieldErrors.email && (
          <div className="invalid-feedback">{t.errors.email}</div>
        )}
      </div>

      {/* Row 3: Ville & Profession */}
      <div className="row g-3 mb-4">
        {/* Ville */}
        <div className="col-12 col-md-6">
          <label htmlFor="cityInput" className="form-label">
            {t.cityLabel} <span className="required-indicator">*</span>
          </label>
          <div className="input-icon-group">
            <i className="fa-solid fa-city input-icon"></i>
            <input
              id="cityInput"
              name="city"
              type="text"
              autoComplete="address-level2"
              className={`form-control input-with-icon ${
                touched.city && fieldErrors.city ? 'is-invalid' : ''
              }`}
              placeholder={t.cityPlaceholder}
              value={formData.city}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isSubmitting}
              required
            />
          </div>
          {touched.city && fieldErrors.city && (
            <div className="invalid-feedback">{t.errors.city}</div>
          )}
        </div>

        {/* Profession */}
        <div className="col-12 col-md-6">
          <label htmlFor="occupationSelect" className="form-label">
            {t.occupationLabel} <span className="required-indicator">*</span>
          </label>
          <div className="input-icon-group">
            <i className="fa-solid fa-briefcase input-icon"></i>
            <select
              id="occupationSelect"
              name="occupation"
              className={`form-select input-with-icon ${
                touched.occupation && fieldErrors.occupation ? 'is-invalid' : ''
              }`}
              value={formData.occupation}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isSubmitting}
              required
            >
              <option value="" disabled>
                {t.occupationPlaceholder}
              </option>
              {t.occupations.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {touched.occupation && fieldErrors.occupation && (
            <div className="invalid-feedback">{t.errors.occupation}</div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="btn-submit"
        disabled={isSubmitting}
        id="submitRegistrationBtn"
      >
        {isSubmitting ? (
          <>
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            <span>{t.submitting}</span>
          </>
        ) : (
          <>
            <i className="fa-solid fa-paper-plane me-1"></i>
            <span>{t.submitButton}</span>
          </>
        )}
      </button>
    </form>
  );
}
