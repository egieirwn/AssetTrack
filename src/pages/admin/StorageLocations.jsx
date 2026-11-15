import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, Edit2, Trash2, Save, X, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, Package, Layers } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export default function StorageLocations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newLoc, setNewLoc] = useState({ code: '', name: '', capacity: 20, description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guardWarning, setGuardWarning] = useState(null);

  const isConfigured = isSupabaseConfigured();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        setLocations([]);
        return;
      }

      // Fetch storage locations
      const { data: locs, error: locErr } = await supabase
        .from('storage_locations')
        .select('*')
        .order('code');

      if (locErr) throw locErr;

      // Count items and total physical units stored in each location
      const { data: items, error: itemErr } = await supabase
        .from('items')
        .select('storage_location_id, total_qty');

      if (itemErr) {
        console.warn('Could not aggregate storage items:', itemErr.message);
      }

      const countMap = {};
      const unitMap = {};
      if (items) {
        items.forEach(it => {
          if (it.storage_location_id) {
            countMap[it.storage_location_id] = (countMap[it.storage_location_id] || 0) + 1;
            unitMap[it.storage_location_id] = (unitMap[it.storage_location_id] || 0) + (it.total_qty || 1);
          }
        });
      }

      const merged = (locs || []).map(l => {
        const itemCount = countMap[l.id] || 0;
        const totalUnits = unitMap[l.id] || 0;
        const capacity = l.capacity || 1;
        const usageRatio = Math.round((totalUnits / capacity) * 100);

        let status = 'available';
        if (!l.is_active) {
          status = 'inactive';
        } else if (usageRatio >= 100) {
          status = 'full';
        } else if (usageRatio >= 80) {
          status = 'near_full';
        }

        return {
          ...l,
          item_count: itemCount,
          total_units: totalUnits,
          usage_ratio: usageRatio,
          status
        };
      });

      setLocations(merged);
    } catch (err) {
      console.error('Error fetching storage locations:', err);
      setError('Gagal memuat lokasi penyimpanan: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newLoc.code.trim() || !newLoc.name.trim()) {
      setError('Kode dan nama lokasi wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const codeUpper = newLoc.code.trim().toUpperCase();
      const capInt = Math.max(1, parseInt(newLoc.capacity, 10) || 10);

      if (!isConfigured) {
        const dummy = {
          id: 'loc-' + Date.now(),
          code: codeUpper,
          name: newLoc.name.trim(),
          capacity: capInt,
          description: newLoc.description?.trim() || '',
          is_active: true,
          item_count: 0,
          total_units: 0,
          usage_ratio: 0,
          status: 'available'
        };
        setLocations(prev => [...prev, dummy]);
        setCreating(false);
        setNewLoc({ code: '', name: '', capacity: 20, description: '' });
        setSuccess('Lokasi berhasil ditambahkan (mode lokal).');
        return;
      }

      const { data, error: insertErr } = await supabase
        .from('storage_locations')
        .insert({
          code: codeUpper,
          name: newLoc.name.trim(),
          capacity: capInt,
          description: newLoc.description?.trim() || '',
          is_active: true
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setCreating(false);
      setNewLoc({ code: '', name: '', capacity: 20, description: '' });
      setSuccess(`Lokasi "${data?.code || codeUpper}" berhasil ditambahkan.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan lokasi penyimpanan.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editing?.name?.trim()) {
      setError('Nama lokasi tidak boleh kosong.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const capInt = Math.max(1, parseInt(editing.capacity, 10) || 1);

      if (!isConfigured) {
        setLocations(prev => prev.map(l => l.id === editing.id ? { ...l, ...editing, capacity: capInt } : l));
        setEditing(null);
        setSuccess('Lokasi berhasil diperbarui (mode lokal).');
        return;
      }

      const { error: updErr } = await supabase
        .from('storage_locations')
        .update({
          name: editing.name.trim(),
          capacity: capInt,
          description: editing.description?.trim() || '',
          is_active: editing.is_active
        })
        .eq('id', editing.id);

      if (updErr) throw updErr;

      setEditing(null);
      setSuccess(`Lokasi "${editing.code}" berhasil diperbarui.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal memperbarui lokasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (loc) => {
    setError('');
    try {
      const nextActive = !loc.is_active;
      if (!isConfigured) {
        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_active: nextActive } : l));
        return;
      }

      const { error: updErr } = await supabase
        .from('storage_locations')
        .update({ is_active: nextActive })
        .eq('id', loc.id);

      if (updErr) throw updErr;

      setSuccess(`Status lokasi "${loc.code}" diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`);
      fetchData();
    } catch (err) {
      setError(err.message || 'Gagal mengubah status lokasi.');
    }
  };

  const handleDelete = async (loc) => {
    setError('');
    setGuardWarning(null);

    // Strict guard: Cannot delete if items reside in this location
    if (loc.item_count > 0 || loc.total_units > 0) {
      setGuardWarning({
        id: loc.id,
        code: loc.code,
        name: loc.name,
        count: loc.item_count,
        units: loc.total_units
      });
      return;
    }

    if (!window.confirm(`Hapus permanen lokasi "${loc.code} - ${loc.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      if (!isConfigured) {
        setLocations(prev => prev.filter(l => l.id !== loc.id));
        setSuccess(`Lokasi "${loc.code}" dihapus.`);
        return;
      }

      const { error: delErr } = await supabase
        .from('storage_locations')
        .delete()
        .eq('id', loc.id);

      if (delErr) throw delErr;

      setSuccess(`Lokasi "${loc.code}" berhasil dihapus.`);
      fetchData();
    } catch (err) {
      setError('Gagal menghapus lokasi: ' + (err.message || 'Lokasi terikat dengan entitas lain.'));
    }
  };

  const totalCap = locations.reduce((s, l) => s + (l.capacity || 0), 0);
  const totalOccupied = locations.reduce((s, l) => s + (l.total_units || 0), 0);
  const activeLocations = locations.filter(l => l.is_active).length;
  const fullLocations = locations.filter(l => l.status === 'full').length;

  return (
    <div className="atrium-content-container">
      {/* Top Banner Card */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={20} color="#0f172a" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Lokasi Penyimpanan</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Tata letak fisik rak, lemari, dan drawer gudang PT Vinix Seven Aurum.
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
              Tambah Lokasi
            </button>
          </div>
        </div>

        {/* Mini KPI Chips */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Lokasi</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{locations.length} titik</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Lokasi Aktif</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{activeLocations} titik</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Kapasitas Terpakai</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' }}>
              {totalOccupied} / {totalCap} unit ({totalCap > 0 ? Math.round((totalOccupied / totalCap) * 100) : 0}%)
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Lokasi Penuh (Max)</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: fullLocations > 0 ? '#e11d48' : '#64748b' }}>
              {fullLocations} titik
            </div>
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

      {/* Deletion Guard Banner */}
      {guardWarning && (
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <ShieldAlert size={22} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.25rem' }}>
              Pencegahan Hapus: Lokasi Masih Menyimpan Barang
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f', lineHeight: 1.5 }}>
              Lokasi <strong>"{guardWarning.code} — {guardWarning.name}"</strong> tidak dapat dihapus karena saat ini menampung <strong>{guardWarning.count} jenis barang ({guardWarning.units} total unit fisik)</strong>. Silakan pindahkan barang ke rak lain terlebih dahulu, atau gunakan opsi <strong>Nonaktifkan</strong>.
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-atrium-outline"
                style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                onClick={() => {
                  const target = locations.find(l => l.id === guardWarning.id);
                  if (target) handleToggleActive(target);
                  setGuardWarning(null);
                }}
              >
                Nonaktifkan Lokasi Ini
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
              <Plus size={16} /> Tambah Lokasi Baru
            </h3>
            <button type="button" onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Kode Lokasi <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="text"
                className="atrium-input"
                style={{ width: '100%', textTransform: 'uppercase' }}
                placeholder="cth: GDG-A-RK03"
                value={newLoc.code}
                onChange={e => setNewLoc(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Nama Lokasi <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="text"
                className="atrium-input"
                style={{ width: '100%' }}
                placeholder="cth: Gudang Utama - Rak A3"
                value={newLoc.name}
                onChange={e => setNewLoc(p => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Kapasitas Maksimal (Unit) <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                className="atrium-input"
                style={{ width: '100%' }}
                value={newLoc.capacity}
                onChange={e => setNewLoc(p => ({ ...p, capacity: e.target.value }))}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                Keterangan / Posisi
              </label>
              <input
                type="text"
                className="atrium-input"
                style={{ width: '100%' }}
                placeholder="cth: Sisi utara dekat pintu gerbang"
                value={newLoc.description}
                onChange={e => setNewLoc(p => ({ ...p, description: e.target.value }))}
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
              Simpan Lokasi
            </button>
          </div>
        </form>
      )}

      {/* Grid of Storage Location Cards */}
      {loading ? (
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat lokasi penyimpanan...</div>
        </div>
      ) : locations.length === 0 ? (
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Layers size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
          <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Belum ada lokasi penyimpanan</div>
          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Klik "Tambah Lokasi" untuk mendaftarkan rak atau lemari gudang.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {locations.map(loc => {
            const isEditingThis = editing?.id === loc.id;
            const ratio = loc.usage_ratio || 0;
            const progressColor = ratio >= 100 ? '#e11d48' : ratio >= 80 ? '#d97706' : '#10b981';

            return (
              <div
                key={loc.id}
                className="atrium-glass-card"
                style={{
                  padding: '1.25rem',
                  opacity: loc.is_active ? 1 : 0.65,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: `3px solid ${loc.is_active ? progressColor : '#94a3b8'}`
                }}
              >
                <div>
                  {/* Top Bar: Code & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <span className="atrium-tag-mono" style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                        {loc.code}
                      </span>
                    </div>

                    <span className={`atrium-subtle-badge ${!loc.is_active ? 'badge-inactive' : ratio >= 100 ? 'badge-damaged' : ratio >= 80 ? 'badge-borrowed' : 'badge-available'}`}>
                      {!loc.is_active ? 'Nonaktif' : ratio >= 100 ? 'Penuh' : ratio >= 80 ? 'Hampir Penuh' : 'Tersedia'}
                    </span>
                  </div>

                  {/* Name & Description */}
                  {isEditingThis ? (
                    <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="atrium-input"
                        placeholder="Nama Lokasi"
                        value={editing.name}
                        onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                        autoFocus
                      />
                      <input
                        type="number"
                        min="1"
                        className="atrium-input"
                        placeholder="Kapasitas"
                        value={editing.capacity}
                        onChange={e => setEditing(p => ({ ...p, capacity: e.target.value }))}
                      />
                      <input
                        type="text"
                        className="atrium-input"
                        placeholder="Keterangan"
                        value={editing.description || ''}
                        onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                      />
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
                        <input
                          type="checkbox"
                          checked={editing.is_active}
                          onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                        />
                        Aktif
                      </label>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                        {loc.name}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.4 }}>
                        {loc.description || 'Tidak ada keterangan khusus.'}
                      </p>
                    </div>
                  )}

                  {/* Capacity Bar & Utilization */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid rgba(226, 232, 240, 0.8)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Package size={13} />
                        Kapasitas Terpakai
                      </span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {loc.total_units} / {loc.capacity} unit ({ratio}%)
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(ratio, 100)}%`,
                          background: progressColor,
                          borderRadius: '999px',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>

                    <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{loc.item_count} macam barang</span>
                      <span>Sisa ruang: {Math.max(0, loc.capacity - loc.total_units)} unit</span>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'flex-end', gap: '0.375rem' }}>
                  {isEditingThis ? (
                    <>
                      <button
                        type="button"
                        className="btn-atrium-outline"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        onClick={() => setEditing(null)}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        className="btn-atrium-primary"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        onClick={handleUpdate}
                        disabled={saving}
                      >
                        <Save size={13} /> Simpan
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-atrium-ghost"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
                        onClick={() => { setEditing({ ...loc }); setGuardWarning(null); }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn-atrium-ghost"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem', color: loc.is_active ? '#d97706' : '#10b981' }}
                        onClick={() => handleToggleActive(loc)}
                      >
                        {loc.is_active ? '⏸ Nonaktifkan' : '▶ Aktifkan'}
                      </button>
                      <button
                        type="button"
                        className="btn-atrium-ghost"
                        style={{ padding: '0.375rem 0.5rem', color: '#e11d48' }}
                        onClick={() => handleDelete(loc)}
                        title="Hapus Lokasi"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
