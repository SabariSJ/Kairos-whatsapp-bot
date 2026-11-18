import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, staffRole, login } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      if (staffRole === 'payment_staff') {
        navigate('/payments', { replace: true });
      } else if (staffRole === 'report_staff') {
        navigate('/reports', { replace: true });
      }
    }
  }, [currentUser, staffRole, navigate]);

  // Check if redirected due to expired token
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('expired') === 'true') {
      setError('Your session has expired. Please log in again.');
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const user = await login(email, password);
      if (user.role === 'payment_staff') {
        navigate('/payments');
      } else if (user.role === 'report_staff') {
        navigate('/reports');
      } else {
        navigate('/unauthorized');
      }
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.response?.data?.error || err.message || 'Invalid email or password.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="registration-wrapper d-flex align-items-center justify-content-center min-vh-100"
      style={{ backgroundColor: '#F8FAFC' }}
    >
      <div
        className="card border-0 shadow-lg rounded-4 p-4 p-sm-5 w-100"
        style={{ maxWidth: '420px', backgroundColor: '#fff' }}
      >
        <div className="text-center mb-5">
          <img src={logo} alt="Sprout Logo" style={{ height: '50px', objectFit: 'contain' }} className="mb-4" />
          <h3 className="fw-bold" style={{ color: '#0B192C' }}>Central Staff Portal</h3>
          <p className="text-muted small">Sign in with your staff credentials</p>
        </div>

        {error && (
          <div className="alert alert-danger border-0 rounded-3 text-center" role="alert" style={{ fontSize: '0.9rem' }}>
            <i className="fa-solid fa-triangle-exclamation me-2"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
              Email Address
            </label>
            <div className="input-group input-group-lg shadow-sm rounded-3 overflow-hidden border">
              <span className="input-group-text bg-light border-0 text-secondary px-3">
                <i className="fa-solid fa-envelope"></i>
              </span>
              <input
                type="email"
                className="form-control border-0 bg-light"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                style={{ fontSize: '1rem', paddingLeft: '5px' }}
                placeholder="payment@sprout.com"
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>
              Password
            </label>
            <div className="input-group input-group-lg shadow-sm rounded-3 overflow-hidden border">
              <span className="input-group-text bg-light border-0 text-secondary px-3">
                <i className="fa-solid fa-lock"></i>
              </span>
              <input
                type="password"
                className="form-control border-0 bg-light"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                style={{ fontSize: '1rem', paddingLeft: '5px' }}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100 rounded-pill d-flex justify-content-center align-items-center transition-all shadow hover-primary"
            disabled={isSubmitting}
            style={{ backgroundColor: '#00AEEF', borderColor: '#00AEEF', height: '56px' }}
            title="Sign In"
          >
            {isSubmitting ? (
              <div className="spinner-border spinner-border-sm text-white" role="status"></div>
            ) : (
              <span className="fw-bold">Sign In <i className="fa-solid fa-arrow-right ms-2"></i></span>
            )}
          </button>
        </form>

        <div className="mt-4 pt-3 border-top text-center text-muted" style={{ fontSize: '0.75rem' }}>
          <div>Testing Accounts:</div>
          <div><code>payment@sprout.com</code> &bull; <code>report@sprout.com</code></div>
        </div>
      </div>
    </div>
  );
}
