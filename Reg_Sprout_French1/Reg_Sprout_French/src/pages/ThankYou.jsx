import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TRANSLATIONS } from '../utils/i18n';
import logoImg from '../assets/logo.png';

export default function ThankYou() {
  const location = useLocation();
  const lang = location.state?.lang || 'fr';
  const t = TRANSLATIONS[lang].thankYou;

  return (
    <div className="registration-wrapper">
      <div className="registration-card thankyou-card">
        {/* Brand Logo Presentation */}
        <div className="brand-logo-container mb-4">
          <img
            src={logoImg}
            alt="Sprout | Kairos by Sprout"
            className="brand-logo-img"
          />
        </div>

        {/* Animated Checkmark / Success Badge */}
        <div className="success-icon-wrapper" aria-hidden="true">
          <i className="fa-solid fa-check"></i>
        </div>

        {/* Heading & Confirmation Messages */}
        <h1 className="thankyou-heading">{t.title}</h1>
        <p className="thankyou-main-msg">
          {t.mainMsg}
        </p>
        <p className="thankyou-sub-msg">
          {t.subMsg}
        </p>

        {/* Action Buttons */}
        <div className="d-flex justify-content-center gap-3 flex-wrap">
          <Link to="/registration" className="btn-back" id="backToFormBtn">
            <i className="fa-solid fa-arrow-left"></i>
            <span>{t.backBtn}</span>
          </Link>
          <a href="https://google.com" className="btn-back" id="exitBtn">
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>{t.exitBtn}</span>
          </a>
        </div>
      </div>
      <div className="position-absolute bottom-0 text-center w-100 p-3" style={{ fontSize: '0.8rem', color: '#64748b' }}>
        {t.footer}
      </div>
    </div>
  );
}
