import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles = null }) {
  const { user, profile, loading, isConfigured, signOut, revalidateActiveProfile } = useAuth();
  const location = useLocation();
  const [revalidationDeactivated, setRevalidationDeactivated] = useState(false);

  // Server-backed profile revalidation upon route navigation
  useEffect(() => {
    let mounted = true;
    if (isConfigured && user && revalidateActiveProfile) {
      revalidateActiveProfile().then(result => {
        if (!mounted) return;
        if (result && result.valid === false && result.reason === 'DEACTIVATED') {
          setRevalidationDeactivated(true);
        }
      }).catch(() => {
        // Network errors are handled separately and do not falsely deactivate users
      });
    }
    return () => { mounted = false; };
  }, [location.pathname, user?.id, isConfigured, revalidateActiveProfile]);

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

  // Fail closed: account must be explicitly active (is_active === true)
  if (revalidationDeactivated || (profile && profile.is_active !== true)) {
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
            backgroundColor: revalidationDeactivated ? '#FEE2E2' : '#FEF3C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertCircle size={32} color={revalidationDeactivated ? '#DC2626' : '#D97706'} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#17191C', margin: 0 }}>
            {revalidationDeactivated ? 'Akun Dinonaktifkan' : 'Akun Menunggu Persetujuan Admin'}
          </h2>
          <p style={{ color: '#5F646D', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
            {revalidationDeactivated
              ? 'Akun Anda saat ini telah dinonaktifkan oleh Administrator PT Vinix Seven Aurum. Akses operasional sistem gudang telah ditutup. Silakan hubungi Administrator untuk informasi lebih lanjut.'
              : 'Akun Anda telah terdaftar namun saat ini berstatus nonaktif (menunggu verifikasi). Sesuai kebijakan keamanan, akses operasional gudang akan dibuka segera setelah diaktifkan oleh Administrator.'}
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
