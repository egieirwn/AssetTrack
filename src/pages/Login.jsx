import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight,
  Boxes, Sparkles, CheckCircle2, Clock, User, UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, user, isConfigured } = useAuth();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState('login');

  // Login form state
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Register form state
  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Status & feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPendingNotice, setIsPendingNotice] = useState(false);
  const [successPending, setSuccessPending] = useState(null);

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setIsPendingNotice(false);
  };

  const handleRegChange = (e) => {
    setRegForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
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

  // Submit Sign Up (Warehouse Keeper registration)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!regForm.fullName.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }
    if (!regForm.email.trim()) {
      setError('Alamat email wajib diisi.');
      return;
    }
    if (!regForm.password) {
      setError('Kata sandi wajib diisi.');
      return;
    }
    if (regForm.password.length < 6) {
      setError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (regForm.password !== regForm.confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: regError } = await signUp({
        email: regForm.email.trim(),
        password: regForm.password,
        fullName: regForm.fullName.trim()
      });

      if (regError) {
        const msg = regError.message || '';
        if (msg.includes('already registered') || msg.includes('User already registered') || msg.includes('already in use')) {
          setError('Alamat email ini sudah terdaftar di sistem. Silakan masuk atau gunakan fitur lupa kata sandi.');
        } else {
          setError(msg || 'Gagal melakukan pendaftaran akun petugas.');
        }
      } else {
        // Registrasi berhasil: tampilkan layar Akun Menunggu Persetujuan Admin
        setSuccessPending({
          email: regForm.email.trim(),
          fullName: regForm.fullName.trim()
        });
        setRegForm({ fullName: '', email: '', password: '', confirmPassword: '' });
      }
    } catch (err) {
      setError('Terjadi kendala jaringan saat mendaftarkan akun. Silakan coba lagi.');
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
        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--atrium-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '0.25rem'
          }}>
            {authMode === 'login' ? 'Autentikasi Petugas' : 'Registrasi Petugas Gudang'}
          </span>
          <h1 style={{
            fontSize: '1.375rem',
            fontWeight: 800,
            color: 'var(--atrium-text-primary)',
            letterSpacing: '-0.02em',
            margin: 0
          }}>
            {authMode === 'login' ? 'Masuk ke Sistem Gudang' : 'Pendaftaran Akun Baru'}
          </h1>
          <p style={{
            fontSize: '0.8125rem',
            color: 'var(--atrium-text-secondary)',
            margin: '0.35rem 0 0 0'
          }}>
            {authMode === 'login'
              ? 'Gunakan akun Administrator atau Penjaga Gudang yang telah terdaftar.'
              : 'Daftarkan akun Penjaga Gudang baru. Akun memerlukan aktivasi oleh Administrator.'}
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        {!successPending && (
          <div style={{
            display: 'flex',
            backgroundColor: '#F1F0F4',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '1.25rem'
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setError(''); setIsPendingNotice(false); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: authMode === 'login' ? '#FFFFFF' : 'transparent',
                color: authMode === 'login' ? 'var(--atrium-text-primary)' : 'var(--atrium-text-muted)',
                boxShadow: authMode === 'login' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setError(''); setIsPendingNotice(false); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: authMode === 'register' ? '#FFFFFF' : 'transparent',
                color: authMode === 'register' ? 'var(--atrium-text-primary)' : 'var(--atrium-text-muted)',
                boxShadow: authMode === 'register' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Daftar Petugas
            </button>
          </div>
        )}

        {/* Demo Mode Notice */}
        {!isConfigured && !successPending && (
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
            <span><strong>Mode Offline Demo</strong> — Supabase belum dikonfigurasi. Anda dapat menguji alur sistem secara lokal.</span>
          </div>
        )}

        {/* Screen: Success Pending Approval */}
        {successPending ? (
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto'
            }}>
              <Clock size={28} />
            </div>

            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>
              Menunggu Persetujuan Admin
            </span>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.75rem 0 0.5rem 0', color: 'var(--atrium-text-primary)' }}>
              Pendaftaran Berhasil
            </h3>

            <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', lineHeight: 1.6, margin: '0 0 1.25rem 0' }}>
              Akun Penjaga Gudang untuk <strong>{successPending.email}</strong> telah terdaftar di sistem.
              Sesuai kebijakan keamanan PT Vinix Seven Aurum, akun baru berstatus nonaktif hingga diverifikasi dan diaktifkan oleh Administrator.
            </p>

            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              fontSize: '0.75rem',
              color: '#475569',
              textAlign: 'left',
              marginBottom: '1.5rem',
              lineHeight: 1.5
            }}>
              <strong>Konfirmasi Email Dinonaktifkan:</strong> Anda tidak perlu menunggu atau membuka tautan konfirmasi email. Akses sistem gudang akan terbuka segera setelah Administrator mengaktifkan akun Anda.
            </div>

            <button
              type="button"
              className="atrium-btn-dark"
              style={{ width: '100%', padding: '0.75rem' }}
              onClick={() => {
                setSuccessPending(null);
                setAuthMode('login');
              }}
            >
              Kembali ke Halaman Masuk
            </button>
          </div>
        ) : authMode === 'login' ? (
          /* ============================================================
             FORM: SIGN IN (MASUK)
             ============================================================ */
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
                backgroundColor: isPendingNotice ? '#FEF3C7' : '#FEE2E2',
                border: `1px solid ${isPendingNotice ? '#FCD34D' : '#FECACA'}`,
                borderRadius: '12px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                color: isPendingNotice ? '#92400E' : '#991B1B',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                lineHeight: 1.5
              }}>
                {isPendingNotice ? (
                  <Clock size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
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
        ) : (
          /* ============================================================
             FORM: SIGN UP (DAFTAR PETUGAS GUDANG)
             ============================================================ */
          <form onSubmit={handleRegisterSubmit}>
            <div className="atrium-input-group">
              <label htmlFor="reg-fullName">Nama Lengkap</label>
              <input
                id="reg-fullName"
                type="text"
                name="fullName"
                className="atrium-input-field"
                placeholder="cth. Budi Santoso"
                value={regForm.fullName}
                onChange={handleRegChange}
                required
              />
            </div>

            <div className="atrium-input-group">
              <label htmlFor="reg-email">Alamat Email Perusahaan</label>
              <input
                id="reg-email"
                type="email"
                name="email"
                className="atrium-input-field"
                placeholder="nama@vinix7aurum.com"
                value={regForm.email}
                onChange={handleRegChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="atrium-input-group">
              <label htmlFor="reg-password">Kata Sandi (Min. 6 Karakter)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showRegPassword ? 'text' : 'password'}
                  name="password"
                  className="atrium-input-field"
                  style={{ paddingRight: '2.75rem' }}
                  placeholder="Buat kata sandi aman"
                  value={regForm.password}
                  onChange={handleRegChange}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(p => !p)}
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
                  aria-label={showRegPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="atrium-input-group">
              <label htmlFor="reg-confirmPassword">Konfirmasi Kata Sandi</label>
              <input
                id="reg-confirmPassword"
                type="password"
                name="confirmPassword"
                className="atrium-input-field"
                placeholder="Ulangi kata sandi"
                value={regForm.confirmPassword}
                onChange={handleRegChange}
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div style={{
                backgroundColor: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: '12px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                color: '#991B1B',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
                lineHeight: 1.5
              }}>
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="atrium-login-btn"
              disabled={loading}
            >
              {loading ? (
                <span>Mendaftarkan Akun...</span>
              ) : (
                <>
                  <span>Daftarkan Akun Petugas</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Security and Registration Notice Footer */}
        {!successPending && (
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
              {authMode === 'login'
                ? 'Belum memiliki akun aktif? Beralih ke tab "Daftar Petugas" untuk mendaftarkan akun baru.'
                : 'Akun mandiri otomatis diberi role Penjaga Gudang dan memerlukan aktivasi oleh Administrator sebelum dapat digunakan.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
