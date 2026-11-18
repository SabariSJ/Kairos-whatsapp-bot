import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { currentUser, staffRole } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      if (staffRole === 'payment_staff') {
        navigate('/paymentstaff', { replace: true });
      } else if (staffRole === 'report_staff') {
        navigate('/reportstaff', { replace: true });
      }
    }
  }, [currentUser, staffRole, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Set session persistence (clears login when browser window is closed)
      await setPersistence(auth, browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Verify role
      const staffDocRef = doc(db, 'staffUsers', user.uid);
      const staffSnap = await getDoc(staffDocRef);

      if (staffSnap.exists() && staffSnap.data().active === true) {
        const role = staffSnap.data().role;
        if (role === 'payment_staff') {
          navigate('/paymentstaff');
        } else if (role === 'report_staff') {
          navigate('/reportstaff');
        } else {
          setError('Invalid role assigned to your account.');
          await auth.signOut();
        }
      } else {
        setError('Your account is not authorized or inactive.');
        await auth.signOut();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="registration-wrapper d-flex align-items-center justify-content-center min-vh-100" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="card border-0 shadow-lg rounded-4 p-4 p-sm-5 w-100" style={{ maxWidth: '420px', backgroundColor: '#fff' }}>
        
        <div className="text-center mb-5">
          <img src={logo} alt="Sprout Logo" style={{ height: '50px', objectFit: 'contain' }} className="mb-4" />
          <h3 className="fw-bold" style={{ color: '#0B192C' }}>Staff Portal</h3>
          <p className="text-muted small">Please sign in to access your dashboard</p>
        </div>
        
        {error && (
          <div className="alert alert-danger border-0 rounded-3 text-center" role="alert" style={{ fontSize: '0.9rem' }}>
            <i className="fa-solid fa-triangle-exclamation me-2"></i>{error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>Email Address</label>
            <div className="input-group input-group-lg shadow-sm rounded-3 overflow-hidden border">
              <span className="input-group-text bg-light border-0 text-secondary px-3"><i className="fa-solid fa-envelope"></i></span>
              <input
                type="email"
                className="form-control border-0 bg-light"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                style={{ fontSize: '1rem', paddingLeft: '5px' }}
                placeholder="admin@sprout.app"
              />
            </div>
          </div>
          <div className="mb-5">
            <label className="form-label text-muted fw-bold mb-2" style={{ fontSize: '0.85rem' }}>Password</label>
            <div className="input-group input-group-lg shadow-sm rounded-3 overflow-hidden border">
              <span className="input-group-text bg-light border-0 text-secondary px-3"><i className="fa-solid fa-lock"></i></span>
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
              <i className="fa-solid fa-arrow-right-to-bracket fs-4"></i>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
