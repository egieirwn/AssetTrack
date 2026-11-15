import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Boxes, ArrowLeftRight, History, Shield,
  Search, Filter, Download, Printer, RefreshCw, AlertCircle,
  Calendar, CheckCircle2, Clock, AlertTriangle, FileSpreadsheet,
  ChevronDown, User, Tag, MapPin, Eye
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { exportToCsv, formatIndonesianDate, formatNumber } from '../../utils/exportUtils';

export default function ReportsManagement() {
  const { profile, isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  // Active Tab: 'inventory' | 'borrowing' | 'movements' | 'audit'
  const [activeTab, setActiveTab] = useState('inventory');

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);

  // 1. Data Store
  const [inventoryData, setInventoryData] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [locationsList, setLocationsList] = useState([]);

  const [borrowingData, setBorrowingData] = useState([]);
  const [movementsData, setMovementsData] = useState([]);
  const [auditLogsData, setAuditLogsData] = useState([]);

  // 2. Filter States
  // Global search
  const [searchTerm, setSearchTerm] = useState('');

  // Inventory Filters
  const [invCategoryFilter, setInvCategoryFilter] = useState('all');
  const [invLocationFilter, setInvLocationFilter] = useState('all');
  const [invTrackingFilter, setInvTrackingFilter] = useState('all');
  const [invStatusFilter, setInvStatusFilter] = useState('all');

  // Borrowing Filters
  const [brwStatusFilter, setBrwStatusFilter] = useState('all');
  const [brwDeptFilter, setBrwDeptFilter] = useState('all');
  const [brwStartDate, setBrwStartDate] = useState('');
  const [brwEndDate, setBrwEndDate] = useState('');

  // Movement Filters
  const [movTypeFilter, setMovTypeFilter] = useState('all');
  const [movStartDate, setMovStartDate] = useState('');
  const [movEndDate, setMovEndDate] = useState('');

  // Audit Filters
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  // --------------------------------------------------------------------------
  // Data Fetching
  // --------------------------------------------------------------------------
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        setInventoryData([]);
        setBorrowingData([]);
        setMovementsData([]);
        setAuditLogsData([]);
        setLastGeneratedAt(new Date());
        return;
      }

      // Fetch master categories and locations
      const [{ data: cats }, { data: locs }] = await Promise.all([
        supabase.from('item_categories').select('id, name').order('name'),
        supabase.from('storage_locations').select('id, code, name').order('code')
      ]);
      setCategoriesList(cats || []);
      setLocationsList(locs || []);

      // Fetch Inventory with categories and storage locations
      const { data: items, error: itmErr } = await supabase
        .from('items')
        .select(`
          id, item_code, name, description, tracking_type,
          asset_serial, total_qty, available_qty, damaged_qty, under_repair_qty,
          condition, status, is_active, updated_at,
          item_categories (id, name),
          storage_locations (id, code, name)
        `)
        .order('name');

      if (itmErr) throw itmErr;
      setInventoryData(items || []);

      // Fetch Borrowings with borrower and recorded profile
      const { data: brws, error: brwErr } = await supabase
        .from('borrowings')
        .select(`
          id, transaction_code, purpose, borrowed_at, expected_return_at, returned_at,
          status, notes, created_at,
          borrowers (id, full_name, employee_id, department, phone),
          recorded_profile:recorded_by (id, full_name),
          returned_profile:returned_by (id, full_name),
          borrowing_items (
            id, item_id, quantity, returned_good_qty, returned_damaged_qty,
            borrow_condition, return_condition, return_notes,
            items (id, item_code, name, tracking_type, asset_serial)
          )
        `)
        .order('created_at', { ascending: false });

      if (brwErr) throw brwErr;

      const now = new Date();
      const enrichedBorrowings = (brws || []).map(b => {
        const lineCount = b.borrowing_items?.length || 0;
        const totalUnits = (b.borrowing_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
        const returnedUnits = (b.borrowing_items || []).reduce((s, it) => s + ((it.returned_good_qty || 0) + (it.returned_damaged_qty || 0)), 0);
        const remainingUnits = Math.max(0, totalUnits - returnedUnits);

        const isPastDue = b.expected_return_at && new Date(b.expected_return_at) < now;
        const isOverdue = b.status === 'overdue' || (
          ['borrowed', 'partial_returned'].includes(b.status) && isPastDue
        );

        return {
          ...b,
          line_count: lineCount,
          total_units: totalUnits,
          returned_units: returnedUnits,
          remaining_units: remainingUnits,
          is_overdue: isOverdue
        };
      });
      setBorrowingData(enrichedBorrowings);

      // Fetch Stock Movements (append-only ledger)
      const { data: movs, error: movErr } = await supabase
        .from('stock_movements')
        .select(`
          id, movement_type, quantity_delta, qty_before, qty_after,
          reference_id, reason, created_at,
          items (id, item_code, name, tracking_type),
          performed_profile:performed_by (id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (movErr) throw movErr;
      setMovementsData(movs || []);

      // Fetch Activity Logs
      const { data: logs, error: logErr } = await supabase
        .from('activity_logs')
        .select(`
          id, entity_type, entity_id, action, details, created_at,
          performed_profile:performed_by (id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (logErr) throw logErr;
      setAuditLogsData(logs || []);

      setLastGeneratedAt(new Date());
    } catch (err) {
      console.error('Error fetching report suite data:', err);
      setError('Gagal memuat kumpulan data laporan: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // --------------------------------------------------------------------------
  // Tab 1: Filtered Inventory Data
  // --------------------------------------------------------------------------
  const filteredInventory = inventoryData.filter(item => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.item_code && item.item_code.toLowerCase().includes(q)) ||
      (item.asset_serial && item.asset_serial.toLowerCase().includes(q));

    const matchCategory = invCategoryFilter === 'all' || item.item_categories?.id === invCategoryFilter;
    const matchLocation = invLocationFilter === 'all' || item.storage_locations?.id === invLocationFilter;
    const matchTracking = invTrackingFilter === 'all' || item.tracking_type === invTrackingFilter;

    let matchStatus = true;
    if (invStatusFilter === 'available') matchStatus = (item.available_qty || 0) > 0;
    else if (invStatusFilter === 'empty') matchStatus = (item.available_qty || 0) === 0;
    else if (invStatusFilter === 'damaged') matchStatus = (item.damaged_qty || 0) > 0 || (item.under_repair_qty || 0) > 0;
    else if (invStatusFilter === 'inactive') matchStatus = !item.is_active;

    return matchSearch && matchCategory && matchLocation && matchTracking && matchStatus;
  });

  // --------------------------------------------------------------------------
  // Tab 2: Filtered Borrowings Data
  // --------------------------------------------------------------------------
  const filteredBorrowings = borrowingData.filter(b => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      (b.transaction_code && b.transaction_code.toLowerCase().includes(q)) ||
      (b.borrowers?.full_name && b.borrowers.full_name.toLowerCase().includes(q)) ||
      (b.borrowers?.employee_id && b.borrowers.employee_id.toLowerCase().includes(q)) ||
      (b.purpose && b.purpose.toLowerCase().includes(q));

    let matchStatus = true;
    if (brwStatusFilter === 'borrowed') matchStatus = b.status === 'borrowed' && !b.is_overdue;
    else if (brwStatusFilter === 'partial_returned') matchStatus = b.status === 'partial_returned' && !b.is_overdue;
    else if (brwStatusFilter === 'overdue') matchStatus = b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled';
    else if (brwStatusFilter === 'returned') matchStatus = b.status === 'returned';
    else if (brwStatusFilter === 'cancelled') matchStatus = b.status === 'cancelled';

    const matchDept = brwDeptFilter === 'all' || b.borrowers?.department === brwDeptFilter;

    let matchDate = true;
    if (brwStartDate && b.borrowed_at) {
      matchDate = matchDate && new Date(b.borrowed_at) >= new Date(brwStartDate);
    }
    if (brwEndDate && b.borrowed_at) {
      const endD = new Date(brwEndDate);
      endD.setHours(23, 59, 59, 999);
      matchDate = matchDate && new Date(b.borrowed_at) <= endD;
    }

    return matchSearch && matchStatus && matchDept && matchDate;
  });

  // --------------------------------------------------------------------------
  // Tab 3: Filtered Movements Data
  // --------------------------------------------------------------------------
  const filteredMovements = movementsData.filter(m => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      (m.items?.name && m.items.name.toLowerCase().includes(q)) ||
      (m.items?.item_code && m.items.item_code.toLowerCase().includes(q)) ||
      (m.reason && m.reason.toLowerCase().includes(q));

    const matchType = movTypeFilter === 'all' || m.movement_type === movTypeFilter;

    let matchDate = true;
    if (movStartDate && m.created_at) {
      matchDate = matchDate && new Date(m.created_at) >= new Date(movStartDate);
    }
    if (movEndDate && m.created_at) {
      const endD = new Date(movEndDate);
      endD.setHours(23, 59, 59, 999);
      matchDate = matchDate && new Date(m.created_at) <= endD;
    }

    return matchSearch && matchType && matchDate;
  });

  // --------------------------------------------------------------------------
  // Tab 4: Filtered Audit Logs Data
  // --------------------------------------------------------------------------
  const filteredAuditLogs = auditLogsData.filter(log => {
    const q = searchTerm.toLowerCase();
    const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');
    const matchSearch =
      !searchTerm ||
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(q)) ||
      (log.performed_profile?.full_name && log.performed_profile.full_name.toLowerCase().includes(q)) ||
      detailsStr.toLowerCase().includes(q);

    const matchAction = auditActionFilter === 'all' || log.action === auditActionFilter;

    let matchDate = true;
    if (auditStartDate && log.created_at) {
      matchDate = matchDate && new Date(log.created_at) >= new Date(auditStartDate);
    }
    if (auditEndDate && log.created_at) {
      const endD = new Date(auditEndDate);
      endD.setHours(23, 59, 59, 999);
      matchDate = matchDate && new Date(log.created_at) <= endD;
    }

    return matchSearch && matchAction && matchDate;
  });

  // Departments for borrowing filter
  const departmentsList = Array.from(new Set(borrowingData.map(b => b.borrowers?.department).filter(Boolean))).sort();

  // --------------------------------------------------------------------------
  // EXPORT HANDLERS (CSV & PDF Print)
  // --------------------------------------------------------------------------

  // 1. Export Inventory CSV
  const handleExportInventoryCsv = () => {
    const headers = [
      'No',
      'Kode Barang',
      'Nama Barang',
      'Kategori',
      'Lokasi Penyimpanan',
      'Tipe Pelacakan',
      'Nomor Seri',
      'Total Stok (Unit)',
      'Tersedia (Unit)',
      'Dipinjam (Unit)',
      'Rusak (Unit)',
      'Perbaikan (Unit)',
      'Kondisi Fisik',
      'Status Aktif'
    ];

    const rows = filteredInventory.map((item, idx) => {
      const borrowed = Math.max(0, (item.total_qty || 0) - ((item.available_qty || 0) + (item.damaged_qty || 0) + (item.under_repair_qty || 0)));
      return [
        idx + 1,
        item.item_code,
        item.name,
        item.item_categories?.name || '—',
        item.storage_locations?.code ? `${item.storage_locations.code} - ${item.storage_locations.name}` : '—',
        item.tracking_type === 'individual' ? 'Aset Individual' : 'Kuantitas Massal',
        item.asset_serial || '—',
        item.total_qty || 0,
        item.available_qty || 0,
        borrowed,
        item.damaged_qty || 0,
        item.under_repair_qty || 0,
        item.condition || 'baik',
        item.is_active ? 'Aktif' : 'Nonaktif'
      ];
    });

    const metadata = {
      title: 'LAPORAN REKAPITULASI INVENTARIS GUDANG',
      generatedAt: new Date().toLocaleString('id-ID'),
      filterSummary: `Kategori: ${invCategoryFilter}, Lokasi: ${invLocationFilter}, Tipe: ${invTrackingFilter}, Status: ${invStatusFilter}`
    };

    exportToCsv(`laporan-inventaris-${Date.now()}`, headers, rows, metadata);
  };

  // 2. Export Borrowing CSV
  const handleExportBorrowingCsv = () => {
    const headers = [
      'No',
      'Kode Tiket',
      'Nama Peminjam',
      'NIK / NIP',
      'Departemen',
      'Keperluan',
      'Jumlah Macam',
      'Total Unit',
      'Waktu Pinjam',
      'Jatuh Tempo',
      'Waktu Kembali',
      'Status Tiket',
      'Petugas Pencatat',
      'Petugas Penerima',
      'Catatan'
    ];

    const rows = filteredBorrowings.map((b, idx) => [
      idx + 1,
      b.transaction_code,
      b.borrowers?.full_name || '—',
      b.borrowers?.employee_id || '—',
      b.borrowers?.department || '—',
      b.purpose || '—',
      b.line_count || 0,
      b.total_units || 0,
      formatIndonesianDate(b.borrowed_at, true),
      formatIndonesianDate(b.expected_return_at, true),
      b.returned_at ? formatIndonesianDate(b.returned_at, true) : 'Belum Kembali',
      b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled' ? 'TERLAMBAT' : b.status,
      b.recorded_profile?.full_name || 'Petugas',
      b.returned_profile?.full_name || '—',
      b.notes || ''
    ]);

    const metadata = {
      title: 'LAPORAN TRANSAKSI PEMINJAMAN & PENGEMBALIAN',
      generatedAt: new Date().toLocaleString('id-ID'),
      filterSummary: `Status: ${brwStatusFilter}, Dept: ${brwDeptFilter}, Periode: ${brwStartDate || 'Awal'} s/d ${brwEndDate || 'Sekarang'}`
    };

    exportToCsv(`laporan-peminjaman-${Date.now()}`, headers, rows, metadata);
  };

  // 3. Export Movements CSV
  const handleExportMovementsCsv = () => {
    const headers = [
      'No',
      'Waktu Mutasi',
      'Kode Barang',
      'Nama Barang',
      'Jenis Mutasi',
      'Perubahan (Delta)',
      'Saldo Akhir',
      'Petugas Pelaksana',
      'Keterangan / Alasan'
    ];

    const rows = filteredMovements.map((m, idx) => [
      idx + 1,
      formatIndonesianDate(m.created_at, true),
      m.items?.item_code || '—',
      m.items?.name || '—',
      m.movement_type,
      (m.quantity_delta > 0 ? `+${m.quantity_delta}` : `${m.quantity_delta}`) + ' unit',
      `${m.qty_after ?? '—'} unit`,
      m.performed_profile?.full_name || 'Petugas',
      m.reason || ''
    ]);

    const metadata = {
      title: 'LAPORAN BUKU BESAR MUTASI STOK GUDANG',
      generatedAt: new Date().toLocaleString('id-ID'),
      filterSummary: `Jenis Mutasi: ${movTypeFilter}, Periode: ${movStartDate || 'Awal'} s/d ${movEndDate || 'Sekarang'}`
    };

    exportToCsv(`laporan-mutasi-stok-${Date.now()}`, headers, rows, metadata);
  };

  // 4. Export Audit Logs CSV
  const handleExportAuditLogsCsv = () => {
    const headers = [
      'No',
      'Waktu Audit',
      'Aksi Sistem',
      'Tipe Entitas',
      'ID Entitas',
      'Aktor / Petugas',
      'Rincian Aktivitas'
    ];

    const rows = filteredAuditLogs.map((log, idx) => [
      idx + 1,
      formatIndonesianDate(log.created_at, true),
      log.action,
      log.entity_type,
      log.entity_id || '—',
      log.performed_profile?.full_name || 'Sistem',
      typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '')
    ]);

    const metadata = {
      title: 'LAPORAN LOG AUDIT & AKTIVITAS SISTEM',
      generatedAt: new Date().toLocaleString('id-ID'),
      filterSummary: `Aksi: ${auditActionFilter}, Periode: ${auditStartDate || 'Awal'} s/d ${auditEndDate || 'Sekarang'}`
    };

    exportToCsv(`laporan-audit-log-${Date.now()}`, headers, rows, metadata);
  };

  // Print PDF using native browser print engine
  const handlePrintPdf = () => {
    window.print();
  };

  // --------------------------------------------------------------------------
  // KPI Calculations
  // --------------------------------------------------------------------------
  const invTotalSku = filteredInventory.length;
  const invTotalUnits = filteredInventory.reduce((s, it) => s + (it.total_qty || 0), 0);
  const invAvailUnits = filteredInventory.reduce((s, it) => s + (it.available_qty || 0), 0);
  const invDamagedUnits = filteredInventory.reduce((s, it) => s + (it.damaged_qty || 0) + (it.under_repair_qty || 0), 0);
  const invBorrowedUnits = Math.max(0, invTotalUnits - (invAvailUnits + invDamagedUnits));

  const brwTotalCount = filteredBorrowings.length;
  const brwActiveCount = filteredBorrowings.filter(b => ['borrowed', 'partial_returned'].includes(b.status) && !b.is_overdue).length;
  const brwOverdueCount = filteredBorrowings.filter(b => b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled').length;
  const brwCompletedCount = filteredBorrowings.filter(b => b.status === 'returned').length;

  return (
    <div className="atrium-content-container">
      {/* Printable Report Header Block (Only visible during print) */}
      <div className="atrium-printable-receipt" style={{ display: 'none' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 800 }}>PT VINIX SEVEN AURUM</h2>
          <div style={{ fontSize: '0.8125rem', color: '#475569', textTransform: 'uppercase' }}>
            Warehouse Inventory & Borrowing Management System
          </div>
          <div style={{ margin: '0.75rem 0 0.25rem', fontSize: '1.125rem', fontWeight: 700, color: '#2563eb' }}>
            {activeTab === 'inventory' ? 'LAPORAN REKAPITULASI INVENTARIS GUDANG'
              : activeTab === 'borrowing' ? 'LAPORAN TRANSAKSI PEMINJAMAN & PENGEMBALIAN'
              : activeTab === 'movements' ? 'LAPORAN BUKU BESAR MUTASI STOK'
              : 'LAPORAN LOG AUDIT AKTIVITAS SISTEM'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Waktu Pembuatan: {new Date().toLocaleString('id-ID')} | Petugas: {profile?.full_name || 'Administrator'}
          </div>
        </div>
      </div>

      {/* Top Banner (Screen Only) */}
      <div className="atrium-glass-card atrium-banner-card no-print" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={20} color="#0f172a" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Pusat Laporan & Audit Gudang</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Rekapitulasi inventaris, transaksi sirkulasi, buku besar mutasi stok, dan log kepatuhan audit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchReportData}
              disabled={loading}
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>

            {/* Export Buttons */}
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={
                activeTab === 'inventory' ? handleExportInventoryCsv
                : activeTab === 'borrowing' ? handleExportBorrowingCsv
                : activeTab === 'movements' ? handleExportMovementsCsv
                : handleExportAuditLogsCsv
              }
              title="Unduh Spreadsheet Excel / CSV"
            >
              <FileSpreadsheet size={15} color="#059669" />
              Ekspor Excel (CSV)
            </button>

            <button
              type="button"
              className="btn-atrium-primary"
              onClick={handlePrintPdf}
              title="Cetak atau Simpan sebagai PDF"
            >
              <Printer size={15} />
              Cetak / PDF
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`atrium-mini-pill ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
            style={{ fontWeight: activeTab === 'inventory' ? 700 : 500 }}
          >
            <Boxes size={14} />
            <span>Laporan Inventaris ({filteredInventory.length})</span>
          </button>

          <button
            type="button"
            className={`atrium-mini-pill ${activeTab === 'borrowing' ? 'active' : ''}`}
            onClick={() => setActiveTab('borrowing')}
            style={{ fontWeight: activeTab === 'borrowing' ? 700 : 500 }}
          >
            <ArrowLeftRight size={14} />
            <span>Laporan Peminjaman ({filteredBorrowings.length})</span>
          </button>

          <button
            type="button"
            className={`atrium-mini-pill ${activeTab === 'movements' ? 'active' : ''}`}
            onClick={() => setActiveTab('movements')}
            style={{ fontWeight: activeTab === 'movements' ? 700 : 500 }}
          >
            <History size={14} />
            <span>Mutasi Stok Ledger ({filteredMovements.length})</span>
          </button>

          <button
            type="button"
            className={`atrium-mini-pill ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
            style={{ fontWeight: activeTab === 'audit' ? 700 : 500 }}
          >
            <Shield size={14} />
            <span>Jejak Audit Sistem ({filteredAuditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="atrium-error-card no-print" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={18} color="#e11d48" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>{error}</div>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
        </div>
      )}

      {/* --------------------------------------------------------------------
          TAB 1: INVENTORY REPORTS
          -------------------------------------------------------------------- */}
      {activeTab === 'inventory' && (
        <>
          {/* Inventory Summary Mini KPIs */}
          <div className="atrium-glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Macam (SKU)</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{invTotalSku} jenis</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Unit Fisik</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{formatNumber(invTotalUnits)} unit</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Stok Siap Pakai</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{formatNumber(invAvailUnits)} unit</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sedang Dipinjam</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{formatNumber(invBorrowedUnits)} unit</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rusak & Servis</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{formatNumber(invDamagedUnits)} unit</div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="atrium-glass-card no-print" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="atrium-input"
                  style={{ width: '100%', paddingLeft: '2.25rem' }}
                  placeholder="Cari kode atau nama barang..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ flex: '0 0 170px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={invCategoryFilter}
                  onChange={e => setInvCategoryFilter(e.target.value)}
                >
                  <option value="all">Semua Kategori</option>
                  {categoriesList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '0 0 170px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={invLocationFilter}
                  onChange={e => setInvLocationFilter(e.target.value)}
                >
                  <option value="all">Semua Lokasi Rak</option>
                  {locationsList.map(l => (
                    <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '0 0 150px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={invTrackingFilter}
                  onChange={e => setInvTrackingFilter(e.target.value)}
                >
                  <option value="all">Semua Tipe</option>
                  <option value="individual">Aset Individual</option>
                  <option value="quantity">Kuantitas Massal</option>
                </select>
              </div>

              <div style={{ flex: '0 0 150px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={invStatusFilter}
                  onChange={e => setInvStatusFilter(e.target.value)}
                >
                  <option value="all">Semua Status</option>
                  <option value="available">Stok Tersedia</option>
                  <option value="empty">Stok Habis (0)</option>
                  <option value="damaged">Ada Rusak / Servis</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ margin: 0 }}>
              <table className="atrium-inventory-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>Kode Barang</th>
                    <th>Nama Barang & Serial</th>
                    <th>Kategori</th>
                    <th>Lokasi Rak</th>
                    <th style={{ textAlign: 'center' }}>Tipe</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Tersedia</th>
                    <th style={{ textAlign: 'center' }}>Dipinjam</th>
                    <th style={{ textAlign: 'center' }}>Rusak/Servis</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Menyiapkan laporan inventaris...</div>
                      </td>
                    </tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '3rem' }}>
                        <Boxes size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                        <div style={{ color: '#64748b' }}>Tidak ada data inventaris yang cocok dengan kriteria filter.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((it, idx) => {
                      const borrowed = Math.max(0, (it.total_qty || 0) - ((it.available_qty || 0) + (it.damaged_qty || 0) + (it.under_repair_qty || 0)));
                      const defect = (it.damaged_qty || 0) + (it.under_repair_qty || 0);

                      return (
                        <tr key={it.id}>
                          <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>{idx + 1}</td>
                          <td>
                            <span className="atrium-tag-mono" style={{ fontSize: '0.75rem' }}>{it.item_code}</span>
                          </td>
                          <td>
                            <strong style={{ color: '#0f172a', fontSize: '0.875rem', display: 'block' }}>{it.name}</strong>
                            {it.asset_serial && (
                              <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                                SN: {it.asset_serial}
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                              {it.item_categories?.name || '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                              {it.storage_locations?.code || '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="atrium-subtle-badge badge-neutral" style={{ fontSize: '0.6875rem' }}>
                              {it.tracking_type === 'individual' ? 'Individual' : 'Massal'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{it.total_qty}</td>
                          <td style={{ textAlign: 'center', color: it.available_qty > 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                            {it.available_qty}
                          </td>
                          <td style={{ textAlign: 'center', color: borrowed > 0 ? '#d97706' : '#94a3b8' }}>
                            {borrowed}
                          </td>
                          <td style={{ textAlign: 'center', color: defect > 0 ? '#dc2626' : '#94a3b8' }}>
                            {defect}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`atrium-subtle-badge ${it.is_active ? 'badge-available' : 'badge-inactive'}`}>
                              {it.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --------------------------------------------------------------------
          TAB 2: BORROWING & RETURN REPORTS
          -------------------------------------------------------------------- */}
      {activeTab === 'borrowing' && (
        <>
          {/* Borrowing KPI Summary */}
          <div className="atrium-glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Tiket Terfilter</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{brwTotalCount} tiket</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sedang Berjalan</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{brwActiveCount} tiket</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Terlambat (Overdue)</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: brwOverdueCount > 0 ? '#dc2626' : '#64748b' }}>
                  {brwOverdueCount} tiket
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Selesai Dikembalikan</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{brwCompletedCount} tiket</div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="atrium-glass-card no-print" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="atrium-input"
                  style={{ width: '100%', paddingLeft: '2.25rem' }}
                  placeholder="Cari kode tiket, nama peminjam, atau NIK..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ flex: '0 0 160px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={brwStatusFilter}
                  onChange={e => setBrwStatusFilter(e.target.value)}
                >
                  <option value="all">Semua Status</option>
                  <option value="borrowed">Sedang Dipinjam</option>
                  <option value="partial_returned">Kembali Sebagian</option>
                  <option value="overdue">Terlambat (Overdue)</option>
                  <option value="returned">Selesai</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>

              <div style={{ flex: '0 0 160px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={brwDeptFilter}
                  onChange={e => setBrwDeptFilter(e.target.value)}
                >
                  <option value="all">Semua Departemen</option>
                  {departmentsList.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dari:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={brwStartDate}
                  onChange={e => setBrwStartDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sampai:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={brwEndDate}
                  onChange={e => setBrwEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Borrowing Table */}
          <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ margin: 0 }}>
              <table className="atrium-inventory-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>Kode Tiket</th>
                    <th>Peminjam & Divisi</th>
                    <th>Keperluan</th>
                    <th style={{ textAlign: 'center' }}>Total Unit</th>
                    <th>Waktu Pinjam</th>
                    <th>Batas Waktu</th>
                    <th>Status</th>
                    <th>Pencatat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Menyiapkan laporan peminjaman...</div>
                      </td>
                    </tr>
                  ) : filteredBorrowings.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '3rem' }}>
                        <ArrowLeftRight size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                        <div style={{ color: '#64748b' }}>Tidak ada data transaksi peminjaman yang cocok.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredBorrowings.map((b, idx) => (
                      <tr key={b.id}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>{idx + 1}</td>
                        <td>
                          <span className="atrium-tag-mono" style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                            {b.transaction_code}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#0f172a', fontSize: '0.875rem', display: 'block' }}>
                            {b.borrowers?.full_name || '—'}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {b.borrowers?.department || 'Karyawan'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px', fontSize: '0.8125rem', color: '#475569' }}>
                          {b.purpose || '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {b.total_units} unit
                          {b.remaining_units > 0 && b.status === 'partial_returned' && (
                            <div style={{ fontSize: '0.6875rem', color: '#d97706' }}>
                              (Sisa {b.remaining_units})
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          {formatIndonesianDate(b.borrowed_at, true)}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled' ? '#dc2626' : undefined, fontWeight: b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled' ? 700 : 400 }}>
                          {formatIndonesianDate(b.expected_return_at, true)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled' ? (
                            <span className="atrium-subtle-badge badge-status-overdue">Terlambat</span>
                          ) : b.status === 'borrowed' ? (
                            <span className="atrium-subtle-badge badge-status-borrowed">Dipinjam</span>
                          ) : b.status === 'partial_returned' ? (
                            <span className="atrium-subtle-badge badge-status-partial_returned">Parsial</span>
                          ) : b.status === 'returned' ? (
                            <span className="atrium-subtle-badge badge-status-returned">Selesai</span>
                          ) : b.status === 'cancelled' ? (
                            <span className="atrium-subtle-badge badge-status-cancelled">Dibatalkan</span>
                          ) : (
                            <span className="atrium-subtle-badge badge-neutral">{b.status}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {b.recorded_profile?.full_name || 'Petugas'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --------------------------------------------------------------------
          TAB 3: STOCK MOVEMENTS LEDGER REPORTS
          -------------------------------------------------------------------- */}
      {activeTab === 'movements' && (
        <>
          {/* Movement Filters Bar */}
          <div className="atrium-glass-card no-print" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px', position: 'relative' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="atrium-input"
                  style={{ width: '100%', paddingLeft: '2.25rem' }}
                  placeholder="Cari kode/nama barang atau alasan mutasi..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ flex: '0 0 180px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={movTypeFilter}
                  onChange={e => setMovTypeFilter(e.target.value)}
                >
                  <option value="all">Semua Jenis Mutasi</option>
                  <option value="initial_stock">Saldo Awal (initial_stock)</option>
                  <option value="incoming">Barang Masuk (incoming)</option>
                  <option value="borrow_out">Peminjaman (borrow_out)</option>
                  <option value="return_good">Kembali Baik (return_good)</option>
                  <option value="return_damaged">Kembali Rusak (return_damaged)</option>
                  <option value="sent_to_repair">Kirim Servis (sent_to_repair)</option>
                  <option value="repair_complete">Selesai Servis (repair_complete)</option>
                  <option value="adjustment">Penyesuaian (adjustment)</option>
                  <option value="write_off">Afkir Permanen (write_off)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dari:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={movStartDate}
                  onChange={e => setMovStartDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sampai:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={movEndDate}
                  onChange={e => setMovEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ margin: 0 }}>
              <table className="atrium-inventory-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>Waktu Mutasi</th>
                    <th>Kode & Nama Barang</th>
                    <th>Jenis Mutasi</th>
                    <th style={{ textAlign: 'center' }}>Perubahan (Delta)</th>
                    <th style={{ textAlign: 'center' }}>Saldo Akhir</th>
                    <th>Petugas Pelaksana</th>
                    <th>Keterangan / Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat riwayat mutasi stok...</div>
                      </td>
                    </tr>
                  ) : filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                        <History size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                        <div style={{ color: '#64748b' }}>Tidak ada catatan pergerakan stok yang cocok.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m, idx) => {
                      const isPositive = m.quantity_delta > 0;
                      return (
                        <tr key={m.id}>
                          <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>{idx + 1}</td>
                          <td style={{ fontSize: '0.8125rem' }}>
                            {formatIndonesianDate(m.created_at, true)}
                          </td>
                          <td>
                            <span className="atrium-tag-mono" style={{ fontSize: '0.75rem', marginRight: '0.25rem' }}>
                              {m.items?.item_code}
                            </span>
                            <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>{m.items?.name}</strong>
                          </td>
                          <td>
                            <span className="atrium-movement-pill" style={{ fontSize: '0.6875rem' }}>
                              {m.movement_type}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: isPositive ? '#059669' : m.quantity_delta < 0 ? '#dc2626' : '#64748b' }}>
                            {isPositive ? `+${m.quantity_delta}` : m.quantity_delta}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                            {m.qty_after ?? '—'}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: '#475569' }}>
                            {m.performed_profile?.full_name || 'Petugas'}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: '#64748b', maxWidth: '240px' }}>
                            {m.reason || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --------------------------------------------------------------------
          TAB 4: AUDIT TRAIL / ACTIVITY HISTORY
          -------------------------------------------------------------------- */}
      {activeTab === 'audit' && (
        <>
          {/* Audit Filters Bar */}
          <div className="atrium-glass-card no-print" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px', position: 'relative' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="atrium-input"
                  style={{ width: '100%', paddingLeft: '2.25rem' }}
                  placeholder="Cari aksi, entitas, atau aktor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ flex: '0 0 180px' }}>
                <select
                  className="atrium-input"
                  style={{ width: '100%' }}
                  value={auditActionFilter}
                  onChange={e => setAuditActionFilter(e.target.value)}
                >
                  <option value="all">Semua Aksi</option>
                  <option value="borrowing_created">Peminjaman Dibuat</option>
                  <option value="borrowing_returned">Pengembalian Diproses</option>
                  <option value="borrowing_cancelled">Peminjaman Dibatalkan</option>
                  <option value="stock_adjusted">Penyesuaian Stok</option>
                  <option value="item_created">Pendaftaran Barang Baru</option>
                  <option value="staff_invited">Undangan Staf Baru</option>
                  <option value="staff_deactivated">Penonaktifan Staf</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dari:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={auditStartDate}
                  onChange={e => setAuditStartDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sampai:</span>
                <input
                  type="date"
                  className="atrium-input"
                  style={{ width: '135px', fontSize: '0.8125rem' }}
                  value={auditEndDate}
                  onChange={e => setAuditEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ margin: 0 }}>
              <table className="atrium-inventory-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>Waktu Aktivitas</th>
                    <th>Aksi Sistem</th>
                    <th>Entitas</th>
                    <th>Aktor Pelaksana</th>
                    <th>Rincian Operasional</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat jejak audit sistem...</div>
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                        <Shield size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                        <div style={{ color: '#64748b' }}>Tidak ada log audit aktivitas yang cocok.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log, idx) => (
                      <tr key={log.id}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>{idx + 1}</td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          {formatIndonesianDate(log.created_at, true)}
                        </td>
                        <td>
                          <span className="atrium-subtle-badge badge-neutral" style={{ fontWeight: 700, fontSize: '0.75rem' }}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8125rem', color: '#475569', textTransform: 'capitalize' }}>
                            {log.entity_type}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                            {log.performed_profile?.full_name || 'Sistem / Otomatis'}
                          </strong>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'block', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify(log.details)}>
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—')}
                          </code>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Printable Report Signatures Block (Only visible during print) */}
      <div className="atrium-printable-receipt" style={{ display: 'none', marginTop: '3rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', textAlign: 'center', fontSize: '0.8125rem' }}>
          <div>
            <div style={{ color: '#64748b', marginBottom: '4rem' }}>Disiapkan Oleh,</div>
            <div style={{ fontWeight: 700, borderTop: '1px solid #0f172a', paddingTop: '0.25rem', width: '200px', margin: '0 auto' }}>
              {profile?.full_name || 'Petugas Gudang'}
            </div>
          </div>
          <div>
            <div style={{ color: '#64748b', marginBottom: '4rem' }}>Mengetahui & Menyetujui,</div>
            <div style={{ fontWeight: 700, borderTop: '1px solid #0f172a', paddingTop: '0.25rem', width: '200px', margin: '0 auto' }}>
              Kepala Operasional Gudang
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
