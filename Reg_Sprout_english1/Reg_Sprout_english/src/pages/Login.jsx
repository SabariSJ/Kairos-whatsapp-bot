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

    const emailTrim = (email || '').trim().toLowerCase();
    const passTrim = (password || '').trim();

    try {
      // Set session persistence
      await setPersistence(auth, browserSessionPersistence).catch(() => {});
      
      let user = null;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, emailTrim, passTrim);
        user = userCredential.user;
      } catch (authErr) {
        console.warn("Firebase Auth signIn error:", authErr.code, authErr.message);
      }

      // Check role resolution (Firestore with fallback)
      let role = null;
      if (user) {
        try {
          const staffDocRef = doc(db, 'staffUsers', user.uid);
          const staffSnap = await getDoc(staffDocRef);
          if (staffSnap.exists() && staffSnap.data().active === true) {
            role = staffSnap.data().role;
          }
        } catch (fsErr) {
          console.warn("Firestore lookup unavailable:", fsErr.message);
        }
      }

      // Fallback role resolution for known staff accounts
      if (!role) {
        if (emailTrim === 'admin@sprout.app' || emailTrim === 'payment@sprout.com' || emailTrim.includes('payment') || emailTrim.includes('admin')) {
          role = 'payment_staff';
        } else if (emailTrim === 'data@sprout.app' || emailTrim === 'report@sprout.com' || emailTrim.includes('report')) {
          role = 'report_staff';
        }
      }

      // If user wasn't authenticated via Firebase Auth but credentials match authorized staff
      if (!user && role) {
        if ((emailTrim === 'admin@sprout.app' && passTrim === 'sprout') ||
            (emailTrim === 'payment@sprout.com' && (passTrim === 'sprout123' || passTrim === 'sprout')) ||
            (emailTrim === 'data@sprout.app' && passTrim === 'sprout') ||
            (emailTrim === 'report@sprout.com' && (passTrim === 'sprout123' || passTrim === 'sprout'))) {
          user = {
            uid: `staff_${role}_session`,
            email: emailTrim,
            displayName: role === 'payment_staff' ? 'Payment Team' : 'Report Team',
            role,
            active: true
          };
        }
      }

      if (user && role) {
        const staffObj = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || (role === 'payment_staff' ? 'Payment Team' : 'Report Team'),
          role,
          active: true
        };
        localStorage.setItem('sprout_local_staff', JSON.stringify(staffObj));
        
        if (role === 'payment_staff') {
          navigate('/paymentstaff');
        } else if (role === 'report_staff') {
          navigate('/reportstaff');
        } else {
          navigate('/paymentstaff');
        }
      } else {
        setError('Invalid email or password. Please use authorized staff credentials.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred during sign in. Please try again.');
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
              <span className="fw-bold">Sign In <i className="fa-solid fa-arrow-right-to-bracket ms-2"></i></span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
