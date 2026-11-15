import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, PackagePlus, ArrowLeftRight, Users, Clock,
  CheckCircle2, AlertTriangle, ArrowRight, RefreshCw,
  Sparkles, ShieldCheck, ChevronRight, Check,
  AlertCircle, Tag, MapPin, UserCog, WifiOff, Database, FileText
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [queryError, setQueryError] = useState(null);

  // Warehouse KPI metrics (default to real zeroes)
  const [stats, setStats] = useState({
    totalItems: 0,
    totalSku: 0,
    totalPhysicalUnits: 0,
    availableQty: 0,
    borrowedQty: 0,
    damagedQty: 0,
    underRepairQty: 0,
    maintenanceQty: 0,
    activeBorrowings: 0,
    overdueCount: 0,
    returnsDueToday: 0
  });

  // Actionable priority tasks & real borrowings from database
  const [priorities, setPriorities] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentMovements, setRecentMovements] = useState([]);
  const [urgentItem, setUrgentItem] = useState(null);
  const [scheduleItems, setScheduleItems] = useState([]);

  // Fetch warehouse data with strict integrity: NO silent mock fallback in production
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setQueryError(null);

    // Explicit dev-only demo mode: only allowed in Vite DEV when VITE_ENABLE_DEV_DEMO is explicitly 'true'
    // In production (import.meta.env.PROD), this is strictly FALSE.
    const isExplicitDevDemo = Boolean(
      import.meta.env.DEV &&
      import.meta.env.VITE_ENABLE_DEV_DEMO === 'true'
    );

    if (!isConfigured) {
      if (isExplicitDevDemo) {
        // Development-only demo mode
        setTimeout(() => {
          setStats({
            totalItems: 96,
            availableQty: 82,
            borrowedQty: 11,
            maintenanceQty: 3,
            activeBorrowings: 6,
            overdueCount: 2,
            returnsDueToday: 3
          });
          setUrgentItem({
            title: 'Pengembalian Terlambat: Tiket #BRW-DEMO-0004',
            borrower: 'Rian Prasetya · Divisi Multimedia',
            dueTime: 'Jatuh tempo: Kemarin',
            code: 'BRW-DEMO-0004'
          });
          setLastRefreshed(new Date());
          setLoading(false);
        }, 200);
        return;
      }

      // Offline / Unconfigured state: Show clear connection notice, never silent mock data
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];

      // 1. Fetch Items inventory summary using actual schema columns
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id, item_code, name, total_qty, available_qty, damaged_qty, under_repair_qty, status, is_active');

      if (itemsError) {
        throw new Error(`Gagal memuat inventaris: ${itemsError.message}`);
      }

      // 2. Fetch Borrowings summary using actual Phase B schema:
      // transaction_code, expected_return_at, borrowed_at, status, borrower_id
      const { data: borrowings, error: borrowingsError } = await supabase
        .from('borrowings')
        .select(`
          id,
          transaction_code,
          status,
          borrowed_at,
          expected_return_at,
          returned_at,
          borrowers (
            id,
            full_name,
            employee_id,
            department
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (borrowingsError) {
        throw new Error(`Gagal memuat transaksi peminjaman: ${borrowingsError.message}`);
      }

      // 3. Fetch recent stock movements for audit and ledger visibility
      const { data: movements } = await supabase
        .from('stock_movements')
        .select(`
          id,
          movement_type,
          quantity_delta,
          qty_after,
          reason,
          created_at,
          items (id, item_code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(3);

      // Compute actual inventory metrics
      let totalItems = 0;
      let availableQty = 0;
      let maintenanceQty = 0;
      let damagedQty = 0;
      let underRepairQty = 0;

      if (items && items.length > 0) {
        items.forEach(item => {
          totalItems += item.total_qty || 0;
          availableQty += item.available_qty || 0;
          damagedQty += item.damaged_qty || 0;
          underRepairQty += item.under_repair_qty || 0;
          maintenanceQty += (item.damaged_qty || 0) + (item.under_repair_qty || 0);
        });
      }

      // Compute actual borrowing metrics based on real database status and expected_return_at
      let activeBorrowings = 0;
      let overdueCount = 0;
      let returnsDueToday = 0;
      let firstOverdueBorrowing = null;
      const todayScheduled = [];
      const derivedPriorities = [];

      if (borrowings && borrowings.length > 0) {
        borrowings.forEach(b => {
          const isActiveBorrowing = ['borrowed', 'partial_returned', 'overdue'].includes(b.status);
          const isOverdue = b.status === 'overdue' || (
            ['borrowed', 'partial_returned'].includes(b.status) &&
            b.expected_return_at &&
            new Date(b.expected_return_at) < now
          );

          if (isActiveBorrowing) {
            activeBorrowings++;

            if (isOverdue) {
              overdueCount++;
              if (!firstOverdueBorrowing) {
                firstOverdueBorrowing = b;
              }
              derivedPriorities.push({
                id: b.id,
                title: `Tindak lanjut pengembalian #${b.transaction_code}`,
                context: `${b.borrowers?.full_name || 'Peminjam'} · ${b.borrowers?.department || 'Karyawan'}`,
                status: 'overdue',
                statusLabel: 'Terlambat',
                time: new Date(b.expected_return_at).toLocaleDateString('id-ID')
              });
            } else {
              derivedPriorities.push({
                id: b.id,
                title: `Peminjaman aktif #${b.transaction_code}`,
                context: `${b.borrowers?.full_name || 'Peminjam'} · ${b.borrowers?.department || 'Karyawan'}`,
                status: 'in_progress',
                statusLabel: b.status === 'partial_returned' ? 'Parsial' : 'Dipinjam',
                time: new Date(b.borrowed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              });
            }

            if (b.expected_return_at && b.expected_return_at.startsWith(todayDateStr)) {
              returnsDueToday++;
              todayScheduled.push(b);
            }
          } else if (b.status === 'returned') {
            if (derivedPriorities.length < 4) {
              derivedPriorities.push({
                id: b.id,
                title: `Pengembalian selesai #${b.transaction_code}`,
                context: `${b.borrowers?.full_name || 'Peminjam'} · ${b.borrowers?.department || 'Karyawan'}`,
                status: 'completed',
                statusLabel: 'Selesai',
                time: b.returned_at ? new Date(b.returned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Hari ini'
              });
            }
          }
        });
      }

      const borrowedQty = Math.max(0, totalItems - (availableQty + maintenanceQty));

      setStats({
        totalItems,
        totalSku: items?.length || 0,
        totalPhysicalUnits: totalItems,
        availableQty,
        borrowedQty,
        maintenanceQty,
        damagedQty,
        underRepairQty,
        activeBorrowings,
        overdueCount,
        returnsDueToday
      });

      if (firstOverdueBorrowing) {
        setUrgentItem({
          title: `Pengembalian Terlambat: Tiket #${firstOverdueBorrowing.transaction_code}`,
          borrower: `${firstOverdueBorrowing.borrowers?.full_name || 'Peminjam'} · ${firstOverdueBorrowing.borrowers?.department || 'Karyawan'}`,
          dueTime: `Jatuh tempo: ${new Date(firstOverdueBorrowing.expected_return_at).toLocaleString('id-ID')}`,
          code: firstOverdueBorrowing.transaction_code
        });
      } else {
        setUrgentItem(null);
      }

      setPriorities(derivedPriorities.slice(0, 4));
      setScheduleItems(todayScheduled);
      setRecentTransactions(borrowings || []);
      setRecentMovements(movements || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setQueryError(err.message || 'Terjadi kesalahan saat memuat data database.');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // STATE C: Unconfigured / Offline State
  if (!isConfigured) {
    return (
      <div className="atrium-bento-grid">
        <section className="atrium-card col-span-12" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: '#F1F0F4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: 'var(--atrium-text-secondary)'
          }}>
            <WifiOff size={28} />
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--atrium-text-primary)', margin: '0 0 0.5rem 0' }}>
            Koneksi Database Belum Dikonfigurasi
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--atrium-text-secondary)', maxWidth: '520px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
            Aplikasi berjalan tanpa koneksi Supabase aktif. Dashboard operasional tidak menampilkan data rekaan dalam mode ini. Silakan periksa kredensial environment sistem Anda.
          </p>
          <button
            type="button"
            className="atrium-btn-dark"
            onClick={fetchDashboardData}
          >
            Muat Ulang Halaman
          </button>
        </section>
      </div>
    );
  }

  // STATE D: Database Query Failure
  if (queryError) {
    return (
      <div className="atrium-bento-grid">
        <section className="atrium-card col-span-12" style={{ textAlign: 'center', padding: '3rem 2rem', border: '1px solid #FECACA' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: '#FEE2E2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: '#DC2626'
          }}>
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991B1B', margin: '0 0 0.5rem 0' }}>
            Gagal Memuat Data Operasional Gudang
          </h2>
          <p style={{ fontSize: '0.8125rem', color: '#B91C1C', maxWidth: '560px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            {queryError}
          </p>
          <button
            type="button"
            className="atrium-btn-dark"
            onClick={fetchDashboardData}
          >
            <RefreshCw size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
            Coba Muat Ulang Data
          </button>
        </section>
      </div>
    );
  }

  const hasNoItems = stats.totalItems === 0;

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
                {lastRefreshed ? `Sinkron pukul ${lastRefreshed.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB` : 'Sinkronisasi aktif'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="atrium-mini-pill"
            onClick={fetchDashboardData}
            disabled={loading}
            title="Segarkan data dari database"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>

        <div className="atrium-hero-quote">
          {hasNoItems ? (
            <>
              Inventaris gudang belum memiliki data aset terdaftar. Silakan tambahkan data master inventaris pada modul manajemen barang (Phase E).
            </>
          ) : stats.overdueCount > 0 ? (
            <>
              Terdapat <strong>{stats.overdueCount} transaksi pengembalian terlambat</strong> yang memerlukan tindak lanjut segera, dan <strong>{stats.availableQty} unit barang</strong> siap dialokasikan.
            </>
          ) : (
            <>
              Seluruh transaksi berjalan tertib. <strong>{stats.availableQty} unit barang</strong> dalam kondisi siap pakai dan <strong>{stats.borrowedQty} unit</strong> sedang dipinjamkan.
            </>
          )}
        </div>

        <div className="atrium-hero-footer">
          <div className="atrium-pill-tags">
            <button
              type="button"
              className="atrium-mini-pill"
              onClick={() => navigate('/inventaris')}
            >
              <Boxes size={14} />
              <span>SKU: {stats.totalSku} ({stats.totalPhysicalUnits} Unit Fisik)</span>
            </button>

            <button
              type="button"
              className="atrium-mini-pill"
              onClick={() => navigate('/inventaris')}
            >
              <CheckCircle2 size={14} color="#16A34A" />
              <span>Stok Siap: {stats.availableQty} Unit</span>
            </button>

            <button
              type="button"
              className="atrium-mini-pill"
              onClick={() => navigate('/peminjaman')}
            >
              <ArrowLeftRight size={14} />
              <span>Pinjaman Aktif: {stats.activeBorrowings}</span>
            </button>

            {stats.maintenanceQty > 0 && (
              <button
                type="button"
                className="atrium-mini-pill"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}
                onClick={() => navigate('/inventaris')}
              >
                <AlertTriangle size={14} />
                <span>Rusak/Perbaikan: {stats.maintenanceQty}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className="atrium-link-action"
            onClick={() => navigate('/inventaris')}
          >
            <span>Buka Inventaris Gudang</span>
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
                {stats.overdueCount}
              </span>
            </h3>
            <button
              type="button"
              className="atrium-link-action"
              style={{ fontSize: '0.75rem' }}
              onClick={() => navigate('/peminjaman')}
            >
              Lihat semua
            </button>
          </div>

          {urgentItem ? (
            <div className="atrium-attention-box">
              <div className="atrium-attention-box-top">
                <div className="atrium-attention-box-icon">
                  <AlertCircle size={16} color="#DC2626" />
                </div>
                <span className="atrium-attention-box-title">
                  {urgentItem.title}
                </span>
              </div>
              <p className="atrium-attention-box-desc">
                {urgentItem.borrower} · {urgentItem.dueTime}
              </p>

              <div className="atrium-btn-group">
                <button
                  type="button"
                  className="atrium-btn-dark"
                  onClick={() => navigate('/pengembalian')}
                >
                  Proses
                </button>
                <button
                  type="button"
                  className="atrium-btn-light"
                  onClick={() => navigate('/peminjaman')}
                >
                  Tinjau
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#FAF9FB',
              borderRadius: '14px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              color: 'var(--atrium-text-muted)',
              fontSize: '0.8125rem',
              marginBottom: '1rem'
            }}>
              <CheckCircle2 size={24} color="#16A34A" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--atrium-text-primary)' }}>
                Tidak Ada Transaksi Mendesak
              </p>
              <span style={{ fontSize: '0.75rem' }}>
                Seluruh pengembalian dalam status tepat waktu atau belum ada transaksi aktif.
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
          <span>{stats.overdueCount > 0 ? `${stats.overdueCount} transaksi terlambat` : 'Semua transaksi tertib'}</span>
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
          <span>{hasNoItems ? 'Belum Ada Aset' : 'Kondisi Normal'}</span>
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
                Jadwal Pengembalian Hari Ini
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: '0.2rem 0 0 0' }}>
                {stats.returnsDueToday > 0
                  ? `${stats.returnsDueToday} transaksi jatuh tempo hari ini`
                  : 'Tidak ada jadwal jatuh tempo pengembalian hari ini'}
              </p>
            </div>
            <button
              type="button"
              className="atrium-link-action"
              style={{ fontSize: '0.75rem' }}
              onClick={() => navigate('/peminjaman')}
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
          {scheduleItems.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{
                backgroundColor: '#17191C',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '0.15rem 0.5rem',
                fontSize: '0.6875rem',
                fontWeight: 700
              }}>
                Hari Ini
              </span>
              <span style={{ fontWeight: 600, color: 'var(--atrium-text-primary)' }}>
                Jatuh tempo: #{scheduleItems[0].transaction_code} oleh {scheduleItems[0].borrowers?.full_name || 'Peminjam'}
              </span>
            </div>
          ) : (
            <span style={{ color: 'var(--atrium-text-muted)', fontSize: '0.75rem' }}>
              Tidak ada jadwal pengembalian tercatat untuk hari ini.
            </span>
          )}
          <button
            type="button"
            className="atrium-btn-dark"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            onClick={() => navigate('/pengembalian')}
          >
            Serah Terima
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
              Tugas & verifikasi pengembalian aset dari database
            </p>
          </div>
          <button
            type="button"
            className="atrium-link-action"
            style={{ fontSize: '0.75rem' }}
            onClick={() => navigate('/peminjaman')}
          >
            Lihat semua
          </button>
        </div>

        <div>
          {priorities.length > 0 ? (
            priorities.map((item) => (
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
                    onClick={() => navigate('/peminjaman')}
                  >
                    Buka
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--atrium-text-muted)', fontSize: '0.8125rem' }}>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--atrium-text-primary)' }}>
                Belum Ada Prioritas Operasional
              </p>
              <span>Seluruh transaksi peminjaman terselesaikan atau belum ada transaksi tercatat.</span>
            </div>
          )}
        </div>
      </section>

      {/* Workforce / Role Management & Quick Actions (Span 5) */}
      <section className="atrium-card col-span-5" aria-label="Aktivitas dan Pengawasan Gudang">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--atrium-text-primary)' }}>
              {isAdmin ? 'Pengawasan & Staf Gudang' : 'Tindakan Cepat Operasional'}
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
            onClick={() => navigate('/peminjaman')}
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
            onClick={() => navigate('/pengembalian')}
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

          {isAdmin ? (
            <>
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
                onClick={() => navigate('/laporan')}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#F5F3FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.5rem',
                  color: '#7C3AED'
                }}>
                  <FileText size={18} />
                </div>
                <strong style={{ fontSize: '0.8125rem' }}>Pusat Laporan</strong>
                <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Ekspor & audit gudang</span>
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
                onClick={() => navigate('/manajemen-petugas')}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#FFF7ED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.5rem',
                  color: '#EA580C'
                }}>
                  <UserCog size={18} />
                </div>
                <strong style={{ fontSize: '0.8125rem' }}>Kelola Petugas</strong>
                <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Akses & otorisasi</span>
              </button>
            </>
          ) : (
            <>
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
                onClick={() => navigate('/inventaris/barang-masuk')}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#F5F3FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.5rem',
                  color: '#7C3AED'
                }}>
                  <Boxes size={18} />
                </div>
                <strong style={{ fontSize: '0.8125rem' }}>Barang Masuk</strong>
                <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Check-in & stok baru</span>
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
                onClick={() => navigate('/inventaris/penyesuaian-stok')}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#FFF7ED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.5rem',
                  color: '#EA580C'
                }}>
                  <Clock size={18} />
                </div>
                <strong style={{ fontSize: '0.8125rem' }}>Penyesuaian Stok</strong>
                <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Koreksi & opname fisik</span>
              </button>
            </>
          )}
        </div>

        {/* Recent Activity List from Real Database */}
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
            Aktivitas Terakhir Database
          </span>

          {recentTransactions.length > 0 ? (
            recentTransactions.slice(0, 3).map((tx) => (
              <div key={tx.id} className="atrium-activity-item">
                <div className="atrium-activity-avatar">
                  {(tx.borrowers?.full_name || 'P').charAt(0).toUpperCase()}
                </div>
                <div className="atrium-activity-meta">
                  <p>{tx.borrowers?.full_name || 'Peminjam'} · <span style={{ fontWeight: 400, color: 'var(--atrium-text-secondary)' }}>{tx.borrowers?.department || 'Karyawan'}</span></p>
                  <span>#{tx.transaction_code} · {tx.borrowed_at ? new Date(tx.borrowed_at).toLocaleDateString('id-ID') : 'Hari ini'}</span>
                </div>
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: tx.status === 'borrowed' ? '#EFF6FF' : (tx.status === 'overdue' ? '#FEE2E2' : '#DCFCE7'),
                  color: tx.status === 'borrowed' ? '#1D4ED8' : (tx.status === 'overdue' ? '#991B1B' : '#15803D')
                }}>
                  {tx.status === 'borrowed' ? 'Dipinjam' : (tx.status === 'overdue' ? 'Terlambat' : (tx.status === 'partial_returned' ? 'Parsial' : 'Selesai'))}
                </span>
              </div>
            ))
          ) : recentMovements.length > 0 ? (
            recentMovements.slice(0, 3).map((mv) => (
              <div key={mv.id} className="atrium-activity-item">
                <div className="atrium-activity-avatar" style={{ backgroundColor: '#F1F5F9', color: '#334155' }}>
                  <Boxes size={14} />
                </div>
                <div className="atrium-activity-meta">
                  <p>{mv.items?.name || 'Barang'} · <span style={{ fontWeight: 400, color: 'var(--atrium-text-secondary)' }}>{mv.items?.item_code || 'SKU'}</span></p>
                  <span>Mutasi: {mv.movement_type} · {mv.created_at ? new Date(mv.created_at).toLocaleDateString('id-ID') : 'Hari ini'}</span>
                </div>
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: mv.quantity_delta > 0 ? '#DCFCE7' : '#FEE2E2',
                  color: mv.quantity_delta > 0 ? '#15803D' : '#991B1B'
                }}>
                  {mv.quantity_delta > 0 ? `+${mv.quantity_delta}` : mv.quantity_delta}
                </span>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--atrium-text-muted)', fontSize: '0.75rem' }}>
              Belum ada riwayat aktivitas gudang tercatat di database.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
