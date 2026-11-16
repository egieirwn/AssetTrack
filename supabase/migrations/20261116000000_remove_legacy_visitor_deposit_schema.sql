-- ============================================================
-- MIGRATION: 20261116000000_remove_legacy_visitor_deposit_schema.sql
-- Project: PT Vinix Seven Aurum - Warehouse Management System
-- Purpose: Complete removal of obsolete visitor deposit schema
--          belonging to a previous, unrelated personal project.
-- ============================================================
--
-- BACKUP RECOMMENDATION:
-- Before applying this migration on a production environment,
-- if any historical records from the old personal visitor project
-- need to be archived for external records, run the following pg_dump command:
--
-- pg_dump "$DATABASE_URL" \
--   --data-only \
--   -t public.visitors \
--   -t public.deposit_transactions \
--   -t public.deposit_items \
--   -t public.pickup_authorizations \
--   -t public.transaction_logs \
--   -f backup_legacy_visitor_deposit_data.sql
--
-- ============================================================
-- DEPENDENCY & RESTRICTION RULES:
-- 1. Uses PostgreSQL default RESTRICT behavior (strictly prohibits any cascade clause).
-- 2. Child tables are dropped BEFORE parent tables in strict dependency order:
--    a. public.deposit_items (depends on deposit_transactions)
--    b. public.pickup_authorizations (depends on deposit_transactions)
--    c. public.transaction_logs (depends on deposit_transactions)
--    d. public.deposit_transactions (depends on visitors and profiles)
--    e. public.visitors (parent table)
-- 3. Obsolete standalone visitor functions are dropped.
-- 4. Storage policy on 'deposit-items' bucket is removed.
-- 5. PRESERVED WAREHOUSE & CORE TABLES (MUST REMAIN INTACT):
--    - public.profiles
--    - public.item_categories
--    - public.storage_locations
--    - public.items
--    - public.borrowers
--    - public.borrowings
--    - public.borrowing_items
--    - public.stock_movements
--    - public.activity_logs
-- ============================================================

-- 1. HAPUS FUNGSI & RPC KHUSUS PENITIPAN BARANG
DROP FUNCTION IF EXISTS public.rpc_create_deposit(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.rpc_complete_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.generate_transaction_code();

-- 2. HAPUS KEBIJAKAN STORAGE UNTUK BUCKET PENITIPAN
DROP POLICY IF EXISTS "Staff can upload deposit item photos" ON storage.objects;

-- 3. HAPUS TABEL ANAK (CHILD TABLES) TERLEBIH DAHULU
-- a. deposit_items (foreign key ke deposit_transactions, item_categories, storage_locations)
DROP TABLE IF EXISTS public.deposit_items;

-- b. pickup_authorizations (foreign key ke deposit_transactions, profiles)
DROP TABLE IF EXISTS public.pickup_authorizations;

-- c. transaction_logs (foreign key ke deposit_transactions, profiles)
DROP TABLE IF EXISTS public.transaction_logs;

-- 4. HAPUS TABEL TRANSAKSI INDUK
-- deposit_transactions (foreign key ke visitors, profiles)
DROP TABLE IF EXISTS public.deposit_transactions;

-- 5. HAPUS TABEL PENGUNJUNG
-- visitors (tabel induk tanpa dependensi anak yang tersisa)
DROP TABLE IF EXISTS public.visitors;

-- 6. DOKUMENTASI VALIDASI STATUS TABEL GUDANG YANG TETAP UTUH
COMMENT ON TABLE public.profiles IS 'PT Vinix Seven Aurum - Akun Pengguna & Petugas Gudang (admin & warehouse_keeper)';
COMMENT ON TABLE public.items IS 'PT Vinix Seven Aurum - Master Data Inventaris & Saldo Stok Gudang';
COMMENT ON TABLE public.item_categories IS 'PT Vinix Seven Aurum - Master Kategori Peralatan Gudang';
COMMENT ON TABLE public.storage_locations IS 'PT Vinix Seven Aurum - Master Rak & Loker Penyimpanan Gudang';
COMMENT ON TABLE public.borrowers IS 'PT Vinix Seven Aurum - Direktori Karyawan Peminjam Alat';
COMMENT ON TABLE public.borrowings IS 'PT Vinix Seven Aurum - Transaksi Peminjaman & Sirkulasi Aset';
COMMENT ON TABLE public.borrowing_items IS 'PT Vinix Seven Aurum - Rincian Baris Barang Transaksi Peminjaman';
COMMENT ON TABLE public.stock_movements IS 'PT Vinix Seven Aurum - Buku Besar Mutasi Stok Pergudangan (Append-Only)';
COMMENT ON TABLE public.activity_logs IS 'PT Vinix Seven Aurum - Jejak Audit Aktivitas Administratif Sistem';
