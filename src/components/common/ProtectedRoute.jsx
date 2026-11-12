import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles = null }) {
  const { user, profile, loading, isConfigured, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <Shield size={32} color="var(--color-primary)" />
        <span className="spinner spinner-primary" style={{ width: '2rem', height: '2rem' }} />
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Memverifikasi sesi...</p>
      </div>
    );
  }

  if (isConfigured && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile && profile.is_active === false) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <AlertCircle size={40} color="#DC2626" />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Akun Dinonaktifkan</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', maxWidth: '420px', lineHeight: 1.5 }}>
          Akun Anda saat ini berstatus nonaktif. Silakan hubungi Administrator PT Vinix Seven Aurum untuk mengaktifkan kembali akses Anda.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await signOut();
          }}
        >
          Keluar ke Halaman Masuk
        </button>
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
