import React from 'react';

export default function LanguageFilter({ value, onChange }) {
  return (
    <div className="btn-group shadow-sm rounded-pill p-1 bg-light border" role="group" aria-label="Language Filter">
      <button
        type="button"
        className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold transition-all ${
          value === 'all' ? 'btn-primary text-white shadow-sm' : 'btn-light text-secondary border-0'
        }`}
        style={value === 'all' ? { backgroundColor: '#00AEEF', borderColor: '#00AEEF' } : {}}
        onClick={() => onChange('all')}
      >
        <i className="fa-solid fa-globe me-1"></i> All
      </button>
      <button
        type="button"
        className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold transition-all ${
          value === 'en' ? 'btn-primary text-white shadow-sm' : 'btn-light text-secondary border-0'
        }`}
        style={value === 'en' ? { backgroundColor: '#00AEEF', borderColor: '#00AEEF' } : {}}
        onClick={() => onChange('en')}
      >
        🇬🇧 English
      </button>
      <button
        type="button"
        className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold transition-all ${
          value === 'fr' ? 'btn-primary text-white shadow-sm' : 'btn-light text-secondary border-0'
        }`}
        style={value === 'fr' ? { backgroundColor: '#00AEEF', borderColor: '#00AEEF' } : {}}
        onClick={() => onChange('fr')}
      >
        🇫🇷 Français
      </button>
    </div>
  );
}
