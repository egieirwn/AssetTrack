# Dokumentasi Sistem Manajemen Gudang & Peminjaman Barang (Vinix WMS)
## PT Vinix Seven Aurum

---

## 1. Ikhtisar Arsitektur Sistem

Aplikasi ini merupakan **Warehouse Inventory & Borrowing Management System** yang komprehensif untuk PT Vinix Seven Aurum.

Fondasi arsitektural ini mencakup:
- **Pondasi Keamanan (Phase A):** Skema role ke dua peran baku (`admin` dan `warehouse_keeper`), proteksi profil pengguna, pencegahan eskalasi hak istimewa secara mandiri (*self-promotion*), dan isolasi audit trail.
- **Skema Inventaris & Peminjaman (Phase B, B.1, B.2):** Penambahan skema gudang enterprise (`items`, `item_categories`, `storage_locations`, `borrowers`, `borrowings`, `borrowing_items`, `stock_movements`, dan `activity_logs`), penegakan integritas stok secara transaksional melalui PostgreSQL Triggers dan RPC berstatus `SECURITY DEFINER`, penguncian baris (`FOR UPDATE`), serta pemblokiran mutasi langsung dari sisi klien.
- **Manajemen Akun & Otorisasi (Phase C):** Modul administrasi staf terproteksi bagi Admin untuk mengelola akun penjaga gudang (`warehouse_keeper`).
- **Refaktor Antarmuka Pengguna (Phase D):** Redesain visual menyeluruh terinspirasi dari sistem desain modern *Atrium*, pembersihan fallback data tiruan (*zero silent mock data*), dan integrasi autentikasi fail-closed.
- **Manajemen Inventaris Gudang (Phase E):** Modul master barang dengan pembedaan *individual tracking* (alat bernomor seri unik) vs *quantity tracking* (alat/barang massal), barang masuk (*stock in*), penyesuaian stok (*stock adjustment*), dan audit log ledger mutasi.
- **Manajemen Peminjaman & Pengembalian (Phase F):** Modul direktori peminjam, peminjaman multi-item atomik, serah terima pengembalian parsial dan penuh, perutean barang rusak ke `damaged_qty`, pembatalan aman, dan cetak struk tanda terima QR Code.
- **Pusat Laporan & Verifikasi Akhir (Phase G):** Modul pelaporan terintegrasi mencakup Laporan Inventaris, Laporan Peminjaman, Laporan Mutasi Stok (*Stock Movements*), dan Jejak Audit (*Activity Logs*) dengan fitur ekspor CSV aman (kebal *formula injection*) serta tampilan cetak PDF formal.

---

## 2. Matriks Peran & Hak Akses (Roles & Permissions)

Sistem secara ketat hanya mengenal dua peran (*authenticated roles*):

| Modul / Operasi | Admin | Warehouse Keeper | Catatan Keamanan |
| :--- | :---: | :---: | :--- |
| **Login & Dashboard Operasional** | ✅ | ✅ | Keeper hanya melihat ringkasan operasional harian. |
| **Katalog & Inventaris Barang (Read)** | ✅ | ✅ | Terbuka untuk seluruh staf gudang aktif. |
| **Pendaftaran & Edit Barang (Create/Update)** | ✅ | ✅ | Mutasi kuantitas langsung diblokir via trigger. |
| **Deaktivasi / Soft Delete Barang** | ✅ | ❌ | Hanya Admin yang dapat menonaktifkan master barang. |
| **Barang Masuk & Penyesuaian Stok (RPC)** | ✅ | ✅ | Menjalankan RPC atomik dengan audit trail wajib. |
| **Direktori Peminjam (CRUD)** | ✅ | ✅ | Keeper dapat menambah/memperbarui data peminjam. |
| **Pembuatan Peminjaman Baru (RPC)** | ✅ | ✅ | Menjalankan RPC atomik dengan penguncian baris. |
| **Pemrosesan Pengembalian (RPC)** | ✅ | ✅ | Mengurangi pinjaman, merutekan barang baik/rusak. |
| **Pembatalan Peminjaman (RPC)** | ✅ | ✅ | Hanya tiket `borrowed` tanpa pengembalian sebelumnya. |
| **Pusat Laporan (Inventory, Loans, Ledger)** | ✅ | ❌ (Menu Khusus) | Admin memiliki akses penuh ke seluruh audit trail & ekspor. |
| **Manajemen Petugas (Akun Staf)** | ✅ | ❌ | Keeper diblokir oleh RLS dan Route Guard. |
| **Penetapan Role Akun Baru / Promosi** | ✅ (Superuser/DB) | ❌ | Trigger `handle_new_user()` mengunci role `warehouse_keeper`. |

