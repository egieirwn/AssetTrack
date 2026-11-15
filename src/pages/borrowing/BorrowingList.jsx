import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, Plus, Search, Filter, RefreshCw, AlertCircle,
  Clock, CheckCircle2, AlertTriangle, ArrowRight, X, QrCode,
  Calendar, User, Boxes, Eye, FileText
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function BorrowingList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [borrowings, setBorrowings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, borrowed, partial_returned, overdue, returned, cancelled
  const [dateFilter, setDateFilter] = useState('all'); // all, today, this_week, this_month
  const [error, setError] = useState('');

  const fetchBorrowings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        setBorrowings([]);
        return;
      }

      // Fetch borrowings with borrowers and staff profile
      const { data, error: bErr } = await supabase
        .from('borrowings')
        .select(`
          id,
          transaction_code,
          purpose,
          borrowed_at,
          expected_return_at,
          returned_at,
          status,
          notes,
          created_at,
          borrowers (
            id,
            full_name,
            employee_id,
            department,
            phone
          ),
          recorded_profile:recorded_by (
            id,
            full_name
          ),
          borrowing_items (
            id,
            item_id,
            quantity,
            returned_good_qty,
            returned_damaged_qty
          )
        `)
        .order('created_at', { ascending: false });

      if (bErr) throw bErr;

      const now = new Date();

      // Process and enrich each transaction
      const enriched = (data || []).map(b => {
        const lineCount = b.borrowing_items?.length || 0;
        const totalUnits = (b.borrowing_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
        const returnedUnits = (b.borrowing_items || []).reduce((s, it) => s + ((it.returned_good_qty || 0) + (it.returned_damaged_qty || 0)), 0);
        const remainingUnits = Math.max(0, totalUnits - returnedUnits);

        // Dynamically compute overdue status
        const isPastDue = b.expected_return_at && new Date(b.expected_return_at) < now;
        const isOverdue = (b.status === 'overdue') || (
          ['borrowed', 'partial_returned'].includes(b.status) && isPastDue
        );

        let displayStatus = b.status;
        if (isOverdue && ['borrowed', 'partial_returned'].includes(b.status)) {
          displayStatus = 'overdue';
        }

        return {
          ...b,
          line_count: lineCount,
          total_units: totalUnits,
          returned_units: returnedUnits,
          remaining_units: remainingUnits,
          is_overdue: isOverdue,
          display_status: displayStatus
        };
      });

      setBorrowings(enriched);
    } catch (err) {
      console.error('Error fetching borrowings:', err);
      setError('Gagal memuat transaksi peminjaman: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchBorrowings();
  }, [fetchBorrowings]);

  // KPI Calculations
  const totalTransactions = borrowings.length;
  const activeCount = borrowings.filter(b => ['borrowed', 'partial_returned'].includes(b.status) && !b.is_overdue).length;
  const overdueCount = borrowings.filter(b => b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled').length;
  const completedCount = borrowings.filter(b => b.status === 'returned').length;
  const totalBorrowedUnits = borrowings
    .filter(b => ['borrowed', 'partial_returned', 'overdue'].includes(b.status))
    .reduce((s, b) => s + (b.remaining_units || 0), 0);

  // Filter logic
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredBorrowings = borrowings.filter(b => {
    // Search
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      (b.transaction_code && b.transaction_code.toLowerCase().includes(q)) ||
      (b.borrowers?.full_name && b.borrowers.full_name.toLowerCase().includes(q)) ||
      (b.borrowers?.employee_id && b.borrowers.employee_id.toLowerCase().includes(q)) ||
      (b.borrowers?.department && b.borrowers.department.toLowerCase().includes(q)) ||
      (b.purpose && b.purpose.toLowerCase().includes(q));

    // Status filter
    let matchStatus = true;
    if (statusFilter === 'borrowed') {
      matchStatus = b.status === 'borrowed' && !b.is_overdue;
    } else if (statusFilter === 'partial_returned') {
      matchStatus = b.status === 'partial_returned' && !b.is_overdue;
    } else if (statusFilter === 'overdue') {
      matchStatus = b.is_overdue && b.status !== 'returned' && b.status !== 'cancelled';
    } else if (statusFilter === 'returned') {
      matchStatus = b.status === 'returned';
    } else if (statusFilter === 'cancelled') {
      matchStatus = b.status === 'cancelled';
    }

    // Date filter
    let matchDate = true;
    if (dateFilter === 'today') {
      matchDate = b.borrowed_at && b.borrowed_at.startsWith(todayStr);
    } else if (dateFilter === 'this_week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      matchDate = b.borrowed_at && new Date(b.borrowed_at) >= oneWeekAgo;
    } else if (dateFilter === 'this_month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      matchDate = b.borrowed_at && new Date(b.borrowed_at) >= oneMonthAgo;
    }

    return matchSearch && matchStatus && matchDate;
  });

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeftRight size={20} color="#2563eb" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Peminjaman & Pengembalian</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Kelola sirkulasi aset, batas pengembalian, status jatuh tempo, dan bukti transaksi gudang.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchBorrowings}
              disabled={loading}
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={() => navigate('/peminjaman/tambah')}
            >
              <Plus size={16} />
              Catat Peminjaman Baru
            </button>
          </div>
        </div>

        {/* Mini KPI Chips */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Transaksi</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{totalTransactions}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sedang Dipinjam</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>{activeCount} tiket</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Unit Sedang Di Luar</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' }}>{totalBorrowedUnits} unit</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Terlambat (Overdue)</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: overdueCount > 0 ? '#e11d48' : '#64748b' }}>
              {overdueCount} tiket
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Selesai Kembali</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{completedCount} tiket</div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="atrium-error-card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={18} color="#e11d48" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>{error}</div>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="atrium-glass-card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="atrium-input"
              style={{ width: '100%', paddingLeft: '2.25rem' }}
              placeholder="Cari kode tiket (BRW-...), nama peminjam, NIK, atau keperluan..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <div style={{ flex: '0 0 180px' }}>
            <select
              className="atrium-input"
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Semua Status</option>
              <option value="borrowed">Sedang Dipinjam</option>
              <option value="partial_returned">Kembali Sebagian</option>
              <option value="overdue">Terlambat (Overdue)</option>
              <option value="returned">Selesai Dikembalikan</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ flex: '0 0 160px' }}>
            <select
              className="atrium-input"
              style={{ width: '100%' }}
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            >
              <option value="all">Semua Waktu</option>
              <option value="today">Hari Ini</option>
              <option value="this_week">7 Hari Terakhir</option>
              <option value="this_month">30 Hari Terakhir</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a' }}>
            Daftar Transaksi Peminjaman
          </div>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Menampilkan {filteredBorrowings.length} dari {borrowings.length} tiket
          </span>
        </div>

        <div className="table-wrapper" style={{ margin: 0, overflowX: 'auto' }}>
          <table className="atrium-inventory-table">
            <thead>
              <tr>
                <th>Kode Tiket</th>
                <th>Peminjam & Departemen</th>
                <th>Waktu Pinjam</th>
                <th>Batas Jatuh Tempo</th>
                <th style={{ textAlign: 'center' }}>Jumlah Barang</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Petugas Pencatat</th>
                <th style={{ textAlign: 'right', width: '150px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat data peminjaman...</div>
                  </td>
                </tr>
              ) : filteredBorrowings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <ArrowLeftRight size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
                        ? 'Tidak ada peminjaman yang cocok dengan filter'
                        : 'Belum ada transaksi peminjaman'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      Klik "Catat Peminjaman Baru" untuk memulai transaksi.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBorrowings.map(b => {
                  const isPendingReturn = ['borrowed', 'partial_returned', 'overdue'].includes(b.status) || b.is_overdue;
                  const isReturned = b.status === 'returned';
                  const isCancelled = b.status === 'cancelled';

                  return (
                    <tr key={b.id} style={{ backgroundColor: b.is_overdue && !isReturned && !isCancelled ? 'rgba(254, 242, 242, 0.4)' : undefined }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="atrium-tag-mono" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                            {b.transaction_code}
                          </span>
                        </div>
                        {b.purpose && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.purpose}>
                            {b.purpose}
                          </div>
                        )}
                      </td>

                      <td>
                        <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.875rem' }}>
                          {b.borrowers?.full_name || '—'}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {b.borrowers?.department || 'Karyawan'} {b.borrowers?.employee_id ? `· ${b.borrowers.employee_id}` : ''}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem', color: '#334155' }}>
                          {b.borrowed_at ? new Date(b.borrowed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {b.borrowed_at ? new Date(b.borrowed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem', color: b.is_overdue && !isReturned && !isCancelled ? '#dc2626' : '#334155', fontWeight: b.is_overdue && !isReturned && !isCancelled ? 700 : 400 }}>
                          {b.expected_return_at ? new Date(b.expected_return_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: b.is_overdue && !isReturned && !isCancelled ? '#dc2626' : '#94a3b8' }}>
                          {b.expected_return_at ? new Date(b.expected_return_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {b.is_overdue && !isReturned && !isCancelled ? ' (Lewat)' : ''}
                        </span>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <span className="atrium-subtle-badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Boxes size={12} />
                          {b.line_count} macam ({b.total_units} unit)
                        </span>
                        {b.status === 'partial_returned' && (
                          <div style={{ fontSize: '0.6875rem', color: '#d97706', marginTop: '0.125rem' }}>
                            Sisa {b.remaining_units} unit
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {b.is_overdue && !isReturned && !isCancelled ? (
                          <span className="atrium-subtle-badge badge-status-overdue">
                            Terlambat
                          </span>
                        ) : b.status === 'borrowed' ? (
                          <span className="atrium-subtle-badge badge-status-borrowed">
                            Dipinjam
                          </span>
                        ) : b.status === 'partial_returned' ? (
                          <span className="atrium-subtle-badge badge-status-partial_returned">
                            Kembali Parsial
                          </span>
                        ) : b.status === 'returned' ? (
                          <span className="atrium-subtle-badge badge-status-returned">
                            Selesai
                          </span>
                        ) : b.status === 'cancelled' ? (
                          <span className="atrium-subtle-badge badge-status-cancelled">
                            Dibatalkan
                          </span>
                        ) : (
                          <span className="atrium-subtle-badge badge-neutral">
                            {b.status}
                          </span>
                        )}
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {b.recorded_profile?.full_name || 'Petugas'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn-atrium-outline"
                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                            onClick={() => navigate(`/peminjaman/${b.id}`)}
                            title="Lihat Detail Transaksi"
                          >
                            <Eye size={13} />
                            Detail
                          </button>

                          {isPendingReturn && !isCancelled && !isReturned && (
                            <button
                              type="button"
                              className="btn-atrium-primary"
                              style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                              onClick={() => navigate(`/peminjaman/${b.id}/pengembalian`)}
                              title="Proses Pengembalian Barang"
                            >
                              Kembali
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
