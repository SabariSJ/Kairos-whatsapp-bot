import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [staffRole, setStaffRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from storage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('kairos_token');
      const storedUser = localStorage.getItem('kairos_user');

      if (storedToken && storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setCurrentUser(user);
          setStaffRole(user.role);

          // Background verification of token validity
          authApi.getMe()
            .then((res) => {
              if (res.success && res.user) {
                setCurrentUser(res.user);
                setStaffRole(res.user.role);
                localStorage.setItem('kairos_user', JSON.stringify(res.user));
              }
            })
            .catch(() => {
              // Token invalid or expired - handled by axios interceptor
            });
        } catch (e) {
          localStorage.removeItem('kairos_token');
          localStorage.removeItem('kairos_user');
          setCurrentUser(null);
          setStaffRole(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login({ email, password });
    if (data.success && data.token && data.user) {
      localStorage.setItem('kairos_token', data.token);
      localStorage.setItem('kairos_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setStaffRole(data.user.role);
      return data.user;
    }
    throw new Error(data.error || 'Authentication failed');
  };

  const logout = () => {
    localStorage.removeItem('kairos_token');
    localStorage.removeItem('kairos_user');
    setCurrentUser(null);
    setStaffRole(null);
  };

  const value = {
    currentUser,
    staffRole,
    isAuthenticated: Boolean(currentUser),
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
