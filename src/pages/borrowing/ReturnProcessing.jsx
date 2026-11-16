import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck,
  Check, AlertTriangle, Boxes, User, Calendar, FileText, QrCode,
  ChevronDown, Search, X
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function ReturnProcessing() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [activeBorrowingsList, setActiveBorrowingsList] = useState([]);
  const [selectedBorrowingId, setSelectedBorrowingId] = useState(paramId || '');
  const [isTicketDropdownOpen, setIsTicketDropdownOpen] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const ticketDropdownRef = useRef(null);
  const [borrowing, setBorrowing] = useState(null);
  const [loading, setLoading] = useState(true);

  // Return item inputs: { [line_id]: { good_qty: number, damaged_qty: number, condition: string, notes: string } }
  const [returnInputs, setReturnInputs] = useState({});
  const [generalNotes, setGeneralNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch active borrowings if no paramId
  const fetchActiveBorrowings = useCallback(async () => {
    if (!isConfigured) return;
    try {
      const { data, error: err } = await supabase
        .from('borrowings')
        .select(`
          id,
          transaction_code,
          purpose,
          expected_return_at,
          status,
          borrowers (full_name, department)
        `)
        .in('status', ['borrowed', 'partial_returned', 'overdue'])
        .order('borrowed_at', { ascending: false });

      if (err) throw err;
      setActiveBorrowingsList(data || []);
    } catch (e) {
      console.warn('Could not fetch active borrowings list:', e.message);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (!paramId) {
      fetchActiveBorrowings();
    }
  }, [paramId, fetchActiveBorrowings]);

  // Close ticket dropdown on outside click or Esc
  useEffect(() => {
    if (!isTicketDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (ticketDropdownRef.current && !ticketDropdownRef.current.contains(e.target)) {
        setIsTicketDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsTicketDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTicketDropdownOpen]);

  // Load specific borrowing transaction
  const loadBorrowingDetail = useCallback(async (borrowingId) => {
    if (!borrowingId) {
      setBorrowing(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (!isConfigured) {
        // Mock fallback for test/offline
        setBorrowing({
          id: borrowingId,
          transaction_code: 'BRW-DEMO-0001',
          purpose: 'Liputan dokumentasi',
          borrowers: { full_name: 'Budi Santoso', department: 'IT' },
          borrowing_items: [
            {
              id: 'bi-1',
              item_id: 'itm-1',
              quantity: 2,
              returned_good_qty: 0,
              returned_damaged_qty: 0,
              borrow_condition: 'baik',
              items: {
                id: 'itm-1',
                item_code: 'ITM-LP01',
                name: 'MacBook Pro 14"',
                tracking_type: 'individual',
                asset_serial: 'VNX-MBP-01'
              }
            }
          ]
        });
        setLoading(false);
        return;
      }

      const { data, error: bErr } = await supabase
        .from('borrowings')
        .select(`
          id,
          transaction_code,
          purpose,
          borrowed_at,
          expected_return_at,
          status,
          borrowers (id, full_name, employee_id, department),
          borrowing_items (
            id,
            item_id,
            quantity,
            returned_good_qty,
            returned_damaged_qty,
            borrow_condition,
            items (
              id,
              item_code,
              name,
              tracking_type,
              asset_serial,
              condition
            )
          )
        `)
        .eq('id', borrowingId)
        .single();

      if (bErr) throw bErr;
      if (!data) throw new Error('Transaksi peminjaman tidak ditemukan.');

      // Check if eligible
      if (!['borrowed', 'partial_returned', 'overdue'].includes(data.status)) {
        throw new Error(`Transaksi #${data.transaction_code} tidak dapat diproses (status: ${data.status}).`);
      }

      setBorrowing(data);

      // Initialize return inputs
      const initialInputs = {};
      (data.borrowing_items || []).forEach(line => {
        const unreturned = line.quantity - ((line.returned_good_qty || 0) + (line.returned_damaged_qty || 0));
        initialInputs[line.id] = {
          good_qty: unreturned > 0 ? unreturned : 0, // default to all good
          damaged_qty: 0,
          condition: 'baik',
          notes: ''
        };
      });
      setReturnInputs(initialInputs);
    } catch (err) {
      console.error('Error loading return target:', err);
      setError(err.message || 'Gagal memuat detail peminjaman.');
      setBorrowing(null);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (selectedBorrowingId) {
      loadBorrowingDetail(selectedBorrowingId);
    } else {
      setLoading(false);
    }
  }, [selectedBorrowingId, loadBorrowingDetail]);

  // Set All to Good Condition
  const handleSetAllGood = () => {
    if (!borrowing) return;
    const nextInputs = {};
    (borrowing.borrowing_items || []).forEach(line => {
      const unreturned = Math.max(0, line.quantity - ((line.returned_good_qty || 0) + (line.returned_damaged_qty || 0)));
      nextInputs[line.id] = {
        good_qty: unreturned,
        damaged_qty: 0,
        condition: 'baik',
        notes: ''
      };
    });
    setReturnInputs(nextInputs);
  };

  // Set All to Zero
  const handleResetInputs = () => {
    if (!borrowing) return;
    const nextInputs = {};
    (borrowing.borrowing_items || []).forEach(line => {
      nextInputs[line.id] = {
        good_qty: 0,
        damaged_qty: 0,
        condition: 'baik',
        notes: ''
      };
    });
    setReturnInputs(nextInputs);
  };

  // Input changes
  const handleLineQtyChange = (lineId, field, value, maxAllowed) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setReturnInputs(prev => {
      const current = prev[lineId] || { good_qty: 0, damaged_qty: 0, condition: 'baik', notes: '' };
      const otherField = field === 'good_qty' ? 'damaged_qty' : 'good_qty';
      const otherVal = current[otherField] || 0;

      // Cap at remaining unreturned
      const capped = Math.min(num, Math.max(0, maxAllowed - otherVal));

      return {
        ...prev,
        [lineId]: {
          ...current,
          [field]: capped
        }
      };
    });
  };

  // Calculate return totals
  let totalReturningGood = 0;
  let totalReturningDamaged = 0;
  let totalReturningUnits = 0;
  let totalUnreturnedRemaining = 0;
  let willBeFullyReturned = true;

  if (borrowing) {
    (borrowing.borrowing_items || []).forEach(line => {
      const unreturned = Math.max(0, line.quantity - ((line.returned_good_qty || 0) + (line.returned_damaged_qty || 0)));
      const input = returnInputs[line.id] || { good_qty: 0, damaged_qty: 0 };
      const thisReturning = (input.good_qty || 0) + (input.damaged_qty || 0);

      totalReturningGood += (input.good_qty || 0);
      totalReturningDamaged += (input.damaged_qty || 0);
      totalReturningUnits += thisReturning;
      totalUnreturnedRemaining += unreturned;

      if (thisReturning < unreturned) {
        willBeFullyReturned = false;
      }
    });
  }

  // Submit Return via atomic RPC
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    setError('');

    if (!borrowing) {
      setError('Pilih transaksi peminjaman terlebih dahulu.');
      return;
    }

    if (totalReturningUnits <= 0) {
      setError('Tentukan kuantitas barang yang dikembalikan minimal 1 unit.');
      return;
    }

    // Build returns array payload for RPC
    const returnsPayload = [];
    for (const [lineId, input] of Object.entries(returnInputs)) {
      const good = input.good_qty || 0;
      const damaged = input.damaged_qty || 0;
      if (good + damaged > 0) {
        returnsPayload.push({
          borrowing_item_id: lineId,
          return_good_qty: good,
          return_damaged_qty: damaged,
          return_condition: damaged > 0 ? (input.condition || 'rusak_ringan') : 'baik',
          return_notes: input.notes?.trim() || ''
        });
      }
    }

    setSubmitting(true);
    try {
      if (!isConfigured) {
        setSuccess('Pengembalian berhasil diproses (mode lokal).');
        setTimeout(() => navigate(`/peminjaman/${borrowing.id}`), 1000);
        return;
      }

      // Execute secure atomic RPC
      const { data, error: rpcErr } = await supabase.rpc('rpc_process_return', {
        p_borrowing_id: borrowing.id,
        p_returns: returnsPayload,
        p_notes: generalNotes.trim()
      });

      if (rpcErr) throw rpcErr;

      const finalStatus = data?.status === 'returned' ? 'Lengkap (Selesai)' : 'Sebagian (Parsial)';
      setSuccess(`Pengembalian berhasil dicatat. Status transaksi: ${finalStatus}.`);
      setTimeout(() => {
        navigate(`/peminjaman/${borrowing.id}`);
      }, 1000);
    } catch (err) {
      console.error('Return RPC failure:', err);
      setError(err.message || 'Gagal memproses pengembalian barang.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedActiveBorrowing = activeBorrowingsList.find(b => b.id === selectedBorrowingId);

  const filteredActiveBorrowings = activeBorrowingsList.filter(b => {
    if (!ticketSearchQuery.trim()) return true;
    const q = ticketSearchQuery.toLowerCase();
    const code = (b.transaction_code || '').toLowerCase();
    const name = (b.borrowers?.full_name || '').toLowerCase();
    const dept = (b.borrowers?.department || '').toLowerCase();
    const purpose = (b.purpose || '').toLowerCase();
    return code.includes(q) || name.includes(q) || dept.includes(q) || purpose.includes(q);
  });

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
                onClick={() => navigate(paramId ? `/peminjaman/${paramId}` : '/peminjaman')}
                style={{ padding: '0.375rem', borderRadius: '8px' }}
                title="Kembali"
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(5, 150, 105, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} color="#059669" />
              </div>
              <h1 className="atrium-page-title" style={{ margin: 0, fontSize: '1.5rem' }}>
                Proses Pengembalian Barang
              </h1>
            </div>
            <p className="atrium-card-subtitle" style={{ margin: 0, marginLeft: '3rem' }}>
              Pemeriksaan fisik unit kembali, pemisahan kondisi baik vs rusak, dan rekonsiliasi stok otomatis.
            </p>
          </div>

          {borrowing && (
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-atrium-outline"
                onClick={handleSetAllGood}
                disabled={submitting}
                title="Isi otomatis semua barang kembali baik"
              >
                <Check size={14} />
                Kembalikan Semua (Baik)
              </button>
              <button
                type="button"
                className="btn-atrium-primary"
                onClick={handleSubmitReturn}
                disabled={submitting || totalReturningUnits <= 0}
              >
                {submitting ? <span className="spinner spinner-sm" /> : <ShieldCheck size={16} />}
                Konfirmasi Pengembalian ({totalReturningUnits} Unit)
              </button>
            </div>
          )}
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

      {/* If standalone route without ID: Selector for active borrowing */}
      {!paramId && (
        <div className="atrium-glass-card" style={{ marginBottom: '1.25rem', padding: '1.25rem', overflow: 'visible' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
            Pilih Tiket Peminjaman yang Akan Dikembalikan
          </label>

          <div ref={ticketDropdownRef} style={{ position: 'relative', width: '100%' }}>
            {/* Custom Styled Trigger Button */}
            <button
              type="button"
              onClick={() => setIsTicketDropdownOpen(prev => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isTicketDropdownOpen}
              style={{
                width: '100%',
                minHeight: '46px',
                padding: '0.5rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                backgroundColor: '#FFFFFF',
                border: isTicketDropdownOpen ? '1px solid #17191C' : '1px solid #CBD5E1',
                boxShadow: isTicketDropdownOpen
                  ? '0 0 0 3px rgba(23, 25, 28, 0.08)'
                  : '0 1px 2px rgba(0, 0, 0, 0.03)',
                borderRadius: '12px',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit'
              }}
            >
              {selectedActiveBorrowing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #DBEAFE'
                  }}>
                    {selectedActiveBorrowing.transaction_code}
                  </span>
                  <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>
                    {selectedActiveBorrowing.borrowers?.full_name}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#475569',
                    backgroundColor: '#F1F5F9',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px'
                  }}>
                    {selectedActiveBorrowing.borrowers?.department || 'Karyawan'}
                  </span>
                  {selectedActiveBorrowing.purpose && (
                    <span style={{
                      fontSize: '0.8125rem',
                      color: '#64748B',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '320px'
                    }}>
                      — {selectedActiveBorrowing.purpose}
                    </span>
                  )}
                  {selectedActiveBorrowing.status === 'overdue' ? (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', backgroundColor: '#FFE4E6', color: '#BE123C' }}>
                      Terlambat
                    </span>
                  ) : selectedActiveBorrowing.status === 'partial_returned' ? (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#92400E' }}>
                      Parsial
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', backgroundColor: '#EEF5E5', color: '#386016' }}>
                      Dipinjam
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.875rem' }}>
                  <FileText size={16} color="#94A3B8" />
                  <span>-- Pilih tiket pinjaman aktif / terlambat --</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                {selectedBorrowingId && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBorrowingId('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setSelectedBorrowingId('');
                      }
                    }}
                    style={{
                      padding: '3px',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.15s ease'
                    }}
                    title="Hapus pilihan"
                  >
                    <X size={14} />
                  </span>
                )}
                <ChevronDown
                  size={16}
                  color="#64748B"
                  style={{
                    transition: 'transform 0.2s ease',
                    transform: isTicketDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                />
              </div>
            </button>

            {/* Custom Dropdown Popover */}
            {isTicketDropdownOpen && (
              <div
                role="listbox"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  padding: '0.5rem',
                  zIndex: 1050,
                  maxHeight: '340px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box'
                }}
              >
                {/* Search Bar inside Popover */}
                <div style={{ padding: '0.25rem 0.25rem 0.5rem', borderBottom: '1px solid #F1F5F9', marginBottom: '0.375rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '8px',
                    padding: '0.4rem 0.625rem',
                    border: '1px solid #E2E8F0'
                  }}>
                    <Search size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                    <input
                      type="text"
                      value={ticketSearchQuery}
                      onChange={e => setTicketSearchQuery(e.target.value)}
                      placeholder="Cari kode tiket, nama peminjam, departemen, atau keperluan..."
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        fontSize: '0.8125rem',
                        color: '#0F172A',
                        width: '100%',
                        fontFamily: 'inherit'
                      }}
                      autoFocus
                    />
                    {ticketSearchQuery && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => setTicketSearchQuery('')}
                        style={{ cursor: 'pointer', color: '#94A3B8', display: 'flex' }}
                      >
                        <X size={13} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Scrollable Items Container */}
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {/* Option: Clear / Default */}
                  <div
                    role="option"
                    aria-selected={!selectedBorrowingId}
                    onClick={() => {
                      setSelectedBorrowingId('');
                      setIsTicketDropdownOpen(false);
                      setTicketSearchQuery('');
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      color: '#64748B',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: !selectedBorrowingId ? '#F1F5F9' : 'transparent',
                      fontWeight: !selectedBorrowingId ? 600 : 400,
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => { if (selectedBorrowingId) e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                    onMouseLeave={e => { if (selectedBorrowingId) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span>-- Pilih tiket pinjaman aktif / terlambat --</span>
                    {!selectedBorrowingId && <Check size={14} color="#0F172A" style={{ strokeWidth: 2.5 }} />}
                  </div>

                  {/* List of Borrowings */}
                  {filteredActiveBorrowings.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.8125rem' }}>
                      {activeBorrowingsList.length === 0
                        ? 'Tidak ada transaksi pinjaman aktif atau terlambat.'
                        : 'Tidak ditemukan tiket peminjaman yang cocok dengan pencarian.'}
                    </div>
                  ) : (
                    filteredActiveBorrowings.map(b => {
                      const isSelected = b.id === selectedBorrowingId;
                      const isOverdue = b.status === 'overdue';
                      const isPartial = b.status === 'partial_returned';
                      return (
                        <div
                          key={b.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setSelectedBorrowingId(b.id);
                            setIsTicketDropdownOpen(false);
                            setTicketSearchQuery('');
                          }}
                          style={{
                            padding: '0.625rem 0.75rem',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#F1F5F9' : 'transparent',
                            border: isSelected ? '1px solid #CBD5E1' : '1px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = '#F8FAFC';
                              e.currentTarget.style.borderColor = '#E2E8F0';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, flex: 1 }}>
                            {/* Top row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '0.78125rem',
                                backgroundColor: '#EFF6FF',
                                color: '#1D4ED8',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                border: '1px solid #DBEAFE'
                              }}>
                                {b.transaction_code}
                              </span>
                              <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.84375rem' }}>
                                {b.borrowers?.full_name}
                              </span>
                              <span style={{
                                fontSize: '0.75rem',
                                color: '#475569',
                                backgroundColor: '#F1F5F9',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px'
                              }}>
                                {b.borrowers?.department || 'Karyawan'}
                              </span>
                            </div>

                            {/* Bottom row: Purpose & Due Date */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: '#64748B', flexWrap: 'wrap' }}>
                              {b.purpose && (
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>
                                  Keperluan: <strong style={{ color: '#334155', fontWeight: 500 }}>{b.purpose}</strong>
                                </span>
                              )}
                              {b.expected_return_at && (
                                <span style={{ color: isOverdue ? '#E11D48' : '#64748B', fontWeight: isOverdue ? 600 : 400 }}>
                                  Jatuh tempo: {new Date(b.expected_return_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right side: status tag & checkmark */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                            {isOverdue ? (
                              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: '#FFE4E6', color: '#BE123C' }}>
                                Terlambat
                              </span>
                            ) : isPartial ? (
                              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                Parsial
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '9999px', backgroundColor: '#EEF5E5', color: '#386016' }}>
                                Dipinjam
                              </span>
                            )}

                            {isSelected && (
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: '#17191C',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <Check size={12} color="#FFFFFF" style={{ strokeWidth: 3 }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3.5rem' }}>
          <div className="spinner spinner-primary" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat rincian tanggungan peminjaman...</div>
        </div>
      ) : !borrowing ? (
        <div className="atrium-glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Boxes size={32} color="#94a3b8" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
          <h3 style={{ margin: '0 0 0.25rem', color: '#0f172a' }}>Pilih Transaksi Peminjaman</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8125rem' }}>
            Gunakan pilihan di atas atau buka menu Peminjaman untuk memilih tiket yang akan diproses.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmitReturn}>
          {/* Transaction Summary Card */}
          <div className="atrium-glass-card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Nomor Tiket</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                  {borrowing.transaction_code}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Peminjam</span>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                  {borrowing.borrowers?.full_name}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {borrowing.borrowers?.department} {borrowing.borrowers?.employee_id ? `(${borrowing.borrowers.employee_id})` : ''}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Batas Waktu</span>
                <div style={{ fontSize: '0.875rem', color: '#334155' }}>
                  {borrowing.expected_return_at ? new Date(borrowing.expected_return_at).toLocaleString('id-ID') : '—'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sisa Tanggungan</span>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2563eb' }}>
                  {totalUnreturnedRemaining} unit
                </div>
              </div>
            </div>
          </div>

          {/* Lines Return Table */}
          <div className="atrium-glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                Item Tanggungan Pinjaman
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-atrium-ghost"
                  onClick={handleResetInputs}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  Nol-kan Semua
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ margin: 0 }}>
              <table className="atrium-inventory-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th>Nama & Kode Barang</th>
                    <th>No. Seri / Tipe</th>
                    <th style={{ textAlign: 'center', width: '80px' }}>Total Pinjam</th>
                    <th style={{ textAlign: 'center', width: '80px' }}>Sisa Tanggungan</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Kembali Baik</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Kembali Rusak</th>
                    <th>Kondisi & Catatan Fisik</th>
                  </tr>
                </thead>
                <tbody>
                  {(borrowing.borrowing_items || []).map((line, idx) => {
                    const previouslyReturned = (line.returned_good_qty || 0) + (line.returned_damaged_qty || 0);
                    const unreturned = Math.max(0, line.quantity - previouslyReturned);
                    const input = returnInputs[line.id] || { good_qty: 0, damaged_qty: 0, condition: 'baik', notes: '' };
                    const isAllReturned = unreturned === 0;

                    return (
                      <tr key={line.id} style={{ opacity: isAllReturned ? 0.6 : 1 }}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                          {idx + 1}
                        </td>

                        <td>
                          <div>
                            <span className="atrium-tag-mono" style={{ fontSize: '0.75rem', marginRight: '0.375rem' }}>
                              {line.items?.item_code}
                            </span>
                            <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                              {line.items?.name}
                            </strong>
                          </div>
                          {line.borrow_condition && (
                            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                              Kondisi saat pinjam: {line.borrow_condition}
                            </div>
                          )}
                        </td>

                        <td>
                          {line.items?.tracking_type === 'individual' ? (
                            <span className="atrium-subtle-badge badge-neutral" style={{ fontSize: '0.6875rem' }}>
                              SN: {line.items?.asset_serial || '—'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Kuantitas Massal</span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                          {line.quantity}
                        </td>

                        <td style={{ textAlign: 'center', fontWeight: 700, color: unreturned > 0 ? '#2563eb' : '#059669', fontSize: '0.875rem' }}>
                          {unreturned}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {isAllReturned ? (
                            <span style={{ fontSize: '0.75rem', color: '#059669' }}>Lengkap</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={unreturned}
                              className="atrium-input"
                              style={{ width: '70px', padding: '0.25rem 0.375rem', textAlign: 'center', borderColor: input.good_qty > 0 ? '#10b981' : undefined }}
                              value={input.good_qty}
                              onChange={e => handleLineQtyChange(line.id, 'good_qty', e.target.value, unreturned)}
                            />
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {isAllReturned ? (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>—</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={unreturned}
                              className="atrium-input"
                              style={{ width: '70px', padding: '0.25rem 0.375rem', textAlign: 'center', borderColor: input.damaged_qty > 0 ? '#e11d48' : undefined }}
                              value={input.damaged_qty}
                              onChange={e => handleLineQtyChange(line.id, 'damaged_qty', e.target.value, unreturned)}
                            />
                          )}
                        </td>

                        <td>
                          {isAllReturned ? (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tidak ada tanggungan</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {input.damaged_qty > 0 && (
                                <div style={{ width: '135px', flexShrink: 0 }}>
                                  <CustomSelect
                                    size="sm"
                                    value={input.condition}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setReturnInputs(p => ({
                                        ...p,
                                        [line.id]: { ...p[line.id], condition: val }
                                      }));
                                    }}
                                    options={[
                                      { value: 'rusak_ringan', label: 'Rusak Ringan' },
                                      { value: 'rusak_berat', label: 'Rusak Berat' },
                                      { value: 'perbaikan', label: 'Perlu Servis' }
                                    ]}
                                  />
                                </div>
                              )}
                              <input
                                type="text"
                                className="atrium-input"
                                style={{ width: '100%', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                placeholder="Catatan fisik / keterangan..."
                                value={input.notes}
                                onChange={e => {
                                  const val = e.target.value;
                                  setReturnInputs(p => ({
                                    ...p,
                                    [line.id]: { ...p[line.id], notes: val }
                                  }));
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Reconciliation Preview Box */}
            <div style={{ padding: '1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: '#ecfdf5', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
                  <span style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 600 }}>Kembali Baik (Tersedia Lagi)</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                    +{totalReturningGood} unit
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: '#047857' }}>
                    Otomatis menambah stok available_qty
                  </span>
                </div>

                <div style={{ backgroundColor: totalReturningDamaged > 0 ? '#fff1f2' : '#f8fafc', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #fecdd3' }}>
                  <span style={{ fontSize: '0.75rem', color: '#9f1239', fontWeight: 600 }}>Kembali Rusak (Damaged)</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totalReturningDamaged > 0 ? '#e11d48' : '#64748b' }}>
                    +{totalReturningDamaged} unit
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: '#881337' }}>
                    Dialihkan ke damaged_qty (tidak siap pinjam)
                  </span>
                </div>

                <div style={{ backgroundColor: '#eff6ff', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Status Transaksi Pasca Pengembalian</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>
                    {willBeFullyReturned && totalReturningUnits === totalUnreturnedRemaining
                      ? 'Lengkap / Returned'
                      : 'Parsial / Partial Returned'}
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: '#1d4ed8' }}>
                    {willBeFullyReturned ? 'Seluruh tanggungan tiket selesai' : `Sisa ${Math.max(0, totalUnreturnedRemaining - totalReturningUnits)} unit belum kembali`}
                  </span>
                </div>
              </div>

              {/* General Return Remarks */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                  Catatan Pengembalian Umum (Opsional)
                </label>
                <input
                  type="text"
                  className="atrium-input"
                  style={{ width: '100%' }}
                  placeholder="cth: Pengembalian gelombang pertama divisi multimedia"
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem' }}>
                <button
                  type="button"
                  className="btn-atrium-outline"
                  onClick={() => navigate(`/peminjaman/${borrowing.id}`)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-atrium-primary"
                  disabled={submitting || totalReturningUnits <= 0}
                >
                  {submitting ? <span className="spinner spinner-sm" /> : <ShieldCheck size={16} />}
                  Proses Pengembalian ({totalReturningUnits} Unit)
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
