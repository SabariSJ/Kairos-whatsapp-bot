import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import PaymentDashboard from './pages/PaymentDashboard';
import ReportDashboard from './pages/ReportDashboard';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';

function RootRedirect() {
  const { currentUser, staffRole, loading } = useAuth();
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (staffRole === 'payment_staff') {
    return <Navigate to="/payments" replace />;
  }
  if (staffRole === 'report_staff') {
    return <Navigate to="/reports" replace />;
  }
  return <Navigate to="/unauthorized" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="d-flex flex-column min-vh-100">
        <main className="flex-grow-1">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Protected Payment Staff Dashboard */}
            <Route
              path="/payments"
              element={
                <ProtectedRoute allowedRoles={['payment_staff']}>
                  <PaymentDashboard />
                </ProtectedRoute>
              }
            />

            {/* Protected Report Staff Dashboard */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={['report_staff']}>
                  <ReportDashboard />
                </ProtectedRoute>
              }
            />

            {/* 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="py-3 text-center text-muted border-top bg-white" style={{ fontSize: '0.8rem' }}>
          <small>
            Sprout &bull; Kairos &bull; Central Staff Portal &bull; Enterprise Secure Edition
          </small>
        </footer>
      </div>
    </AuthProvider>
  );
}
