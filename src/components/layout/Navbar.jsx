import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bell, LogOut, User, ChevronDown, Shield, Search,
  UserCog, ArrowRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, profile, signOut, isAdmin } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await signOut();
    navigate('/login');
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Petugas';
  const firstName = displayName.split(' ')[0];
  const userRole = profile?.role || 'warehouse_keeper';

  const avatarInitials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'U');

  // Greeting based on current hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat pagi';
    if (hour < 15) return 'Selamat siang';
    if (hour < 18) return 'Selamat sore';
    return 'Selamat malam';
  };

  // Formatted date string (e.g. Jumat, 13 November 2026)
  const formattedDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <header className="atrium-header" role="banner">
      {/* Left: Date kicker and Greeting */}
      <div className="atrium-greeting-block">
        <span className="atrium-date-kicker">{formattedDate}</span>
        <h1 className="atrium-greeting-title">{getGreeting()}, {firstName}</h1>
      </div>

      {/* Right: Search, Role Tag, Notification, and User Dropdown */}
      <div className="atrium-header-actions">
        {/* Search Input Pill */}
        <div className="atrium-search-pill">
          <Search size={16} color="var(--atrium-text-muted)" />
          <input
            type="text"
            className="atrium-search-input"
            placeholder="Cari barang, peminjam..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari barang atau peminjam"
          />
          <span className="atrium-kbd-pill">⌘K</span>
        </div>

        {/* Role Tag Pill */}
        <span className={`atrium-role-tag ${userRole}`}>
          {userRole === 'admin' ? 'Administrator' : 'Penjaga Gudang'}
        </span>

        {/* Notifications Icon Button */}
        <button
          type="button"
          className="atrium-icon-btn"
          aria-label="Notifikasi operasional gudang"
          title="Notifikasi"
        >
          <Bell size={18} />
          <span className="atrium-badge-dot" />
        </button>

        {/* User Avatar & Dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            type="button"
            className="atrium-icon-btn"
            style={{ fontWeight: 700, fontSize: '0.875rem' }}
            onClick={() => setDropdownOpen(prev => !prev)}
            aria-expanded={dropdownOpen}
            aria-label="Menu akun pengguna"
          >
            {avatarInitials}
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '16px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.1)',
              minWidth: '240px',
              zIndex: 1000,
              overflow: 'hidden'
            }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid #F1F0F4', backgroundColor: '#FAF9FB' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--atrium-text-primary)', margin: 0 }}>
                    {displayName}
                  </p>
                  <span className={`atrium-role-tag ${userRole}`} style={{ fontSize: '0.625rem', padding: '0.15rem 0.5rem' }}>
                    {userRole === 'admin' ? 'Admin' : 'Keeper'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: 0 }}>
                  {user?.email || 'vinix-staff@aurum.com'}
                </p>
                {profile?.employee_id && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-secondary)', marginTop: '0.25rem' }}>
                    ID: <strong>{profile.employee_id}</strong>
                  </p>
                )}
              </div>

              <div style={{ padding: '0.5rem' }}>
                <Link
                  to="/profil"
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--atrium-text-primary)',
                    borderRadius: '8px',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F4F3F6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <User size={16} />
                  <span>Profil Akun</span>
                </Link>

                {isAdmin && (
                  <Link
                    to="/manajemen-petugas"
                    onClick={() => setDropdownOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.6rem 0.75rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--atrium-text-primary)',
                      borderRadius: '8px',
                      textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F4F3F6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <UserCog size={16} />
                    <span>Manajemen Petugas</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#DC2626',
                    borderRadius: '8px',
                    width: '100%',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <LogOut size={16} />
                  <span>Keluar dari Sistem</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
