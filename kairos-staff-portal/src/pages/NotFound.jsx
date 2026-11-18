import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="card border-0 shadow-sm rounded-4 p-5 text-center" style={{ maxWidth: '420px' }}>
        <h1 className="display-4 fw-bold text-muted mb-2">404</h1>
        <h4 className="fw-bold mb-3" style={{ color: '#0B192C' }}>Page Not Found</h4>
        <p className="text-muted mb-4">The requested page does not exist.</p>
        <button className="btn btn-primary rounded-pill px-4" style={{ backgroundColor: '#00AEEF', borderColor: '#00AEEF' }} onClick={() => navigate('/login')}>
          Back to Portal
        </button>
      </div>
    </div>
  );
}
