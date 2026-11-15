import React, { useState } from 'react';
import { User, Save, KeyRound, Mail, Phone, Hash, Clock, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CustomSelect from '../components/common/CustomSelect';

export default function Profile() {
  const { user, profile, updateUserProfile, updatePassword } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    employee_id: profile?.employee_id || '',
    shift: profile?.shift || '',
    phone: profile?.phone || '',
  });
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState({ profile: '', password: '' });

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateUserProfile(form);
    setMsg(prev => ({ ...prev, profile: error ? `Gagal: ${error.message}` : 'Profil berhasil disimpan!' }));
    setSaving(false);
    setTimeout(() => setMsg(prev => ({ ...prev, profile: '' })), 3000);
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (passwords.newPass !== passwords.confirm) {
      setMsg(prev => ({ ...prev, password: 'Password baru tidak cocok.' }));
      return;
    }
    if (passwords.newPass.length < 8) {
      setMsg(prev => ({ ...prev, password: 'Password minimal 8 karakter.' }));
      return;
    }
    setSavingPw(true);
    const { error } = await updatePassword(passwords.newPass);
    setMsg(prev => ({ ...prev, password: error ? `Gagal: ${error.message}` : 'Password berhasil diubah!' }));
    if (!error) setPasswords({ current: '', newPass: '', confirm: '' });
    setSavingPw(false);
    setTimeout(() => setMsg(prev => ({ ...prev, password: '' })), 3000);
  };

  const avatarInitials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <div className="atrium-content-container">
      {/* Top Header */}
      <div className="atrium-page-header" style={{ marginBottom: '1.5rem' }}>
        <div className="atrium-page-title-wrap">
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--atrium-text-primary, #17191C)', margin: '0 0 0.25rem 0' }}>
            Profil Saya
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--atrium-text-secondary, #5F646D)' }}>
            Kelola identitas petugas dan keamanan akun PT Vinix Seven Aurum
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Profile Card */}
        <div className="atrium-glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{
            padding: '1.125rem 1.5rem',
            borderBottom: '1px solid var(--atrium-border-soft, #E3E2E6)',
            backgroundColor: '#FAFAFB',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(23, 25, 28, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={16} color="#17191C" />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--atrium-text-primary, #17191C)' }}>
              Informasi Petugas
            </h3>
          </div>

          {/* User Badge Section */}
          <div style={{ padding: '1.5rem', textAlign: 'center', borderBottom: '1px solid var(--atrium-border-soft, #E3E2E6)', backgroundColor: '#FFFFFF' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              backgroundColor: 'var(--atrium-accent-dark, #17191C)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', fontWeight: 800, margin: '0 auto 0.75rem',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)'
            }}>
              {avatarInitials}
            </div>
            <p style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--atrium-text-primary, #17191C)', margin: 0 }}>
              {profile?.full_name || 'Petugas'}
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.75rem',
              fontWeight: 700, padding: '0.25rem 0.875rem', borderRadius: '999px',
              backgroundColor: profile?.role === 'admin' ? '#FEE2E2' : '#EEF5E5',
              color: profile?.role === 'admin' ? '#991B1B' : '#386016'
            }}>
              <Shield size={12} />
              {profile?.role === 'admin' ? 'Administrator' : 'Penjaga Gudang'}
            </span>
            <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary, #5F646D)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', margin: '0.5rem 0 0' }}>
              <Mail size={13} />
              {user?.email || 'petugas@vinix7aurum.com'}
            </p>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleProfileSave} style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Nama Lengkap
              </label>
              <input
                type="text"
                className="atrium-input"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                <Hash size={13} /> ID Karyawan / Petugas
              </label>
              <input
                type="text"
                className="atrium-input"
                value={form.employee_id}
                onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
                placeholder="cth: PG-001"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                <Clock size={13} /> Shift Kerja
              </label>
              <CustomSelect
                className="atrium-input"
                value={form.shift}
                onChange={e => setForm(p => ({ ...p, shift: e.target.value }))}
                ariaLabel="Pilih Shift Kerja"
              >
                <option value="">Pilih shift</option>
                <option value="Pagi">Pagi (06:00–14:00)</option>
                <option value="Siang">Siang (14:00–22:00)</option>
                <option value="Malam">Malam (22:00–06:00)</option>
              </CustomSelect>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                <Phone size={13} /> Nomor Telepon
              </label>
              <input
                type="tel"
                className="atrium-input"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="cth: 081234567890"
              />
            </div>

            {msg.profile && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.8125rem',
                fontWeight: 500,
                marginBottom: '1rem',
                backgroundColor: msg.profile.includes('Gagal') ? '#FEE2E2' : '#DCFCE7',
                color: msg.profile.includes('Gagal') ? '#991B1B' : '#166534',
                border: msg.profile.includes('Gagal') ? '1px solid #FECACA' : '1px solid #BBF7D0'
              }}>
                {msg.profile}
              </div>
            )}

            <button type="submit" className="btn-atrium-primary" style={{ width: '100%', height: '44px' }} disabled={saving}>
              {saving ? <><span className="spinner spinner-sm" /> Menyimpan...</> : <><Save size={16} /> Simpan Profil</>}
            </button>
          </form>
        </div>

        {/* Password Card */}
        <div className="atrium-glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{
            padding: '1.125rem 1.5rem',
            borderBottom: '1px solid var(--atrium-border-soft, #E3E2E6)',
            backgroundColor: '#FAFAFB',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(23, 25, 28, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <KeyRound size={16} color="#17191C" />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--atrium-text-primary, #17191C)' }}>
              Ubah Password
            </h3>
          </div>

          <form onSubmit={handlePasswordSave} style={{ padding: '1.5rem' }}>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.5 }}>
              Pastikan kata sandi baru Anda memiliki minimal 8 karakter dan kombinasi huruf serta angka.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Password Baru
              </label>
              <input
                type="password"
                className="atrium-input"
                value={passwords.newPass}
                onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                placeholder="Minimal 8 karakter"
                required
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Konfirmasi Password Baru
              </label>
              <input
                type="password"
                className="atrium-input"
                value={passwords.confirm}
                onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Ulangi password baru"
                required
              />
            </div>

            {msg.password && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.8125rem',
                fontWeight: 500,
                marginBottom: '1rem',
                backgroundColor: msg.password.includes('Gagal') || msg.password.includes('tidak') ? '#FEE2E2' : '#DCFCE7',
                color: msg.password.includes('Gagal') || msg.password.includes('tidak') ? '#991B1B' : '#166534',
                border: msg.password.includes('Gagal') || msg.password.includes('tidak') ? '1px solid #FECACA' : '1px solid #BBF7D0'
              }}>
                {msg.password}
              </div>
            )}

            <button type="submit" className="btn-atrium-primary" style={{ width: '100%', height: '44px' }} disabled={savingPw}>
              {savingPw ? <><span className="spinner spinner-sm" /> Memproses...</> : <><KeyRound size={16} /> Perbarui Password</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
