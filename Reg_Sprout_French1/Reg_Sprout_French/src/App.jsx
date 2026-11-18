import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Registration from './pages/Registration';
import ThankYou from './pages/ThankYou';
import Login from './pages/Login';
import PaymentStaff from './pages/PaymentStaff';
import ReportStaff from './pages/ReportStaff';
import Unauthorized from './pages/Unauthorized';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <div className="d-flex flex-column min-vh-100">
        <main className="flex-grow-1 d-flex flex-column">
          <Routes>
            {/* Root route redirects to /registration */}
            <Route path="/" element={<Navigate to="/registration" replace />} />

            {/* Public Phase 1 Routes */}
            <Route path="/registration" element={<Registration />} />
            <Route path="/thank-you" element={<ThankYou />} />

            {/* Phase 2 Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Protected Phase 2 Staff Routes */}
            <Route 
              path="/paymentstaff" 
              element={
                <ProtectedRoute allowedRoles={['payment_staff']}>
                  <PaymentStaff />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reportstaff" 
              element={
                <ProtectedRoute allowedRoles={['report_staff']}>
                  <ReportStaff />
                </ProtectedRoute>
              } 
            />

            {/* Fallback unknown route redirects to /registration */}
            <Route path="*" element={<Navigate to="/registration" replace />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <div className="container">
            <small className="app-footer-brand">
              Sprout &bull; Kairos &bull; Plateforme d'inscription sécurisée
            </small>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
