import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, ArrowLeft, Plus, Trash2, Calendar, User, FileText,
  Boxes, AlertCircle, CheckCircle2, ShieldCheck, Tag, MapPin, Hash, Sparkles
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function CreateBorrowing() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [borrowers, setBorrowers] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);

  // Form state
  const [selectedBorrowerId, setSelectedBorrowerId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [notes, setNotes] = useState('');

  // Selected line items: [{ item_id, item, quantity, condition }]
  const [selectedLines, setSelectedLines] = useState([]);

  // Add Item Picker State
  const [itemPickerId, setItemPickerId] = useState('');
  const [itemPickerQty, setItemPickerQty] = useState(1);
  const [itemPickerCondition, setItemPickerCondition] = useState('baik');
  const [pickerSearch, setPickerSearch] = useState('');

  // Submitting & status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Default expected return date: tomorrow at 17:00
  useEffect(() => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(17, 0, 0, 0);
    // Format YYYY-MM-DDTHH:mm
    const tzOffset = tmrw.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(tmrw - tzOffset)).toISOString().slice(0, 16);
    setExpectedReturnAt(localISOTime);
  }, []);

  const loadData = useCallback(async () => {
    setLoadingInitial(true);
    setError('');
    try {
      if (!isConfigured) {
        setBorrowers([
          { id: 'b1', full_name: 'Budi Santoso', employee_id: 'EMP-001', department: 'IT Operations', is_active: true },
          { id: 'b2', full_name: 'Rian Prasetya', employee_id: 'EMP-002', department: 'Multimedia & Kreatif', is_active: true }
        ]);
        setAvailableItems([
          { id: 'i1', item_code: 'ITM-LP01', name: 'MacBook Pro 14" M3', tracking_type: 'individual', asset_serial: 'VNX-MBP-01', available_qty: 1, total_qty: 1, condition: 'baik', is_active: true },
          { id: 'i2', item_code: 'ITM-KB01', name: 'Kabel HDMI 2.0 2m', tracking_type: 'quantity', asset_serial: '', available_qty: 15, total_qty: 20, condition: 'baik', is_active: true }
        ]);
        return;
      }

      // Fetch active borrowers
      const { data: bList, error: bErr } = await supabase
        .from('borrowers')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (bErr) throw bErr;
      setBorrowers(bList || []);

      // Fetch available inventory items with categories and locations
      const { data: iList, error: iErr } = await supabase
        .from('items')
        .select(`
          id, item_code, name, description, tracking_type,
          asset_serial, available_qty, total_qty, condition, status, is_active,
          item_categories (id, name),
          storage_locations (id, code, name)
        `)
        .eq('is_active', true)
        .gt('available_qty', 0)
        .order('name');

      if (iErr) throw iErr;
      setAvailableItems(iList || []);
    } catch (err) {
      console.error('Error loading borrowing form dependencies:', err);
      setError('Gagal memuat data formulir: ' + (err.message || 'Kesalahan koneksi'));
    } finally {
      setLoadingInitial(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected borrower object
  const selectedBorrower = borrowers.find(b => b.id === selectedBorrowerId);

  // Add line item handler
  const handleAddLineItem = () => {
    setError('');
    if (!itemPickerId) {
      setError('Pilih barang inventaris terlebih dahulu.');
      return;
    }

    const item = availableItems.find(it => it.id === itemPickerId);
    if (!item) {
      setError('Barang inventaris tidak ditemukan.');
      return;
    }

    // Check if already in list
    const existingIndex = selectedLines.findIndex(l => l.item_id === item.id);

    if (item.tracking_type === 'individual') {
      if (existingIndex >= 0) {
        setError(`Aset individual "${item.name}" (${item.asset_serial}) sudah ada dalam daftar.`);
        return;
      }
      setSelectedLines(prev => [
        ...prev,
        {
          item_id: item.id,
          item,
          quantity: 1,
          condition: itemPickerCondition || item.condition || 'baik'
        }
      ]);
    } else {
      // Quantity tracking
      const qty = parseInt(itemPickerQty, 10);
      if (isNaN(qty) || qty <= 0) {
        setError('Kuantitas peminjaman harus lebih besar dari 0.');
        return;
      }

      if (existingIndex >= 0) {
        const nextQty = selectedLines[existingIndex].quantity + qty;
        if (nextQty > item.available_qty) {
          setError(`Total kuantitas "${item.name}" (${nextQty}) melebihi stok tersedia (${item.available_qty}).`);
          return;
        }
        setSelectedLines(prev => prev.map((l, idx) => idx === existingIndex ? { ...l, quantity: nextQty } : l));
      } else {
        if (qty > item.available_qty) {
          setError(`Kuantitas diminta (${qty}) melebihi stok tersedia (${item.available_qty}).`);
          return;
        }
        setSelectedLines(prev => [
          ...prev,
          {
            item_id: item.id,
            item,
            quantity: qty,
            condition: itemPickerCondition || item.condition || 'baik'
          }
        ]);
      }
    }

    // Reset picker
    setItemPickerId('');
    setItemPickerQty(1);
    setItemPickerCondition('baik');
  };

  const handleRemoveLineItem = (index) => {
    setSelectedLines(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateLineQty = (index, newQty) => {
    const qty = parseInt(newQty, 10);
    const line = selectedLines[index];
    if (!line) return;

    if (line.item.tracking_type === 'individual') return; // strictly 1

    if (isNaN(qty) || qty <= 0) return;
    if (qty > line.item.available_qty) {
      setError(`Kuantitas maksimal "${line.item.name}" adalah ${line.item.available_qty} unit.`);
      return;
    }

    setError('');
    setSelectedLines(prev => prev.map((l, idx) => idx === index ? { ...l, quantity: qty } : l));
  };

  // Submit borrowing
  const handleSubmitBorrowing = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!selectedBorrowerId) {
      setError('Peminjam wajib dipilih dari direktori.');
      return;
    }
    if (!purpose.trim()) {
      setError('Keperluan peminjaman wajib diisi.');
      return;
    }
    if (!expectedReturnAt) {
      setError('Waktu perkiraan kembali wajib ditentukan.');
      return;
    }

    const expDate = new Date(expectedReturnAt);
    if (isNaN(expDate.getTime()) || expDate <= new Date()) {
      setError('Waktu perkiraan kembali harus lebih besar dari waktu saat ini.');
      return;
    }

    if (selectedLines.length === 0) {
      setError('Minimal satu barang harus disertakan dalam transaksi peminjaman.');
      return;
    }

    // Construct JSON items payload for RPC
    const itemsPayload = selectedLines.map(l => ({
      item_id: l.item_id,
      quantity: l.quantity,
      condition: l.condition
    }));

    setSubmitting(true);
    try {
      if (!isConfigured) {
        // Mock success for local demo
        const mockCode = 'BRW-' + Date.now().toString().slice(-8);
        setSuccess(`Peminjaman berhasil dicatat dengan kode transaksi ${mockCode} (mode lokal).`);
        setTimeout(() => navigate('/peminjaman'), 1000);
        return;
      }

      // Execute secure atomic RPC
      const { data, error: rpcErr } = await supabase.rpc('rpc_create_borrowing', {
        p_borrower_id: selectedBorrowerId,
        p_purpose: purpose.trim(),
        p_expected_return_at: expDate.toISOString(),
        p_notes: notes.trim(),
        p_items: itemsPayload
      });

      if (rpcErr) throw rpcErr;

      const code = data?.transaction_code || 'sukses';
      setSuccess(`Transaksi peminjaman #${code} berhasil dicatat.`);
      setTimeout(() => {
        if (data?.borrowing_id) {
          navigate(`/peminjaman/${data.borrowing_id}`);
        } else {
          navigate('/peminjaman');
        }
      }, 800);
    } catch (err) {
      console.error('Borrowing RPC failure:', err);
      setError(err.message || 'Gagal memproses transaksi peminjaman.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalDistinctItems = selectedLines.length;
  const totalPhysicalUnits = selectedLines.reduce((s, l) => s + (l.quantity || 0), 0);

  // Available items filtered by search
  const filteredPickerItems = availableItems.filter(it => {
    if (!pickerSearch) return true;
    const q = pickerSearch.toLowerCase();
    return (
      (it.name && it.name.toLowerCase().includes(q)) ||
      (it.item_code && it.item_code.toLowerCase().includes(q)) ||
      (it.asset_serial && it.asset_serial.toLowerCase().includes(q))
    );
  });

  const selectedPickerItem = availableItems.find(it => it.id === itemPickerId);

  return (
    <div className="atrium-content-container">
      {/* Top Banner */}
      <div className="atrium-glass-card atrium-banner-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
              <button
                type="button"
                className="btn-atrium-ghost"
                onClick={() => navigate('/peminjaman')}
                style={{ padding: '0.375rem', borderRadius: '8px' }}
                title="Kembali ke daftar peminjaman"
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeftRight size={20} color="#2563eb" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>Catat Peminjaman Baru</h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0, marginLeft: '3rem' }}>
              Peminjaman multi-barang terintegrasi dengan pengurangan stok atomik dan pencatatan buku besar.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-atrium-outline"
              onClick={() => navigate('/peminjaman')}
              disabled={submitting}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-atrium-primary"
              onClick={handleSubmitBorrowing}
              disabled={submitting || selectedLines.length === 0}
            >
              {submitting ? <span className="spinner spinner-sm" /> : <ShieldCheck size={16} />}
              Konfirmasi & Buat Tiket Pinjam
            </button>
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
        </div>
      )}

      {loadingInitial ? (
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Menyiapkan direktori peminjam & stok barang...</div>
        </div>
      ) : (
        <form onSubmit={handleSubmitBorrowing}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '1.25rem' }}>
            {/* LEFT COLUMN: Borrower Info & Terms */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Borrower Selection Card */}
              <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} color="#2563eb" />
                  1. Pilih Peminjam
                </h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                    Karyawan Peminjam <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <select
                    className="atrium-input"
                    style={{ width: '100%' }}
                    value={selectedBorrowerId}
                    onChange={e => setSelectedBorrowerId(e.target.value)}
                    required
                  >
                    <option value="">-- Pilih karyawan terdaftar --</option>
                    {borrowers.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.full_name} ({b.department || 'Umum'}) {b.employee_id ? `— ${b.employee_id}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBorrower && (
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                      {selectedBorrower.full_name}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span>Departemen: <strong>{selectedBorrower.department || '—'}</strong></span>
                      {selectedBorrower.employee_id && <span>NIK/NIP: <code>{selectedBorrower.employee_id}</code></span>}
                      {selectedBorrower.phone && <span>Kontak: {selectedBorrower.phone}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Purpose & Deadlines Card */}
              <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} color="#2563eb" />
                  2. Keperluan & Jadwal
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                      Keperluan / Peruntukan Peminjaman <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <textarea
                      className="atrium-input"
                      rows={2}
                      style={{ width: '100%', resize: 'vertical' }}
                      placeholder="cth: Liputan event peluncuran produk di Graha Kompas"
                      value={purpose}
                      onChange={e => setPurpose(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                      Batas Waktu Pengembalian (Jatuh Tempo) <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      className="atrium-input"
                      style={{ width: '100%' }}
                      value={expectedReturnAt}
                      onChange={e => setExpectedReturnAt(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                      Transaksi akan otomatis ditandai terlambat jika melewati batas waktu ini.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                      Catatan Tambahan (Opsional)
                    </label>
                    <input
                      type="text"
                      className="atrium-input"
                      style={{ width: '100%' }}
                      placeholder="cth: Disertai kelengkapan charger & tas laptop"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Inventory Item Picker & Summary Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Item Picker Card */}
              <div className="atrium-glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Boxes size={16} color="#2563eb" />
                  3. Pilih Barang Inventaris
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {/* Search / Filter for item list */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.625rem', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Pilih Aset / Barang Siap Pakai
                      </label>
                      <select
                        className="atrium-input"
                        style={{ width: '100%', fontSize: '0.8125rem' }}
                        value={itemPickerId}
                        onChange={e => {
                          const id = e.target.value;
                          setItemPickerId(id);
                          const it = availableItems.find(x => x.id === id);
                          if (it) {
                            setItemPickerQty(1);
                            setItemPickerCondition(it.condition || 'baik');
                          }
                        }}
                      >
                        <option value="">-- Pilih barang inventaris --</option>
                        {filteredPickerItems.map(it => (
                          <option key={it.id} value={it.id}>
                            [{it.item_code}] {it.name} {it.asset_serial ? `(SN: ${it.asset_serial})` : ''} — Stok: {it.available_qty}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Kuantitas
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedPickerItem?.available_qty || 1}
                        disabled={!selectedPickerItem || selectedPickerItem.tracking_type === 'individual'}
                        className="atrium-input"
                        style={{ width: '100%', fontSize: '0.8125rem' }}
                        value={itemPickerQty}
                        onChange={e => setItemPickerQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Kondisi
                      </label>
                      <select
                        className="atrium-input"
                        style={{ width: '100%', fontSize: '0.8125rem' }}
                        value={itemPickerCondition}
                        onChange={e => setItemPickerCondition(e.target.value)}
                      >
                        <option value="baik">Baik</option>
                        <option value="cukup_baik">Cukup Baik</option>
                        <option value="rusak_ringan">Rusak Ringan</option>
                      </select>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="btn-atrium-primary"
                        onClick={handleAddLineItem}
                        disabled={!itemPickerId}
                        style={{ padding: '0.5rem 0.875rem', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                      >
                        <Plus size={15} /> Tambah
                      </button>
                    </div>
                  </div>

                  {selectedPickerItem && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '1rem', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                      <span>Tipe: <strong>{selectedPickerItem.tracking_type === 'individual' ? 'Aset Individual' : 'Kuantitas Massal'}</strong></span>
                      <span>Lokasi: <strong>{selectedPickerItem.storage_locations?.code || 'Gudang'}</strong></span>
                      <span>Stok Tersedia: <strong>{selectedPickerItem.available_qty} unit</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Line Items Table Card */}
              <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                    Daftar Barang Dipinjam ({selectedLines.length} Macam)
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem' }}>
                    <span>Total SKU: <strong>{totalDistinctItems}</strong></span>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>Total Unit: {totalPhysicalUnits} unit</span>
                  </div>
                </div>

                <div className="table-wrapper" style={{ margin: 0 }}>
                  <table className="atrium-inventory-table">
                    <thead>
                      <tr>
                        <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                        <th>Kode & Nama Barang</th>
                        <th>Tipe / Serial</th>
                        <th style={{ textAlign: 'center', width: '90px' }}>Kuantitas</th>
                        <th style={{ textAlign: 'center' }}>Kondisi Pinjam</th>
                        <th style={{ textAlign: 'right', width: '60px' }}>Hapus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                            <Boxes size={28} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                            <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                              Belum ada barang yang dipilih. Gunakan panel di atas untuk menambahkan barang ke tiket.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        selectedLines.map((line, idx) => (
                          <tr key={line.item_id}>
                            <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                              {idx + 1}
                            </td>

                            <td>
                              <div>
                                <span className="atrium-tag-mono" style={{ fontSize: '0.75rem', marginRight: '0.375rem' }}>
                                  {line.item.item_code}
                                </span>
                                <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>{line.item.name}</strong>
                              </div>
                            </td>

                            <td>
                              {line.item.tracking_type === 'individual' ? (
                                <span className="atrium-subtle-badge badge-neutral" style={{ fontSize: '0.6875rem' }}>
                                  SN: {line.item.asset_serial || '—'}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Kuantitas Massal</span>
                              )}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              {line.item.tracking_type === 'individual' ? (
                                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>1 unit</span>
                              ) : (
                                <input
                                  type="number"
                                  min="1"
                                  max={line.item.available_qty}
                                  className="atrium-input"
                                  style={{ width: '64px', padding: '0.25rem 0.375rem', textAlign: 'center', fontSize: '0.8125rem' }}
                                  value={line.quantity}
                                  onChange={e => handleUpdateLineQty(idx, e.target.value)}
                                />
                              )}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <span className="atrium-subtle-badge badge-available" style={{ fontSize: '0.75rem' }}>
                                {line.condition}
                              </span>
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn-atrium-ghost"
                                style={{ padding: '0.25rem 0.5rem', color: '#e11d48' }}
                                onClick={() => handleRemoveLineItem(idx)}
                                title="Hapus dari daftar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer confirmation */}
                <div style={{ padding: '1rem 1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Stok barang akan otomatis dipotong seketika transaksi berhasil dibuat.
                  </div>
                  <button
                    type="submit"
                    className="btn-atrium-primary"
                    disabled={submitting || selectedLines.length === 0}
                  >
                    {submitting ? <span className="spinner spinner-sm" /> : <ShieldCheck size={16} />}
                    Simpan Transaksi ({totalPhysicalUnits} Unit)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
