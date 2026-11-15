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

// Inventory Pages (Phase E)
import InventoryList from './pages/inventory/InventoryList';
import ItemForm from './pages/inventory/ItemForm';
import ItemDetail from './pages/inventory/ItemDetail';
import IncomingStock from './pages/inventory/IncomingStock';
import StockAdjustment from './pages/inventory/StockAdjustment';
import StockMovementHistory from './pages/inventory/StockMovementHistory';

// Master Data Pages
import ItemCategories from './pages/admin/ItemCategories';
import StorageLocations from './pages/admin/StorageLocations';

import FutureModulePlaceholder from './components/common/FutureModulePlaceholder';

// Admin Pages
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
        
        {/* Modul Inventaris Gudang (Phase E - Active) */}
        <Route path="/inventaris" element={<InventoryList />} />
        <Route path="/inventaris/tambah" element={<ItemForm />} />
        <Route path="/inventaris/:id" element={<ItemDetail />} />
        <Route path="/inventaris/:id/edit" element={<ItemForm />} />
        <Route path="/inventaris/barang-masuk" element={<IncomingStock />} />
        <Route path="/inventaris/penyesuaian-stok" element={<StockAdjustment />} />
        <Route path="/inventaris/pergerakan-stok" element={<StockMovementHistory />} />

        {/* Master Data Kategori & Lokasi (Phase E - Active) */}
        <Route path="/kategori-barang" element={<ItemCategories />} />
        <Route path="/lokasi-penyimpanan" element={<StorageLocations />} />

        {/* Modul Transaksi Peminjaman (Phase F - Future Module Placeholder) */}
        <Route path="/peminjam" element={<FutureModulePlaceholder pathOverride="/peminjam" />} />
        <Route path="/peminjaman" element={<FutureModulePlaceholder pathOverride="/peminjaman" />} />
        <Route path="/pengembalian" element={<FutureModulePlaceholder pathOverride="/pengembalian" />} />

        {/* Legacy Deposit Routes (Preserved for Historical Audit) */}
        <Route path="/penitipan-baru" element={<NewDeposit />} />
        <Route path="/kartu-penitipan" element={<DepositCard />} />
        <Route path="/barang-dititipkan" element={<ActiveDeposits />} />
        <Route path="/pengambilan" element={<Pickup />} />
        <Route path="/pengunjung" element={<Visitors />} />
        <Route path="/riwayat" element={<DepositHistory />} />
        <Route path="/profil" element={<Profile />} />

        {/* Admin Only */}
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
