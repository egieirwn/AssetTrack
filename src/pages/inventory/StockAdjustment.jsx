import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight, ArrowLeft, Save, AlertCircle, CheckCircle2,
  Boxes, Shield, RefreshCw, AlertTriangle, Wrench, Trash2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';

const ADJUSTMENT_TYPES = [
  {
    type: 'adjustment',
    label: 'Rekonsiliasi Hasil Stock Opname',
    description: 'Koreksi selisih hitung fisik saat audit berkala (nilai delta dapat bertambah atau berkurang).',
    allowNegative: true
  },
  {
    type: 'damaged',
    label: 'Pencatatan Barang Rusak Baru',
    description: 'Memindahkan unit dari status Tersedia ke status Rusak akibat insiden fisik atau kegagalan fungsi.',
    allowNegative: false
  },
  {
    type: 'sent_to_repair',
    label: 'Kirim Barang ke Bengkel Servis',
    description: 'Memindahkan unit dari status Rusak ke status Dalam Perbaikan untuk perawatan teknis.',
    allowNegative: false
  },
  {
    type: 'repair_complete',
    label: 'Barang Selesai Diperbaiki',
    description: 'Mengembalikan unit yang selesai diservis ke status Tersedia untuk dipinjamkan kembali.',
    allowNegative: false
  },
  {
    type: 'write_off',
    label: 'Penghapusan Aset / Afkir Permanen',
    description: 'Menghapus permanen unit rusak total (tidak dapat diperbaiki) dari total inventaris perusahaan.',
    allowNegative: false
  }
];

