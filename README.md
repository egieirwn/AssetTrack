# PT Vinix Seven Aurum — Warehouse Inventory & Borrowing Management System

> **Sistem Informasi Manajemen Inventaris, Sirkulasi Peminjaman Aset, dan Mutasi Stok Pergudangan**  
> Dibangun dengan arsitektur modern **React 19 + Vite 6 + Supabase PostgreSQL**, dilengkapi **Row Level Security (RLS)**, **Stored Procedures / RPC Functions**, serta antarmuka modern **Atrium Design System**.

Aplikasi ini dikembangkan secara khusus untuk operasional pergudangan internal **PT Vinix Seven Aurum**, memungkinkan **Penjaga Gudang (*Warehouse Keeper*)** dan **Administrator** untuk mengelola master inventaris peralatan operasional, mencatat sirkulasi peminjaman multi-barang oleh karyawan, memproses pengembalian unit secara fleksibel (lengkap maupun parsial), memilah barang kondisi baik vs rusak, dan memelihara buku besar mutasi stok yang terintegrasi secara atomik.

---

## 🏛️ Fitur Utama Sistem

### 1. Dashboard Pemantauan Pergudangan
- **Metrik Real-time**: Total SKU aktif, total unit fisik barang, unit yang sedang dipinjam, unit rusak (*damaged*), transaksi peminjaman berjalan, dan transaksi terlambat (*overdue*).
- **Pemantauan Kapasitas Rak/Loker**: Visualisasi tingkat keterisian kapasitas rak gudang secara dinamis (*available*, *full*, *inactive*).
- **Aktivitas & Log Cepat**: Ringkasan sirkulasi peminjaman aktif dan peringatan keterlambatan pengembalian alat.

### 2. Manajemen Master Inventaris & Pelacakan Aset Ganda
- **Pelacakan Individual (*Individual Asset*)**: Untuk aset bernilai tinggi (laptop, kamera, proyektor) dengan nomor seri unik (*asset serial*) dan status kondisi fisik awal.
- **Pelacakan Massal (*Quantity-Based / Bulk*)**: Untuk barang konsumabel, kabel, adaptor, dan perkakas dengan saldo stok kuantitas otomatis.
- **Kategori & Lokasi Penyimpanan**: Pengelompokan barang berdasarkan kategori dan penetapan rak/loker dengan pembatasan kapasitas maksimum.
- **Penyesuaian Stok (*Stock Adjustment*) & Penambahan Stok Baru**: Form penyesuaian kuantitas yang otomatis mencatat log mutasi stok permanen (*append-only*).

### 3. Direktori Karyawan Peminjam (*Borrower Directory*)
- Master data karyawan peminjam alat (Nomor Induk Karyawan, Nama Lengkap, Departemen, Kontak/Email).
- Pelacakan keaktifan karyawan dan riwayat peminjaman per individu.
- Proteksi integritas referensial: Karyawan yang memiliki riwayat transaksi dilindungi dari penghapusan permanen tidak sengaja.

### 4. Sirkulasi Peminjaman Multi-Barang (*Multi-Item Borrowing*)
- **Pencatatan Atomik**: Mendukung peminjaman banyak jenis barang sekaligus dalam satu transaksi terpadu dengan kode tiket unik berformat `BRW-YYYYMMDD-XXXX`.
- **Validasi Ketersediaan Stok**: Sistem memverifikasi saldo `available_qty` dan menolak transaksi jika stok fisik tidak mencukupi atau aset individual sedang dipinjam.
- **Penetapan Batas Waktu & Deteksi Overdue**: Tanggal perkiraan kembali (*due date*) dengan pelabelan otomatis tiket terlambat secara dinamis.
- **Bukti Pinjam Siap Cetak (*Printable Receipt*)**: Format tanda terima resmi perusahaan dilengkapi QR Code ringkas untuk pencarian dan pemindaian cepat di meja gudang.

