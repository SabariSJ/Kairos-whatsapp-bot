import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [staffRole, setStaffRole] = useState(null); // 'payment_staff' | 'report_staff' | null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Enforce session persistence globally
    setPersistence(auth, browserSessionPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Fetch staff role from Firestore
          const staffDocRef = doc(db, 'staffUsers', user.uid);
          const staffSnap = await getDoc(staffDocRef);
          
          if (staffSnap.exists() && staffSnap.data().active === true) {
            setStaffRole(staffSnap.data().role);
            setCurrentUser({ ...user, ...staffSnap.data() });
          } else {
            // User exists in Auth but not authorized in staffUsers or inactive
            setStaffRole(null);
            setCurrentUser(null);
            await signOut(auth); // force sign out
          }
        } catch (error) {
          console.error("Error fetching staff details:", error);
          setStaffRole(null);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setStaffRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut(auth);
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
