import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  History, ArrowLeft, RefreshCw, AlertCircle, Filter,
  Boxes, Shield, Calendar, Search, ArrowRight
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

const MOVEMENT_TYPES = [
  { value: 'initial', label: 'Saldo Awal (Initial)' },
  { value: 'incoming', label: 'Barang Masuk (Incoming)' },
  { value: 'borrow_out', label: 'Peminjaman Keluar (Borrow Out)' },
  { value: 'return_good', label: 'Pengembalian Baik (Return Good)' },
  { value: 'return_damaged', label: 'Pengembalian Rusak (Return Damaged)' },
  { value: 'sent_to_repair', label: 'Kirim Servis (Sent to Repair)' },
  { value: 'repair_complete', label: 'Selesai Servis (Repair Complete)' },
  { value: 'adjustment', label: 'Penyesuaian Opname (Adjustment)' },
  { value: 'write_off', label: 'Penghapusan / Afkir (Write Off)' }
];

export default function StockMovementHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialItemId = searchParams.get('itemId') || '';

  const isConfigured = isSupabaseConfigured();

  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedItemId, setSelectedItemId] = useState(initialItemId);
  const [selectedType, setSelectedType] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month'

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      // 1. Load items for filter
      const { data: itemsData } = await supabase
        .from('items')
        .select('id, name, item_code')
        .order('name');
      setItems(itemsData || []);

      // 2. Build query on stock_movements
      let query = supabase
        .from('stock_movements')
        .select(`
          id, movement_type, quantity_delta, qty_before, qty_after,
          reason, created_at,
          items (id, name, item_code, tracking_type),
          profiles (id, full_name, role)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (selectedItemId) {
        query = query.eq('item_id', selectedItemId);
      }

      if (selectedType) {
        query = query.eq('movement_type', selectedType);
      }

      if (dateFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('created_at', today.toISOString());
      } else if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('created_at', weekAgo.toISOString());
      } else if (dateFilter === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        query = query.gte('created_at', monthAgo.toISOString());
      }

      const { data: movementsData, error: movErr } = await query;
      if (movErr) throw movErr;

      setMovements(movementsData || []);
    } catch (err) {
      console.error('Error fetching stock movements:', err);
      setError(err.message || 'Gagal memuat riwayat mutasi stok.');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, selectedItemId, selectedType, dateFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleItemFilterChange = (newItemId) => {
    setSelectedItemId(newItemId);
    if (newItemId) {
      setSearchParams({ itemId: newItemId });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="atrium-page-header">
        <div className="atrium-page-title-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--atrium-text-muted)', textTransform: 'uppercase' }}>
              Buku Besar Fisik
            </span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, backgroundColor: '#E2E8F0', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Append-Only (Imutabel)
            </span>
          </div>
          <h1>Riwayat Pergerakan Stok</h1>
          <p>Catatan lengkap dan permanen mutasi fisik seluruh barang inventaris di gudang.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            className="atrium-btn-light"
            onClick={fetchHistory}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            className="atrium-btn-dark"
            onClick={() => navigate('/inventaris')}
          >
            <Boxes size={16} />
            <span>Kembali ke Inventaris</span>
          </button>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="atrium-toolbar">
        <CustomSelect
          className="atrium-filter-select"
          style={{ minWidth: '220px' }}
          value={selectedItemId}
          onChange={(e) => handleItemFilterChange(e.target.value)}
          ariaLabel="Filter Barang"
          autoWidth
        >
          <option value="">Semua Barang Inventaris</option>
          {items.map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.item_code})</option>
          ))}
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          style={{ minWidth: '200px' }}
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          ariaLabel="Filter Tipe Mutasi"
          autoWidth
        >
          <option value="">Semua Tipe Mutasi</option>
          {MOVEMENT_TYPES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          ariaLabel="Filter Rentang Waktu"
          autoWidth
        >
          <option value="all">Semua Waktu</option>
          <option value="today">Hari Ini</option>
          <option value="week">7 Hari Terakhir</option>
          <option value="month">30 Hari Terakhir</option>
        </CustomSelect>

        {(selectedItemId || selectedType || dateFilter !== 'all') && (
          <button
            type="button"
            className="atrium-btn-light"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem' }}
            onClick={() => {
              setSelectedItemId('');
              setSelectedType('');
              setDateFilter('all');
              setSearchParams({});
            }}
          >
            Reset Filter
          </button>
        )}
      </div>

      {/* Error View */}
      {error && (
        <div className="atrium-card" style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#991B1B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{error}</span>
          </div>
          <button type="button" className="atrium-btn-dark" onClick={fetchHistory} style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
            Coba Lagi
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="atrium-table-card">
        {loading ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--atrium-text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Memuat buku besar pergerakan stok...</p>
          </div>
        ) : movements.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <History size={36} color="var(--atrium-text-muted)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
              Belum Ada Mutasi Stok
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
              Tidak ditemukan catatan mutasi stok sesuai kriteria filter yang dipilih. Setiap penerimaan barang masuk atau penyesuaian stok akan dicatat di sini secara otomatis.
            </p>
          </div>
        ) : (
          <div className="atrium-table-container">
            <table className="atrium-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Barang</th>
                  <th>Tipe Mutasi</th>
                  <th style={{ textAlign: 'center' }}>Perubahan</th>
                  <th style={{ textAlign: 'center' }}>Saldo (Sblm → Ssdh)</th>
                  <th>Alasan / Keterangan</th>
                  <th>Petugas</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {new Date(m.created_at).toLocaleString('id-ID')}
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Link
                          to={`/inventaris/${m.items?.id}`}
                          style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--atrium-text-primary)' }}
                        >
                          {m.items?.name || 'Barang Terhapus'}
                        </Link>
                        <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
                          {m.items?.item_code || '—'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={`atrium-movement-badge movement-${m.movement_type}`}>
                        {m.movement_type}
                      </span>
                    </td>

                    <td style={{ textAlign: 'center', fontWeight: 700, color: m.quantity_delta > 0 ? '#15803D' : (m.quantity_delta < 0 ? '#DC2626' : 'inherit') }}>
                      {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                    </td>

                    <td style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)' }}>
                      {m.qty_before} → <strong>{m.qty_after}</strong>
                    </td>

                    <td style={{ fontSize: '0.8125rem', maxWidth: '320px' }}>
                      {m.reason}
                    </td>

                    <td style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-muted)' }}>
                      {m.profiles?.full_name || 'Petugas'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