---

## 3. Urutan Eksekusi Migrasi Database

Seluruh migrasi database PostgreSQL pada direktori `supabase/migrations/` disusun secara sekuensial dan berulang (*idempotent*):

1. **`20261110000000_phase_a_security_hardening.sql` (Phase A)**
   - Migrasi role lama `satpam` menjadi `warehouse_keeper`.
   - Implementasi RLS pada tabel `profiles` dan `activity_logs`.
   - Trigger `handle_new_user()` yang menetapkan default role `warehouse_keeper` dan mencegah promosi mandiri.
   - Trigger `protect_profile_roles()` yang membatasi pengubahan role hanya untuk Admin.
   - Fungsi sequence atomik untuk generator kode unik.
2. **`20261113000001_phase_b_warehouse_inventory_schema.sql` (Phase B)**
   - Pembuatan tabel master gudang: `item_categories`, `storage_locations`, `items`, `borrowers`, `borrowings`, `borrowing_items`, dan `stock_movements`.
   - Check constraints integritas non-negatif (`total_qty >= 0`, `available_qty >= 0`, `damaged_qty >= 0`, `under_repair_qty >= 0`).
   - Formula integritas stok: `total_qty = available_qty + borrowed_qty + damaged_qty + under_repair_qty`.
3. **`20261113000002_phase_b1_security_and_integrity_review.sql` (Phase B.1)**
   - Hardening trigger `protect_item_quantities()` terhadap pembaruan kolom stok secara langsung.
   - Pengecekan flag konfigurasi transaksional `app.allow_item_qty_mutation`.
   - RPC function atomik berstatus `SECURITY DEFINER` dengan penguncian baris `FOR UPDATE`:
     - `rpc_create_borrowing()`
     - `rpc_process_return()`
     - `rpc_adjust_stock()`
     - `rpc_cancel_borrowing()`
4. **`20261113000003_phase_b2_sql_security_hardening.sql` (Phase B.2)**
   - Penguatan pembatasan search path PostgreSQL (`SET search_path = public, pg_temp`).
   - Pencabutan hak eksekusi RPC dari role `anon` dan `PUBLIC` (`REVOKE EXECUTE ... FROM anon, PUBLIC`).
   - Pembatasan eksekusi hanya untuk role terautentikasi (`authenticated`).
   - Pemeriksaan validitas status pengguna (`is_active = true`).

---

## 4. Spesifikasi Variabel Lingkungan (.env)

