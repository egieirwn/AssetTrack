import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight,
  Boxes, Sparkles, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, isConfigured } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await signIn({ email: form.email, password: form.password });
      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email atau kata sandi tidak valid. Periksa kembali kredensial Anda.'
          : authError.message);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError('Terjadi kendala saat proses autentikasi. Silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="atrium-login-page">
      <div className="atrium-login-card">
        {/* Brand Header */}
        <div className="atrium-login-brand">
          <div className="atrium-login-logo">
            <Shield size={24} />
          </div>
          <div className="atrium-login-title-wrap">
            <h2>SiPenitip</h2>
            <p>PT Vinix Seven Aurum · Warehouse System</p>
          </div>
        </div>

        {/* Section Heading */}
        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--atrium-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '0.25rem'
          }}>
            Autentikasi Petugas
          </span>
          <h1 style={{
            fontSize: '1.375rem',
            fontWeight: 800,
            color: 'var(--atrium-text-primary)',
            letterSpacing: '-0.02em',
            margin: 0
          }}>
            Masuk ke Sistem Gudang
          </h1>
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--atrium-text-secondary)',
            margin: '0.35rem 0 0 0'
          }}>
            Gunakan akun Administrator atau Penjaga Gudang yang telah terdaftar.
          </p>
        </div>

        {/* Demo Mode Notice */}
        {!isConfigured && (
          <div style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '12px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.25rem',
            fontSize: '0.8125rem',
            color: '#1E40AF'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span><strong>Mode Offline Demo</strong> — Supabase belum dikonfigurasi. Anda dapat langsung mengklik masuk.</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="atrium-input-group">
            <label htmlFor="email">Alamat Email</label>
            <div style={{ position: 'relative' }}>
              <input
                id="email"
                type="email"
                name="email"
                className="atrium-input-field"
                placeholder="nama@vinix7aurum.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="atrium-input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label htmlFor="password" style={{ margin: 0 }}>Kata Sandi</label>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--atrium-text-secondary)',
                  textDecoration: 'none'
                }}
              >
                Lupa kata sandi?
              </Link>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className="atrium-input-field"
                style={{ paddingRight: '2.75rem' }}
                placeholder="Masukkan kata sandi"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--atrium-text-muted)',
                  display: 'flex',
                  alignItems: 'center'
                }}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #FECACA',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#991B1B',
              fontSize: '0.8125rem',
              marginBottom: '1rem'
            }}>
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="atrium-login-btn"
            disabled={loading}
          >
            {loading ? (
              <span>Memverifikasi Kredensial...</span>
            ) : (
              <>
                <span>Masuk ke Sistem</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Security and Registration Notice */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #F1F0F4',
          textAlign: 'center'
        }}>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--atrium-text-muted)',
            lineHeight: 1.5,
            margin: 0
          }}>
            Pendaftaran akun mandiri ditutup untuk umum. Akun Penjaga Gudang baru didaftarkan dan dikelola langsung oleh Administrator Sistem.
          </p>
        </div>
      </div>
    </div>
  );
}