### 5. Proses Pengembalian Fleksibel & Rekonsiliasi Kondisi Fisik
- **Pengembalian Bertahap (*Partial Return*) & Penuh (*Full Return*)**: Fleksibilitas mengembalikan sebagian kuantitas barang dengan status transaksi otomatis (`partial_returned` atau `returned`).
- **Pemisahan Kondisi Fisik (Baik vs Rusak)**:
  - Unit kembali dalam kondisi **Baik** otomatis mengembalikan saldo stok ke `available_qty` (siap dipinjam kembali).
  - Unit kembali dalam kondisi **Rusak (*Damaged*)** dialihkan ke saldo `damaged_qty` (tidak dapat dipinjam) disertai catatan kondisi fisik.
- **Antarmuka Dropdown Atrium**: Dropdown pencarian tiket aktif dengan filter pencarian instan (*instant search*) dan badge status operasional.

### 6. Buku Riwayat Transaksi Peminjaman (*Borrowing History*)
- Audit lengkap seluruh sirkulasi peminjaman (status: `borrowed`, `partial_returned`, `returned`, `cancelled`, `overdue`).
- Pencarian dan filter fleksibel berdasarkan kode tiket, nama peminjam, departemen, status transaksi, dan rentang tanggal.
- Modal rincian mendalam menampilkan seluruh baris barang multi-item, nomor seri, petugas pencatat (*recorded by*), dan petugas penerima (*returned by*).

### 7. Buku Besar Mutasi Stok (*Stock Movements Ledger*)
- Ledger mutasi stok permanen (*append-only*, dilarang `UPDATE` dan `DELETE`) yang mencatat setiap pergerakan unit fisik:
  - `stock_in` (Penerimaan stok baru)
  - `adjustment` (Koreksi fisik stok)
  - `borrowed` (Pengurangan saat barang dipinjam)
  - `returned_good` (Penambahan stok siap pakai saat kembali baik)
  - `returned_damaged` (Pencatatan unit rusak saat pengembalian)
  - `cancelled` (Pemulihan stok saat pembatalan tiket pinjaman)

### 8. Laporan Operasional & Ekspor Data (CSV)
- Laporan inventaris, ringkasan sirkulasi peminjaman, mutasi stok, dan jejak aktivitas (*activity logs*).
- Fitur ekspor CSV berstandar Excel yang dilengkapi **UTF-8 BOM (`\uFEFF`)** dan sanitasi terhadap kerentanan injeksi formula spreadsheet (*CSV formula injection*).

### 9. Manajemen Pengguna & Keamanan Berlapis (RBAC)
- **Tepat Dua Peran Pengguna Terautentikasi**:
  - `admin`: Hak akses penuh atas konfigurasi master, manajemen staf, aktivasi akun, dan laporan audit.
  - `warehouse_keeper`: Akses operasional pergudangan (pencatatan barang, peminjaman, pengembalian, pergerakan stok).
- **Kebijakan Pendaftaran Mandiri *Pending Approval***: Pendaftaran akun baru otomatis berstatus nonaktif (`is_active = FALSE`) dan hanya dapat masuk setelah disetujui serta diaktifkan oleh Administrator.
- **Proteksi Database Triggers**: Trigger `handle_new_user` dan `protect_profile_roles` memastikan role tidak dapat dimanipulasi dari sisi klien.

---

## 🗄️ Skema Database Supabase

Seluruh migrasi skema database tersusun secara terstruktur dalam folder `supabase/migrations/`:

| File Migrasi | Deskripsi & Tujuan |
|---|---|
| `20261113000000_phase_a_user_roles.sql` | Struktur akun pengguna, migrasi role `admin` & `warehouse_keeper`, trigger handle new user, dan audit trail. |
| `20261113000001_phase_b_warehouse_borrowing_schema.sql` | Skema inti pergudangan: items, item_categories, storage_locations, borrowers, borrowings, borrowing_items, stock_movements. |
| `20261113000002_phase_b1_security_and_integrity_review.sql` | Hardening foreign keys, constraints stok non-negatif, dan integritas referensial. |
| `20261113000003_phase_b2_security_hardening.sql` | Kebijakan Row Level Security (RLS) dan pengetatan izin operasional. |
| `20261115000000_deactivate_new_signups_pending_approval.sql` | Kebijakan keamanan pendaftaran: akun baru otomatis `is_active = FALSE` sampai disetujui Admin. |
| `20261116000000_remove_legacy_visitor_deposit_schema.sql` | Migrasi pembersihan: menjatuhkan objek skema usang dengan klausul `RESTRICT`. |