Aplikasi membaca konfigurasi dari berkas `.env` pada root direktori:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Keamanan & Mode Pengujian
# Dalam mode produksi, VITE_ENABLE_DEV_DEMO wajib bernilai false atau ditiadakan!
VITE_ENABLE_DEV_DEMO=false
```

> [!WARNING]
> Jangan pernah menyertakan `SUPABASE_SERVICE_ROLE_KEY` pada file frontend `.env` atau commit ke repositori Git. Kunci service role hanya diizinkan untuk skrip administratif backend/staging yang terisolasi.

---

## 5. Prosedur Aman Pembuatan Akun Admin Pertama (Bootstrap)

Karena trigger `handle_new_user()` secara otomatis membatalkan role `admin` dari metadata signup publik dan menguncinya menjadi `warehouse_keeper`, pembuatan akun Admin awal pada database baru dilakukan melalui prosedur aman berikut:

1. **Pendaftaran Akun Pengguna:**
   Buka Supabase Console -> **Authentication** -> **Users** -> Klik **Add User** (atau lakukan registrasi email & kata sandi melalui antarmuka pendaftaran).
2. **Promosi Role Melalui SQL Editor (Sebagai Postgres Superuser):**
   Jalankan query SQL berikut di Supabase SQL Editor:
   ```sql
   -- Ganti email dengan alamat email admin yang telah didaftarkan
   UPDATE public.profiles
   SET 
     role = 'admin',
     is_active = true,
     full_name = 'Administrator Utama'
   WHERE email = 'admin@vinix7aurum.com';
   ```
3. **Verifikasi:**
   Periksa hasil eksekusi:
   ```sql
   SELECT id, email, full_name, role, is_active FROM public.profiles WHERE email = 'admin@vinix7aurum.com';
   ```
   Pastikan kolom `role` bernilai `'admin'` dan `is_active` bernilai `true`.

---

## 6. Alur Kerja Manajemen Inventaris Gudang

1. **Pendaftaran Barang Baru (`/inventaris/tambah`):**
   - Pilih jenis pelacakan:
     - **Pelacakan Individual (`individual`):** Digunakan untuk aset bernilai tinggi (misal: laptop, kamera). Wajib mengisi nomor seri unik (`asset_serial`). Kuantitas otomatis terkunci tepat 1 unit.
     - **Pelacakan Massal (`quantity`):** Digunakan untuk alat kerja umum atau perkakas (misal: helm proyek, kabel roll). Total unit fisik diisi sesuai stok awal (>= 1). Nomor seri bersifat opsional.
   - Pilih kategori barang dan lokasi rak/zona penyimpanan.
2. **Penerimaan Barang Masuk (`/inventaris/barang-masuk`):**
   - Menambahkan unit baru ke stok barang massal yang sudah terdaftar menggunakan RPC `rpc_adjust_stock` dengan tipe mutasi `'incoming'`.
3. **Penyesuaian Stok Fisik (`/inventaris/penyesuaian-stok`):**
   - Digunakan saat stock opname untuk menyesuaikan selisih barang (hilang, rusak, atau koreksi hitung) dengan tipe mutasi `'adjustment'`. Menghasilkan pratinjau matematis (*diff preview*) sebelum eksekusi.
4. **Riwayat Mutasi Stok (`/inventaris/pergerakan-stok`):**
   - Menampilkan catatan ledger append-only dari tabel `stock_movements`.

---

## 7. Alur Kerja Peminjaman & Pengembalian Barang

1. **Pendaftaran Peminjam (`/peminjam`):**
   - Menampung identitas karyawan/peminjam (Nama Lengkap, NIK/ID Karyawan, Departemen, Kontak).
2. **Pembuatan Peminjaman Baru (`/peminjaman/tambah`):**
   - Memilih peminjam aktif.
   - Menentukan estimasi waktu pengembalian (`expected_return_at`).
   - Menambahkan satu atau beberapa barang (*multi-item line*).
   - Validasi ketersediaan stok fisik secara realtime.
   - Eksekusi atomik melalui RPC `rpc_create_borrowing()` yang mencatat pergerakan stok `'borrow_out'` dan mengurangi `available_qty`.
3. **Pengembalian Barang (`/pengembalian` atau `/peminjaman/:id/pengembalian`):**
   - Masukkan nomor transaksi tiket peminjaman.
   - Tentukan kuantitas kondisi baik (*Good*) dan kondisi rusak (*Damaged*).
   - Eksekusi melalui RPC `rpc_process_return()`:
     - Unit baik dikembalikan ke `available_qty` dengan mutasi `'return_good'`.
     - Unit rusak diarahkan ke `damaged_qty` dengan mutasi `'return_damaged'`.
     - Jika seluruh unit kembali, status tiket berubah menjadi `'returned'`.
     - Jika baru sebagian unit kembali, status tiket berubah menjadi `'partial_returned'`.
4. **Pembatalan Transaksi:**
   - Transaksi berstatus `'borrowed'` tanpa ada riwayat pengembalian dapat dibatalkan via RPC `rpc_cancel_borrowing()`, yang memulihkan kuantitas ke `available_qty` dan mengubah status menjadi `'cancelled'`.

---

## 8. Panduan Modul Laporan & Ekspor Data

Pusat Laporan (`/laporan`) menyediakan 4 tab laporan utama:
1. **Laporan Inventaris Gudang:** Menyaring berdasarkan kategori, lokasi penyimpanan, jenis pelacakan, dan status ketersediaan.
2. **Laporan Peminjaman Aset:** Menyaring berdasarkan rentang tanggal pinjam, departemen peminjam, nama peminjam, dan status tiket (termasuk deteksi dinamis *terlambat* / *overdue*).
3. **Laporan Mutasi Stok (Ledger):** Audit jejak pergerakan barang (`incoming`, `borrow_out`, `return_good`, `return_damaged`, `adjustment`).
4. **Jejak Audit Aktivitas (Activity Logs):** Catatan seluruh aksi administratif dan operasional staf di sistem.

### Keamanan Ekspor CSV (Formula Injection Defense)
Semua fungsi ekspor CSV melalui `src/utils/exportUtils.js` dilengkapi perlindungan terhadap **CSV / Formula Injection**:
- Sel teks yang diawali dengan karakter berbahaya pemicu eksekusi formula di Microsoft Excel / Google Sheets (`=`, `+`, `-`, `@`, `\t`, `\r`) secara otomatis diawali dengan tanda kutip tunggal (`'`).
- File CSV disisipkan **UTF-8 Byte Order Mark (BOM - `\uFEFF`)** pada awal berkas agar karakter khusus dan aksen tampil sempurna saat dibuka di Microsoft Excel.
- Seluruh angka dan tanggal diformat sesuai standar lokal Indonesia (`id-ID`).

