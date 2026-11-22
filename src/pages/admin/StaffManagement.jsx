import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCog, UserPlus, Edit2, RefreshCw, Shield, AlertCircle,
  Mail, Phone, Clock, Search, Filter, CheckCircle2,
  AlertTriangle, X, Check, ArrowRight, UserCheck, UserX,
  ShieldCheck, Users
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import CustomSelect from '../../components/common/CustomSelect';

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
  const [shiftFilter, setShiftFilter] = useState('all');

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

      let matchesShift = true;
      if (shiftFilter !== 'all') matchesShift = member.shift === shiftFilter;

      return matchesSearch && matchesStatus && matchesShift;
    });
  }, [staff, searchQuery, statusFilter, shiftFilter]);

  const activeCount = useMemo(() => staff.filter(s => s.is_active).length, [staff]);
  const inactiveCount = useMemo(() => staff.filter(s => !s.is_active).length, [staff]);

  const shiftCounts = useMemo(() => {
    return {
      pagi: staff.filter(s => s.shift === 'Pagi').length,
      siang: staff.filter(s => s.shift === 'Siang').length,
      malam: staff.filter(s => s.shift === 'Malam').length,
      fleksibel: staff.filter(s => !s.shift || s.shift === 'Fleksibel').length
    };
  }, [staff]);

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
    <div className="atrium-content-container">
      {/* Top Banner (Atrium Header Card) */}
      <div className="atrium-glass-card atrium-banner-card no-print" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.08)', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCog size={20} />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Manajemen Petugas Gudang</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0 }}>
              Pusat kendali akun operasional, penugasan shift kerja, dan pemantauan hak akses Penjaga Gudang PT Vinix Seven Aurum.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={fetchData}
              disabled={loading}
              title="Segarkan data petugas"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Segarkan
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={openInviteModal}
            >
              <UserPlus size={16} />
              Undang Petugas Gudang
            </button>
          </div>
        </div>

        {/* Mini KPI Chips Row */}
        <div style={{ display: 'flex', gap: '1.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Petugas</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{staff.length} orang</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Akun Aktif Operasional</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{activeCount} aktif</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Akun Ditangguhkan</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: inactiveCount > 0 ? '#dc2626' : '#64748b' }}>
              {inactiveCount} nonaktif
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sebaran Shift</span>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#2563eb', marginTop: '0.2rem' }}>
              Pagi ({shiftCounts.pagi}) • Siang ({shiftCounts.siang}) • Malam ({shiftCounts.malam})
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              fontSize: '0.75rem',
              fontWeight: 700,
              border: '1px solid #BFDBFE'
            }}>
              <ShieldCheck size={14} />
              Otoritas Level Administrator
            </span>
          </div>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="atrium-error-card no-print" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={18} color="#e11d48" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
            aria-label="Tutup pesan error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar Card */}
      <div className="atrium-glass-card no-print" style={{ padding: '0.875rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="atrium-input"
              placeholder="Cari berdasarkan nama, email, atau ID karyawan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.35rem' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                aria-label="Hapus kata kunci pencarian"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Shift Filter Dropdown */}
          <div style={{ flex: '0 0 180px' }}>
            <CustomSelect
              className="atrium-input"
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              ariaLabel="Filter Shift Kerja"
            >
              <option value="all">Semua Shift</option>
              <option value="Pagi">Shift Pagi</option>
              <option value="Siang">Shift Siang</option>
              <option value="Malam">Shift Malam</option>
              <option value="Fleksibel">Shift Fleksibel</option>
            </CustomSelect>
          </div>

          {/* Status Filter Dropdown */}
          <div style={{ flex: '0 0 180px' }}>
            <CustomSelect
              className="atrium-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              ariaLabel="Filter Status Akun"
            >
              <option value="all">Semua Status ({staff.length})</option>
              <option value="active">Hanya Aktif ({activeCount})</option>
              <option value="inactive">Hanya Nonaktif ({inactiveCount})</option>
            </CustomSelect>
          </div>

          {/* Reset Button */}
          {(searchQuery || shiftFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              className="btn-atrium-ghost btn-atrium-sm"
              onClick={() => { setSearchQuery(''); setShiftFilter('all'); setStatusFilter('all'); }}
              title="Reset semua filter pencarian"
            >
              <X size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper" style={{ margin: 0 }}>
          <table className="atrium-inventory-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th>Petugas Gudang</th>
                <th>Peran & Otoritas</th>
                <th>ID Karyawan</th>
                <th>Shift Kerja</th>
                <th>No. Telepon / WhatsApp</th>
                <th style={{ textAlign: 'center' }}>Status Akun</th>
                <th>Terdaftar</th>
                <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Aksi Administrator</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="spinner spinner-primary" style={{ width: '2rem', height: '2rem' }} />
                      <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Menyiapkan direktori petugas gudang...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <UserCog size={26} />
                      </div>
                      <h4 style={{ margin: 0, fontWeight: 700, color: '#0F172A' }}>
                        {staff.length === 0 ? 'Belum Ada Penjaga Gudang Terdaftar' : 'Tidak Ditemukan Hasil'}
                      </h4>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', maxWidth: '420px', lineHeight: 1.5 }}>
                        {staff.length === 0
                          ? 'Belum ada akun Penjaga Gudang yang terdaftar. Klik tombol di bawah untuk mengundang petugas pertama ke sistem gudang.'
                          : 'Tidak ada data Penjaga Gudang yang cocok dengan kriteria kata kunci pencarian, filter shift, atau status yang dipilih.'}
                      </p>
                      {staff.length === 0 ? (
                        <button type="button" className="btn-atrium-primary btn-atrium-sm" onClick={openInviteModal} style={{ marginTop: '0.5rem' }}>
                          <UserPlus size={15} />
                          <span>Undang Petugas Pertama</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-atrium-outline btn-atrium-sm"
                          onClick={() => { setSearchQuery(''); setShiftFilter('all'); setStatusFilter('all'); }}
                          style={{ marginTop: '0.5rem' }}
                        >
                          Reset Pencarian
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member, idx) => (
                  <tr key={member.id}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                      {idx + 1}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            backgroundColor: member.is_active ? 'var(--color-primary-light, #DBEAFE)' : '#F1F5F9',
                            color: member.is_active ? 'var(--color-primary, #2563EB)' : '#94A3B8',
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
                          <p style={{ fontWeight: 700, margin: 0, fontSize: '0.875rem', color: member.is_active ? '#0F172A' : '#64748B' }}>
                            {member.full_name}
                          </p>
                          <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Mail size={12} />
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
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <Shield size={12} />
                        Penjaga Gudang
                      </span>
                    </td>
                    <td>
                      {member.employee_id ? (
                        <span className="atrium-tag-mono" style={{ fontSize: '0.75rem' }}>
                          {member.employee_id}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: '#334155', fontWeight: 500 }}>
                        <Clock size={13} color="#64748b" />
                        {member.shift || 'Fleksibel'}
                      </span>
                    </td>
                    <td>
                      {member.phone ? (
                        <a
                          href={`tel:${member.phone}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}
                          title="Hubungi Petugas"
                        >
                          <Phone size={13} />
                          {member.phone}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`atrium-pill ${member.is_active ? 'atrium-pill-available' : 'atrium-pill-inactive'}`}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: member.is_active ? '#16A34A' : '#DC2626' }} />
                        {member.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      {formatDate(member.created_at)}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-atrium-outline btn-atrium-sm"
                          onClick={() => openEditModal(member)}
                          title="Edit Data & Shift Petugas"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className={member.is_active ? 'btn-atrium-danger btn-atrium-sm' : 'btn-atrium-outline btn-atrium-sm'}
                          style={!member.is_active ? { color: '#15803D', borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' } : {}}
                          onClick={() => openToggleConfirmModal(member)}
                          title={member.is_active ? 'Nonaktifkan Akses Petugas' : 'Pulihkan Akses Petugas'}
                        >
                          {member.is_active ? (
                            <>
                              <UserX size={13} />
                              <span>Nonaktifkan</span>
                            </>
                          ) : (
                            <>
                              <UserCheck size={13} />
                              <span>Aktifkan</span>
                            </>
                          )}
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

      {/* Security Authority Context Alert */}
      <div className="atrium-glass-card" style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', borderLeft: '4px solid #2563EB', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <ShieldCheck size={20} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: 1.5 }}>
          <strong style={{ color: '#0F172A', display: 'block', marginBottom: '0.25rem' }}>
            Protokol Otoritas Administrator & Keamanan Akun (PT Vinix Seven Aurum)
          </strong>
          Modul ini khusus memfasilitasi administrasi akun Penjaga Gudang (<code>warehouse_keeper</code>). Akun dengan peran Administrator memiliki kontrol penuh untuk mengundang, memperbarui data tugas/shift, serta membekukan status aktif akun sewaktu-waktu. Penonaktifan akun akan seketika mencabut hak akses login petugas ke sistem gudang.
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: UNDANG / TAMBAH PENJAGA GUDANG                      */}
      {/* ============================================================ */}
      {isInviteModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
          <div className="modal-content" style={{ maxWidth: '520px', borderRadius: '20px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={18} color="#2563EB" />
                <h3 id="invite-modal-title" style={{ margin: 0, fontWeight: 700 }}>Undang Petugas Gudang Baru</h3>
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
                <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '12px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                  <span>Undangan aktivasi akan dikirimkan ke email petugas. Peran akun otomatis ditetapkan sebagai <strong>Penjaga Gudang</strong>.</span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="invite-fullname">
                    Nama Lengkap <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    id="invite-fullname"
                    type="text"
                    className="atrium-input"
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
                    className="atrium-input"
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
                      className="atrium-input"
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
                      className="atrium-input"
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
                    className="atrium-input"
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
                    className="atrium-input"
                    value="Penjaga Gudang (warehouse_keeper) — Terkunci"
                    disabled
                    style={{ backgroundColor: '#F1F5F9', color: '#64748b' }}
                  />
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: '#FAF9FB', borderRadius: '0 0 20px 20px' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={inviteLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-atrium-primary"
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
          <div className="modal-content" style={{ maxWidth: '520px', borderRadius: '20px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={18} color="#2563EB" />
                <h3 id="edit-modal-title" style={{ margin: 0, fontWeight: 700 }}>Edit Data Petugas Gudang</h3>
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
                    className="atrium-input"
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
                    className="atrium-input"
                    value={editForm.email}
                    onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                    disabled={editLoading}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
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
                      className="atrium-input"
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
                      className="atrium-input"
                      value={editForm.shift}
                      onChange={(e) => setEditForm(p => ({ ...p, shift: e.target.value }))}
                      disabled={editLoading}
                    >
                      <option value="">— Belum Ditentukan —</option>
                      <option value="Pagi">Pagi (08:00 - 16:00)</option>
                      <option value="Siang">Siang (13:00 - 21:00)</option>
                      <option value="Malam">Malam (21:00 - 06:00)</option>
                      <option value="Fleksibel">Fleksibel</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-phone">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    id="edit-phone"
                    type="tel"
                    className="atrium-input"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    disabled={editLoading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role Akun Terdaftar</label>
                  <input
                    type="text"
                    className="atrium-input"
                    value="Penjaga Gudang (warehouse_keeper) — Terkunci"
                    disabled
                    style={{ backgroundColor: '#F1F5F9', color: '#64748b' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                    Peran akun tidak dapat diubah menjadi Administrator untuk mencegah eskalasi hak istimewa.
                  </span>
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: '#FAF9FB', borderRadius: '0 0 20px 20px' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => setEditingStaff(null)}
                  disabled={editLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-atrium-primary"
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
          <div className="modal-content" style={{ maxWidth: '460px', borderRadius: '20px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {confirmToggleStaff.is_active ? (
                  <AlertTriangle size={18} color="#DC2626" />
                ) : (
                  <CheckCircle2 size={18} color="#16A34A" />
                )}
                <h3 id="toggle-modal-title" style={{ margin: 0, fontWeight: 700 }}>
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
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#991B1B', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Dampak Penonaktifan:</strong> Petugas ini akan langsung terblokir dari login dan tidak dapat memproses transaksi inventaris atau peminjaman barang hingga diaktifkan kembali oleh Administrator.
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Dampak Pengaktifan:</strong> Petugas akan kembali memiliki izin operasional penuh untuk masuk dan mengakses modul gudang yang ditugaskan.
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', backgroundColor: '#FAF9FB', borderRadius: '0 0 20px 20px' }}>
              <button
                type="button"
                className="btn-atrium-outline"
                onClick={() => setConfirmToggleStaff(null)}
                disabled={toggleLoading}
              >
                Batal
              </button>
              <button
                type="button"
                className={confirmToggleStaff.is_active ? 'btn-atrium-danger' : 'btn-atrium-primary'}
                style={!confirmToggleStaff.is_active ? { backgroundColor: '#15803D', borderColor: '#15803D' } : {}}
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