### Entitas Tabel Inti:
1. `profiles`: Data akun pengguna dan petugas gudang (`admin` dan `warehouse_keeper`).
2. `item_categories`: Master kategori peralatan dan barang pergudangan.
3. `storage_locations`: Master rak, loker, dan zona penyimpanan barang beserta kapasitas maksimal.
4. `items`: Master data inventaris, tipe pelacakan (individual/bulk), nomor seri, dan saldo stok (`available_qty`, `borrowed_qty`, `damaged_qty`, `under_repair_qty`).
5. `borrowers`: Direktori karyawan peminjam alat PT Vinix Seven Aurum.
6. `borrowings`: Header transaksi peminjaman alat (`borrowed`, `partial_returned`, `returned`, `cancelled`, `overdue`).
7. `borrowing_items`: Baris rincian item barang dalam setiap tiket peminjaman multi-item.
8. `stock_movements`: Buku besar mutasi stok pergudangan (*append-only audit ledger*).
9. `activity_logs`: Jejak audit aktivitas administratif dan operasional sistem.

---

## 🚀 Panduan Memulai Cepat

### 1. Prasyarat Sistem
- **Node.js** versi 18+ atau 20+
- **NPM** versi 9+
- Proyek **Supabase** (PostgreSQL 15+)

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin berkas `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi konfigurasi dengan URL dan anon key proyek Supabase Anda:
```env
VITE_SUPABASE_URL=https://proyek-anda.supabase.co
VITE_SUPABASE_ANON_KEY=kunci-anon-anda
```
*(Catatan: Aplikasi memiliki fallback data demonstrasi untuk keperluan pengujian offline apabila kredensial belum terpasang).*

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka peramban di `http://localhost:5173`.

### 5. Menjalankan Rangkaian Pengujian Otomatis (*Automated Tests*)
Proyek ini dilengkapi dengan 153 skenario pengujian komprehensif mencakup fungsionalitas pergudangan, keamanan RBAC, integritas stok, dan audit data:
```bash
npm test
```

### 6. Membangun untuk Produksi (*Production Build*)
```bash
npm run build
```
Hasil kompilasi produksi yang teroptimasi akan tersimpan di direktori `dist/`.

---

## 🔒 Matriks Hak Akses (Role-Based Access Control)

| Modul / Tindakan Operasional | Warehouse Keeper | Admin |
|---|:---:|:---:|
| Dashboard Pemantauan Pergudangan | ✅ | ✅ |
| Master Data Inventaris (Lihat & Cari) | ✅ | ✅ |
| Tambah Barang & Penyesuaian Stok (*Adjustment*) | ✅ | ✅ |
| Hapus / Nonaktifkan Master Barang | ❌ | ✅ |
| Kelola Kategori & Lokasi Penyimpanan | ❌ | ✅ |
| Direktori Peminjam (Karyawan) | ✅ | ✅ |
| Transaksi Peminjaman Baru & Cetak Resi | ✅ | ✅ |
| Proses Pengembalian (Baik & Rusak) | ✅ | ✅ |
| Pembatalan Transaksi Peminjaman | ✅ | ✅ |
| Riwayat Peminjaman & Buku Mutasi Stok | ✅ | ✅ |
| Laporan & Ekspor Data CSV | ❌ | ✅ |
| Manajemen Akun Pengguna & Aktivasi Staf | ❌ | ✅ |

---

## 📄 Lisensi & Hak Cipta
Hak Cipta © 2026 **PT Vinix Seven Aurum**. Seluruh hak cipta dilindungi undang-undang.
