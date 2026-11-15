import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowLeftRight, Calendar, User, Boxes, QrCode,
  AlertCircle, CheckCircle2, Clock, Printer, X, ShieldAlert,
  Ban, Check, AlertTriangle, FileText, Building, Phone
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function BorrowingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [borrowing, setBorrowing] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cancel modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // QR Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        // Fallback for offline/test environments
        setBorrowing({
          id,
          transaction_code: 'BRW-DEMO-0001',
          purpose: 'Uji coba operasional gudang PT Vinix Seven Aurum',
          borrowed_at: new Date().toISOString(),
          expected_return_at: new Date(Date.now() + 86400000).toISOString(),
          status: 'borrowed',
          notes: 'Kelengkapan adaptor lengkap',
          borrowers: {
            full_name: 'Budi Santoso',
            employee_id: 'EMP-001',
            department: 'IT Infrastructure',
            phone: '08123456789'
          },
          recorded_profile: { full_name: 'Admin Gudang' },
          borrowing_items: [
            {
              id: 'bi-1',
              quantity: 1,
              returned_good_qty: 0,
              returned_damaged_qty: 0,
              borrow_condition: 'baik',
              items: {
                id: 'itm-1',
                item_code: 'ITM-LP01',
                name: 'MacBook Pro 14" M3',
                tracking_type: 'individual',
                asset_serial: 'VNX-MBP-001'
              }
            }
          ]
        });
        setLoading(false);
        return;
      }

      // Fetch borrowing header, borrower, profiles, and line items with item info
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
            returned_at,
            items (
              id,
              item_code,
              name,
              tracking_type,
              asset_serial,
              condition
            )
          )
        `)
        .eq('id', id)
        .single();

      if (bErr) throw bErr;
      if (!data) throw new Error('Transaksi peminjaman tidak ditemukan.');

      // Check overdue dynamically
      const now = new Date();
      const isPastDue = data.expected_return_at && new Date(data.expected_return_at) < now;
      const isOverdue = data.status === 'overdue' || (
        ['borrowed', 'partial_returned'].includes(data.status) && isPastDue
      );

      setBorrowing({
        ...data,
        is_overdue: isOverdue
      });

      // Fetch activity logs for this borrowing
      const { data: logs, error: logErr } = await supabase
        .from('activity_logs')
        .select(`
          id,
          action,
          details,
          created_at,
          profiles:performed_by (
            id,
            full_name
          )
        `)
        .eq('entity_type', 'borrowing')
        .eq('entity_id', id)
        .order('created_at', { ascending: true });

      if (logErr) {
        console.warn('Could not load activity logs:', logErr.message);
      }
      setTimeline(logs || []);
    } catch (err) {
      console.error('Error fetching borrowing detail:', err);
      setError('Gagal memuat detail peminjaman: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [id, isConfigured]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Handle Cancellation
  const handleCancelBorrowing = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setError('Alasan pembatalan transaksi wajib diisi.');
      return;
    }

    setCancelling(true);
    setError('');
    try {
      if (!isConfigured) {
        setBorrowing(prev => ({ ...prev, status: 'cancelled' }));
        setShowCancelModal(false);
        setSuccess('Transaksi peminjaman berhasil dibatalkan (mode lokal).');
        return;
      }

      const { data, error: rpcErr } = await supabase.rpc('rpc_cancel_borrowing', {
        p_borrowing_id: id,
        p_reason: cancelReason.trim()
      });

      if (rpcErr) throw rpcErr;

      setShowCancelModal(false);
      setSuccess('Transaksi peminjaman berhasil dibatalkan. Kuantitas stok inventaris telah dipulihkan.');
      fetchDetail();
    } catch (err) {
      console.error('Cancellation failure:', err);
      setError(err.message || 'Gagal membatalkan transaksi.');
    } finally {
      setCancelling(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="atrium-content-container">
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3.5rem' }}>
          <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat rincian tiket peminjaman...</div>
        </div>
      </div>
    );
  }

  if (!borrowing && error) {
    return (
      <div className="atrium-content-container">
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <AlertCircle size={36} color="#e11d48" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Transaksi Tidak Ditemukan</h3>
          <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{error}</p>
          <button type="button" className="btn-atrium-outline" onClick={() => navigate('/peminjaman')}>
            <ArrowLeft size={16} /> Kembali ke Daftar
          </button>
        </div>
      </div>
    );
  }

  // Quantities calculation
  const totalBorrowedUnits = (borrowing.borrowing_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
  const totalReturnedUnits = (borrowing.borrowing_items || []).reduce((s, it) => s + ((it.returned_good_qty || 0) + (it.returned_damaged_qty || 0)), 0);
  const remainingUnits = Math.max(0, totalBorrowedUnits - totalReturnedUnits);

  // Cancellation eligibility: ONLY if status is 'borrowed' and NO items have been returned
  const canCancel = borrowing.status === 'borrowed' && totalReturnedUnits === 0;

  // Return eligibility
  const canReturn = ['borrowed', 'partial_returned', 'overdue'].includes(borrowing.status) && remainingUnits > 0;

  // Safe QR Payload
  const qrReceiptPayload = JSON.stringify({
    system: 'SiPenitip-Vinix',
    type: 'BORROWING_RECEIPT',
    code: borrowing.transaction_code,
    id: borrowing.id
  });

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <button
                type="button"
                className="btn-atrium-ghost"
                onClick={() => navigate('/peminjaman')}
                style={{ padding: '0.375rem', borderRadius: '8px' }}
                title="Kembali ke daftar peminjaman"
              >
                <ArrowLeft size={18} />
              </button>
              <span className="atrium-tag-mono" style={{ fontSize: '1.125rem', fontWeight: 800 }}>
                {borrowing.transaction_code}
              </span>

              {borrowing.is_overdue && borrowing.status !== 'returned' && borrowing.status !== 'cancelled' ? (
                <span className="atrium-subtle-badge badge-status-overdue">
                  Terlambat (Overdue)
                </span>
              ) : borrowing.status === 'borrowed' ? (
                <span className="atrium-subtle-badge badge-status-borrowed">
                  Sedang Dipinjam
                </span>
              ) : borrowing.status === 'partial_returned' ? (
                <span className="atrium-subtle-badge badge-status-partial_returned">
                  Kembali Sebagian
                </span>
              ) : borrowing.status === 'returned' ? (
                <span className="atrium-subtle-badge badge-status-returned">
                  Selesai Dikembalikan
                </span>
              ) : borrowing.status === 'cancelled' ? (
                <span className="atrium-subtle-badge badge-status-cancelled">
                  Dibatalkan
                </span>
              ) : (
                <span className="atrium-subtle-badge badge-neutral">
                  {borrowing.status}
                </span>
              )}
            </div>

            <p className="atrium-card-subtitle" style={{ margin: 0, marginLeft: '2.5rem' }}>
              Keperluan: <strong>{borrowing.purpose}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={() => setShowReceiptModal(true)}
              title="Lihat / Cetak Bukti Peminjaman QR"
            >
              <QrCode size={15} />
              Cetak Bukti QR
            </button>

            {canReturn && (
              <button
                type="button"
                className="btn-atrium-primary"
                onClick={() => navigate(`/peminjaman/${borrowing.id}/pengembalian`)}
              >
                <ArrowLeftRight size={15} />
                Proses Pengembalian
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                className="btn-atrium-ghost"
                style={{ color: '#e11d48', borderColor: '#fecdd3' }}
                onClick={() => { setShowCancelModal(true); setCancelReason(''); }}
                title="Batalkan transaksi ini"
              >
                <Ban size={15} />
                Batalkan
              </button>
            )}
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

      {success && (
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '0.875rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#065f46' }}>
          <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{success}</div>
        </div>
      )}

      {/* Grid: Details & Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Borrower Card */}
        <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={16} color="#2563eb" />
            Identitas Karyawan Peminjam
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Nama Lengkap</span>
              <strong style={{ color: '#0f172a' }}>{borrowing.borrowers?.full_name || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Departemen / Divisi</span>
              <span style={{ color: '#334155' }}>{borrowing.borrowers?.department || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>NIK / ID Karyawan</span>
              <code style={{ fontSize: '0.8125rem' }}>{borrowing.borrowers?.employee_id || '—'}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Nomor Telepon</span>
              <span style={{ color: '#334155' }}>{borrowing.borrowers?.phone || '—'}</span>
            </div>
          </div>
        </div>

        {/* Schedule & Operational Info Card */}
        <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={16} color="#2563eb" />
            Jadwal & Catatan Petugas
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Waktu Peminjaman</span>
              <span style={{ color: '#334155' }}>
                {borrowing.borrowed_at ? new Date(borrowing.borrowed_at).toLocaleString('id-ID') : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Batas Pengembalian</span>
              <span style={{ color: borrowing.is_overdue && borrowing.status !== 'returned' ? '#dc2626' : '#334155', fontWeight: borrowing.is_overdue && borrowing.status !== 'returned' ? 700 : 400 }}>
                {borrowing.expected_return_at ? new Date(borrowing.expected_return_at).toLocaleString('id-ID') : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Petugas Pencatat</span>
              <span style={{ color: '#334155' }}>{borrowing.recorded_profile?.full_name || 'Petugas'}</span>
            </div>
            {borrowing.returned_profile && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Petugas Penerima</span>
                <span style={{ color: '#334155' }}>{borrowing.returned_profile.full_name}</span>
              </div>
            )}
            {borrowing.notes && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.8125rem', color: '#64748b' }}>
                <strong>Catatan:</strong> {borrowing.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Borrowed Items Table */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
            Rincian Barang Dipinjam
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem' }}>
            <span>Total Dipinjam: <strong>{totalBorrowedUnits} unit</strong></span>
            <span>Telah Kembali: <strong style={{ color: '#059669' }}>{totalReturnedUnits} unit</strong></span>
            <span>Sisa Tanggungan: <strong style={{ color: remainingUnits > 0 ? '#2563eb' : '#64748b' }}>{remainingUnits} unit</strong></span>
          </div>
        </div>

        <div className="table-wrapper" style={{ margin: 0 }}>
          <table className="atrium-inventory-table">
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                <th>Kode & Nama Barang</th>
                <th>Tipe / No. Seri</th>
                <th style={{ textAlign: 'center' }}>Jumlah Dipinjam</th>
                <th style={{ textAlign: 'center' }}>Kembali Baik</th>
                <th style={{ textAlign: 'center' }}>Kembali Rusak</th>
                <th style={{ textAlign: 'center' }}>Sisa Pinjam</th>
                <th style={{ textAlign: 'center' }}>Status Baris</th>
              </tr>
            </thead>
            <tbody>
              {(borrowing.borrowing_items || []).map((line, idx) => {
                const good = line.returned_good_qty || 0;
                const damaged = line.returned_damaged_qty || 0;
                const totalRet = good + damaged;
                const unreturned = Math.max(0, line.quantity - totalRet);
                const isLineComplete = unreturned === 0;

                return (
                  <tr key={line.id}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                      {idx + 1}
                    </td>

                    <td>
                      <div>
                        <span className="atrium-tag-mono" style={{ fontSize: '0.75rem', marginRight: '0.375rem' }}>
                          {line.items?.item_code || '—'}
                        </span>
                        <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                          {line.items?.name || 'Barang Inventaris'}
                        </strong>
                      </div>
                      {line.return_notes && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>
                          Catatan kembali: {line.return_notes}
                        </div>
                      )}
                    </td>

                    <td>
                      {line.items?.tracking_type === 'individual' ? (
                        <span className="atrium-subtle-badge badge-neutral" style={{ fontSize: '0.6875rem' }}>
                          SN: {line.items?.asset_serial || '—'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Kuantitas Massal</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {line.quantity} unit
                    </td>

                    <td style={{ textAlign: 'center', color: good > 0 ? '#059669' : '#94a3b8', fontWeight: good > 0 ? 700 : 400 }}>
                      {good}
                    </td>

                    <td style={{ textAlign: 'center', color: damaged > 0 ? '#dc2626' : '#94a3b8', fontWeight: damaged > 0 ? 700 : 400 }}>
                      {damaged}
                    </td>

                    <td style={{ textAlign: 'center', color: unreturned > 0 ? '#2563eb' : '#94a3b8', fontWeight: unreturned > 0 ? 700 : 400 }}>
                      {unreturned} unit
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {isLineComplete ? (
                        <span className="atrium-subtle-badge badge-status-returned">
                          Lengkap
                        </span>
                      ) : totalRet > 0 ? (
                        <span className="atrium-subtle-badge badge-status-partial_returned">
                          Parsial ({unreturned} sisa)
                        </span>
                      ) : (
                        <span className="atrium-subtle-badge badge-status-borrowed">
                          Belum Kembali
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trail / Timeline */}
      <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} color="#64748b" />
          Riwayat Jejak Audit Transaksi
        </h3>

        {timeline.length === 0 ? (
          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Transaksi tercatat pada {new Date(borrowing.created_at).toLocaleString('id-ID')}.
          </div>
        ) : (
          <div className="atrium-timeline">
            {timeline.map((event, idx) => {
              const isReturn = event.action.includes('returned');
              const isCancel = event.action.includes('cancelled');
              const dotClass = isReturn ? 'dot-success' : isCancel ? 'dot-danger' : 'dot-warning';

              return (
                <div key={event.id || idx} className="atrium-timeline-item">
                  <div className={`atrium-timeline-dot ${dotClass}`} />
                  <div className="atrium-timeline-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                        {event.action === 'borrowing_created' ? 'Transaksi Peminjaman Dibuat'
                          : event.action === 'borrowing_returned' ? 'Pengembalian Barang Diproses'
                          : event.action === 'borrowing_cancelled' ? 'Transaksi Dibatalkan'
                          : event.action}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {new Date(event.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
                      Oleh: <strong>{event.profiles?.full_name || 'Petugas'}</strong>
                      {event.details?.reason && ` — Alasan: ${event.details.reason}`}
                      {event.details?.notes && ` — Catatan: ${event.details.notes}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="atrium-receipt-modal-backdrop">
          <div className="atrium-receipt-card" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#e11d48', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Ban size={18} /> Batalkan Peminjaman
              </h3>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCancelBorrowing} style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
                Pembatalan akan mengembalikan seluruh stok barang ke status <strong>Tersedia (available)</strong> dan menandai tiket peminjaman sebagai <strong>Dibatalkan</strong>.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                  Alasan Pembatalan Transaksi <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <textarea
                  className="atrium-input"
                  rows={3}
                  style={{ width: '100%' }}
                  placeholder="cth: Salah input peminjam, kegiatan dibatalkan oleh panitia"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="btn-atrium-primary"
                  style={{ backgroundColor: '#e11d48', borderColor: '#e11d48' }}
                  disabled={cancelling}
                >
                  {cancelling ? <span className="spinner spinner-sm" /> : <Ban size={15} />}
                  Konfirmasi Pembatalan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable QR Code Borrowing Receipt Modal */}
      {showReceiptModal && (
        <div className="atrium-receipt-modal-backdrop">
          <div className="atrium-receipt-card atrium-printable-receipt" style={{ maxWidth: '640px' }}>
            {/* Header controls (hidden during print) */}
            <div className="no-print" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                Pratinjau Bukti Peminjaman (QR Receipt)
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-atrium-primary"
                  onClick={handlePrintReceipt}
                  style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                >
                  <Printer size={14} /> Cetak Bukti
                </button>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setShowReceiptModal(false)}
                  style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                >
                  <X size={14} /> Tutup
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div style={{ padding: '2rem' }}>
              {/* Receipt Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px dashed #94a3b8', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
                  PT VINIX SEVEN AURUM
                </h2>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Warehouse Inventory & Borrowing System
                </div>
                <div style={{ margin: '0.75rem 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#2563eb' }}>
                  BUKTI PEMINJAMAN BARANG GUDANG
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                  {borrowing.transaction_code}
                </div>
              </div>

              {/* Receipt QR Code and Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1.25rem', alignItems: 'center', marginBottom: '1.5rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <QRCodeSVG
                    value={qrReceiptPayload}
                    size={100}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div style={{ fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', color: '#334155' }}>
                  <div><strong>Peminjam:</strong> {borrowing.borrowers?.full_name}</div>
                  <div><strong>Divisi / NIK:</strong> {borrowing.borrowers?.department || '—'} {borrowing.borrowers?.employee_id ? `(${borrowing.borrowers.employee_id})` : ''}</div>
                  <div><strong>Waktu Pinjam:</strong> {new Date(borrowing.borrowed_at).toLocaleString('id-ID')}</div>
                  <div><strong>Batas Kembali:</strong> {new Date(borrowing.expected_return_at).toLocaleString('id-ID')}</div>
                  <div><strong>Petugas:</strong> {borrowing.recorded_profile?.full_name || 'Petugas'}</div>
                </div>
              </div>

              {/* Items List Table */}
              <div style={{ marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '0.5rem 0.25rem', width: '28px' }}>#</th>
                      <th style={{ padding: '0.5rem' }}>Kode & Nama Barang</th>
                      <th style={{ padding: '0.5rem' }}>No. Seri Aset</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>Qty</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', width: '80px' }}>Kondisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(borrowing.borrowing_items || []).map((line, i) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem 0.25rem', color: '#94a3b8' }}>{i + 1}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <strong>{line.items?.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{line.items?.item_code}</div>
                        </td>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {line.items?.asset_serial || '—'}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700 }}>
                          {line.quantity}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', textTransform: 'capitalize' }}>
                          {line.borrow_condition}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                      <td colSpan={3} style={{ padding: '0.625rem 0.5rem', fontWeight: 700, textAlign: 'right' }}>
                        Total Unit Fisik:
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontWeight: 800 }}>
                        {totalBorrowedUnits} unit
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2.5rem', textAlign: 'center', fontSize: '0.8125rem' }}>
                <div>
                  <div style={{ color: '#64748b', marginBottom: '3.5rem' }}>Karyawan Peminjam,</div>
                  <div style={{ fontWeight: 700, borderTop: '1px solid #94a3b8', paddingTop: '0.375rem', width: '160px', margin: '0 auto' }}>
                    {borrowing.borrowers?.full_name}
                  </div>
                </div>

                <div>
                  <div style={{ color: '#64748b', marginBottom: '3.5rem' }}>Petugas Gudang,</div>
                  <div style={{ fontWeight: 700, borderTop: '1px solid #94a3b8', paddingTop: '0.375rem', width: '160px', margin: '0 auto' }}>
                    {borrowing.recorded_profile?.full_name || 'Petugas'}
                  </div>
                </div>
              </div>

              {/* Footer Terms */}
              <div style={{ marginTop: '2rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem', textAlign: 'center', fontSize: '0.6875rem', color: '#94a3b8' }}>
                Barang wajib dikembalikan sebelum tanggal jatuh tempo dalam kondisi fisik baik. Kehilangan atau kerusakan aset perusahaan menjadi tanggung jawab peminjam.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
