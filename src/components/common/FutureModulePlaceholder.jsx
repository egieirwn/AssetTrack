import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, ArrowLeftRight, Users, Clock,
  ArrowLeft, ShieldCheck, Construction, BarChart3,
  Calendar, Layers
} from 'lucide-react';

const MODULE_METADATA = {
  '/inventaris': {
    title: 'Manajemen Inventaris Gudang',
    phase: 'Phase E — Inventory Management',
    icon: Boxes,
    description: 'Modul master inventaris, monitoring kuantitas stok (tersedia, dipinjam, rusak, dalam perbaikan), dan penyesuaian stok terjadwal untuk diintegrasikan pada Phase E.',
    schemaStatus: 'Skema tabel public.items dan trigger protect_item_quantities() telah aktif di Supabase.'
  },
  '/peminjaman': {
    title: 'Transaksi Peminjaman Aset',
    phase: 'Phase F — Borrowing & Returns',
    icon: ArrowLeftRight,
    description: 'Modul pencatatan peminjaman multi-item karyawan, validasi ketersediaan stok atomik, dan penerbitan tiket peminjaman terjadwal untuk Phase F.',
    schemaStatus: 'Fungsi RPC rpc_create_borrowing() dan rpc_process_return() telah diamankan di Supabase.'
  },
  '/pengembalian': {
    title: 'Pengembalian & Serah Terima Aset',
    phase: 'Phase F — Borrowing & Returns',
    icon: ArrowLeftRight,
    description: 'Modul verifikasi kondisi aset saat pengembalian (baik vs rusak), pengembalian parsial, dan update stok otomatis terjadwal untuk Phase F.',
    schemaStatus: 'Fungsi RPC rpc_process_return() dan audit log stock_movements telah aktif di Supabase.'
  },
  '/peminjam': {
    title: 'Direktori Karyawan Peminjam',
    phase: 'Phase F — Borrower Directory',
    icon: Users,
    description: 'Modul direktori karyawan dan mentor peminjam aset perusahaan (tabel public.borrowers) terjadwal untuk diintegrasikan pada Phase F.',
    schemaStatus: 'Tabel public.borrowers telah siap dan terisolasi dari akun autentikasi aplikasi.'
  },
  '/laporan': {
    title: 'Laporan & Audit Gudang',
    phase: 'Phase G — Reporting & Analytics',
    icon: BarChart3,
    description: 'Modul rekapitulasi operasional, analisis utilisasi aset perusahaan, dan audit perpindahan stok terjadwal untuk Phase G.',
    schemaStatus: 'Tabel immutable stock_movements dan activity_logs telah siap untuk analitik.'
  }
};

export default function FutureModulePlaceholder({ pathOverride = null }) {
  const navigate = useNavigate();
  const currentPath = pathOverride || window.location.pathname;
  const meta = MODULE_METADATA[currentPath] || {
    title: 'Modul Sistem Gudang',
    phase: 'Tahap Pengembangan Selanjutnya',
    icon: Construction,
    description: 'Antarmuka untuk modul ini sedang dipersiapkan dan dijadwalkan pada fase pengembangan berikutnya.',
    schemaStatus: 'Struktur database dan aturan keamanan Supabase telah terpasang.'
  };

  const IconComponent = meta.icon;

  return (
    <div style={{ maxWidth: '840px', margin: '1rem auto', width: '100%' }}>
      <div className="atrium-card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
        {/* Top Phase Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#F1F0F4', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--atrium-text-secondary)', marginBottom: '1.5rem' }}>
          <Layers size={14} />
          <span>{meta.phase}</span>
        </div>

        {/* Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '20px',
          backgroundColor: '#17191C',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem'
        }}>
          <IconComponent size={30} />
        </div>

        {/* Title & Description */}
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--atrium-text-primary)', margin: '0 0 0.5rem 0' }}>
          {meta.title}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--atrium-text-secondary)', maxWidth: '560px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
          {meta.description}
        </p>

        {/* Database Status Callout */}
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          maxWidth: '560px',
          margin: '0 auto 2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          textAlign: 'left'
        }}>
          <ShieldCheck size={20} color="#16A34A" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.75rem', color: '#334155', lineHeight: 1.5 }}>
            <strong>Kesiapan Fondasi Basis Data:</strong><br />
            {meta.schemaStatus}
          </div>
        </div>

        {/* Back Button */}
        <div>
          <button
            type="button"
            className="atrium-btn-dark"
            style={{ padding: '0.65rem 1.75rem', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
