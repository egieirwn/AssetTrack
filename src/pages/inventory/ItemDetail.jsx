import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Boxes, ArrowLeft, Edit2, PackagePlus, ArrowLeftRight,
  History, Tag, MapPin, AlertTriangle, Wrench, CheckCircle2,
  RefreshCw, AlertCircle, Shield, Clock, Archive
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const isConfigured = isSupabaseConfigured();

  const [item, setItem] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingActive, setTogglingActive] = useState(false);

  const fetchItemDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const [
        { data: itemData, error: itemErr },
        { data: moveData, error: moveErr }
      ] = await Promise.all([
        supabase
          .from('items')
          .select(`
            *,
            item_categories (id, name),
            storage_locations (id, code, name)
          `)
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('stock_movements')
          .select(`
            id, movement_type, quantity_delta, qty_before, qty_after,
            reason, created_at,
            profiles (full_name, role)
          `)
          .eq('item_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      if (itemErr || !itemData) {
        throw new Error('Data barang tidak ditemukan dalam database.');
      }
      if (moveErr) {
        console.warn('Gagal memuat riwayat mutasi:', moveErr.message);
      }

      setItem(itemData);
      setMovements(moveData || []);
    } catch (err) {
      console.error('Error fetching item detail:', err);
      setError(err.message || 'Gagal memuat rincian barang.');
    } finally {
      setLoading(false);
    }
  }, [id, isConfigured]);

  useEffect(() => {
    fetchItemDetail();
  }, [fetchItemDetail]);

  const handleToggleActive = async () => {
    if (!item || togglingActive) return;
    setTogglingActive(true);

    try {
      const newStatus = !item.is_active;
      const { error: err } = await supabase
        .from('items')
        .update({
          is_active: newStatus,
          status: newStatus ? 'available' : 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (err) throw err;

      setItem(prev => ({
        ...prev,
        is_active: newStatus,
        status: newStatus ? 'available' : 'inactive'
      }));
      toast?.success?.(newStatus ? 'Barang berhasil diaktifkan kembali.' : 'Barang dinonaktifkan dari katalog operasional.');
    } catch (err) {
      console.error('Error toggling active state:', err);
      toast?.error?.(err.message || 'Gagal mengubah status aktif barang.');
    } finally {
      setTogglingActive(false);
    }
  };

  if (loading) {
    return (
      <div className="atrium-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Memuat rincian barang...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="atrium-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <AlertCircle size={36} color="#DC2626" style={{ margin: '0 auto 1rem' }} />
        <h2>Data Barang Tidak Ditemukan</h2>
        <p style={{ color: 'var(--atrium-text-secondary)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
          {error || 'Barang yang Anda cari tidak tersedia dalam database gudang.'}
        </p>
        <button type="button" className="atrium-btn-dark" onClick={() => navigate('/inventaris')}>
          <ArrowLeft size={16} /> Kembali ke Inventaris
        </button>
      </div>
    );
  }

  const borrowedQty = Math.max(0, (item.total_qty || 0) - ((item.available_qty || 0) + (item.damaged_qty || 0) + (item.under_repair_qty || 0)));

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Top Navigation & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="atrium-btn-light"
            style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => navigate('/inventaris')}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className={`atrium-pill ${item.tracking_type === 'individual' ? 'atrium-pill-individual' : 'atrium-pill-quantity'}`}>
                {item.tracking_type === 'individual' ? 'Aset Individual' : 'Pelacakan Kuantitas'}
              </span>
              <span className={`atrium-pill atrium-pill-${item.status}`}>
                {item.status === 'available' ? 'Tersedia' : (item.status === 'borrowed' ? 'Dipinjam' : (item.status === 'maintenance' ? 'Perawatan' : 'Nonaktif'))}
              </span>
              {!item.is_active && (
                <span className="atrium-pill atrium-pill-inactive">Diarsipkan</span>
              )}
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--atrium-text-primary)' }}>
              {item.name}
            </h1>
            <span style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-muted)' }}>
              SKU: <strong>{item.item_code}</strong>
              {item.asset_serial ? ` · No Seri: ${item.asset_serial}` : ''}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate(`/inventaris/barang-masuk?itemId=${item.id}`)}
          >
            <PackagePlus size={16} />
            <span>Catat Barang Masuk</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate(`/inventaris/penyesuaian-stok?itemId=${item.id}`)}
          >
            <ArrowLeftRight size={16} />
            <span>Penyesuaian Stok</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate(`/inventaris/${item.id}/edit`)}
          >
            <Edit2 size={15} />
            <span>Edit Informasi</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            style={{ color: item.is_active ? '#DC2626' : '#15803D' }}
            onClick={handleToggleActive}
            disabled={togglingActive}
          >
            <Archive size={15} />
            <span>{item.is_active ? 'Nonaktifkan' : 'Aktifkan'}</span>
          </button>
        </div>
      </div>

      {/* Stock Breakdown Card */}
      <div className="atrium-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 1rem 0', color: 'var(--atrium-text-primary)' }}>
          Alokasi & Kuantitas Fisik Stok
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Total Fisik Aset
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--atrium-text-primary)' }}>
              {item.total_qty} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>unit</span>
            </div>
            <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>Tercatat di gudang</span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '14px', border: '1px solid #BBF7D0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534', display: 'block', marginBottom: '0.35rem' }}>
              Stok Tersedia
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803D' }}>
              {item.available_qty} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>unit</span>
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#166534' }}>Siap dipinjamkan</span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#EFF6FF', borderRadius: '14px', border: '1px solid #BFDBFE' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E40AF', display: 'block', marginBottom: '0.35rem' }}>
              Sedang Dipinjam
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1D4ED8' }}>
              {borrowedQty} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>unit</span>
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#1E40AF' }}>Di luar gudang</span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#FEF2F2', borderRadius: '14px', border: '1px solid #FECACA' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991B1B', display: 'block', marginBottom: '0.35rem' }}>
              Barang Rusak
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#B91C1C' }}>
              {item.damaged_qty} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>unit</span>
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#991B1B' }}>Menunggu servis</span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#FFFBEB', borderRadius: '14px', border: '1px solid #FDE68A' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '0.35rem' }}>
              Dalam Perbaikan
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#B45309' }}>
              {item.under_repair_qty} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>unit</span>
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#92400E' }}>Sedang diservis</span>
          </div>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={14} color="#16A34A" />
          <span>Integritas Kuantitas: <strong>total_qty = available_qty ({item.available_qty}) + borrowed_qty ({borrowedQty}) + damaged_qty ({item.damaged_qty}) + under_repair_qty ({item.under_repair_qty})</strong></span>
        </div>
      </div>

      {/* Metadata Overview Card */}
      <div className="atrium-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 1.25rem 0', color: 'var(--atrium-text-primary)' }}>
          Spesifikasi & Informasi Lokasi
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Kategori Barang
            </span>
            <strong style={{ fontSize: '0.9375rem', color: 'var(--atrium-text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Tag size={15} color="var(--atrium-text-muted)" />
              {item.item_categories?.name || '—'}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Lokasi Rak / Penyimpanan
            </span>
            <strong style={{ fontSize: '0.9375rem', color: 'var(--atrium-text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={15} color="var(--atrium-text-muted)" />
              {item.storage_locations?.code} - {item.storage_locations?.name}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Kondisi Fisik Saat Ini
            </span>
            <strong style={{ fontSize: '0.9375rem', color: 'var(--atrium-text-primary)', textTransform: 'capitalize' }}>
              {item.condition ? item.condition.replace('_', ' ') : 'Baik'}
            </strong>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Terakhir Diperbarui
            </span>
            <strong style={{ fontSize: '0.9375rem', color: 'var(--atrium-text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={15} color="var(--atrium-text-muted)" />
              {new Date(item.updated_at).toLocaleString('id-ID')}
            </strong>
          </div>
        </div>

        {item.description && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F0F4' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block', marginBottom: '0.35rem' }}>
              Deskripsi / Spesifikasi Tambahan
            </span>
            <p style={{ fontSize: '0.875rem', color: 'var(--atrium-text-secondary)', margin: 0, lineHeight: 1.6 }}>
              {item.description}
            </p>
          </div>
        )}
      </div>

      {/* Stock Movements Ledger for this item */}
      <div className="atrium-table-card">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--atrium-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.2rem 0', color: 'var(--atrium-text-primary)' }}>
              Riwayat Mutasi Stok Barang Ini
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', margin: 0 }}>
              Buku besar mutasi fisik append-only (tidak dapat dimodifikasi atau dihapus)
            </p>
          </div>
          <Link
            to={`/inventaris/pergerakan-stok?itemId=${item.id}`}
            style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--atrium-text-primary)' }}
          >
            Lihat Semua Mutasi →
          </Link>
        </div>

        {movements.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--atrium-text-muted)', fontSize: '0.8125rem' }}>
            Belum ada riwayat mutasi stok tercatat untuk barang ini.
          </div>
        ) : (
          <div className="atrium-table-container">
            <table className="atrium-table">
              <thead>
                <tr>
                  <th>Waktu</th>
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

                    <td style={{ fontSize: '0.8125rem' }}>
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
