import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles = null }) {
  const { user, profile, loading, isConfigured, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--atrium-canvas, #E8E7E9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '16px',
          backgroundColor: '#17191C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
        }}>
          <Shield size={26} color="#FFFFFF" />
        </div>
        <p style={{ color: '#5F646D', fontSize: '0.875rem', fontWeight: 600 }}>Memverifikasi sesi sistem...</p>
      </div>
    );
  }

  if (isConfigured && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile && profile.is_active === false) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--atrium-canvas, #E8E7E9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.05)',
          padding: '2.5rem 2rem',
          maxWidth: '460px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#FEE2E2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertCircle size={32} color="#DC2626" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#17191C', margin: 0 }}>Akun Dinonaktifkan</h2>
          <p style={{ color: '#5F646D', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
            Akun Anda saat ini berstatus nonaktif. Akses ke sistem gudang telah ditutup. Silakan hubungi Administrator PT Vinix Seven Aurum untuk informasi lebih lanjut.
          </p>
          <button
            type="button"
            className="atrium-btn-dark"
            style={{ width: '100%', padding: '0.75rem 1.5rem', marginTop: '0.5rem' }}
            onClick={async () => {
              await signOut();
            }}
          >
            Keluar ke Halaman Masuk
          </button>
        </div>
      </div>
    );
  }

  if (profile && !['admin', 'warehouse_keeper'].includes(profile.role)) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
