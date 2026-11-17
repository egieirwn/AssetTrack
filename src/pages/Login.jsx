import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight,
  Boxes, Sparkles, CheckCircle2, Clock, User, QrCode, Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, profile, isActive, isConfigured } = useAuth();

  // Login form state
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status & feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPendingNotice, setIsPendingNotice] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user && isActive && profile && ['admin', 'warehouse_keeper'].includes(profile.role)) {
      navigate(from, { replace: true });
    }
  }, [user, isActive, profile, navigate, from]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setIsPendingNotice(false);
  };

  // Submit Sign In
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    setError('');
    setIsPendingNotice(false);

    try {
      const { error: authError } = await signIn({ email: form.email, password: form.password });
      if (authError) {
        if (authError.isPendingApproval || authError.message.includes('persetujuan') || authError.message.includes('menunggu')) {
          setIsPendingNotice(true);
          setError(authError.message);
        } else if (authError.message === 'Invalid login credentials') {
          setError('Email atau kata sandi tidak valid. Periksa kembali kredensial Anda.');
        } else {
          setError(authError.message);
        }
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
      {/* Background decorative watermarks (matching reference styling) */}
      <div className="atrium-login-backdrop-circle-1" />
      <div className="atrium-login-backdrop-circle-2" />
      <div className="atrium-login-backdrop-ring" />

      {/* Main Dual-Panel Card */}
      <div className="atrium-login-card">
        {/* Decorative corner stripes */}
        <div className="atrium-login-stripes" />

        {/* ============================================================
            LEFT PANEL: HERO BRANDING & 3D WAREHOUSE ARTWORK
            ============================================================ */}
        <div className="atrium-login-hero">
          {/* Catchy headline with highlighted keywords */}
          <div className="atrium-hero-headline">
            Permudah pengelolaan <span className="highlight-orange">Aset Gudang</span> dan <span className="highlight-blue">Logistik Terpadu</span> secara akurat!
          </div>

          {/* 3D Visual Stage with Floating Badges */}
          <div className="atrium-hero-stage">
            {/* Soft Radial Disk */}
            <div className="atrium-hero-disk" />

            {/* Floating Badge 1: Top-Left (Barcode & QR Scanner) */}
            <div className="atrium-float-badge badge-top-left" title="Pemindai Barcode Cepat">
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EA580C'
              }}>
                <QrCode size={20} />
              </div>
            </div>

            {/* Floating Badge 2: Top-Right (Keamanan & Audit) */}
            <div className="atrium-float-badge badge-top-right" title="Proteksi Audit Trail & Keamanan">
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#DC2626'
              }}>
                <Shield size={20} />
              </div>
            </div>

            {/* Central 3D Device Card */}
            <div className="atrium-hero-device">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', alignSelf: 'flex-start' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  Terminal Gudang
                </span>
              </div>

              {/* Central warehouse crate / asset icon */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.15)',
                marginBottom: '0.75rem'
              }}>
                <Boxes size={44} strokeWidth={1.75} />
              </div>

              <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#0F172A', marginBottom: '0.2rem' }}>
                Vinix Seven Aurum
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#64748B', marginBottom: '0.875rem' }}>
                Status: 100% Stok Terverifikasi
              </div>

              {/* Simulated "Accept" / Action pill */}
              <div style={{
                width: '100%',
                padding: '0.45rem',
                borderRadius: '8px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                boxShadow: '0 4px 10px rgba(15, 23, 42, 0.18)'
              }}>
                <Sparkles size={12} color="#FBBF24" />
                <span>Verifikasi Aset</span>
              </div>
            </div>

            {/* Floating Badge 3: Bottom-Left (Stok Real-time) */}
            <div className="atrium-float-badge badge-bottom-left" title="Pelacakan Stok Real-time">
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284C7'
              }}>
                <CheckCircle2 size={20} />
              </div>
            </div>

            {/* Floating Badge 4: Bottom-Right (Manajemen Waktu / Jadwal) */}
            <div className="atrium-float-badge badge-bottom-right" title="Jatuh Tempo & Pengembalian">
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669'
              }}>
                <Clock size={20} />
              </div>
            </div>
          </div>

          {/* Bottom Footer Note */}
          <div className="atrium-hero-footer-note">
            <Shield size={14} color="#2563EB" />
            <span>PT Vinix Seven Aurum · Enterprise WMS v2.0</span>
          </div>
        </div>

        {/* ============================================================
            RIGHT PANEL: LOGIN FORM ONLY
            ============================================================ */}
        <div className="atrium-login-form-panel">
          {/* Brand Logo & Name */}
          <div className="atrium-form-brand-row">
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Boxes size={18} />
            </div>
            <div className="atrium-form-brand-text">
              Vinix<span className="atrium-form-brand-accent">Warehouse</span>
            </div>
          </div>

          {/* Greeting Title */}
          <h1 className="atrium-form-greeting-title">
            Hai, selamat datang kembali
          </h1>

          {/* Subtitle — static, no register toggle */}
          <div className="atrium-form-switch-subtext">
            Masukkan kredensial akun Anda untuk mengakses sistem.
          </div>

          {/* Demo Mode Notice */}
          {!isConfigured && (
            <div style={{
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '10px',
              padding: '0.65rem 0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              fontSize: '0.78125rem',
              color: '#1E40AF'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span><strong>Mode Offline Demo</strong> — Supabase belum dikonfigurasi.</span>
            </div>
          )}

          {/* ============================================================
              FORM: SIGN IN (MASUK)
              ============================================================ */}
          <form onSubmit={handleSubmit}>
            <div className="atrium-modern-input-wrap">
              <input
                id="email"
                type="email"
                name="email"
                className="atrium-modern-input-field"
                placeholder="Contoh: email@example.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="atrium-modern-input-wrap">
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="atrium-modern-input-field"
                  style={{ paddingRight: '2.75rem' }}
                  placeholder="Masukkan kata sandi kamu"
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
                    color: '#94A3B8',
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
                backgroundColor: isPendingNotice ? '#FEF3C7' : '#FEE2E2',
                border: `1px solid ${isPendingNotice ? '#FCD34D' : '#FECACA'}`,
                borderRadius: '10px',
                padding: '0.65rem 0.875rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                color: isPendingNotice ? '#92400E' : '#991B1B',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                lineHeight: 1.45
              }}>
                {isPendingNotice ? (
                  <Clock size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="atrium-modern-submit-btn"
              disabled={loading}
            >
              {loading ? 'Memverifikasi...' : 'Masuk'}
            </button>

            {/* Forgot password link below button */}
            <div style={{ textAlign: 'right', marginTop: '0.625rem' }}>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: '0.78125rem',
                  fontWeight: 600,
                  color: '#2563EB',
                  textDecoration: 'none'
                }}
              >
                Lupa kata sandi?
              </Link>
            </div>

            {/* Enterprise Role Access Badges */}
            <div style={{ margin: '1.25rem 0 0.875rem 0' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center', marginBottom: '0.625rem' }}>
                Atau masuk menggunakan portal resmi
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem' }}>
                <div className="atrium-access-badge-card" title="Hak Akses Administrator Sistem">
                  <Shield size={14} color="#2563EB" />
                  <span>Admin</span>
                </div>
                <div className="atrium-access-badge-card" title="Hak Akses Penjaga Gudang">
                  <Boxes size={14} color="#059669" />
                  <span>Gudang</span>
                </div>
                <div className="atrium-access-badge-card" title="Keamanan Enkripsi Data SSL/TLS">
                  <Lock size={14} color="#475569" />
                  <span>Tersertifikasi</span>
                </div>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8125rem',
              color: '#475569',
              cursor: 'pointer',
              margin: '0.875rem 0 1.25rem 0',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: '#2563EB',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
              <span>Ingat perangkat ini</span>
            </label>

            {/* Terms and Privacy Policy Footer */}
            <div style={{ fontSize: '0.71875rem', color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
              Dengan melanjutkan, kamu menerima{' '}
              <span style={{ color: '#2563EB', fontWeight: 600 }}>Syarat Penggunaan</span> dan{' '}
              <span style={{ color: '#2563EB', fontWeight: 600 }}>Kebijakan Privasi</span> PT Vinix Seven Aurum.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
