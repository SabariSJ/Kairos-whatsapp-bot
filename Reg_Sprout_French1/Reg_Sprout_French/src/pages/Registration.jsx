import React from 'react';
import RegistrationForm from '../components/RegistrationForm';
import { TRANSLATIONS } from '../utils/i18n';
import logoImg from '../assets/logo.png';

export default function Registration() {
  const lang = 'fr';
  const t = TRANSLATIONS[lang];

  return (
    <div className="registration-wrapper">
      <div className="registration-card p-4 p-md-5">

        {/* Brand Logo Presentation */}
        <div className="brand-logo-container">
          <img
            src={logoImg}
            alt="Sprout | Kairos by Sprout"
            className="brand-logo-img"
          />
        </div>

        {/* Header Section */}
        <div className="text-center mb-4">
          <div className="form-header-badge">
            <i className="fa-solid fa-seedling"></i>
            <span>{t.badge}</span>
          </div>
          <h1 className="form-heading">{t.title}</h1>
          <p className="form-subtitle">
            {t.subtitle}
          </p>
        </div>

        {/* Registration Form Component */}
        <RegistrationForm lang={lang} t={t} />
      </div>
    </div>
  );
}
