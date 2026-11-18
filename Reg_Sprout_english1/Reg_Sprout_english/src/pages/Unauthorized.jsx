import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { staffRole } = useAuth();

  const handleGoToDashboard = () => {
    if (staffRole === 'payment_staff') {
      navigate('/paymentstaff');
    } else if (staffRole === 'report_staff') {
      navigate('/reportstaff');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="registration-wrapper" style={{ backgroundColor: '#f1f5f9' }}>
      <div className="registration-card p-5 text-center" style={{ maxWidth: '480px' }}>
        <i className="fa-solid fa-triangle-exclamation text-warning mb-4" style={{ fontSize: '4rem' }}></i>
        <h2 className="font-weight-bold mb-3" style={{ color: '#0f172a' }}>Unauthorized Access</h2>
        <p className="text-muted mb-4" style={{ fontSize: '1.1rem' }}>
          You do not have permission to access this page.
        </p>
        <button 
          onClick={handleGoToDashboard}
          className="btn btn-primary"
          style={{ backgroundColor: '#00AEEF', borderColor: '#00AEEF', fontWeight: '600' }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
