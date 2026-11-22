import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCog, UserPlus, Edit2, RefreshCw, Shield, AlertCircle,
  Mail, Phone, Clock, Search, Filter, CheckCircle2,
  AlertTriangle, X, Check, ArrowRight
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';

const MOCK_WAREHOUSE_KEEPERS = [
  {
    id: 'mock-wk-001',
    full_name: 'Budi Santoso',
    email: 'budi@vinix7aurum.com',
    role: 'warehouse_keeper',
    employee_id: 'PG-001',
    shift: 'Pagi',
    phone: '081234567891',
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'mock-wk-002',
    full_name: 'Siti Rahma',
    email: 'siti@vinix7aurum.com',
    role: 'warehouse_keeper',
    employee_id: 'PG-002',
    shift: 'Siang',
    phone: '081234567892',
    is_active: true,
    created_at: new Date(Date.now() - 14 * 86400000).toISOString()
  },
  {
    id: 'mock-wk-003',
    full_name: 'Ahmad Fauzi',
    email: 'ahmad@vinix7aurum.com',
    role: 'warehouse_keeper',
    employee_id: 'PG-003',
    shift: 'Malam',
    phone: '081234567893',
    is_active: false,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString()
  }
];

export default function StaffManagement() {
  const { user } = useAuth();
  const toast = useToast();
  const isConfigured = isSupabaseConfigured();

  // State Utama
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State: Invite / Tambah
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    employeeId: '',
    shift: 'Pagi',
    phone: ''
  });
  const [inviteLoading, setInviteLoading] = useState(false);

  // Modal State: Edit
  const [editingStaff, setEditingStaff] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    employeeId: '',
    shift: '',
    phone: ''
  });
  const [editLoading, setEditLoading] = useState(false);

  // Modal State: Konfirmasi Aktif / Nonaktif
  const [confirmToggleStaff, setConfirmToggleStaff] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  /**
   * Mengambil data HANYA untuk role 'warehouse_keeper'.
   * Akun Administrator difilter keluar agar tidak dapat dikelola dari antarmuka ini.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    if (!isConfigured) {
      setStaff(MOCK_WAREHOUSE_KEEPERS);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, employee_id, shift, phone, is_active, created_at, updated_at')
        .eq('role', 'warehouse_keeper')
        .order('full_name', { ascending: true });

      if (fetchErr) throw fetchErr;
      setStaff(data || []);
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memuat daftar penjaga gudang.');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter & Search List
  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (member.full_name && member.full_name.toLowerCase().includes(q)) ||
        (member.email && member.email.toLowerCase().includes(q)) ||
        (member.employee_id && member.employee_id.toLowerCase().includes(q));

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = member.is_active === true;
      if (statusFilter === 'inactive') matchesStatus = member.is_active === false;

      return matchesSearch && matchesStatus;
    });
  }, [staff, searchQuery, statusFilter]);

  const activeCount = useMemo(() => staff.filter(s => s.is_active).length, [staff]);
  const inactiveCount = useMemo(() => staff.filter(s => !s.is_active).length, [staff]);

  // ============================================================
  // HANDLERS: INVITE / CREATE WAREHOUSE KEEPER
  // ============================================================
  const openInviteModal = () => {
    setInviteForm({
      fullName: '',
      email: '',
      employeeId: '',
      shift: 'Pagi',
      phone: ''
    });
    setErrorMessage('');
    setIsInviteModalOpen(true);
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteForm.fullName.trim()) {
      setErrorMessage('Nama lengkap penjaga gudang wajib diisi.');
      return;
    }

    if (!inviteForm.email.trim()) {
      setErrorMessage('Alamat email wajib diisi.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteForm.email.trim())) {
      setErrorMessage('Format alamat email tidak valid.');
      return;
    }

    setInviteLoading(true);
    setErrorMessage('');

    try {
      if (!isConfigured) {
        const newMock = {
          id: 'mock-wk-' + Date.now(),
          full_name: inviteForm.fullName.trim(),
          email: inviteForm.email.trim(),
          role: 'warehouse_keeper',
          employee_id: inviteForm.employeeId.trim() || `PG-${String(staff.length + 1).padStart(3, '0')}`,
          shift: inviteForm.shift || 'Pagi',
          phone: inviteForm.phone.trim(),
          is_active: true,
          created_at: new Date().toISOString()
        };
        setStaff(prev => [newMock, ...prev]);
        setIsInviteModalOpen(false);
        toast.success(`Undangan berhasil dikirim ke ${newMock.email}.`);
        return;
      }

      // Panggil trusted backend Supabase Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('admin-manage-staff', {
        body: {
          action: 'invite_staff',
          email: inviteForm.email.trim(),
          fullName: inviteForm.fullName.trim(),
          employeeId: inviteForm.employeeId.trim(),
          shift: inviteForm.shift,
          phone: inviteForm.phone.trim(),
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (fnError || data?.error) {
        throw new Error(fnError?.message || data?.error || 'Gagal mengirim undangan akun.');
      }

      toast.success(data?.message || `Undangan berhasil dikirim ke ${inviteForm.email}.`);
      setIsInviteModalOpen(false);
      await fetchData();
    } catch (err) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat mengundang akun.');
    } finally {
      setInviteLoading(false);
    }
  };

  // ============================================================
  // HANDLERS: EDIT WAREHOUSE KEEPER
  // ============================================================
  const openEditModal = (member) => {
    // Mencegah modifikasi akun Admin melalui form ini
    if (member.role === 'admin') {
      setErrorMessage('Akun Administrator tidak dapat diedit melalui manajemen penjaga gudang.');
      return;
    }

    setEditingStaff(member);
    setEditForm({
      fullName: member.full_name || '',
      email: member.email || '',
      employeeId: member.employee_id || '',
      shift: member.shift || '',
      phone: member.phone || ''
    });
    setErrorMessage('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;

    if (!editForm.fullName.trim()) {
      setErrorMessage('Nama lengkap tidak boleh kosong.');
      return;
    }

    setEditLoading(true);
    setErrorMessage('');

    try {
      if (!isConfigured) {
        setStaff(prev => prev.map(s => s.id === editingStaff.id ? {
          ...s,
          full_name: editForm.fullName.trim(),
          email: editForm.email.trim(),
          employee_id: editForm.employeeId.trim(),
          shift: editForm.shift,
          phone: editForm.phone.trim()
        } : s));
        setEditingStaff(null);
        toast.success('Data Penjaga Gudang berhasil diperbarui.');
        return;
      }

      let updateSuccess = false;

      // 1. Upayakan update melalui trusted Edge Function
      try {
        const { data, error: fnError } = await supabase.functions.invoke('admin-manage-staff', {
          body: {
            action: 'update_staff',
            targetUserId: editingStaff.id,
            fullName: editForm.fullName.trim(),
            email: editForm.email.trim(),
            employeeId: editForm.employeeId.trim(),
            shift: editForm.shift,
            phone: editForm.phone.trim()
          }
        });

        if (!fnError && !data?.error) {
          updateSuccess = true;
        } else if (fnError && !fnError.message?.includes('Failed to send a request')) {
          throw new Error(fnError.message || data?.error);
        }
      } catch (invokeErr) {
        if (invokeErr.message && !invokeErr.message.includes('Failed to send a request')) {
          throw invokeErr;
        }
      }

      // 2. Direct RLS update fallback (Admin aktif memiliki izin update profil Penjaga Gudang)
      if (!updateSuccess) {
        const { error: directErr } = await supabase
          .from('profiles')
          .update({
            full_name: editForm.fullName.trim(),
            employee_id: editForm.employeeId.trim(),
            shift: editForm.shift,
            phone: editForm.phone.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', editingStaff.id);

        if (directErr) throw directErr;
      }

      toast.success('Data Penjaga Gudang berhasil disimpan.');
      setEditingStaff(null);
      await fetchData();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal memperbarui data penjaga gudang.');
    } finally {
      setEditLoading(false);
    }
  };

  // ============================================================
  // HANDLERS: ACTIVATE / DEACTIVATE CONFIRMATION
  // ============================================================
  const openToggleConfirmModal = (member) => {
    if (member.id === user?.id) {
      setErrorMessage('Anda tidak dapat menonaktifkan akun Administrator Anda sendiri.');
      return;
    }
    if (member.role === 'admin') {
      setErrorMessage('Akun Administrator tidak dapat diubah statusnya melalui antarmuka ini.');
      return;
    }
    setConfirmToggleStaff(member);
    setErrorMessage('');
  };

  const handleToggleActiveConfirm = async () => {
    if (!confirmToggleStaff) return;
    const target = confirmToggleStaff;
    const nextStatus = !target.is_active;

    setToggleLoading(true);
    setErrorMessage('');

    try {
      if (!isConfigured) {
        setStaff(prev => prev.map(s => s.id === target.id ? { ...s, is_active: nextStatus } : s));
        setConfirmToggleStaff(null);
        toast.success(`Akun ${target.full_name} berhasil ${nextStatus ? 'diaktifkan kembali' : 'dinonaktifkan'}.`);
        return;
      }

      let toggleSuccess = false;

      // 1. Coba melalui trusted Edge Function
      try {
        const { data, error: fnError } = await supabase.functions.invoke('admin-manage-staff', {
          body: {
            action: 'toggle_active',
            targetUserId: target.id,
            newStatus: nextStatus
          }
        });

        if (!fnError && !data?.error) {
          toggleSuccess = true;
        } else if (fnError && !fnError.message?.includes('Failed to send a request')) {
          throw new Error(fnError.message || data?.error);
        }
      } catch (invokeErr) {
        if (invokeErr.message && !invokeErr.message.includes('Failed to send a request')) {
          throw invokeErr;
        }
      }

      // 2. Fallback update via Direct RLS
      if (!toggleSuccess) {
        const { error: directErr } = await supabase
          .from('profiles')
          .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', target.id);

        if (directErr) throw directErr;
      }

      toast.success(`Akun ${target.full_name} berhasil ${nextStatus ? 'diaktifkan kembali' : 'dinonaktifkan'}.`);
      setConfirmToggleStaff(null);
      await fetchData();
    } catch (err) {
      setErrorMessage(err.message || 'Gagal mengubah status aktif akun.');
    } finally {
      setToggleLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--color-primary-light, #DBEAFE)', color: 'var(--color-primary, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCog size={20} />
            </div>
            <h1 className="page-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Manajemen Penjaga Gudang</h1>
          </div>
          <p className="page-subtitle" style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Kelola akun, penugasan shift, dan hak akses operasional Penjaga Gudang PT Vinix Seven Aurum.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
            title="Muat ulang data"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Perbarui</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openInviteModal}
          >
            <UserPlus size={16} />
            <span>Undang Penjaga Gudang</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0.25rem' }}
            aria-label="Tutup pesan error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Status Counters & Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCog size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total Penjaga Gudang</span>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{staff.length}</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Akun Aktif</span>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{activeCount}</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#FEE2E2', color: '#B91C1C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Akun Nonaktif</span>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{inactiveCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 280px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Cari berdasarkan nama, email, atau ID karyawan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={15} color="var(--color-text-muted)" />
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Status:</span>
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem', width: 'auto' }}
          >
            <option value="all">Semua Status ({staff.length})</option>
            <option value="active">Hanya Aktif ({activeCount})</option>
            <option value="inactive">Hanya Nonaktif ({inactiveCount})</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Penjaga Gudang</th>
                <th>Role</th>
                <th>ID Karyawan</th>
                <th>Shift Kerja</th>
                <th>No. Telepon</th>
                <th>Status Akun</th>
                <th>Terdaftar</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="spinner spinner-primary" style={{ width: '2rem', height: '2rem' }} />
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0 }}>Memuat daftar penjaga gudang...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--color-bg-subtle, #F3F4F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                        <UserCog size={24} />
                      </div>
                      <h4 style={{ margin: 0, fontWeight: 700 }}>
                        {staff.length === 0 ? 'Belum Ada Penjaga Gudang' : 'Tidak Ditemukan Hasil'}
                      </h4>
                      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem', maxWidth: '380px' }}>
                        {staff.length === 0
                          ? 'Belum ada akun Penjaga Gudang yang terdaftar. Klik tombol di bawah untuk mengundang petugas pertama.'
                          : 'Tidak ada Penjaga Gudang yang sesuai dengan kriteria pencarian atau filter status yang dipilih.'}
                      </p>
                      {staff.length === 0 ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={openInviteModal} style={{ marginTop: '0.5rem' }}>
                          <UserPlus size={15} />
                          <span>Undang Penjaga Gudang</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                          style={{ marginTop: '0.5rem' }}
                        >
                          Reset Pencarian
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: member.is_active ? 'var(--color-primary-light, #DBEAFE)' : '#F3F4F6',
                            color: member.is_active ? 'var(--color-primary, #2563EB)' : '#9CA3AF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            flexShrink: 0
                          }}
                        >
                          {member.full_name?.charAt(0)?.toUpperCase() || 'P'}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, margin: 0, fontSize: '0.875rem', color: member.is_active ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                            {member.full_name}
                          </p>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Mail size={11} />
                            {member.email || '—'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.625rem',
                          borderRadius: '999px',
                          backgroundColor: 'var(--color-primary-light, #DBEAFE)',
                          color: 'var(--color-primary, #2563EB)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <Shield size={11} />
                        Penjaga Gudang
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {member.employee_id ? (
                        <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--color-bg-subtle, #F3F4F6)', border: '1px solid var(--color-border)' }}>
                          {member.employee_id}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      {member.shift ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} color="var(--color-text-muted)" />
                          {member.shift}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {member.phone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Phone size={12} />
                          {member.phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.625rem',
                          borderRadius: '999px',
                          backgroundColor: member.is_active ? '#DCFCE7' : '#FEE2E2',
                          color: member.is_active ? '#15803D' : '#B91C1C',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: member.is_active ? '#16A34A' : '#DC2626' }} />
                        {member.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {formatDate(member.created_at)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditModal(member)}
                          title="Edit Data Penjaga Gudang"
                          style={{ padding: '0.3rem 0.5rem' }}
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className={member.is_active ? 'btn btn-danger btn-sm' : 'btn btn-success btn-sm'}
                          onClick={() => openToggleConfirmModal(member)}
                          title={member.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Kembali Akun'}
                          style={{ padding: '0.3rem 0.5rem' }}
                        >
                          {member.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Note Footer */}
      <div className="alert alert-info" style={{ marginTop: '1.25rem', fontSize: '0.8125rem', display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
        <Shield size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Aturan Keamanan Akun PT Vinix Seven Aurum:</strong> Modul ini secara khusus mengelola akun Penjaga Gudang (<code>warehouse_keeper</code>). Akun Administrator tidak dapat dimanipulasi dari antarmuka ini. Pengundangan dan perubahan status aktif diverifikasi melalui Edge Function terpercaya (<code>admin-manage-staff</code>).
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: UNDANG / TAMBAH PENJAGA GUDANG                      */}
      {/* ============================================================ */}
      {isInviteModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={18} color="var(--color-primary)" />
                <h3 id="invite-modal-title">Undang Penjaga Gudang Baru</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsInviteModalOpen(false)}
                disabled={inviteLoading}
                aria-label="Tutup modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="alert alert-info" style={{ fontSize: '0.8125rem' }}>
                  Undangan aktivasi akan dikirimkan ke email petugas. Peran akun secara otomatis ditetapkan sebagai <strong>Penjaga Gudang</strong>.
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="invite-fullname">
                    Nama Lengkap <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="invite-fullname"
                    type="text"
                    className="form-input"
                    placeholder="cth: Budi Santoso"
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm(p => ({ ...p, fullName: e.target.value }))}
                    disabled={inviteLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="invite-email">
                    Alamat Email <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    className="form-input"
                    placeholder="cth: budi@vinix7aurum.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))}
                    disabled={inviteLoading}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="invite-empid">
                      ID Karyawan / NIK
                    </label>
                    <input
                      id="invite-empid"
                      type="text"
                      className="form-input"
                      placeholder="cth: PG-004"
                      value={inviteForm.employeeId}
                      onChange={(e) => setInviteForm(p => ({ ...p, employeeId: e.target.value }))}
                      disabled={inviteLoading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="invite-shift">
                      Shift Kerja
                    </label>
                    <select
                      id="invite-shift"
                      className="form-input"
                      value={inviteForm.shift}
                      onChange={(e) => setInviteForm(p => ({ ...p, shift: e.target.value }))}
                      disabled={inviteLoading}
                    >
                      <option value="Pagi">Pagi (08:00 - 16:00)</option>
                      <option value="Siang">Siang (13:00 - 21:00)</option>
                      <option value="Malam">Malam (21:00 - 06:00)</option>
                      <option value="Fleksibel">Fleksibel / Sesuai Jadwal</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="invite-phone">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    id="invite-phone"
                    type="tel"
                    className="form-input"
                    placeholder="cth: 08123456789"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm(p => ({ ...p, phone: e.target.value }))}
                    disabled={inviteLoading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role Akun Terdaftar</label>
                  <input
                    type="text"
                    className="form-input"
                    value="Penjaga Gudang (warehouse_keeper) — Terkunci"
                    disabled
                    style={{ backgroundColor: 'var(--color-bg-subtle, #F3F4F6)', color: 'var(--color-text-muted)' }}
                  />
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: 'var(--color-bg-subtle, #FAFAFA)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={inviteLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={inviteLoading}
                >
                  {inviteLoading ? (
                    <>
                      <span className="spinner spinner-primary" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                      <span>Mengirim...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} />
                      <span>Kirim Undangan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: EDIT DATA PENJAGA GUDANG                           */}
      {/* ============================================================ */}
      {editingStaff && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={18} color="var(--color-primary)" />
                <h3 id="edit-modal-title">Edit Data Penjaga Gudang</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditingStaff(null)}
                disabled={editLoading}
                aria-label="Tutup modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-fullname">
                    Nama Lengkap <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="edit-fullname"
                    type="text"
                    className="form-input"
                    value={editForm.fullName}
                    onChange={(e) => setEditForm(p => ({ ...p, fullName: e.target.value }))}
                    disabled={editLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-email">
                    Alamat Email
                  </label>
                  <input
                    id="edit-email"
                    type="email"
                    className="form-input"
                    value={editForm.email}
                    onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                    disabled={editLoading}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Perubahan email akan disinkronkan ke akun autentikasi pengguna.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-empid">
                      ID Karyawan / NIK
                    </label>
                    <input
                      id="edit-empid"
                      type="text"
                      className="form-input"
                      value={editForm.employeeId}
                      onChange={(e) => setEditForm(p => ({ ...p, employeeId: e.target.value }))}
                      disabled={editLoading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-shift">
                      Shift Kerja
                    </label>
                    <select
                      id="edit-shift"
                      className="form-input"
                      value={editForm.shift}
                      onChange={(e) => setEditForm(p => ({ ...p, shift: e.target.value }))}
                      disabled={editLoading}
                    >
                      <option value="">— Belum Ditentukan —</option>
                      <option value="Pagi">Pagi</option>
                      <option value="Siang">Siang</option>
                      <option value="Malam">Malam</option>
                      <option value="Fleksibel">Fleksibel</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-phone">
                    Nomor Telepon
                  </label>
                  <input
                    id="edit-phone"
                    type="tel"
                    className="form-input"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    disabled={editLoading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role Akun</label>
                  <input
                    type="text"
                    className="form-input"
                    value="Penjaga Gudang (warehouse_keeper) — Terkunci"
                    disabled
                    style={{ backgroundColor: 'var(--color-bg-subtle, #F3F4F6)', color: 'var(--color-text-muted)' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Peran akun tidak dapat diubah menjadi Administrator untuk mencegah eskalasi hak istimewa.
                  </span>
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: 'var(--color-bg-subtle, #FAFAFA)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingStaff(null)}
                  disabled={editLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editLoading}
                >
                  {editLoading ? (
                    <>
                      <span className="spinner spinner-primary" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: KONFIRMASI AKTIFKAN / NONAKTIFKAN AKUN             */}
      {/* ============================================================ */}
      {confirmToggleStaff && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="toggle-modal-title">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {confirmToggleStaff.is_active ? (
                  <AlertTriangle size={18} color="#DC2626" />
                ) : (
                  <CheckCircle2 size={18} color="#16A34A" />
                )}
                <h3 id="toggle-modal-title">
                  {confirmToggleStaff.is_active ? 'Nonaktifkan Akun Petugas?' : 'Aktifkan Kembali Akun Petugas?'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirmToggleStaff(null)}
                disabled={toggleLoading}
                aria-label="Tutup modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
                {confirmToggleStaff.is_active ? (
                  <>
                    Anda akan menonaktifkan akun <strong>{confirmToggleStaff.full_name}</strong> ({confirmToggleStaff.email || confirmToggleStaff.employee_id || 'ID: ' + confirmToggleStaff.id.slice(0, 8)}).
                  </>
                ) : (
                  <>
                    Anda akan mengaktifkan kembali akun <strong>{confirmToggleStaff.full_name}</strong> ({confirmToggleStaff.email || confirmToggleStaff.employee_id || 'ID: ' + confirmToggleStaff.id.slice(0, 8)}).
                  </>
                )}
              </p>

              {confirmToggleStaff.is_active ? (
                <div className="alert alert-danger" style={{ fontSize: '0.8125rem' }}>
                  <strong>Dampak Penonaktifan:</strong> Petugas ini akan langsung terblokir dari login dan tidak dapat memproses transaksi inventaris atau peminjaman barang hingga diaktifkan kembali.
                </div>
              ) : (
                <div className="alert alert-success" style={{ fontSize: '0.8125rem' }}>
                  <strong>Dampak Pengaktifan:</strong> Petugas akan kembali memiliki izin penuh untuk masuk dan mengakses fitur operasional gudang.
                </div>
              )}
            </div>

            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: 'var(--color-bg-subtle, #FAFAFA)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmToggleStaff(null)}
                disabled={toggleLoading}
              >
                Batal
              </button>
              <button
                type="button"
                className={confirmToggleStaff.is_active ? 'btn btn-danger' : 'btn btn-success'}
                onClick={handleToggleActiveConfirm}
                disabled={toggleLoading}
              >
                {toggleLoading ? (
                  <>
                    <span className="spinner spinner-primary" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                    <span>Memproses...</span>
                  </>
                ) : confirmToggleStaff.is_active ? (
                  'Ya, Nonaktifkan Akun'
                ) : (
                  'Ya, Aktifkan Akun'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
