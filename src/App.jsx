import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Auth Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';

// App Pages
import Dashboard from './pages/Dashboard';
import NewDeposit from './pages/NewDeposit';
import DepositCard from './pages/DepositCard';
import ActiveDeposits from './pages/ActiveDeposits';
import Pickup from './pages/Pickup';
import Visitors from './pages/Visitors';
import DepositHistory from './pages/DepositHistory';
import Profile from './pages/Profile';

import FutureModulePlaceholder from './components/common/FutureModulePlaceholder';

// Admin Pages
import ItemCategories from './pages/admin/ItemCategories';
import StorageLocations from './pages/admin/StorageLocations';
import StaffManagement from './pages/admin/StaffManagement';
import Reports from './pages/admin/Reports';

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected App Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* Modul Gudang Baru (Future Modules - Phase E & Phase F) */}
        <Route path="/inventaris" element={<FutureModulePlaceholder pathOverride="/inventaris" />} />
        <Route path="/peminjaman" element={<FutureModulePlaceholder pathOverride="/peminjaman" />} />
        <Route path="/pengembalian" element={<FutureModulePlaceholder pathOverride="/pengembalian" />} />
        <Route path="/peminjam" element={<FutureModulePlaceholder pathOverride="/peminjam" />} />

        {/* Legacy Deposit Routes (Preserved for Historical Audit) */}
        <Route path="/penitipan-baru" element={<NewDeposit />} />
        <Route path="/kartu-penitipan" element={<DepositCard />} />
        <Route path="/barang-dititipkan" element={<ActiveDeposits />} />
        <Route path="/pengambilan" element={<Pickup />} />
        <Route path="/pengunjung" element={<Visitors />} />
        <Route path="/riwayat" element={<DepositHistory />} />
        <Route path="/profil" element={<Profile />} />

        {/* Admin Only */}
        <Route path="/kategori-barang" element={
          <ProtectedRoute allowedRoles={['admin']}><ItemCategories /></ProtectedRoute>
        } />
        <Route path="/lokasi-penyimpanan" element={
          <ProtectedRoute allowedRoles={['admin']}><StorageLocations /></ProtectedRoute>
        } />
        <Route path="/manajemen-petugas" element={
          <ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>
        } />
        <Route path="/laporan" element={
          <ProtectedRoute allowedRoles={['admin']}><FutureModulePlaceholder pathOverride="/laporan" /></ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
