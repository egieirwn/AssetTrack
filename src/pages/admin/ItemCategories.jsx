import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Edit2, Trash2, Save, X, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, Package, Layers } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export default function ItemCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guardWarning, setGuardWarning] = useState(null); // { name: string, count: number }

  const isConfigured = isSupabaseConfigured();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        // Fallback for offline/test environments without credentials
        setCategories([]);
        return;
      }

      // Fetch categories
      const { data: cats, error: catErr } = await supabase
        .from('item_categories')
        .select('*')
        .order('name');

      if (catErr) throw catErr;

      // Fetch items to calculate item_count per category
      const { data: items, error: itemErr } = await supabase
        .from('items')
        .select('category_id');

      if (itemErr) {
        console.warn('Could not aggregate item counts:', itemErr.message);
      }

      const countMap = {};
      if (items) {
        items.forEach(it => {
          if (it.category_id) {
            countMap[it.category_id] = (countMap[it.category_id] || 0) + 1;
          }
        });
      }

      const merged = (cats || []).map(c => ({
        ...c,
        item_count: countMap[c.id] || 0
      }));

      setCategories(merged);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Gagal memuat kategori barang: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) {
      setError('Nama kategori wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (!isConfigured) {
        const dummy = {
          id: 'cat-' + Date.now(),
          name: newCat.name.trim(),
          description: newCat.description.trim(),
          is_active: true,
          item_count: 0
        };
        setCategories(prev => [...prev, dummy]);
        setCreating(false);
        setNewCat({ name: '', description: '' });
        setSuccess('Kategori berhasil ditambahkan (mode lokal).');
        return;
      }

      const { data, error: insertErr } = await supabase
        .from('item_categories')
        .insert({
          name: newCat.name.trim(),
          description: newCat.description.trim(),
          is_active: true
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setCreating(false);
      setNewCat({ name: '', description: '' });
      setSuccess('Kategori "' + (data?.name || newCat.name) + '" berhasil ditambahkan.');
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan kategori baru.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editing?.name?.trim()) {
      setError('Nama kategori tidak boleh kosong.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (!isConfigured) {
        setCategories(prev => prev.map(c => c.id === editing.id ? { ...c, ...editing } : c));
        setEditing(null);
        setSuccess('Kategori berhasil diperbarui (mode lokal).');
        return;
      }

      const { error: updErr } = await supabase
        .from('item_categories')
        .update({
          name: editing.name.trim(),
          description: editing.description?.trim() || '',
          is_active: editing.is_active
        })
        .eq('id', editing.id);

      if (updErr) throw updErr;

      setEditing(null);
      setSuccess('Kategori berhasil diperbarui.');
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal memperbarui kategori.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat) => {
    setError('');
    try {
      const nextActive = !cat.is_active;
      if (!isConfigured) {
        setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: nextActive } : c));
        return;
      }

      const { error: updErr } = await supabase
        .from('item_categories')
        .update({ is_active: nextActive })
        .eq('id', cat.id);

      if (updErr) throw updErr;

      setSuccess(`Kategori "${cat.name}" berhasil di${nextActive ? 'aktifkan' : 'nonaktifkan'}.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal mengubah status kategori.');
    }
  };

  const handleDelete = async (cat) => {
    setError('');
    setGuardWarning(null);

    // Strict guard: Cannot delete if items are referencing this category
    if (cat.item_count > 0) {
      setGuardWarning({
        id: cat.id,
        name: cat.name,
        count: cat.item_count
      });
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin menghapus kategori "${cat.name}" secara permanen? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      if (!isConfigured) {
        setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: false } : c));
        setSuccess(`Kategori "${cat.name}" dinonaktifkan.`);
        return;
      }

      const { error: delErr } = await supabase
        .from('item_categories')
        .delete()
        .eq('id', cat.id);

      if (delErr) {
        // If foreign key constraint or any trigger prevents deletion
        throw delErr;
      }

      setSuccess(`Kategori "${cat.name}" berhasil dihapus.`);
      fetchData();
    } catch (err) {
      setError('Tidak dapat menghapus kategori: ' + (err.message || 'Kategori sedang digunakan oleh data lain.'));
    }
  };

  const activeCount = categories.filter(c => c.is_active).length;
  const totalAssignedItems = categories.reduce((s, c) => s + (c.item_count || 0), 0);

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tag size={20} color="#0f172a" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Kategori Barang</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Kelola pengelompokan master barang inventaris PT Vinix Seven Aurum.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchData}
              disabled={loading}
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={() => { setCreating(true); setError(''); setSuccess(''); setGuardWarning(null); }}
            >
              <Plus size={16} />
              Tambah Kategori
            </button>
          </div>
        </div>

        {/* Mini KPI Chips */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Kategori</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{categories.length}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Kategori Aktif</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{activeCount}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Aset Terkategori</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' }}>{totalAssignedItems} unit</div>
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
          <button type="button" onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>×</button>
        </div>
      )}

      {/* Deletion Guard Modal/Banner */}
      {guardWarning && (
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <ShieldAlert size={22} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.25rem' }}>
              Pencegahan Hapus: Kategori Memiliki Aset Terdaftar
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f', lineHeight: 1.5 }}>
              Kategori <strong>"{guardWarning.name}"</strong> tidak dapat dihapus karena masih menaungi <strong>{guardWarning.count} barang</strong> dalam inventaris. Untuk menjaga integritas data dan riwayat mutasi barang, gunakan opsi <strong>Nonaktifkan</strong> daripada menghapus.
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-atrium-outline"
                style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                onClick={() => {
                  const target = categories.find(c => c.id === guardWarning.id);
                  if (target) handleToggleActive(target);
                  setGuardWarning(null);
                }}
              >
                Nonaktifkan Kategori Ini
              </button>
              <button
                type="button"
                className="btn-atrium-ghost"
                style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                onClick={() => setGuardWarning(null)}
              >
                Tutup Peringatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Form */}
      {creating && (
        <form onSubmit={handleCreate} className="atrium-glass-card" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={16} /> Tambah Kategori Baru
            </h3>
            <button type="button" onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Nama Kategori <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="text"
                className="atrium-input"
                style={{ width: '100%' }}
                placeholder="cth: Laptop & Komputer"
                value={newCat.name}
                onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Deskripsi
              </label>
              <input
                type="text"
                className="atrium-input"
                style={{ width: '100%' }}
                placeholder="cth: Unit komputasi, laptop staf, dan workstation"
                value={newCat.description}
                onChange={e => setNewCat(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={() => setCreating(false)}
              disabled={saving}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-atrium-primary"
              disabled={saving}
            >
              {saving ? <span className="spinner spinner-sm" /> : <Save size={15} />}
              Simpan Kategori
            </button>
          </div>
        </form>
      )}

      {/* Categories Table / Card Grid */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a' }}>
            Daftar Kategori Terdaftar
          </div>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            {categories.length} data
          </span>
        </div>

        <div className="table-wrapper" style={{ margin: 0, overflowX: 'auto' }}>
          <table className="atrium-inventory-table">
            <thead>
              <tr>
                <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                <th>Nama Kategori</th>
                <th>Deskripsi</th>
                <th style={{ textAlign: 'center' }}>Barang Terdaftar</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right', width: '140px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat daftar kategori...</div>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                    <Layers size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Belum ada kategori barang</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Klik "Tambah Kategori" untuk mengelompokkan barang inventaris.</div>
                  </td>
                </tr>
              ) : (
                categories.map((cat, idx) => (
                  <tr key={cat.id}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                      {idx + 1}
                    </td>

                    <td>
                      {editing?.id === cat.id ? (
                        <input
                          type="text"
                          className="atrium-input"
                          style={{ padding: '0.375rem 0.625rem', fontSize: '0.875rem' }}
                          value={editing.name}
                          onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                          autoFocus
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Tag size={14} color="#475569" />
                          </div>
                          <div>
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9375rem' }}>{cat.name}</span>
                          </div>
                        </div>
                      )}
                    </td>

                    <td>
                      {editing?.id === cat.id ? (
                        <input
                          type="text"
                          className="atrium-input"
                          style={{ padding: '0.375rem 0.625rem', fontSize: '0.875rem', width: '100%' }}
                          value={editing.description || ''}
                          onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                          placeholder="Deskripsi singkat"
                        />
                      ) : (
                        <span style={{ color: cat.description ? '#475569' : '#94a3b8', fontSize: '0.875rem' }}>
                          {cat.description || '—'}
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <span className="atrium-subtle-badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Package size={12} />
                        {cat.item_count || 0} barang
                      </span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {editing?.id === cat.id ? (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                          <input
                            type="checkbox"
                            checked={editing.is_active}
                            onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                          />
                          Aktif
                        </label>
                      ) : (
                        <span className={`atrium-subtle-badge ${cat.is_active ? 'badge-available' : 'badge-inactive'}`}>
                          {cat.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {editing?.id === cat.id ? (
                        <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                          <button
                            type="button"
                            className="btn-atrium-primary"
                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                            onClick={handleUpdate}
                            disabled={saving}
                            title="Simpan"
                          >
                            <Save size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-atrium-outline"
                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                            onClick={() => setEditing(null)}
                            title="Batal"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                          <button
                            type="button"
                            className="btn-atrium-ghost"
                            style={{ padding: '0.375rem 0.5rem' }}
                            onClick={() => { setEditing({ ...cat }); setGuardWarning(null); }}
                            title="Edit Kategori"
                          >
                            <Edit2 size={14} color="#475569" />
                          </button>
                          <button
                            type="button"
                            className="btn-atrium-ghost"
                            style={{ padding: '0.375rem 0.5rem', color: cat.is_active ? '#d97706' : '#10b981' }}
                            onClick={() => handleToggleActive(cat)}
                            title={cat.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            {cat.is_active ? '⏸' : '▶'}
                          </button>
                          <button
                            type="button"
                            className="btn-atrium-ghost"
                            style={{ padding: '0.375rem 0.5rem', color: '#e11d48' }}
                            onClick={() => handleDelete(cat)}
                            title="Hapus Kategori"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
