import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { staffRole, logout } = useAuth();

  const handleReturn = () => {
    if (staffRole === 'payment_staff') {
      navigate('/payments');
    } else if (staffRole === 'report_staff') {
      navigate('/reports');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="card border-0 shadow-lg rounded-4 p-5 text-center" style={{ maxWidth: '460px' }}>
        <img src={logo} alt="Logo" style={{ height: '45px', objectFit: 'contain' }} className="mx-auto mb-4" />
        <div className="text-danger mb-3">
          <i className="fa-solid fa-shield-halved fa-3x"></i>
        </div>
        <h3 className="fw-bold mb-2" style={{ color: '#0B192C' }}>Access Restricted</h3>
        <p className="text-muted mb-4">
          Your staff account (<strong>{staffRole || 'Unknown Role'}</strong>) does not have permission to view this module.
        </p>
        <div className="d-flex gap-2 justify-content-center">
          <button className="btn btn-primary rounded-pill px-4" style={{ backgroundColor: '#00AEEF', borderColor: '#00AEEF' }} onClick={handleReturn}>
            Return to My Dashboard
          </button>
          <button className="btn btn-outline-secondary rounded-pill px-4" onClick={() => { logout(); navigate('/login'); }}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
