import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Boxes, Plus, Save, ArrowLeft, AlertCircle, CheckCircle2,
  Tag, MapPin, Layers, Info, ShieldCheck, RefreshCw
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';

export default function ItemForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isConfigured = isSupabaseConfigured();

  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    item_code: '',
    category_id: '',
    storage_location_id: '',
    tracking_type: 'quantity', // 'individual' or 'quantity'
    asset_serial: '',
    description: '',
    initial_qty: 1,
    condition: 'baik',
    status: 'available',
    is_active: true
  });

  // Current stock on edit mode (read-only)
  const [currentStock, setCurrentStock] = useState(null);

  // Load categories, locations, and existing item if in edit mode
  const loadFormData = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const [
        { data: catsData, error: catsErr },
        { data: locsData, error: locsErr }
      ] = await Promise.all([
        supabase.from('item_categories').select('id, name').order('name'),
        supabase.from('storage_locations').select('id, code, name').order('code')
      ]);

      if (catsErr) console.warn('Gagal memuat kategori:', catsErr.message);
      if (locsErr) console.warn('Gagal memuat lokasi:', locsErr.message);

      setCategories(catsData || []);
      setLocations(locsData || []);

      if (isEdit) {
        const { data: itemData, error: itemErr } = await supabase
          .from('items')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (itemErr || !itemData) {
          throw new Error('Barang tidak ditemukan atau gagal dimuat.');
        }

        setFormData({
          name: itemData.name || '',
          item_code: itemData.item_code || '',
          category_id: itemData.category_id || '',
          storage_location_id: itemData.storage_location_id || '',
          tracking_type: itemData.tracking_type || 'quantity',
          asset_serial: itemData.asset_serial || '',
          description: itemData.description || '',
          initial_qty: itemData.total_qty || 1,
          condition: itemData.condition || 'baik',
          status: itemData.status || 'available',
          is_active: itemData.is_active !== false
        });

        setCurrentStock({
          total_qty: itemData.total_qty,
          available_qty: itemData.available_qty,
          damaged_qty: itemData.damaged_qty,
          under_repair_qty: itemData.under_repair_qty
        });
      } else {
        // Generate automatic default SKU suggestion
        const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        setFormData(prev => ({
          ...prev,
          item_code: `ITM-${dateStr}-${randomNum}`,
          category_id: catsData?.[0]?.id || '',
          storage_location_id: locsData?.[0]?.id || ''
        }));
      }
    } catch (err) {
      console.error('Error loading form data:', err);
      setError(err.message || 'Gagal memuat data formulir.');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, isConfigured]);

  useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };

      // Individual asset rule: total_qty and available_qty must be locked to 1
      if (name === 'tracking_type') {
        if (value === 'individual') {
          next.initial_qty = 1;
        }
      }
      return next;
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Nama barang wajib diisi.');
      return;
    }
    if (!formData.item_code.trim()) {
      setError('Kode barang / SKU wajib diisi.');
      return;
    }
    if (!formData.category_id) {
      setError('Kategori barang wajib dipilih.');
      return;
    }
    if (!formData.storage_location_id) {
      setError('Lokasi penyimpanan wajib dipilih.');
      return;
    }
    if (formData.tracking_type === 'individual' && !formData.asset_serial.trim()) {
      setError('Nomor seri / barcode unik wajib diisi untuk aset individual.');
      return;
    }
    if (!isEdit && parseInt(formData.initial_qty) < 0) {
      setError('Kuantitas awal tidak boleh bernilai negatif.');
      return;
    }

    setSubmitting(true);

    try {
      if (!isEdit) {
        // CREATE ITEM
        const initialQty = formData.tracking_type === 'individual' ? 1 : parseInt(formData.initial_qty) || 1;

        const payload = {
          name: formData.name.trim(),
          item_code: formData.item_code.trim().toUpperCase(),
          category_id: formData.category_id,
          storage_location_id: formData.storage_location_id,
          tracking_type: formData.tracking_type,
          asset_serial: formData.asset_serial.trim(),
          description: formData.description.trim(),
          total_qty: initialQty,
          available_qty: initialQty,
          damaged_qty: 0,
          under_repair_qty: 0,
          condition: formData.condition,
          status: formData.status,
          is_active: formData.is_active,
          created_by: user?.id || null,
          updated_by: user?.id || null
        };

        const { data: inserted, error: insertErr } = await supabase
          .from('items')
          .insert(payload)
          .select()
          .maybeSingle();

        if (insertErr) {
          if (insertErr.code === '23505') {
            if (insertErr.message.includes('asset_serial')) {
              throw new Error('Nomor seri aset telah digunakan oleh barang lain.');
            }
            throw new Error(`Kode barang '${formData.item_code}' sudah terdaftar. Gunakan kode unik.`);
          }
          throw insertErr;
        }

        toast?.success?.('Barang inventaris baru berhasil ditambahkan.');
        navigate('/inventaris');
      } else {
        // UPDATE ITEM METADATA (Quantity columns excluded per security grant)
        const updatePayload = {
          name: formData.name.trim(),
          category_id: formData.category_id,
          storage_location_id: formData.storage_location_id,
          description: formData.description.trim(),
          asset_serial: formData.asset_serial.trim(),
          condition: formData.condition,
          status: formData.status,
          is_active: formData.is_active,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString()
        };

        const { error: updateErr } = await supabase
          .from('items')
          .update(updatePayload)
          .eq('id', id);

        if (updateErr) {
          if (updateErr.code === '23505') {
            throw new Error('Nomor seri aset telah digunakan oleh barang lain.');
          }
          throw updateErr;
        }

        toast?.success?.('Informasi barang berhasil diperbarui.');
        navigate(`/inventaris/${id}`);
      }
    } catch (err) {
      console.error('Error saving item:', err);
      setError(err.message || 'Terjadi kesalahan saat menyimpan data barang.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="atrium-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Memuat formulir barang...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="atrium-btn-light"
            style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => navigate(isEdit ? `/inventaris/${id}` : '/inventaris')}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--atrium-text-primary)' }}>
              {isEdit ? 'Edit Informasi Barang' : 'Tambah Barang Inventaris Baru'}
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', margin: '0.2rem 0 0 0' }}>
              {isEdit
                ? `Perbarui metadata dan lokasi penyimpanan untuk ${formData.name || 'aset'}`
                : 'Daftarkan aset atau perlengkapan kantor baru ke dalam database gudang'}
            </p>
          </div>
        </div>
      </div>

      {/* Alert Error */}
      {error && (
        <div className="atrium-card" style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#991B1B' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="atrium-card">
        <div className="atrium-form-grid">
          {/* Tracking Type (Create Only) */}
          <div className="atrium-form-grid-full">
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Tipe Pelacakan Inventaris
            </label>
            {isEdit ? (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className={`atrium-pill ${formData.tracking_type === 'individual' ? 'atrium-pill-individual' : 'atrium-pill-quantity'}`}>
                  {formData.tracking_type === 'individual' ? 'Aset Individual' : 'Pelacakan Kuantitas'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
                  (Tipe pelacakan terkunci setelah barang terdaftar)
                </span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '1rem',
                  borderRadius: '14px',
                  border: formData.tracking_type === 'quantity' ? '2px solid var(--atrium-accent-dark)' : '1px solid var(--atrium-border-soft)',
                  backgroundColor: formData.tracking_type === 'quantity' ? '#FAF9FB' : '#FFFFFF',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="tracking_type"
                    value="quantity"
                    checked={formData.tracking_type === 'quantity'}
                    onChange={handleChange}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.875rem', display: 'block', color: 'var(--atrium-text-primary)' }}>
                      Pelacakan Kuantitas (Banyak Unit)
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', lineHeight: 1.4 }}>
                      Untuk barang konsumtif atau periferal yang dapat dipertukarkan (cth: kabel HDMI, mouse, konektor).
                    </span>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '1rem',
                  borderRadius: '14px',
                  border: formData.tracking_type === 'individual' ? '2px solid var(--atrium-accent-dark)' : '1px solid var(--atrium-border-soft)',
                  backgroundColor: formData.tracking_type === 'individual' ? '#FAF9FB' : '#FFFFFF',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="tracking_type"
                    value="individual"
                    checked={formData.tracking_type === 'individual'}
                    onChange={handleChange}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.875rem', display: 'block', color: 'var(--atrium-text-primary)' }}>
                      Aset Individual (Unit Unik)
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)', lineHeight: 1.4 }}>
                      Untuk aset bernilai tinggi dengan nomor seri unik (cth: laptop kantor, kamera, proyektor). Total kuantitas otomatis 1 unit.
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Nama Barang */}
          <div>
            <label htmlFor="name" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Nama Barang <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              id="name"
              type="text"
              name="name"
              className="atrium-input-field"
              placeholder="cth: Laptop Dell Latitude 5420"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          {/* Kode SKU / Item Code */}
          <div>
            <label htmlFor="item_code" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Kode Barang / SKU <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              id="item_code"
              type="text"
              name="item_code"
              className="atrium-input-field"
              style={{ textTransform: 'uppercase' }}
              placeholder="cth: ITM-202611-0001"
              value={formData.item_code}
              onChange={handleChange}
              disabled={isEdit}
              required
            />
          </div>

          {/* Kategori */}
          <div>
            <label htmlFor="category_id" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Kategori Barang <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <select
              id="category_id"
              name="category_id"
              className="atrium-input-field"
              value={formData.category_id}
              onChange={handleChange}
              required
            >
              <option value="">Pilih Kategori...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Lokasi Rak */}
          <div>
            <label htmlFor="storage_location_id" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Lokasi Penyimpanan <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <select
              id="storage_location_id"
              name="storage_location_id"
              className="atrium-input-field"
              value={formData.storage_location_id}
              onChange={handleChange}
              required
            >
              <option value="">Pilih Lokasi Rak...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
              ))}
            </select>
          </div>

          {/* Nomor Seri / Barcode (Asset Serial) */}
          <div>
            <label htmlFor="asset_serial" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Nomor Seri / Barcode Aset {formData.tracking_type === 'individual' && <span style={{ color: '#DC2626' }}>*</span>}
            </label>
            <input
              id="asset_serial"
              type="text"
              name="asset_serial"
              className="atrium-input-field"
              placeholder={formData.tracking_type === 'individual' ? 'cth: SN-DELL-8839210 (Wajib)' : 'cth: BARCODE-8820 (Opsional)'}
              value={formData.asset_serial}
              onChange={handleChange}
              required={formData.tracking_type === 'individual'}
            />
          </div>

          {/* Kuantitas Awal (Hanya pada mode Create) */}
          {!isEdit ? (
            <div>
              <label htmlFor="initial_qty" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Kuantitas Awal Saldo <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                id="initial_qty"
                type="number"
                name="initial_qty"
                className="atrium-input-field"
                min="0"
                max={formData.tracking_type === 'individual' ? '1' : '999999'}
                value={formData.initial_qty}
                onChange={handleChange}
                disabled={formData.tracking_type === 'individual'}
                required
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--atrium-text-muted)' }}>
                {formData.tracking_type === 'individual'
                  ? 'Aset individual terkunci 1 unit per baris record.'
                  : 'Saldo awal akan otomatis dicatat ke riwayat mutasi stok.'}
              </span>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Kuantitas Stok Saat Ini
              </label>
              <div style={{ padding: '0.6rem 0.85rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '0.8125rem', display: 'flex', gap: '1rem' }}>
                <span>Total: <strong>{currentStock?.total_qty}</strong></span>
                <span>Tersedia: <strong style={{ color: '#15803D' }}>{currentStock?.available_qty}</strong></span>
                <span>Servis: <strong style={{ color: '#B45309' }}>{currentStock?.under_repair_qty}</strong></span>
              </div>
            </div>
          )}

          {/* Kondisi Fisik */}
          <div>
            <label htmlFor="condition" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Kondisi Fisik Barang
            </label>
            <select
              id="condition"
              name="condition"
              className="atrium-input-field"
              value={formData.condition}
              onChange={handleChange}
            >
              <option value="baik">Kondisi Baik (Prima)</option>
              <option value="cukup_baik">Cukup Baik</option>
              <option value="rusak_ringan">Rusak Ringan</option>
              <option value="rusak_berat">Rusak Berat</option>
              <option value="perbaikan">Dalam Perbaikan</option>
            </select>
          </div>

          {/* Status Operasional */}
          <div>
            <label htmlFor="status" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Status Operasional
            </label>
            <select
              id="status"
              name="status"
              className="atrium-input-field"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="available">Tersedia (Siap Dipinjam)</option>
              <option value="maintenance">Perawatan / Pemeliharaan</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>

          {/* Deskripsi */}
          <div className="atrium-form-grid-full">
            <label htmlFor="description" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Deskripsi & Spesifikasi Singkat
            </label>
            <textarea
              id="description"
              name="description"
              className="atrium-input-field"
              style={{ height: '80px', padding: '0.75rem', borderRadius: '14px', resize: 'vertical' }}
              placeholder="Catatan spesifikasi, kelengkapan aksesoris, atau nomor referensi faktur pengadaan..."
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          {/* Status Aktif */}
          <div className="atrium-form-grid-full">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--atrium-text-primary)' }}>
                Item aktif dalam katalog operasional gudang
              </span>
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F0F4' }}>
          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate(isEdit ? `/inventaris/${id}` : '/inventaris')}
          >
            Batal
          </button>

          <button
            type="submit"
            className="atrium-btn-dark"
            disabled={submitting}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw size={15} className="spin" /> Menyimpan...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={16} /> Simpan Data Barang
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