### Ekspor Cetak / PDF
Tombol cetak pada masing-masing tab membuka tampilan cetak berorientasi lanskap (*landscape printable format*) dengan header resmi PT Vinix Seven Aurum, tanggal cetak, dan tanda tangan penanggung jawab gudang.

---

## 9. Petunjuk Pengujian Staging Integration Test Harness

Skrip pengujian integrasi staging berada pada `tests/test_staging_integration.cjs`. Skrip ini dilengkapi dengan mekanisme pengamanan ketat:

- **Guardrail URL:** Menolak dijalankan jika URL Supabase terdeteksi mengarah ke production domain.
- **Konfirmasi Eksplisit:** Mewajibkan environment flag `CONFIRM_STAGING_TESTS=true`.
- **Isolasi Data Uji:** Seluruh data uji menggunakan prefix kode unik `TEST-STG-...`.
- **Pembersihan Bersih (Clean Teardown):** Hanya membersihkan data uji yang dibuat pada sesi eksekusi tersebut, tanpa menyentuh data riil dan melarang keras instruksi `DROP`, `TRUNCATE`, atau database reset.

Cara menjalankan:
```bash
# Jalankan pengujian unit lokal lengkap (125 tests)
npm test

# Build verifikasi produksi
npm run build
```

---

## 10. Batasan Sistem Saat Ini & Rekomendasi Masa Depan

1. **Pemindaian Barcode / RFID Hardware:**
   - Sistem saat ini mendukung pencarian manual dan QR code visual pada struk tanda terima. Rekomendasi masa depan adalah integrasi langsung dengan scanner barcode fisik berbasis USB/Bluetooth HID atau kamera smartphone menggunakan WebRTC bar-code detection.
2. **Otomasi Notifikasi Pengingat Jatuh Tempo:**
   - Deteksi keterlambatan saat ini dievaluasi secara dinamis saat memuat data di dashboard dan modul laporan. Disarankan mengimplementasikan scheduled job (Supabase pg_cron / Edge Functions) untuk mengirim notifikasi email atau pesan instan otomatis kepada peminjam sebelum tanggal jatuh tempo.
3. **Manajemen Servis & Vendor Perbaikan:**
   - Aset berstatus `under_repair` atau `damaged` saat ini tercatat di inventaris. Modul khusus untuk mencatat surat jalan ke vendor perbaikan eksternal dan tracking biaya servis dapat dipertimbangkan pada fase pengembangan berikutnya.
