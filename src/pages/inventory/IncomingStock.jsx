import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  PackagePlus, ArrowLeft, Save, AlertCircle, CheckCircle2,
  Boxes, Shield, RefreshCw, FileText
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';

export default function IncomingStock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedItemId = searchParams.get('itemId');

  const { user } = useAuth();
  const toast = useToast();
  const isConfigured = isSupabaseConfigured();

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState(preselectedItemId || '');
  const [incomingQty, setIncomingQty] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  // Fetch active items list
  const loadItems = useCallback(async () => {
    if (!isConfigured) {
      setLoadingItems(false);
      return;
    }

    try {
      const { data, error: err } = await supabase
        .from('items')
        .select(`
          id, item_code, name, tracking_type, asset_serial,
          total_qty, available_qty, damaged_qty, under_repair_qty,
          storage_locations (code, name),
          item_categories (name)
        `)
        .eq('is_active', true)
        .order('name');

      if (err) throw err;
      setItems(data || []);

      if (preselectedItemId) {
        setSelectedItemId(preselectedItemId);
      } else if (data && data.length > 0 && !selectedItemId) {
        setSelectedItemId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading items:', err);
      setError('Gagal memuat daftar barang dari database.');
    } finally {
      setLoadingItems(false);
    }
  }, [isConfigured, preselectedItemId, selectedItemId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const selectedItem = useMemo(() => {
    return items.find(i => i.id === selectedItemId) || null;
  }, [items, selectedItemId]);

  const isIndividual = selectedItem?.tracking_type === 'individual';

  const previewAfter = useMemo(() => {
    if (!selectedItem) return null;
    const delta = parseInt(incomingQty) || 0;
    return {
      total_qty: (selectedItem.total_qty || 0) + delta,
      available_qty: (selectedItem.available_qty || 0) + delta
    };
  }, [selectedItem, incomingQty]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedItemId) {
      setError('Silakan pilih barang inventaris terlebih dahulu.');
      return;
    }

    const qty = parseInt(incomingQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Kuantitas masuk harus bernilai positif (minimal 1 unit).');
      return;
    }

    if (isIndividual && selectedItem.total_qty > 0) {
      setError('Aset individual mewakili unit unik (total = 1). Untuk mendaftarkan aset individual baru dengan nomor seri terpisah, gunakan menu Tambah Barang Baru.');
      return;
    }

    if (!reason.trim()) {
      setError('Catatan / referensi penerimaan barang wajib diisi (cth: Nomor PO, faktur pembelian, pengadaan baru).');
      return;
    }

    setSubmitting(true);

    try {
      // Execute secure atomic RPC
      const { data, error: rpcErr } = await supabase.rpc('rpc_adjust_stock', {
        p_item_id: selectedItemId,
        p_adjustment_type: 'incoming',
        p_quantity_delta: qty,
        p_reason: reason.trim()
      });

      if (rpcErr) throw rpcErr;

      setSuccessResult({
        item: selectedItem,
        qtyAdded: qty,
        newTotal: data?.total_qty || previewAfter.total_qty,
        newAvail: data?.available_qty || previewAfter.available_qty
      });

      toast?.success?.(`Berhasil mencatat stok masuk ${qty} unit untuk ${selectedItem.name}.`);
    } catch (err) {
      console.error('Error recording incoming stock:', err);
      setError(err.message || 'Terjadi kesalahan saat memproses stok masuk.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    setSuccessResult(null);
    setIncomingQty(1);
    setReason('');
    loadItems();
  };

  if (loadingItems) {
    return (
      <div className="atrium-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Memuat data barang...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          className="atrium-btn-light"
          style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => navigate('/inventaris')}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--atrium-text-primary)' }}>
            Penerimaan Barang Masuk
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', margin: '0.2rem 0 0 0' }}>
            Catat penambahan fisik stok baru dari pengadaan, pembelian, atau transfer inventaris ke buku besar.
          </p>
        </div>
      </div>

      {/* Success State View */}
      {successResult ? (
        <div className="atrium-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#DCFCE7',
            color: '#16A34A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem'
          }}>
            <CheckCircle2 size={32} />
          </div>

          <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--atrium-text-primary)', margin: '0 0 0.5rem 0' }}>
            Stok Masuk Berhasil Dicatat
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--atrium-text-secondary)', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            Kuantitas fisik <strong>{successResult.item?.name}</strong> telah bertambah <strong>+{successResult.qtyAdded} unit</strong> dan dicatat secara permanen di riwayat mutasi stok.
          </p>

          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem', maxWidth: '420px', margin: '0 auto 2rem', display: 'flex', justifyContent: 'space-around' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block' }}>Stok Total Baru</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--atrium-text-primary)' }}>{successResult.newTotal} unit</strong>
            </div>
            <div style={{ borderRight: '1px solid #E2E8F0' }} />
            <div>
              <span style={{ fontSize: '0.75rem', color: '#166534', display: 'block' }}>Stok Tersedia Baru</span>
              <strong style={{ fontSize: '1.25rem', color: '#15803D' }}>{successResult.newAvail} unit</strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="atrium-btn-light"
              onClick={handleResetForNext}
            >
              Catat Penerimaan Lain
            </button>
            <button
              type="button"
              className="atrium-btn-dark"
              onClick={() => navigate(`/inventaris/${successResult.item?.id}`)}
            >
              Lihat Detail Barang
            </button>
          </div>
        </div>
      ) : (
        /* Form View */
        <form onSubmit={handleSubmit} className="atrium-card">
          {error && (
            <div style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2', padding: '1rem 1.25rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#991B1B' }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Item Selector */}
            <div>
              <label htmlFor="selectedItemId" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Pilih Barang Inventaris <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                id="selectedItemId"
                className="atrium-input-field"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                required
              >
                <option value="">Pilih barang...</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.item_code}) — Tersedia: {item.available_qty} / Total: {item.total_qty} [{item.storage_locations?.code || 'Tanpa Rak'}]
                  </option>
                ))}
              </select>
            </div>

            {/* Individual Warning */}
            {isIndividual && (
              <div style={{ padding: '0.875rem 1rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', fontSize: '0.8125rem', color: '#92400E', display: 'flex', gap: '0.6rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>
                  <strong>Perhatian Aset Individual:</strong> Barang ini dilacak sebagai unit tunggal (SN: {selectedItem.asset_serial || '—'}). Setiap unit fisik unik tambahan (seperti laptop/proyektor baru) harus didaftarkan melalui form <strong>Tambah Barang Baru</strong> agar memiliki nomor seri tersendiri.
                </span>
              </div>
            )}

            {/* Current Item Overview */}
            {selectedItem && (
              <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: 'var(--atrium-text-primary)' }}>
                    Kondisi Stok Saat Ini: {selectedItem.name}
                  </strong>
                  <span className={`atrium-pill ${isIndividual ? 'atrium-pill-individual' : 'atrium-pill-quantity'}`}>
                    {isIndividual ? 'Aset Individual' : 'Pelacakan Kuantitas'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                  <div>Total Fisik: <strong>{selectedItem.total_qty}</strong></div>
                  <div>Tersedia: <strong style={{ color: '#15803D' }}>{selectedItem.available_qty}</strong></div>
                  <div>Rusak: <strong style={{ color: '#B91C1C' }}>{selectedItem.damaged_qty}</strong></div>
                  <div>Servis: <strong style={{ color: '#B45309' }}>{selectedItem.under_repair_qty}</strong></div>
                </div>
              </div>
            )}

            {/* Incoming Quantity */}
            <div>
              <label htmlFor="incomingQty" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Jumlah Unit Masuk <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                id="incomingQty"
                type="number"
                min="1"
                className="atrium-input-field"
                value={incomingQty}
                onChange={(e) => setIncomingQty(e.target.value)}
                disabled={isIndividual && selectedItem?.total_qty > 0}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
                Kuantitas fisik yang diterima dan siap disimpan di rak gudang.
              </span>
            </div>

            {/* Source Reference Note / PO */}
            <div>
              <label htmlFor="reason" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Catatan / Nomor Referensi Penerimaan <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                id="reason"
                className="atrium-input-field"
                style={{ height: '70px', padding: '0.75rem', borderRadius: '12px', resize: 'vertical' }}
                placeholder="cth: Pengadaan Batch Nov 2026, PO-VINIX-7721, Vendor PT Indotech"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* Preview Box */}
            {previewAfter && (
              <div className="atrium-diff-box">
                <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: 'var(--atrium-text-primary)' }}>
                  Pratinjau Hasil Perubahan Stok
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block' }}>Total Fisik</span>
                    <span className="atrium-diff-val">{selectedItem.total_qty}</span>
                    <span className="atrium-diff-arrow">→</span>
                    <span className="atrium-diff-val" style={{ color: '#15803D' }}>{previewAfter.total_qty}</span>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', display: 'block' }}>Stok Tersedia</span>
                    <span className="atrium-diff-val">{selectedItem.available_qty}</span>
                    <span className="atrium-diff-arrow">→</span>
                    <span className="atrium-diff-val" style={{ color: '#15803D' }}>{previewAfter.available_qty}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F0F4' }}>
            <button
              type="button"
              className="atrium-btn-light"
              onClick={() => navigate('/inventaris')}
            >
              Batal
            </button>

            <button
              type="submit"
              className="atrium-btn-dark"
              disabled={submitting || (isIndividual && selectedItem?.total_qty > 0)}
            >
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={15} className="spin" /> Memproses...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PackagePlus size={16} /> Konfirmasi Penerimaan Stok
                </span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
