import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, PackagePlus, ArrowLeftRight, Users, Clock,
  CheckCircle2, AlertTriangle, ArrowRight, RefreshCw,
  Sparkles, ShieldCheck, ChevronRight, Check,
  AlertCircle, Tag, MapPin, UserCog
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Warehouse KPI metrics
  const [stats, setStats] = useState({
    totalItems: 0,
    availableQty: 0,
    borrowedQty: 0,
    damagedQty: 0,
    activeBorrowings: 0,
    overdueCount: 0,
    returnsDueToday: 0
  });

  // Actionable priority tasks & recent borrowings
  const [priorities, setPriorities] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [urgentItem, setUrgentItem] = useState(null);

  // Fetch warehouse data with graceful fallback
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);

    if (!isConfigured) {
      // Mock Data for offline / demo mode
      setTimeout(() => {
        setStats({
          totalItems: 96,
          availableQty: 82,
          borrowedQty: 11,
          damagedQty: 3,
          activeBorrowings: 6,
          overdueCount: 2,
          returnsDueToday: 3
        });

        setUrgentItem({
          title: 'Pengembalian Terlambat: Proyektor Epson EB-X400',
          borrower: 'Rian Prasetya · Divisi Multimedia',
          dueTime: 'Jatuh tempo: Kemarin, 16:00 WIB',
          code: 'BRW-20261112-0004'
        });

        setPriorities([
          {
            id: 'p1',
            title: 'Verifikasi pengembalian 2 unit Walkie Talkie Motorola',
            context: 'Budi Santoso · Divisi Keamanan',
            status: 'completed',
            statusLabel: 'Selesai',
            time: '08:45'
          },
          {
            id: 'p2',
            title: 'Konfirmasi peminjaman Toolkit Teknis Gudang',
            context: 'Ahmad Fauzi · Divisi Pemeliharaan',
            status: 'in_progress',
            statusLabel: 'Dipinjam',
            time: '10:15'
          },
          {
            id: 'p3',
            title: 'Tindak lanjut pengembalian Proyektor Lab Terlambat',
            context: 'Rian Prasetya · Divisi Multimedia',
            status: 'overdue',
            statusLabel: 'Terlambat',
            time: 'Kemarin'
          },
          {
            id: 'p4',
            title: 'Inspeksi berkala unit printer barcode yang diperbaiki',
            context: 'Tim Maintenance · Lokasi B-02',
            status: 'pending',
            statusLabel: 'Menunggu',
            time: '14:00'
          }
        ]);

        setRecentTransactions([
          {
            id: 'tx-1',
            code: 'BRW-20261113-0001',
            borrowerName: 'Siti Rahma',
            itemSummary: '1x Laptop Dell Latitude 5420',
            status: 'borrowed',
            time: '10 menit yang lalu'
          },
          {
            id: 'tx-2',
            code: 'BRW-20261113-0002',
            borrowerName: 'Budi Santoso',
            itemSummary: '2x Radio HT Motorola CP1660',
            status: 'returned',
            time: '45 menit yang lalu'
          },
          {
            id: 'tx-3',
            code: 'BRW-20261112-0004',
            borrowerName: 'Rian Prasetya',
            itemSummary: '1x Proyektor Epson EB-X400',
            status: 'overdue',
            time: '1 hari yang lalu'
          }
        ]);

        setLastRefreshed(new Date());
        setLoading(false);
      }, 300);
      return;
    }

    try {
      // 1. Fetch Items inventory summary
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('total_qty, available_qty, damaged_qty, under_repair_qty');

      let totalItems = 0;
      let availableQty = 0;
      let damagedQty = 0;

      if (!itemsError && items && items.length > 0) {
        items.forEach(item => {
          totalItems += item.total_qty || 0;
          availableQty += item.available_qty || 0;
          damagedQty += (item.damaged_qty || 0) + (item.under_repair_qty || 0);
        });
      }

      // 2. Fetch Borrowings summary
      const { data: borrowings, error: borrowingsError } = await supabase
        .from('borrowings')
        .select(`
          id, borrowing_code, status, borrow_date, due_date, returned_at,
          borrowers (full_name, department)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      let activeBorrowings = 0;
      let overdueCount = 0;
      let returnsDueToday = 0;
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];

      if (!borrowingsError && borrowings && borrowings.length > 0) {
        borrowings.forEach(b => {
          if (['borrowed', 'partial_returned'].includes(b.status)) {
            activeBorrowings++;
            if (b.due_date && new Date(b.due_date) < now) {
              overdueCount++;
            }
            if (b.due_date && b.due_date.startsWith(todayDateStr)) {
              returnsDueToday++;
            }
          }
        });

        // Set urgent item from the first overdue borrowing
        const firstOverdue = borrowings.find(b => ['borrowed', 'partial_returned'].includes(b.status) && b.due_date && new Date(b.due_date) < now);
        if (firstOverdue) {
          setUrgentItem({
            title: `Pengembalian Terlambat: Tiket #${firstOverdue.borrowing_code}`,
            borrower: `${firstOverdue.borrowers?.full_name || 'Peminjam'} · ${firstOverdue.borrowers?.department || 'Karyawan'}`,
            dueTime: `Jatuh tempo: ${new Date(firstOverdue.due_date).toLocaleDateString('id-ID')}`,
            code: firstOverdue.borrowing_code
          });
        }
      }

      const borrowedQty = Math.max(0, totalItems - availableQty - damagedQty);

      // If database is completely fresh and has no items yet, provide pleasant initial state
      if (totalItems === 0 && (!borrowings || borrowings.length === 0)) {
        setStats({
          totalItems: 0,
          availableQty: 0,
          borrowedQty: 0,
          damagedQty: 0,
          activeBorrowings: 0,
          overdueCount: 0,
          returnsDueToday: 0
        });
      } else {
        setStats({
          totalItems,
          availableQty,
          borrowedQty,
          damagedQty,
          activeBorrowings,
          overdueCount,
          returnsDueToday
        });
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const displayName = profile?.full_name || 'Petugas';

  return (
    <div className="atrium-bento-grid">
      {/* --------------------------------------------------------------------
          ROW 1: Hero Operational Brief & Attention Card
          -------------------------------------------------------------------- */}

      {/* Hero Brief Card (Span 8) */}
      <section className="atrium-card atrium-hero-card col-span-8" aria-label="Ringkasan Operasional Hari Ini">
        <div className="atrium-hero-top">
          <div className="atrium-agent-badge">
            <div className="atrium-agent-avatar">
              <Sparkles size={16} />
            </div>
            <div className="atrium-agent-meta">
              <span className="atrium-agent-name">Ringkasan Operasional Gudang</span>
              <span className="atrium-agent-time">
                {lastRefreshed ? `Diperbarui pukul ${lastRefreshed.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB` : 'Sinkronisasi aktif'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="atrium-mini-pill"
            onClick={fetchDashboardData}
            disabled={loading}
            title="Muat ulang status data"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>

        <div className="atrium-hero-quote">
          {stats.overdueCount > 0 ? (
            <>
              Terdapat <strong>{stats.overdueCount} transaksi pengembalian terlambat</strong> yang memerlukan tindak lanjut segera, dan <strong>{stats.availableQty} unit barang</strong> siap untuk dipinjamkan.
            </>
          ) : (
            <>
              Seluruh operasional gudang berjalan tertib. <strong>{stats.availableQty} unit barang</strong> dalam kondisi prima dan siap dialokasikan.
            </>
          )}
        </div>

        <div className="atrium-hero-footer">
          <div className="atrium-pill-tags">
            <button
              type="button"
              className="atrium-mini-pill"
              onClick={() => navigate('/barang-dititipkan')}
            >
              <Boxes size={14} />
              <span>Stok Siap: {stats.availableQty} Unit</span>
            </button>

            <button
              type="button"
              className="atrium-mini-pill"
              onClick={() => navigate('/riwayat')}
            >
              <ArrowLeftRight size={14} />
              <span>Pinjaman Aktif: {stats.activeBorrowings}</span>
            </button>

            {stats.damagedQty > 0 && (
              <button
                type="button"
                className="atrium-mini-pill"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}
                onClick={() => navigate('/barang-dititipkan')}
              >
                <AlertTriangle size={14} />
                <span>Perlu Servis: {stats.damagedQty}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className="atrium-link-action"
            onClick={() => navigate('/barang-dititipkan')}
          >
            <span>Buka Inventaris Lengkap</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Needs Attention Card (Span 4) */}
      <section className="atrium-card atrium-attention-card col-span-4" aria-label="Perlu Perhatian Segera">
        <div>
          <div className="atrium-attention-header">
            <h3 className="atrium-attention-title">
              <span>Perlu Perhatian Segera</span>
              <span className="atrium-count-bubble">
                {stats.overdueCount > 0 ? stats.overdueCount : '1'}
              </span>
            </h3>
            <button
              type="button"
              className="atrium-link-action"
              style={{ fontSize: '0.75rem' }}
              onClick={() => navigate('/riwayat')}
            >
              Lihat semua
            </button>
          </div>

          <div className="atrium-attention-box">
            <div className="atrium-attention-box-top">
              <div className="atrium-attention-box-icon">
                <AlertCircle size={16} color="#DC2626" />
              </div>
              <span className="atrium-attention-box-title">
                {urgentItem?.title || 'Pengembalian Terlambat: Proyektor EB-X400'}
              </span>
            </div>
            <p className="atrium-attention-box-desc">
              {urgentItem?.borrower || 'Rian Prasetya · Divisi Multimedia'} · {urgentItem?.dueTime || 'Jatuh tempo: Kemarin'}
            </p>

            <div className="atrium-btn-group">
              <button
                type="button"
                className="atrium-btn-dark"
                onClick={() => navigate('/penitipan-baru')}
              >
                Proses
              </button>
              <button
                type="button"
                className="atrium-btn-light"
                onClick={() => navigate('/riwayat')}
              >
                Tinjau
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
          <span>+2 peminjaman lain mendekati jatuh tempo</span>
          <ChevronRight size={14} />
        </div>
      </section>

      {/* --------------------------------------------------------------------
          ROW 2: Metric Widgets & Timeline / Schedule
          -------------------------------------------------------------------- */}

      {/* Metric 1: Stok Tersedia / Ready Stock (Span 3 - Green Gradient) */}
      <section className="atrium-card atrium-kpi-green col-span-3" aria-label="Kesehatan Stok Tersedia">
        <div className="atrium-kpi-top">
          <span className="atrium-kpi-pill">Kesehatan Stok</span>
          <ArrowRight size={16} style={{ transform: 'rotate(-45deg)', opacity: 0.8 }} />
        </div>

        <div>
          <div className="atrium-kpi-number">
            <span>{stats.availableQty}</span>
            <span className="atrium-kpi-unit">unit</span>
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.9 }}>
            Stok Siap & Tersedia
          </span>
        </div>

        <div className="atrium-kpi-bottom">
          <span>Kondisi Normal</span>
          <div className="atrium-soundwave" aria-hidden="true">
            <span style={{ height: '8px' }} />
            <span style={{ height: '14px' }} />
            <span style={{ height: '10px' }} />
            <span style={{ height: '18px' }} />
            <span style={{ height: '12px' }} />
            <span style={{ height: '16px' }} />
          </div>
        </div>
      </section>

      {/* Metric 2: Sedang Dipinjam / Active Loans (Span 3 - Orange Gradient) */}
      <section className="atrium-card atrium-kpi-orange col-span-3" aria-label="Unit Sedang Dipinjam">
        <div className="atrium-kpi-top">
          <span className="atrium-kpi-pill">Sedang Dipinjam</span>
          <ArrowRight size={16} style={{ transform: 'rotate(-45deg)', opacity: 0.8 }} />
        </div>

        <div>
          <div className="atrium-kpi-number">
            <span>{stats.borrowedQty}</span>
            <span className="atrium-kpi-unit">unit</span>
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.9 }}>
            {stats.activeBorrowings} Transaksi Berjalan
          </span>
        </div>

        <div className="atrium-kpi-bottom">
          <span>Tercatat Resmi</span>
          <div className="atrium-soundwave" aria-hidden="true">
            <span style={{ height: '12px' }} />
            <span style={{ height: '6px' }} />
            <span style={{ height: '16px' }} />
            <span style={{ height: '14px' }} />
            <span style={{ height: '10px' }} />
            <span style={{ height: '8px' }} />
          </div>
        </div>
      </section>

      {/* Schedule / Timeline Widget (Span 6) */}
      <section className="atrium-card atrium-schedule-card col-span-6" aria-label="Jadwal Pengembalian Hari Ini">
        <div>
          <div className="atrium-schedule-header">
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--atrium-text-primary)' }}>
                Jadwal & Agenda Pengembalian
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: '0.2rem 0 0 0' }}>
                Hari ini: 3 transaksi pengembalian · 1 telah selesai diverifikasi
              </p>
            </div>
            <button
              type="button"
              className="atrium-link-action"
              style={{ fontSize: '0.75rem' }}
              onClick={() => navigate('/riwayat')}
            >
              Buka agenda
            </button>
          </div>

          <div className="atrium-timeline-bar">
            <div className="atrium-time-slot">09:00</div>
            <div className="atrium-time-slot">11:00</div>
            <div className="atrium-time-slot" style={{ fontWeight: 700, color: 'var(--atrium-accent-dark)' }}>
              13:00 (Aktif)
            </div>
            <div className="atrium-time-slot">15:00</div>
            <div className="atrium-time-slot">17:00</div>
          </div>
        </div>

        <div className="atrium-schedule-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              backgroundColor: '#17191C',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '0.15rem 0.5rem',
              fontSize: '0.6875rem',
              fontWeight: 700
            }}>
              13:30
            </span>
            <span style={{ fontWeight: 600, color: 'var(--atrium-text-primary)' }}>
              Berikutnya: Pengembalian 1x Laptop Lab Multimedia oleh Rian P.
            </span>
          </div>
          <button
            type="button"
            className="atrium-btn-dark"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            onClick={() => navigate('/penitipan-baru')}
          >
            Terima
          </button>
        </div>
      </section>

      {/* --------------------------------------------------------------------
          ROW 3: Today's Priorities / Checklist & Workforce / Activity Feed
          -------------------------------------------------------------------- */}

      {/* Priorities Checklist (Span 7) */}
      <section className="atrium-card col-span-7" aria-label="Prioritas Hari Ini">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--atrium-text-primary)' }}>
              Prioritas Operasional Hari Ini
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: '0.2rem 0 0 0' }}>
              Tugas & verifikasi penting yang direkomendasikan sistem
            </p>
          </div>
          <button
            type="button"
            className="atrium-link-action"
            style={{ fontSize: '0.75rem' }}
            onClick={() => navigate('/riwayat')}
          >
            Lihat semua
          </button>
        </div>

        <div>
          {priorities.map((item) => (
            <div key={item.id} className="atrium-priority-item">
              <div className="atrium-priority-left">
                <div
                  className={`atrium-checkbox-circle${item.status === 'completed' ? ' checked' : ''}`}
                  aria-hidden="true"
                >
                  {item.status === 'completed' && <Check size={14} />}
                </div>
                <div className="atrium-priority-info">
                  <h4 style={{ textDecoration: item.status === 'completed' ? 'line-through' : 'none', opacity: item.status === 'completed' ? 0.6 : 1 }}>
                    {item.title}
                  </h4>
                  <p>{item.context} · {item.time}</p>
                </div>
              </div>

              <div className="atrium-priority-actions">
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  backgroundColor: item.status === 'completed' ? '#DCFCE7' : (item.status === 'overdue' ? '#FEE2E2' : '#F1F0F4'),
                  color: item.status === 'completed' ? '#15803D' : (item.status === 'overdue' ? '#991B1B' : '#475569')
                }}>
                  {item.statusLabel}
                </span>
                <button
                  type="button"
                  className="atrium-btn-light"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                  onClick={() => navigate('/penitipan-baru')}
                >
                  Buka
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workforce / Role Management & Quick Actions (Span 5) */}
      <section className="atrium-card col-span-5" aria-label="Aktivitas dan Pengawasan Gudang">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--atrium-text-primary)' }}>
              {isAdmin ? 'Pengawasan & Petugas Gudang' : 'Tindakan Cepat Operasional'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: '0.2rem 0 0 0' }}>
              {isAdmin ? 'Akses manajemen staf dan modul otorisasi' : 'Pintasan tugas harian penjaga gudang'}
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="atrium-btn-dark"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }}
              onClick={() => navigate('/manajemen-petugas')}
            >
              Kelola Staf
            </button>
          )}
        </div>

        {/* Quick Action Buttons for Keeper or Admin */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="atrium-btn-light"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0.875rem 1rem',
              borderRadius: '16px',
              textAlign: 'left'
            }}
            onClick={() => navigate('/penitipan-baru')}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.5rem',
              color: '#2563EB'
            }}>
              <PackagePlus size={18} />
            </div>
            <strong style={{ fontSize: '0.8125rem' }}>Peminjaman Baru</strong>
            <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Catat alokasi alat</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0.875rem 1rem',
              borderRadius: '16px',
              textAlign: 'left'
            }}
            onClick={() => navigate('/pengambilan')}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#F0FDF4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.5rem',
              color: '#16A34A'
            }}>
              <ArrowLeftRight size={18} />
            </div>
            <strong style={{ fontSize: '0.8125rem' }}>Pengembalian</strong>
            <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Proses serah terima</span>
          </button>
        </div>

        {/* Recent Activity Mini List */}
        <div>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--atrium-text-muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '0.5rem'
          }}>
            Aktivitas Terakhir
          </span>

          {recentTransactions.map((tx) => (
            <div key={tx.id} className="atrium-activity-item">
              <div className="atrium-activity-avatar">
                {tx.borrowerName.charAt(0)}
              </div>
              <div className="atrium-activity-meta">
                <p>{tx.borrowerName} · <span style={{ fontWeight: 400, color: 'var(--atrium-text-secondary)' }}>{tx.itemSummary}</span></p>
                <span>{tx.code} · {tx.time}</span>
              </div>
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                backgroundColor: tx.status === 'borrowed' ? '#EFF6FF' : (tx.status === 'overdue' ? '#FEE2E2' : '#DCFCE7'),
                color: tx.status === 'borrowed' ? '#1D4ED8' : (tx.status === 'overdue' ? '#991B1B' : '#15803D')
              }}>
                {tx.status === 'borrowed' ? 'Dipinjam' : (tx.status === 'overdue' ? 'Terlambat' : 'Selesai')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
