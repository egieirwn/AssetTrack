import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Tag, MapPin, Users,
  ArrowLeftRight, BarChart3, UserCog, User,
  Shield, History
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const { profile, isAdmin, signOut } = useAuth();

  const userInitial = profile?.full_name
    ? profile.full_name.charAt(0).toUpperCase()
    : 'U';

  const userRoleLabel = profile?.role === 'admin' ? 'Administrator' : 'Penjaga Gudang';

  return (
    <aside className="atrium-sidebar" aria-label="Navigasi Utama Gudang">
      {/* Brand Icon Badge */}
      <NavLink to="/dashboard" className="atrium-sidebar-logo" title="SiPenitip · PT Vinix Seven Aurum">
        <Shield size={22} />
      </NavLink>

      {/* Nav Rail Icons */}
      <nav className="atrium-nav-rail">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Dashboard"
        >
          <LayoutDashboard size={20} />
          <span className="atrium-tooltip">Dashboard</span>
        </NavLink>

        <NavLink
          to="/barang-dititipkan"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Inventaris Gudang"
        >
          <Boxes size={20} />
          <span className="atrium-tooltip">Inventaris Gudang</span>
        </NavLink>

        {/* Admin or Keeper accessible routes */}
        {isAdmin ? (
          <>
            <NavLink
              to="/kategori-barang"
              className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
              aria-label="Kategori Barang"
            >
              <Tag size={20} />
              <span className="atrium-tooltip">Kategori Barang</span>
            </NavLink>

            <NavLink
              to="/lokasi-penyimpanan"
              className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
              aria-label="Lokasi Penyimpanan"
            >
              <MapPin size={20} />
              <span className="atrium-tooltip">Lokasi Penyimpanan</span>
            </NavLink>
          </>
        ) : null}

        <NavLink
          to="/pengunjung"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Direktori Peminjam"
        >
          <Users size={20} />
          <span className="atrium-tooltip">Direktori Peminjam</span>
        </NavLink>

        <NavLink
          to="/penitipan-baru"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Peminjaman & Pengembalian"
        >
          <ArrowLeftRight size={20} />
          <span className="atrium-tooltip">Peminjaman & Pengembalian</span>
        </NavLink>

        <NavLink
          to="/riwayat"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Riwayat Operasional"
        >
          <History size={20} />
          <span className="atrium-tooltip">Riwayat Transaksi</span>
        </NavLink>

        {/* Admin-only Modules */}
        {isAdmin && (
          <>
            <NavLink
              to="/laporan"
              className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
              aria-label="Laporan Manajemen"
            >
              <BarChart3 size={20} />
              <span className="atrium-tooltip">Laporan Gudang</span>
            </NavLink>

            <NavLink
              to="/manajemen-petugas"
              className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
              aria-label="Manajemen Petugas"
            >
              <UserCog size={20} />
              <span className="atrium-tooltip">Manajemen Petugas</span>
            </NavLink>
          </>
        )}

        <NavLink
          to="/profil"
          className={({ isActive }) => `atrium-nav-item${isActive ? ' active' : ''}`}
          aria-label="Profil Pengguna"
        >
          <User size={20} />
          <span className="atrium-tooltip">Profil Saya</span>
        </NavLink>
      </nav>

      {/* Footer User Avatar */}
      <div className="atrium-sidebar-footer">
        <NavLink
          to="/profil"
          className="atrium-user-trigger"
          title={`${profile?.full_name || 'Petugas'} (${userRoleLabel})`}
        >
          {userInitial}
        </NavLink>
      </div>
    </aside>
  );
}
