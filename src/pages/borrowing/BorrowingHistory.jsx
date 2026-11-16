import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, Search, Filter, RefreshCw, AlertCircle,
  Clock, CheckCircle2, AlertTriangle, ArrowRight, X,
  Calendar, User, Boxes, Eye, FileText, ArrowLeftRight,
  ChevronRight, Building2, Hash, Phone, Ban
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const formatDateTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateOnly = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export default function BorrowingHistory() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedTx, setSelectedTx] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!isConfigured) {
      setError('Koneksi basis data belum dikonfigurasi. Riwayat transaksi riil tidak dapat dimuat.');
      setTransactions([]);
      setLoading(false);
      return;
    }

    try {
      // Query borrowings with complete relationships:
      // borrowings -> borrowers
      // borrowings -> recorded_by (profiles)
      // borrowings -> returned_by (profiles)
      // borrowings -> borrowing_items -> items
      const { data, error: qErr } = await supabase
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
          returned_profile:returned_by (
            id,
            full_name
          ),
          borrowing_items (
            id,
            item_id,
            quantity,
            returned_good_qty,
            returned_damaged_qty,
            borrow_condition,
            return_condition,
            return_notes,
            items (
              id,
              item_code,
              name,
              tracking_type,
              asset_serial
            )
          )
        `)
        .order('borrowed_at', { ascending: false });

      if (qErr) throw qErr;

      const now = new Date();

      const enriched = (data || []).map(tx => {
        const lineCount = tx.borrowing_items?.length || 0;
        const totalUnits = (tx.borrowing_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
        const goodReturned = (tx.borrowing_items || []).reduce((s, it) => s + (it.returned_good_qty || 0), 0);
        const damagedReturned = (tx.borrowing_items || []).reduce((s, it) => s + (it.returned_damaged_qty || 0), 0);
        const totalReturned = goodReturned + damagedReturned;
        const remainingUnits = Math.max(0, totalUnits - totalReturned);

        const isPastDue = tx.expected_return_at && new Date(tx.expected_return_at) < now;
        const isOverdue = tx.status === 'overdue' || (
          ['borrowed', 'partial_returned'].includes(tx.status) && isPastDue
        );

        let displayStatus = tx.status;
        if (isOverdue && ['borrowed', 'partial_returned'].includes(tx.status)) {
          displayStatus = 'overdue';
        }

        return {
          ...tx,
          line_count: lineCount,
          total_units: totalUnits,
          good_returned: goodReturned,
          damaged_returned: damagedReturned,
          total_returned: totalReturned,
          remaining_units: remainingUnits,
          is_overdue: isOverdue,
          display_status: displayStatus
        };
      });

      setTransactions(enriched);
    } catch (err) {
      console.error('Error fetching borrowing history:', err);
      setError('Gagal memuat riwayat transaksi: ' + (err.message || 'Kesalahan jaringan basis data.'));
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter Logic
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredTransactions = transactions.filter(tx => {
    // Search filter across transaction code, borrower, dept, employee id, item names, purpose
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const codeMatch = tx.transaction_code?.toLowerCase().includes(q);
      const borrowerMatch = tx.borrowers?.full_name?.toLowerCase().includes(q);
      const deptMatch = tx.borrowers?.department?.toLowerCase().includes(q);
      const empIdMatch = tx.borrowers?.employee_id?.toLowerCase().includes(q);
      const purposeMatch = tx.purpose?.toLowerCase().includes(q);
      const itemMatch = tx.borrowing_items?.some(it =>
        it.items?.name?.toLowerCase().includes(q) ||
        it.items?.item_code?.toLowerCase().includes(q)
      );

      if (!codeMatch && !borrowerMatch && !deptMatch && !empIdMatch && !purposeMatch && !itemMatch) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'borrowed' && (tx.display_status !== 'borrowed' || tx.is_overdue)) return false;
      if (statusFilter === 'partial_returned' && (tx.display_status !== 'partial_returned' || tx.is_overdue)) return false;
      if (statusFilter === 'overdue' && !tx.is_overdue) return false;
      if (statusFilter === 'returned' && tx.status !== 'returned') return false;
      if (statusFilter === 'cancelled' && tx.status !== 'cancelled') return false;
    }

    // Date filter
    if (dateFilter !== 'all') {
      if (dateFilter === 'today') {
        if (!tx.borrowed_at || !tx.borrowed_at.startsWith(todayStr)) return false;
      } else if (dateFilter === 'this_week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        if (!tx.borrowed_at || new Date(tx.borrowed_at) < oneWeekAgo) return false;
      } else if (dateFilter === 'this_month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        if (!tx.borrowed_at || new Date(tx.borrowed_at) < oneMonthAgo) return false;
      }
    }

    return true;
  });

  // Status Badge Component
  const renderStatusBadge = (tx) => {
    if (tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled') {
      return <span className="atrium-subtle-badge badge-status-overdue">Terlambat</span>;
    }
    switch (tx.status) {
      case 'borrowed':
        return <span className="atrium-subtle-badge badge-status-borrowed">Dipinjam</span>;
      case 'partial_returned':
        return <span className="atrium-subtle-badge badge-status-partial_returned">Kembali Sebagian</span>;
      case 'returned':
        return <span className="atrium-subtle-badge badge-status-returned">Selesai</span>;
      case 'cancelled':
        return <span className="atrium-subtle-badge badge-status-cancelled">Dibatalkan</span>;
      default:
        return <span className="atrium-subtle-badge badge-neutral">{tx.status}</span>;
    }
  };

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <History size={20} color="#2563eb" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Riwayat Transaksi Peminjaman</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Audit lengkap transaksi peminjaman dan pengembalian aset gudang PT Vinix Seven Aurum.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchHistory}
              disabled={loading}
              title="Segarkan data riwayat"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={() => navigate('/peminjaman/tambah')}
            >
              Catat Peminjaman Baru
            </button>
          </div>
        </div>

        {/* Quick KPI Stats */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Arsip Riwayat</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{transactions.length} transaksi</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sedang Berjalan</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>
              {transactions.filter(t => ['borrowed', 'partial_returned'].includes(t.status) && !t.is_overdue).length} tiket
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Terlambat</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e11d48' }}>
              {transactions.filter(t => t.is_overdue && t.status !== 'returned' && t.status !== 'cancelled').length} tiket
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Selesai Dikembalikan</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
              {transactions.filter(t => t.status === 'returned').length} tiket
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dibatalkan</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#64748b' }}>
              {transactions.filter(t => t.status === 'cancelled').length} tiket
            </div>
          </div>
        </div>
      </div>

      {/* Query Error Notice */}
      {error && (
        <div className="atrium-error-card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={20} color="#e11d48" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>
            <strong>Kesalahan Pengambilan Data:</strong> {error}
          </div>
          <button
            type="button"
            className="btn-atrium-outline"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            onClick={fetchHistory}
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="atrium-glass-card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="atrium-input"
              style={{ width: '100%', paddingLeft: '2.25rem' }}
              placeholder="Cari kode tiket (BRW-...), nama peminjam, departemen, atau barang..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <div style={{ flex: '0 0 190px' }}>
            <CustomSelect
              className="atrium-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              ariaLabel="Filter Status Riwayat"
            >
              <option value="all">Semua Status</option>
              <option value="borrowed">Sedang Dipinjam</option>
              <option value="partial_returned">Kembali Sebagian</option>
              <option value="overdue">Terlambat</option>
              <option value="returned">Selesai Dikembalikan</option>
              <option value="cancelled">Dibatalkan</option>
            </CustomSelect>
          </div>

          {/* Date Filter */}
          <div style={{ flex: '0 0 170px' }}>
            <CustomSelect
              className="atrium-input"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              ariaLabel="Filter Rentang Waktu Riwayat"
            >
              <option value="all">Semua Waktu</option>
              <option value="today">Hari Ini</option>
              <option value="this_week">7 Hari Terakhir</option>
              <option value="this_month">30 Hari Terakhir</option>
            </CustomSelect>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a' }}>
            Buku Riwayat Transaksi Pergudangan
          </div>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Menampilkan {filteredTransactions.length} dari {transactions.length} riwayat
          </span>
        </div>

        <div className="table-wrapper" style={{ margin: 0, overflowX: 'auto', width: '100%' }}>
          <table className="atrium-inventory-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '15%', minWidth: '150px' }}>Kode Transaksi</th>
                <th style={{ width: '20%', minWidth: '180px' }}>Peminjam & Departemen</th>
                <th style={{ width: '13%', minWidth: '130px' }}>Waktu Pinjam</th>
                <th style={{ width: '13%', minWidth: '130px' }}>Jatuh Tempo</th>
                <th style={{ width: '18%', minWidth: '160px' }}>Rincian Barang</th>
                <th style={{ textAlign: 'center', width: '11%', minWidth: '110px' }}>Status</th>
                <th style={{ width: '10%', minWidth: '110px' }}>Petugas</th>
                <th style={{ textAlign: 'right', width: '100px', minWidth: '100px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat riwayat peminjaman...</div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <History size={36} color="#94a3b8" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem', marginBottom: '0.25rem' }}>
                      Belum ada riwayat peminjaman.
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', maxWidth: '420px', margin: '0 auto' }}>
                      {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
                        ? 'Tidak ada transaksi peminjaman yang cocok dengan kriteria filter yang dipilih.'
                        : 'Belum ada catatan transaksi peminjaman alat atau peralatan gudang tercatat di sistem.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const isPendingReturn = ['borrowed', 'partial_returned', 'overdue'].includes(tx.status) || tx.is_overdue;

                  return (
                    <tr key={tx.id} style={{ backgroundColor: tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled' ? 'rgba(254, 242, 242, 0.45)' : undefined }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="atrium-tag-mono" style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                            {tx.transaction_code}
                          </span>
                        </div>
                        {tx.purpose && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.purpose}>
                            {tx.purpose}
                          </div>
                        )}
                      </td>

                      <td>
                        <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.875rem' }}>
                          {tx.borrowers?.full_name || '—'}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {tx.borrowers?.department || 'Karyawan'} {tx.borrowers?.employee_id ? `· ${tx.borrowers.employee_id}` : ''}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem', color: '#334155' }}>
                          {formatDateOnly(tx.borrowed_at)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {tx.borrowed_at ? new Date(tx.borrowed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem', color: tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled' ? '#dc2626' : '#334155', fontWeight: tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled' ? 700 : 400 }}>
                          {formatDateOnly(tx.expected_return_at)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled' ? '#dc2626' : '#94a3b8' }}>
                          {tx.expected_return_at ? new Date(tx.expected_return_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {tx.is_overdue && tx.status !== 'returned' && tx.status !== 'cancelled' ? ' (Lewat)' : ''}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem', color: '#1e293b' }}>
                          {tx.borrowing_items?.slice(0, 2).map((it, idx) => (
                            <span key={it.id || idx}>
                              {it.items?.name || 'Barang'} ({it.quantity}x)
                              {idx < Math.min(tx.borrowing_items.length, 2) - 1 ? ', ' : ''}
                            </span>
                          ))}
                          {tx.borrowing_items?.length > 2 && (
                            <span style={{ color: '#2563eb', fontWeight: 600 }}> +{tx.borrowing_items.length - 2} item</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>
                          Total: {tx.total_units} unit {tx.status === 'partial_returned' ? `(Sisa ${tx.remaining_units} unit)` : ''}
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {renderStatusBadge(tx)}
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                          {tx.recorded_profile?.full_name || 'Petugas'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn-atrium-outline"
                            style={{ padding: '0.35rem 0.625rem', fontSize: '0.75rem' }}
                            onClick={() => setSelectedTx(tx)}
                            title="Lihat Detail Transaksi"
                          >
                            <Eye size={13} />
                            Detail
                          </button>
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

      {/* Detail Modal */}
      {selectedTx && (
        <div className="modal-overlay" onClick={() => setSelectedTx(null)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Detail Riwayat Peminjaman</h3>
                <span className="atrium-tag-mono" style={{ fontSize: '0.8125rem', color: '#2563eb', fontWeight: 700 }}>
                  {selectedTx.transaction_code}
                </span>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedTx(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* Status & Progress Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', padding: '0.875rem', background: '#f8fafc', borderRadius: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Status Transaksi</span>
                  {renderStatusBadge(selectedTx)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Progres Pengembalian</span>
                  <strong style={{ fontSize: '0.9375rem', color: selectedTx.total_returned >= selectedTx.total_units ? '#16a34a' : '#2563eb' }}>
                    {selectedTx.total_returned} / {selectedTx.total_units} unit ({Math.round((selectedTx.total_returned / (selectedTx.total_units || 1)) * 100)}%)
                  </strong>
                </div>
              </div>

              {/* Borrower Info Card */}
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.625rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={15} color="#2563eb" /> Identitas Peminjam
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Nama Lengkap</span>
                    <strong style={{ color: '#0f172a' }}>{selectedTx.borrowers?.full_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Departemen / Divisi</span>
                    <span>{selectedTx.borrowers?.department || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>ID Karyawan / NIK</span>
                    <span style={{ fontFamily: 'monospace' }}>{selectedTx.borrowers?.employee_id || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Nomor Telepon</span>
                    <span>{selectedTx.borrowers?.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Timing & Operators */}
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.625rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={15} color="#2563eb" /> Waktu & Petugas Operasional
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Waktu Peminjaman</span>
                    <span>{formatDateTime(selectedTx.borrowed_at)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Batas Jatuh Tempo</span>
                    <span style={{ color: selectedTx.is_overdue && selectedTx.status !== 'returned' && selectedTx.status !== 'cancelled' ? '#dc2626' : undefined, fontWeight: selectedTx.is_overdue ? 700 : 400 }}>
                      {formatDateTime(selectedTx.expected_return_at)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Petugas Pencatat</span>
                    <span>{selectedTx.recorded_profile?.full_name || 'Petugas'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Waktu Selesai Kembali</span>
                    <span>{selectedTx.returned_at ? formatDateTime(selectedTx.returned_at) : 'Belum selesai'}</span>
                  </div>
                </div>
                {selectedTx.purpose && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Keperluan Penggunaan:</span>
                    <span style={{ color: '#334155' }}>{selectedTx.purpose}</span>
                  </div>
                )}
              </div>

              {/* Items Breakdown Table */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.625rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Boxes size={15} color="#2563eb" /> Rincian Barang yang Dipinjam ({selectedTx.borrowing_items?.length || 0} item)
                </h4>
                <div style={{ border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Barang / SKU</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Pinjam</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Kembali Baik</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Kembali Rusak</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Sisa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTx.borrowing_items || []).map((it, idx) => {
                        const good = it.returned_good_qty || 0;
                        const damaged = it.returned_damaged_qty || 0;
                        const remaining = Math.max(0, (it.quantity || 0) - (good + damaged));

                        return (
                          <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              <strong style={{ display: 'block', color: '#0f172a' }}>{it.items?.name || 'Barang'}</strong>
                              <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                                {it.items?.item_code || '—'} {it.items?.asset_serial ? `· SN: ${it.items.asset_serial}` : ''}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                              {it.quantity}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
                              {good}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: damaged > 0 ? '#dc2626' : '#94a3b8', fontWeight: damaged > 0 ? 700 : 400 }}>
                              {damaged}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: remaining > 0 ? '#d97706' : '#64748b' }}>
                              {remaining}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setSelectedTx(null)}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => {
                    const id = selectedTx.id;
                    setSelectedTx(null);
                    navigate(`/peminjaman/${id}`);
                  }}
                >
                  Buka Halaman Lengkap
                </button>
                {['borrowed', 'partial_returned', 'overdue'].includes(selectedTx.status) && selectedTx.remaining_units > 0 && (
                  <button
                    type="button"
                    className="btn-atrium-primary"
                    onClick={() => {
                      const id = selectedTx.id;
                      setSelectedTx(null);
                      navigate(`/peminjaman/${id}/pengembalian`);
                    }}
                  >
                    Proses Pengembalian
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
