import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Search, Edit2, Trash2, Save, X, RefreshCw,
  AlertCircle, CheckCircle2, ShieldAlert, Phone, Building,
  CreditCard, FileText, Check, Power
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function BorrowerList() {
  const { isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [borrowers, setBorrowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guardWarning, setGuardWarning] = useState(null);

  // Form modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    employee_id: '',
    department: '',
    phone: '',
    notes: '',
    is_active: true
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchBorrowers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        setBorrowers([]);
        return;
      }

      // Fetch all borrowers
      const { data: bList, error: bErr } = await supabase
        .from('borrowers')
        .select('*')
        .order('full_name');

      if (bErr) throw bErr;

      // Count active and historical borrowings for each borrower
      const { data: bTx, error: txErr } = await supabase
        .from('borrowings')
        .select('borrower_id, status');

      if (txErr) {
        console.warn('Could not aggregate borrowing counts:', txErr.message);
      }

      const txCountMap = {};
      const activeCountMap = {};
      if (bTx) {
        bTx.forEach(tx => {
          if (tx.borrower_id) {
            txCountMap[tx.borrower_id] = (txCountMap[tx.borrower_id] || 0) + 1;
            if (['borrowed', 'partial_returned', 'overdue'].includes(tx.status)) {
              activeCountMap[tx.borrower_id] = (activeCountMap[tx.borrower_id] || 0) + 1;
            }
          }
        });
      }

      const merged = (bList || []).map(b => ({
        ...b,
        total_borrowings: txCountMap[b.id] || 0,
        active_borrowings: activeCountMap[b.id] || 0
      }));

      setBorrowers(merged);
    } catch (err) {
      console.error('Error fetching borrowers:', err);
      setError('Gagal memuat direktori peminjam: ' + (err.message || 'Kesalahan jaringan'));
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchBorrowers();
  }, [fetchBorrowers]);

  // Departments list for filter
  const departments = Array.from(new Set(borrowers.map(b => b.department).filter(Boolean))).sort();

  // Validate form
  const validateForm = () => {
    const errs = {};
    if (!formData.full_name.trim()) errs.full_name = 'Nama lengkap karyawan wajib diisi.';
    if (!formData.department.trim()) errs.department = 'Departemen / divisi wajib diisi.';

    // Check duplicate employee_id locally
    if (formData.employee_id.trim()) {
      const existing = borrowers.find(b =>
        b.employee_id &&
        b.employee_id.trim().toLowerCase() === formData.employee_id.trim().toLowerCase() &&
        b.id !== editingId
      );
      if (existing) {
        errs.employee_id = `Nomor identitas "${formData.employee_id}" telah digunakan oleh ${existing.full_name}.`;
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData({
      full_name: '',
      employee_id: '',
      department: '',
      phone: '',
      notes: '',
      is_active: true
    });
    setFormErrors({});
    setError('');
    setShowModal(true);
  };

  const openEditModal = (b) => {
    setModalMode('edit');
    setEditingId(b.id);
    setFormData({
      full_name: b.full_name || '',
      employee_id: b.employee_id || '',
      department: b.department || '',
      phone: b.phone || '',
      notes: b.notes || '',
      is_active: b.is_active !== false
    });
    setFormErrors({});
    setError('');
    setShowModal(true);
  };

  const handleSaveBorrower = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        full_name: formData.full_name.trim(),
        employee_id: formData.employee_id.trim(),
        department: formData.department.trim(),
        phone: formData.phone.trim(),
        notes: formData.notes.trim(),
        is_active: formData.is_active
      };

      if (!isConfigured) {
        if (modalMode === 'create') {
          const dummy = { id: 'brw-' + Date.now(), ...payload, total_borrowings: 0, active_borrowings: 0 };
          setBorrowers(prev => [dummy, ...prev]);
          setSuccess(`Peminjam "${payload.full_name}" berhasil didaftarkan (mode lokal).`);
        } else {
          setBorrowers(prev => prev.map(b => b.id === editingId ? { ...b, ...payload } : b));
          setSuccess(`Data peminjam "${payload.full_name}" berhasil diperbarui.`);
        }
        setShowModal(false);
        return;
      }

      if (modalMode === 'create') {
        const { data, error: insertErr } = await supabase
          .from('borrowers')
          .insert(payload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        setSuccess(`Peminjam "${data?.full_name || payload.full_name}" berhasil didaftarkan.`);
      } else {
        const { error: updateErr } = await supabase
          .from('borrowers')
          .update(payload)
          .eq('id', editingId);

        if (updateErr) throw updateErr;
        setSuccess(`Data peminjam "${payload.full_name}" berhasil diperbarui.`);
      }

      setShowModal(false);
      fetchBorrowers();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan data peminjam.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (b) => {
    setError('');
    try {
      const nextActive = !b.is_active;

      if (!isConfigured) {
        setBorrowers(prev => prev.map(item => item.id === b.id ? { ...item, is_active: nextActive } : item));
        return;
      }

      const { error: updErr } = await supabase
        .from('borrowers')
        .update({ is_active: nextActive })
        .eq('id', b.id);

      if (updErr) throw updErr;

      setSuccess(`Status peminjam "${b.full_name}" diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`);
      fetchBorrowers();
    } catch (err) {
      setError(err.message || 'Gagal mengubah status peminjam.');
    }
  };

  const handleDelete = async (b) => {
    setError('');
    setGuardWarning(null);

    // Strict guard: Cannot delete if borrower has historical borrowings
    if ((b.total_borrowings || 0) > 0) {
      setGuardWarning({
        id: b.id,
        name: b.full_name,
        count: b.total_borrowings,
        activeCount: b.active_borrowings
      });
      return;
    }

    if (!window.confirm(`Hapus permanen karyawan "${b.full_name}" dari direktori? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    try {
      if (!isConfigured) {
        setBorrowers(prev => prev.filter(item => item.id !== b.id));
        setSuccess(`Peminjam "${b.full_name}" dihapus.`);
        return;
      }

      const { error: delErr } = await supabase
        .from('borrowers')
        .delete()
        .eq('id', b.id);

      if (delErr) throw delErr;

      setSuccess(`Peminjam "${b.full_name}" berhasil dihapus.`);
      fetchBorrowers();
    } catch (err) {
      setError('Gagal menghapus peminjam: ' + (err.message || 'Peminjam terikat dengan entitas lain.'));
    }
  };

  // Filter and search
  const filteredBorrowers = borrowers.filter(b => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      (b.full_name && b.full_name.toLowerCase().includes(q)) ||
      (b.employee_id && b.employee_id.toLowerCase().includes(q)) ||
      (b.department && b.department.toLowerCase().includes(q)) ||
      (b.phone && b.phone.toLowerCase().includes(q));

    const matchDept = departmentFilter === 'all' || b.department === departmentFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && b.is_active) ||
      (statusFilter === 'inactive' && !b.is_active);

    return matchSearch && matchDept && matchStatus;
  });

  const totalActive = borrowers.filter(b => b.is_active).length;
  const totalWithActiveLoans = borrowers.filter(b => (b.active_borrowings || 0) > 0).length;

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} color="#0f172a" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Direktori Peminjam</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Daftar karyawan dan personel berwenang meminjam aset PT Vinix Seven Aurum.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchBorrowers}
              disabled={loading}
              title="Segarkan data"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={openCreateModal}
            >
              <UserPlus size={16} />
              Daftar Peminjam Baru
            </button>
          </div>
        </div>

        {/* Mini KPI Chips */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Terdaftar</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{borrowers.length} orang</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Status Aktif</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{totalActive} orang</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sedang Meminjam Aset</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>{totalWithActiveLoans} orang</div>
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
              Pencegahan Hapus: Peminjam Memiliki Riwayat Transaksi
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f', lineHeight: 1.5 }}>
              Karyawan <strong>"{guardWarning.name}"</strong> tidak dapat dihapus permanen karena memiliki <strong>{guardWarning.count} riwayat transaksi peminjaman</strong> (termasuk {guardWarning.activeCount} transaksi aktif). Untuk menjaga jejak audit dan konsistensi data buku besar, gunakan opsi <strong>Nonaktifkan Akun</strong>.
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-atrium-outline"
                style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                onClick={() => {
                  const target = borrowers.find(b => b.id === guardWarning.id);
                  if (target) handleToggleActive(target);
                  setGuardWarning(null);
                }}
              >
                Nonaktifkan Peminjam Ini
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

      {/* Filters Bar */}
      <div className="atrium-glass-card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Input */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="atrium-input"
              style={{ width: '100%', paddingLeft: '2.25rem' }}
              placeholder="Cari nama, NIK/NIP, departemen, atau no. telepon..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Department Filter */}
          <div style={{ flex: '0 0 200px' }}>
            <CustomSelect
              className="atrium-input"
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              ariaLabel="Filter Departemen"
            >
              <option value="all">Semua Departemen</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </CustomSelect>
          </div>

          {/* Status Filter */}
          <div style={{ flex: '0 0 160px' }}>
            <CustomSelect
              className="atrium-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              ariaLabel="Filter Status"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </CustomSelect>
          </div>
        </div>
      </div>

      {/* Borrowers Table */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a' }}>
            Daftar Karyawan Terdaftar
          </div>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Menampilkan {filteredBorrowers.length} dari {borrowers.length} personel
          </span>
        </div>

        <div className="table-wrapper" style={{ margin: 0, overflowX: 'auto' }}>
          <table className="atrium-inventory-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th>Nama Karyawan</th>
                <th>NIK / ID Karyawan</th>
                <th>Departemen / Divisi</th>
                <th>Kontak</th>
                <th style={{ textAlign: 'center' }}>Status Pinjaman</th>
                <th style={{ textAlign: 'center' }}>Status Akun</th>
                <th style={{ textAlign: 'right', width: '130px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat direktori peminjam...</div>
                  </td>
                </tr>
              ) : filteredBorrowers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <Users size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {searchTerm || departmentFilter !== 'all' || statusFilter !== 'all'
                        ? 'Tidak ada peminjam yang sesuai kriteria pencarian'
                        : 'Belum ada data peminjam'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      Klik "Daftar Peminjam Baru" untuk menambahkan karyawan.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBorrowers.map((b, idx) => {
                  const hasActive = (b.active_borrowings || 0) > 0;
                  return (
                    <tr key={b.id}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                        {idx + 1}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: b.is_active ? 'rgba(37, 99, 235, 0.1)' : '#f1f5f9',
                            color: b.is_active ? '#2563eb' : '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.875rem'
                          }}>
                            {b.full_name ? b.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9375rem', display: 'block' }}>
                              {b.full_name}
                            </span>
                            {b.notes && (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                {b.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        {b.employee_id ? (
                          <span className="atrium-tag-mono" style={{ fontSize: '0.8125rem' }}>
                            {b.employee_id}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>—</span>
                        )}
                      </td>

                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: '#475569', fontSize: '0.875rem' }}>
                          <Building size={14} color="#64748b" />
                          {b.department || '—'}
                        </span>
                      </td>

                      <td>
                        {b.phone ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: '#475569', fontSize: '0.8125rem' }}>
                            <Phone size={13} color="#64748b" />
                            {b.phone}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {hasActive ? (
                          <span className="atrium-subtle-badge badge-status-borrowed">
                            {b.active_borrowings} Pinjaman Aktif
                          </span>
                        ) : (
                          <span className="atrium-subtle-badge badge-neutral" style={{ fontSize: '0.6875rem' }}>
                            {b.total_borrowings || 0} Riwayat
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <span className={`atrium-subtle-badge ${b.is_active ? 'badge-available' : 'badge-inactive'}`}>
                          {b.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                          <button
                            type="button"
                            className="btn-atrium-ghost"
                            style={{ padding: '0.375rem 0.5rem' }}
                            onClick={() => openEditModal(b)}
                            title="Edit Data Peminjam"
                          >
                            <Edit2 size={14} color="#475569" />
                          </button>
                          <button
                            type="button"
                            className="btn-atrium-ghost"
                            style={{ padding: '0.375rem 0.5rem', color: b.is_active ? '#d97706' : '#10b981' }}
                            onClick={() => handleToggleActive(b)}
                            title={b.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                          >
                            <Power size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-atrium-ghost"
                              style={{ padding: '0.375rem 0.5rem', color: '#e11d48' }}
                              onClick={() => handleDelete(b)}
                              title="Hapus Peminjam"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal for Create & Edit */}
      {showModal && (
        <div className="atrium-receipt-modal-backdrop">
          <div className="atrium-receipt-card" style={{ maxWidth: '540px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {modalMode === 'create' ? <UserPlus size={18} /> : <Edit2 size={18} />}
                {modalMode === 'create' ? 'Daftar Peminjam Baru' : 'Edit Data Peminjam'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBorrower} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Full Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                    Nama Lengkap Karyawan <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="atrium-input"
                    style={{ width: '100%' }}
                    placeholder="cth: Rian Prasetya"
                    value={formData.full_name}
                    onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                    autoFocus
                  />
                  {formErrors.full_name && (
                    <span style={{ fontSize: '0.75rem', color: '#e11d48', marginTop: '0.25rem', display: 'block' }}>
                      {formErrors.full_name}
                    </span>
                  )}
                </div>

                {/* Employee ID & Department */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                      NIK / ID Karyawan
                    </label>
                    <input
                      type="text"
                      className="atrium-input"
                      style={{ width: '100%' }}
                      placeholder="cth: EMP-2024-001"
                      value={formData.employee_id}
                      onChange={e => setFormData(p => ({ ...p, employee_id: e.target.value }))}
                    />
                    {formErrors.employee_id && (
                      <span style={{ fontSize: '0.75rem', color: '#e11d48', marginTop: '0.25rem', display: 'block' }}>
                        {formErrors.employee_id}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                      Departemen / Divisi <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="atrium-input"
                      style={{ width: '100%' }}
                      placeholder="cth: Multimedia / IT"
                      value={formData.department}
                      onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                    />
                    {formErrors.department && (
                      <span style={{ fontSize: '0.75rem', color: '#e11d48', marginTop: '0.25rem', display: 'block' }}>
                        {formErrors.department}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    className="atrium-input"
                    style={{ width: '100%' }}
                    placeholder="cth: 081234567890"
                    value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                    Catatan / Jabatan (Opsional)
                  </label>
                  <input
                    type="text"
                    className="atrium-input"
                    style={{ width: '100%' }}
                    placeholder="cth: Lead Videographer"
                    value={formData.notes}
                    onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                {/* Active Checkbox */}
                <div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600, color: '#334155' }}>Status Aktif</span>
                  </label>
                  <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                    Peminjam nonaktif tidak dapat dipilih saat pembuatan tiket peminjaman baru.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setShowModal(false)}
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
                  Simpan Peminjam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
