import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Auth Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';

// App Pages
import Dashboard from './pages/Dashboard';
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

// Borrowing & Return Pages (Phase F)
import BorrowerList from './pages/borrowing/BorrowerList';
import BorrowingList from './pages/borrowing/BorrowingList';
import CreateBorrowing from './pages/borrowing/CreateBorrowing';
import BorrowingDetail from './pages/borrowing/BorrowingDetail';
import ReturnProcessing from './pages/borrowing/ReturnProcessing';
import BorrowingHistory from './pages/borrowing/BorrowingHistory';

// Admin Pages
import StaffManagement from './pages/admin/StaffManagement';
import ReportsManagement from './pages/reports/ReportsManagement';

export default function App() {
  return (
    <>
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

          {/* Modul Peminjaman & Pengembalian (Phase F - Active) */}
          <Route path="/peminjam" element={<BorrowerList />} />
          <Route path="/peminjaman" element={<BorrowingList />} />
          <Route path="/peminjaman/tambah" element={<CreateBorrowing />} />
          <Route path="/peminjaman/:id" element={<BorrowingDetail />} />
          <Route path="/peminjaman/:id/pengembalian" element={<ReturnProcessing />} />
          <Route path="/pengembalian" element={<ReturnProcessing />} />

          {/* Riwayat Peminjaman & Pengembalian Gudang */}
          <Route path="/riwayat" element={<BorrowingHistory />} />
          <Route path="/profil" element={<Profile />} />

          {/* Admin Only */}
          <Route path="/manajemen-petugas" element={
            <ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>
          } />
          <Route path="/laporan" element={
            <ProtectedRoute allowedRoles={['admin']}><ReportsManagement /></ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <SpeedInsights />
    </>
  );
}
