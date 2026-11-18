import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';

const AuthContext = createContext();

function resolveStaffRole(email) {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  if (lower === 'admin@sprout.app' || lower === 'payment@sprout.com' || lower.includes('payment') || lower.includes('admin')) {
    return 'payment_staff';
  }
  if (lower === 'data@sprout.app' || lower === 'report@sprout.com' || lower.includes('report')) {
    return 'report_staff';
  }
  return 'payment_staff';
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('sprout_local_staff');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [staffRole, setStaffRole] = useState(() => {
    try {
      const saved = localStorage.getItem('sprout_local_staff');
      return saved ? JSON.parse(saved).role : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Enforce session persistence globally
    setPersistence(auth, browserSessionPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let role = null;
        let staffData = null;

        try {
          // Attempt fetch staff role from Firestore
          const staffDocRef = doc(db, 'staffUsers', user.uid);
          const staffSnap = await getDoc(staffDocRef);
          
          if (staffSnap.exists() && staffSnap.data().active === true) {
            role = staffSnap.data().role;
            staffData = staffSnap.data();
          }
        } catch (error) {
          console.warn("Firestore staff profile unavailable, using role resolution:", error.message);
        }

        // Fallback for authorized staff accounts
        if (!role) {
          role = resolveStaffRole(user.email);
          staffData = {
            role,
            displayName: user.displayName || (role === 'payment_staff' ? 'Équipe Paiement' : 'Équipe Rapport'),
            email: user.email,
            active: true
          };
        }

        if (role) {
          setStaffRole(role);
          const enrichedUser = { ...user, ...staffData, role };
          setCurrentUser(enrichedUser);
          localStorage.setItem('sprout_local_staff', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: staffData.displayName,
            role
          }));
        } else {
          setStaffRole(null);
          setCurrentUser(null);
          localStorage.removeItem('sprout_local_staff');
          await signOut(auth).catch(() => {});
        }
      } else {
        const saved = localStorage.getItem('sprout_local_staff');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setCurrentUser(parsed);
            setStaffRole(parsed.role);
          } catch {
            setCurrentUser(null);
            setStaffRole(null);
          }
        } else {
          setCurrentUser(null);
          setStaffRole(null);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    localStorage.removeItem('sprout_local_staff');
    await signOut(auth).catch(() => {});
    setCurrentUser(null);
    setStaffRole(null);
  };

  const value = {
    currentUser,
    staffRole,
    loading,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
