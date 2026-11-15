import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Boxes, Plus, PackagePlus, ArrowLeftRight, History,
  Search, Filter, ArrowUpDown, ChevronRight, AlertCircle,
  RefreshCw, CheckCircle2, AlertTriangle, Wrench, Shield,
  Tag, MapPin, ExternalLink
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/common/CustomSelect';

export default function InventoryList() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');

  // Fetch actual inventory data from Supabase
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const [
        { data: itemsData, error: itemsErr },
        { data: catsData, error: catsErr },
        { data: locsData, error: locsErr }
      ] = await Promise.all([
        supabase
          .from('items')
          .select(`
            id, item_code, name, description, tracking_type,
            asset_serial, total_qty, available_qty, damaged_qty,
            under_repair_qty, condition, status, is_active,
            updated_at,
            item_categories (id, name),
            storage_locations (id, code, name)
          `)
          .order('name'),
        supabase.from('item_categories').select('id, name').order('name'),
        supabase.from('storage_locations').select('id, code, name').order('code')
      ]);

      if (itemsErr) throw new Error(`Gagal memuat inventaris: ${itemsErr.message}`);
      if (catsErr) console.warn('Gagal memuat kategori:', catsErr.message);
      if (locsErr) console.warn('Gagal memuat lokasi:', locsErr.message);

      setItems(itemsData || []);
      setCategories(catsData || []);
      setLocations(locsData || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat data inventaris.');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Aggregate stats (Record count vs Physical units)
  const stats = useMemo(() => {
    const totalRecords = items.length;
    let totalPhysicalUnits = 0;
    let availableUnits = 0;
    let damagedUnits = 0;
    let repairUnits = 0;

    items.forEach(item => {
      totalPhysicalUnits += item.total_qty || 0;
      availableUnits += item.available_qty || 0;
      damagedUnits += item.damaged_qty || 0;
      repairUnits += item.under_repair_qty || 0;
    });

    const borrowedUnits = Math.max(0, totalPhysicalUnits - (availableUnits + damagedUnits + repairUnits));

    return {
      totalRecords,
      totalPhysicalUnits,
      availableUnits,
      borrowedUnits,
      damagedUnits,
      repairUnits
    };
  }, [items]);

  // Filter & sort items
  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        const matchesSearch =
          !search.trim() ||
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.item_code.toLowerCase().includes(search.toLowerCase()) ||
          (item.asset_serial && item.asset_serial.toLowerCase().includes(search.toLowerCase()));

        const matchesCat = !selectedCategory || item.item_categories?.id === selectedCategory;
        const matchesLoc = !selectedLocation || item.storage_locations?.id === selectedLocation;
        const matchesType = !selectedType || item.tracking_type === selectedType;
        const matchesStatus = !selectedStatus || item.status === selectedStatus;

        return matchesSearch && matchesCat && matchesLoc && matchesType && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'avail_desc') return (b.available_qty || 0) - (a.available_qty || 0);
        if (sortBy === 'avail_asc') return (a.available_qty || 0) - (b.available_qty || 0);
        if (sortBy === 'total_desc') return (b.total_qty || 0) - (a.total_qty || 0);
        if (sortBy === 'updated_desc') return new Date(b.updated_at) - new Date(a.updated_at);
        return 0;
      });
  }, [items, search, selectedCategory, selectedLocation, selectedType, selectedStatus, sortBy]);

  if (!isConfigured) {
    return (
      <div className="atrium-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
        <AlertCircle size={36} color="var(--atrium-text-muted)" style={{ margin: '0 auto 1rem' }} />
        <h2>Koneksi Database Belum Dikonfigurasi</h2>
        <p style={{ color: 'var(--atrium-text-secondary)', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
          Konfigurasi kredensial Supabase belum terdeteksi. Silakan periksa berkas .env Anda untuk mengelola inventaris.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="atrium-page-header">
        <div className="atrium-page-title-wrap">
          <h1>Inventaris Gudang</h1>
          <p>Katalog master aset perusahaan, monitoring kuantitas fisik, dan status alokasi alat.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="atrium-btn-light"
            onClick={fetchInventory}
            disabled={loading}
            title="Segarkan data dari database"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate('/inventaris/barang-masuk')}
          >
            <PackagePlus size={16} />
            <span>Barang Masuk</span>
          </button>

          <button
            type="button"
            className="atrium-btn-light"
            onClick={() => navigate('/inventaris/penyesuaian-stok')}
          >
            <ArrowLeftRight size={16} />
            <span>Penyesuaian Stok</span>
          </button>

          <button
            type="button"
            className="atrium-btn-dark"
            onClick={() => navigate('/inventaris/tambah')}
          >
            <Plus size={16} />
            <span>Tambah Barang Baru</span>
          </button>
        </div>
      </div>

      {/* Summary Strip (KPI Widgets) */}
      <div className="atrium-summary-strip">
        <div className="atrium-stat-widget">
          <div className="atrium-stat-widget-top">
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Katalog Barang</span>
            <Boxes size={18} />
          </div>
          <div className="atrium-stat-widget-number">{stats.totalRecords}</div>
          <div className="atrium-stat-widget-label">Jenis Item Terdaftar</div>
        </div>

        <div className="atrium-stat-widget">
          <div className="atrium-stat-widget-top">
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Total Fisik</span>
            <Boxes size={18} />
          </div>
          <div className="atrium-stat-widget-number">{stats.totalPhysicalUnits}</div>
          <div className="atrium-stat-widget-label">Total Unit Aset</div>
        </div>

        <div className="atrium-stat-widget" style={{ borderLeft: '4px solid #16A34A' }}>
          <div className="atrium-stat-widget-top" style={{ color: '#16A34A' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Siap Digunakan</span>
            <CheckCircle2 size={18} />
          </div>
          <div className="atrium-stat-widget-number" style={{ color: '#15803D' }}>{stats.availableUnits}</div>
          <div className="atrium-stat-widget-label">Unit Tersedia di Rak</div>
        </div>

        <div className="atrium-stat-widget" style={{ borderLeft: '4px solid #2563EB' }}>
          <div className="atrium-stat-widget-top" style={{ color: '#2563EB' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dipinjamkan</span>
            <ArrowLeftRight size={18} />
          </div>
          <div className="atrium-stat-widget-number" style={{ color: '#1D4ED8' }}>{stats.borrowedUnits}</div>
          <div className="atrium-stat-widget-label">Unit Berada di Peminjam</div>
        </div>

        <div className="atrium-stat-widget" style={{ borderLeft: '4px solid #DC2626' }}>
          <div className="atrium-stat-widget-top" style={{ color: '#DC2626' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Rusak</span>
            <AlertTriangle size={18} />
          </div>
          <div className="atrium-stat-widget-number" style={{ color: '#B91C1C' }}>{stats.damagedUnits}</div>
          <div className="atrium-stat-widget-label">Unit Menunggu Penanganan</div>
        </div>

        <div className="atrium-stat-widget" style={{ borderLeft: '4px solid #D97706' }}>
          <div className="atrium-stat-widget-top" style={{ color: '#D97706' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dalam Servis</span>
            <Wrench size={18} />
          </div>
          <div className="atrium-stat-widget-number" style={{ color: '#B45309' }}>{stats.repairUnits}</div>
          <div className="atrium-stat-widget-label">Unit di Bengkel Perbaikan</div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Sorting */}
      <div className="atrium-toolbar">
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--atrium-text-muted)' }} />
          <input
            type="text"
            className="atrium-input-field"
            style={{ paddingLeft: '2.5rem', height: '42px', borderRadius: '9999px' }}
            placeholder="Cari nama barang, kode SKU, atau nomor seri..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <CustomSelect
          className="atrium-filter-select"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          ariaLabel="Filter Tipe Pelacakan"
          autoWidth
        >
          <option value="">Semua Tipe Pelacakan</option>
          <option value="individual">Aset Individual (Unit Unik)</option>
          <option value="quantity">Pelacakan Kuantitas</option>
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          ariaLabel="Filter Kategori"
          autoWidth
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          ariaLabel="Filter Lokasi Rak"
          autoWidth
        >
          <option value="">Semua Lokasi Rak</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
          ))}
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          ariaLabel="Filter Status"
          autoWidth
        >
          <option value="">Semua Status</option>
          <option value="available">Tersedia</option>
          <option value="borrowed">Sedang Dipinjam</option>
          <option value="maintenance">Perawatan/Rusak</option>
          <option value="inactive">Nonaktif</option>
        </CustomSelect>

        <CustomSelect
          className="atrium-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          ariaLabel="Urutkan"
          autoWidth
        >
          <option value="name_asc">Nama (A - Z)</option>
          <option value="name_desc">Nama (Z - A)</option>
          <option value="avail_desc">Stok Tersedia (Terbanyak)</option>
          <option value="avail_asc">Stok Tersedia (Sedikit)</option>
          <option value="total_desc">Total Unit (Terbanyak)</option>
          <option value="updated_desc">Terakhir Diperbarui</option>
        </CustomSelect>
      </div>

      {/* Error State */}
      {error && (
        <div className="atrium-card" style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#991B1B' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{error}</span>
          </div>
          <button type="button" className="atrium-btn-dark" onClick={fetchInventory} style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem' }}>
            Coba Lagi
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="atrium-table-card">
        {loading ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--atrium-text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Memuat katalog inventaris gudang...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <Boxes size={36} color="var(--atrium-text-muted)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
              {items.length === 0 ? 'Belum Ada Barang Inventaris' : 'Tidak Ditemukan Hasil yang Cocok'}
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
              {items.length === 0
                ? 'Katalog gudang masih kosong. Klik tombol di bawah untuk mendaftarkan barang baru ke sistem.'
                : 'Coba sesuaikan kata kunci pencarian atau ubah filter filter kategori/lokasi Anda.'}
            </p>
            {items.length === 0 && (
              <button
                type="button"
                className="atrium-btn-dark"
                onClick={() => navigate('/inventaris/tambah')}
              >
                <Plus size={16} />
                <span>Tambah Barang Baru</span>
              </button>
            )}
          </div>
        ) : (
          <div className="atrium-table-container">
            <table className="atrium-table">
              <thead>
                <tr>
                  <th>Kode & Nama Barang</th>
                  <th>Kategori</th>
                  <th>Lokasi Rak</th>
                  <th>Tipe Pelacakan</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Tersedia</th>
                  <th style={{ textAlign: 'center' }}>Dipinjam</th>
                  <th style={{ textAlign: 'center' }}>Rusak/Servis</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const borrowed = Math.max(0, (item.total_qty || 0) - ((item.available_qty || 0) + (item.damaged_qty || 0) + (item.under_repair_qty || 0)));
                  const maintenance = (item.damaged_qty || 0) + (item.under_repair_qty || 0);

                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '0.875rem', color: 'var(--atrium-text-primary)' }}>
                            {item.name}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--atrium-text-muted)' }}>
                            SKU: <strong>{item.item_code}</strong>
                            {item.asset_serial ? ` · SN: ${item.asset_serial}` : ''}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)' }}>
                          {item.item_categories?.name || '—'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--atrium-text-secondary)' }}>
                          {item.storage_locations?.code || '—'}
                        </span>
                      </td>

                      <td>
                        <span className={`atrium-pill ${item.tracking_type === 'individual' ? 'atrium-pill-individual' : 'atrium-pill-quantity'}`}>
                          {item.tracking_type === 'individual' ? 'Aset Individual' : 'Kuantitas'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {item.total_qty}
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#15803D' }}>
                        {item.available_qty}
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 600, color: borrowed > 0 ? '#1D4ED8' : 'var(--atrium-text-muted)' }}>
                        {borrowed}
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 600, color: maintenance > 0 ? '#B45309' : 'var(--atrium-text-muted)' }}>
                        {maintenance}
                      </td>

                      <td>
                        <span className={`atrium-pill atrium-pill-${item.status}`}>
                          {item.status === 'available' ? 'Tersedia' : (item.status === 'borrowed' ? 'Dipinjam' : (item.status === 'maintenance' ? 'Perawatan' : 'Nonaktif'))}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="atrium-btn-light"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={() => navigate(`/inventaris/${item.id}`)}
                          >
                            Detail
                          </button>

                          <button
                            type="button"
                            className="atrium-btn-light"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={() => navigate(`/inventaris/${item.id}/edit`)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