export default function StockAdjustment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedItemId = searchParams.get('itemId');

  const { user } = useAuth();
  const toast = useToast();
  const isConfigured = isSupabaseConfigured();

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState(preselectedItemId || '');
  const [adjustmentType, setAdjustmentType] = useState('adjustment');
  const [quantityDelta, setQuantityDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  // Load items
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
          storage_locations (code, name)
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

  const currentTypeConfig = useMemo(() => {
    return ADJUSTMENT_TYPES.find(a => a.type === adjustmentType) || ADJUSTMENT_TYPES[0];
  }, [adjustmentType]);

  // Compute live preview of before vs after
  const preview = useMemo(() => {
    if (!selectedItem) return null;
    const delta = parseInt(quantityDelta);
    if (isNaN(delta) || delta === 0) return null;

    let total = selectedItem.total_qty || 0;
    let avail = selectedItem.available_qty || 0;
    let damaged = selectedItem.damaged_qty || 0;
    let repair = selectedItem.under_repair_qty || 0;

    let isValid = true;
    let validationMsg = '';

    if (adjustmentType === 'adjustment') {
      total += delta;
      avail += delta;
      if (total < 0 || avail < 0) {
        isValid = false;
        validationMsg = 'Penyesuaian menghasilkan total atau stok tersedia bernilai negatif.';
      }
    } else if (adjustmentType === 'damaged') {
      if (delta <= 0) {
        isValid = false;
        validationMsg = 'Jumlah barang rusak harus positif.';
      } else if (delta > avail) {
        isValid = false;
        validationMsg = `Jumlah barang rusak (${delta}) melebihi stok tersedia (${avail}).`;
      } else {
        avail -= delta;
        damaged += delta;
      }
    } else if (adjustmentType === 'sent_to_repair') {
      if (delta <= 0) {
        isValid = false;
        validationMsg = 'Jumlah servis harus positif.';
      } else if (delta > damaged) {
        isValid = false;
        validationMsg = `Jumlah barang dikirim servis (${delta}) melebihi stok rusak (${damaged}).`;
      } else {
        damaged -= delta;
        repair += delta;
      }
    } else if (adjustmentType === 'repair_complete') {
      if (delta <= 0) {
        isValid = false;
        validationMsg = 'Jumlah perbaikan selesai harus positif.';
      } else if (delta > (repair + damaged)) {
        isValid = false;
        validationMsg = `Jumlah selesai perbaikan (${delta}) melebihi unit dalam servis (${repair + damaged}).`;
      } else {
        if (repair >= delta) {
          repair -= delta;
        } else {
          damaged -= (delta - repair);
          repair = 0;
        }
        avail += delta;
      }
    } else if (adjustmentType === 'write_off') {
      if (delta <= 0) {
        isValid = false;
        validationMsg = 'Jumlah penghapusan aset harus positif.';
      } else if (delta > damaged) {
        isValid = false;
        validationMsg = `Jumlah afkir (${delta}) melebihi stok rusak (${damaged}).`;
      } else {
        damaged -= delta;
        total -= delta;
      }
    }

    return {
      before: { total: selectedItem.total_qty, avail: selectedItem.available_qty, damaged: selectedItem.damaged_qty, repair: selectedItem.under_repair_qty },
      after: { total, avail, damaged, repair },
      isValid,
      validationMsg
    };
  }, [selectedItem, adjustmentType, quantityDelta]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedItemId) {
      setError('Silakan pilih barang inventaris terlebih dahulu.');
      return;
    }

    const delta = parseInt(quantityDelta);
    if (isNaN(delta) || delta === 0) {
      setError('Jumlah perubahan kuantitas tidak boleh bernilai 0.');
      return;
    }

    if (!currentTypeConfig.allowNegative && delta < 0) {
      setError(`Operasi '${currentTypeConfig.label}' memerlukan nilai kuantitas positif.`);
      return;
    }

    if (preview && !preview.isValid) {
      setError(preview.validationMsg);
      return;
    }

    if (!reason.trim()) {
      setError('Alasan penyesuaian / referensi berita acara audit wajib diisi.');
      return;
    }

    setSubmitting(true);

    try {
      // Execute secure atomic RPC
      const { data, error: rpcErr } = await supabase.rpc('rpc_adjust_stock', {
        p_item_id: selectedItemId,
        p_adjustment_type: adjustmentType,
        p_quantity_delta: delta,
        p_reason: reason.trim()
      });

      if (rpcErr) throw rpcErr;

      setSuccessResult({
        item: selectedItem,
        typeLabel: currentTypeConfig.label,
        data: data || preview?.after
      });

      toast?.success?.(`Penyesuaian stok '${currentTypeConfig.label}' berhasil diterapkan.`);
    } catch (err) {
      console.error('Error adjusting stock:', err);
      setError(err.message || 'Terjadi kesalahan saat memproses penyesuaian stok.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    setSuccessResult(null);
    setQuantityDelta(1);
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
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
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
            Penyesuaian & Rekonsiliasi Stok
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', margin: '0.2rem 0 0 0' }}>
            Koreksi hasil stock opname, alokasi unit rusak, pengiriman servis, dan penghapusan aset afkir.
          </p>
        </div>
      </div>

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
            Penyesuaian Stok Berhasil Dicatat
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--atrium-text-secondary)', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            Operasi <strong>{successResult.typeLabel}</strong> untuk <strong>{successResult.item?.name}</strong> telah berhasil diproses secara atomik di database.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="atrium-btn-light"
              onClick={handleResetForNext}
            >
              Lakukan Penyesuaian Lain
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
                    {item.name} ({item.item_code}) — Total: {item.total_qty} (Tersedia: {item.available_qty}, Rusak: {item.damaged_qty}, Servis: {item.under_repair_qty})
                  </option>
                ))}
              </select>
            </div>

            {/* Current Item Overview */}
            {selectedItem && (
              <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: 'var(--atrium-text-primary)' }}>
                    Saldo Stok Saat Ini: {selectedItem.name}
                  </strong>
                  <span className={`atrium-pill ${selectedItem.tracking_type === 'individual' ? 'atrium-pill-individual' : 'atrium-pill-quantity'}`}>
                    {selectedItem.tracking_type === 'individual' ? 'Aset Individual' : 'Kuantitas'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.8125rem' }}>
                  <div>Total Fisik: <strong>{selectedItem.total_qty}</strong></div>
                  <div>Tersedia: <strong style={{ color: '#15803D' }}>{selectedItem.available_qty}</strong></div>
                  <div>Rusak: <strong style={{ color: '#B91C1C' }}>{selectedItem.damaged_qty}</strong></div>
                  <div>Servis: <strong style={{ color: '#B45309' }}>{selectedItem.under_repair_qty}</strong></div>
                </div>
              </div>
            )}

            {/* Adjustment Type Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Jenis Penyesuaian Stok <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ADJUSTMENT_TYPES.map(a => (
                  <label
                    key={a.type}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      border: adjustmentType === a.type ? '2px solid var(--atrium-accent-dark)' : '1px solid var(--atrium-border-soft)',
                      backgroundColor: adjustmentType === a.type ? '#FAF9FB' : '#FFFFFF',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="adjustmentType"
                      value={a.type}
                      checked={adjustmentType === a.type}
                      onChange={(e) => setAdjustmentType(e.target.value)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--atrium-text-primary)', display: 'block' }}>
                        {a.label}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', lineHeight: 1.4 }}>
                        {a.description}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Quantity Delta */}
            <div>
              <label htmlFor="quantityDelta" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Jumlah Unit Perubahan {currentTypeConfig.allowNegative ? '(Bisa Positif / Negatif)' : '(Nilai Positif)'} <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                id="quantityDelta"
                type="number"
                className="atrium-input-field"
                value={quantityDelta}
                onChange={(e) => setQuantityDelta(e.target.value)}
                min={currentTypeConfig.allowNegative ? undefined : '1'}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
                {adjustmentType === 'adjustment'
                  ? 'Masukkan angka positif untuk penambahan saldo fisik, atau negatif (cth: -2) jika stok fisik kurang.'
                  : 'Jumlah unit yang diproses dalam penyesuaian ini.'}
              </span>
            </div>

            {/* Reason */}
            <div>
              <label htmlFor="reason" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Alasan / Berita Acara Rekonsiliasi <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                id="reason"
                className="atrium-input-field"
                style={{ height: '70px', padding: '0.75rem', borderRadius: '12px', resize: 'vertical' }}
                placeholder="cth: Hasil Stock Opname Q4 2026, BA No: BA/SO/2026/11/02, Perangkat jatuh retak"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* Live Preview Box */}
            {preview && (
              <div className="atrium-diff-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, margin: 0, color: 'var(--atrium-text-primary)' }}>
                    Pratinjau Dampak ke Saldo Stok
                  </h4>
                  {!preview.isValid && (
                    <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>
                      ⚠️ {preview.validationMsg}
                    </span>
                  )}
                </div>

                <div className="atrium-diff-grid">
                  <div className="atrium-diff-col">
                    <h5>Total Fisik</h5>
                    <div>
                      <span className="atrium-diff-val">{preview.before.total}</span>
                      <span className="atrium-diff-arrow">→</span>
                      <strong className="atrium-diff-val">{preview.after.total}</strong>
                    </div>
                  </div>

                  <div className="atrium-diff-col">
                    <h5>Tersedia</h5>
                    <div>
                      <span className="atrium-diff-val">{preview.before.avail}</span>
                      <span className="atrium-diff-arrow">→</span>
                      <strong className="atrium-diff-val" style={{ color: '#15803D' }}>{preview.after.avail}</strong>
                    </div>
                  </div>

                  <div className="atrium-diff-col">
                    <h5>Rusak</h5>
                    <div>
                      <span className="atrium-diff-val">{preview.before.damaged}</span>
                      <span className="atrium-diff-arrow">→</span>
                      <strong className="atrium-diff-val" style={{ color: '#B91C1C' }}>{preview.after.damaged}</strong>
                    </div>
                  </div>

                  <div className="atrium-diff-col">
                    <h5>Servis</h5>
                    <div>
                      <span className="atrium-diff-val">{preview.before.repair}</span>
                      <span className="atrium-diff-arrow">→</span>
                      <strong className="atrium-diff-val" style={{ color: '#B45309' }}>{preview.after.repair}</strong>
                    </div>
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
              disabled={submitting || (preview && !preview.isValid)}
            >
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={15} className="spin" /> Memproses...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Save size={16} /> Terapkan Penyesuaian
                </span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
