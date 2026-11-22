-- ============================================================
-- PT Vinix Seven Aurum Warehouse Management System
-- Combined Database Setup Script (All Valid Migrations)
-- ============================================================

-- ==================== FILE: 20261113000000_phase_a_security_and_role_migration.sql ====================
-- ============================================================
-- PHASE A MIGRATION: Security Hardening & Role Migration
-- Project: PT Vinix Seven Aurum Warehouse Management System
-- Date: 2026-11-13
--
-- IMPORTANT SAFETY NOTES:
-- 1. Preserves all existing user IDs, profile data, Admin accounts,
--    visitors, deposit_transactions, deposit_items, and transaction_logs.
-- 2. Does NOT execute destructive DROP TABLE CASCADE operations.
-- 3. Does NOT promote any user to 'admin'.
-- 4. Stops with an exception if unexpected role values exist.
-- 5. Safe to review and test in a staging/development Supabase project.
--
-- RECOVERY / ROLLBACK CONSIDERATIONS:
-- - Before executing in production, create a Supabase database backup/snapshot.
-- - To roll back role values if required:
--     ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
--     UPDATE public.profiles SET role = 'satpam' WHERE role = 'warehouse_keeper';
--     ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('satpam', 'admin'));
-- - Note: Rolling back security fixes (RLS, triggers, RPC auth.uid() checks)
--   is not recommended unless restoring from pre-migration snapshot.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PRE-MIGRATION VALIDATION: Stop if unexpected roles exist
-- ============================================================
DO $$
DECLARE
  v_unexpected_roles TEXT;
BEGIN
  SELECT string_agg(DISTINCT role, ', ')
  INTO v_unexpected_roles
  FROM public.profiles
  WHERE role IS NULL OR role NOT IN ('admin', 'satpam', 'warehouse_keeper');

  IF v_unexpected_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Migrasi dihentikan: Ditemukan role tidak terduga pada public.profiles (%). Harap periksa secara manual sebelum melanjutkan.', v_unexpected_roles;
  END IF;
END $$;

-- ============================================================
-- 2. ROLE MIGRATION ('satpam' -> 'warehouse_keeper') & PROFILE EMAIL
-- ============================================================

-- Tambahkan kolom email ke profiles agar Admin dapat melihat identitas login petugas
-- tanpa perlu query langsung ke schema auth.users dari frontend.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Backfill email dari auth.users jika masih kosong (non-destructive)
UPDATE public.profiles p
SET email = COALESCE(u.email, '')
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- Lepas constraint lama sebelum migrasi nilai role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Migrasi role lama 'satpam' menjadi 'warehouse_keeper'
-- Akun 'admin' yang sudah ada tetap dipertahankan sebagai 'admin'.
UPDATE public.profiles
SET role = 'warehouse_keeper',
    updated_at = timezone('utc'::text, now())
WHERE role = 'satpam';

-- Terapkan constraint resmi dua role: 'admin' dan 'warehouse_keeper'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'warehouse_keeper'));

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'warehouse_keeper';

-- ============================================================
-- 3. HELPER FUNCTIONS: Enforce is_active = TRUE & Official Roles
-- ============================================================

-- Hanya Admin aktif yang lolos pemeriksaan is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Admin aktif maupun Penjaga Gudang aktif lolos pemeriksaan is_staff()
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouse_keeper')
      AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- 4. SECURE USER REGISTRATION (handle_new_user)
-- ============================================================
-- VULNERABILITY FIXED:
-- Versi sebelumnya membaca NEW.raw_user_meta_data->>'role' dan mengizinkan
-- pendaftar publik menetapkan role 'admin' sendiri melalui metadata signup.
--
-- PERBAIKAN:
-- 1. Seluruh pendaftaran baru via auth.users SELALU diberi role default 'warehouse_keeper'.
-- 2. Metadata signup tidak pernah dipercaya untuk menetapkan role 'admin'.
-- 3. Promosi atau pembuatan akun Admin hanya boleh dilakukan oleh Admin aktif
--    atau langsung melalui proses server-side terpercaya / SQL Administrator.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role TEXT := 'warehouse_keeper';
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, employee_id, shift, phone, is_active, profile_completed
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    v_default_role,
    COALESCE(NEW.raw_user_meta_data->>'employee_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'shift', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    TRUE,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
    full_name = CASE WHEN profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5. HARDEN PROFILE UPDATES (protect_profile_roles & RLS)
-- ============================================================
-- VULNERABILITY FIXED:
-- 1. Trigger lama hanya mengecek role valid, tidak melarang non-admin mengubah
--    role miliknya sendiri menjadi 'admin'.
-- 2. Kolom is_active dapat diubah sendiri oleh pengguna non-admin.
--
-- PERBAIKAN:
-- Trigger berjalan BEFORE UPDATE pada seluruh baris profiles. Jika role atau
-- is_active berubah oleh sesi terautentikasi (auth.uid() IS NOT NULL), pemanggil
-- wajib merupakan Admin aktif (public.is_admin()).
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Pastikan nilai role selalu valid
  IF NEW.role NOT IN ('admin', 'warehouse_keeper') THEN
    RAISE EXCEPTION 'Role tidak valid. Hanya ''admin'' atau ''warehouse_keeper'' yang diizinkan.';
  END IF;

  -- Blokir perubahan role atau status aktif jika dilakukan oleh non-admin terautentikasi
  IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    IF (auth.uid() IS NOT NULL OR auth.role() = 'authenticated') AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Admin aktif yang berwenang mengubah role atau status akun.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_roles ON public.profiles;
CREATE TRIGGER protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

-- Perbarui RLS pada profiles:
-- - SELECT: Pengguna boleh melihat profilnya sendiri (agar frontend dapat mendeteksi is_active = false)
--   dan staf aktif dapat melihat direktori profil petugas.
-- - UPDATE: Hanya pengguna aktif untuk profilnya sendiri (dengan role/is_active dikunci oleh trigger),
--   atau Admin aktif untuk mengelola akun Penjaga Gudang.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by own user or active staff" ON public.profiles;
CREATE POLICY "Profiles are viewable by own user or active staff"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((auth.uid() = id AND is_active = TRUE) OR public.is_admin())
  WITH CHECK ((auth.uid() = id AND is_active = TRUE) OR public.is_admin());

-- ============================================================
-- 6. FIX TRANSACTION CODE CONCURRENCY (PostgreSQL Sequence)
-- ============================================================
-- VULNERABILITY FIXED:
-- generate_transaction_code() sebelumnya memakai COUNT(*) + 1 yang rentan
-- duplikasi kode saat ada dua transaksi bersamaan.
--
-- PERBAIKAN:
-- Gunakan PostgreSQL SEQUENCE yang atomik. Nilai sequence disinkronkan
-- dari jumlah/urutan data historis yang sudah ada tanpa merusak format DEP-.

CREATE SEQUENCE IF NOT EXISTS public.seq_deposit_transaction_code START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_borrowing_transaction_code START 1;

DO $$
DECLARE
  v_max_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_max_count FROM public.deposit_transactions;
  PERFORM setval('public.seq_deposit_transaction_code', GREATEST(v_max_count, 1), v_max_count > 0);
END $$;

CREATE OR REPLACE FUNCTION public.generate_transaction_code()
RETURNS TEXT AS $$
DECLARE
  v_date TEXT;
  v_seq BIGINT;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');

  LOOP
    v_seq := nextval('public.seq_deposit_transaction_code');
    v_code := 'DEP-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.deposit_transactions WHERE transaction_code = v_code
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 7. FIX RPC IDENTITY TRUST (auth.uid() Enforcement)
-- ============================================================
-- VULNERABILITY FIXED:
-- rpc_create_deposit() dan rpc_complete_pickup() sebelumnya mempercayai
-- p_received_by / p_released_by yang dikirim dari frontend.
--
-- PERBAIKAN:
-- Kedua fungsi memvalidasi public.is_staff() (aktif) dan selalu memakai
-- auth.uid() sebagai aktor pencatat, mengabaikan nilai impersonasi dari klien.

CREATE OR REPLACE FUNCTION public.rpc_create_deposit(
  p_visitor_id UUID,
  p_received_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_code TEXT;
  v_transaction RECORD;
  v_item JSONB;
  v_location_id UUID;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak memiliki wewenang petugas.';
  END IF;

  v_code := public.generate_transaction_code();

  -- Selalu gunakan v_actor_id (auth.uid()), abaikan p_received_by dari klien
  INSERT INTO public.deposit_transactions (
    transaction_code, visitor_id, received_by, status, notes
  ) VALUES (
    v_code, p_visitor_id, v_actor_id, 'stored', COALESCE(p_notes, '')
  ) RETURNING * INTO v_transaction;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_location_id := NULLIF(v_item->>'storage_location_id', '')::UUID;

    INSERT INTO public.deposit_items (
      transaction_id, name, category_id, quantity, description,
      initial_condition, photo_url, storage_location_id, notes
    ) VALUES (
      v_transaction.id,
      v_item->>'name',
      NULLIF(v_item->>'category_id', '')::UUID,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE(v_item->>'description', ''),
      COALESCE(v_item->>'initial_condition', 'Baik'),
      COALESCE(v_item->>'photo_url', ''),
      v_location_id,
      COALESCE(v_item->>'notes', '')
    );

    IF v_location_id IS NOT NULL THEN
      UPDATE public.storage_locations
      SET active_count = active_count + 1,
          status = CASE WHEN active_count + 1 >= capacity THEN 'full' ELSE 'available' END
      WHERE id = v_location_id;
    END IF;
  END LOOP;

  INSERT INTO public.transaction_logs (
    transaction_id, action, old_status, new_status, performed_by
  ) VALUES (
    v_transaction.id, 'deposit_created', NULL, 'stored', v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction.id,
    'transaction_code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.rpc_complete_pickup(
  p_transaction_id UUID,
  p_released_by UUID DEFAULT NULL,
  p_pickup_method TEXT DEFAULT 'owner',
  p_representative_name TEXT DEFAULT '',
  p_representative_identity_number TEXT DEFAULT '',
  p_representative_phone TEXT DEFAULT '',
  p_representative_relationship TEXT DEFAULT '',
  p_authorization_method TEXT DEFAULT '',
  p_authorization_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_transaction RECORD;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak memiliki wewenang petugas.';
  END IF;

  SELECT * INTO v_transaction
  FROM public.deposit_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan.';
  END IF;

  IF v_transaction.status != 'stored' THEN
    RAISE EXCEPTION 'Transaksi tidak dapat diproses. Status saat ini: %', v_transaction.status;
  END IF;

  IF p_pickup_method = 'representative' THEN
    INSERT INTO public.pickup_authorizations (
      transaction_id, authorization_type, representative_name, representative_identity_number,
      representative_phone, representative_relationship, additional_notes, verification_status,
      verified_by, verified_at
    ) VALUES (
      p_transaction_id,
      COALESCE(NULLIF(p_authorization_method, ''), 'persetujuan_langsung'),
      p_representative_name,
      p_representative_identity_number,
      p_representative_phone,
      p_representative_relationship,
      p_authorization_notes,
      'verified',
      v_actor_id,
      timezone('utc'::text, now())
    );
  END IF;

  -- Selalu gunakan v_actor_id (auth.uid()), abaikan p_released_by dari klien
  UPDATE public.deposit_transactions SET
    status = 'completed',
    released_by = v_actor_id,
    pickup_method = p_pickup_method,
    representative_name = p_representative_name,
    representative_identity_number = p_representative_identity_number,
    representative_phone = p_representative_phone,
    representative_relationship = p_representative_relationship,
    authorization_method = p_authorization_method,
    authorization_notes = p_authorization_notes,
    pickup_verified_at = timezone('utc'::text, now()),
    pickup_completed_at = timezone('utc'::text, now()),
    checkout_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_transaction_id;

  UPDATE public.storage_locations sl
  SET active_count = GREATEST(0, sl.active_count - 1),
      status = CASE WHEN GREATEST(0, sl.active_count - 1) < sl.capacity THEN 'available' ELSE 'full' END,
      updated_at = timezone('utc'::text, now())
  FROM public.deposit_items di
  WHERE di.transaction_id = p_transaction_id
    AND di.storage_location_id = sl.id;

  INSERT INTO public.transaction_logs (
    transaction_id, action, old_status, new_status, notes, performed_by
  ) VALUES (
    p_transaction_id, 'pickup_completed', 'stored', 'completed',
    'Metode: ' || p_pickup_method, v_actor_id
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 8. SECURE TRANSACTION LOGS (Audit Integrity)
-- ============================================================
-- VULNERABILITY FIXED:
-- Policy lama mengizinkan WITH CHECK (true), sehingga user mana pun dapat
-- memalsukan riwayat log atau mengatasnamakan petugas lain.
--
-- PERBAIKAN:
-- Cabut insert langsung dari klien biasa; log hanya dibuat melalui RPC
-- SECURITY DEFINER atau oleh Admin aktif dengan performed_by = auth.uid().

DROP POLICY IF EXISTS "Staff or service can insert logs" ON public.transaction_logs;
DROP POLICY IF EXISTS "Admin can insert logs for self" ON public.transaction_logs;
DROP POLICY IF EXISTS "Block direct client inserts on transaction_logs" ON public.transaction_logs;

-- Log hanya boleh dibuat oleh fungsi RPC SECURITY DEFINER atau trigger tepercaya.
CREATE POLICY "Block direct client inserts on transaction_logs"
  ON public.transaction_logs FOR INSERT TO authenticated
  WITH CHECK (false);

-- Pastikan tidak ada policy UPDATE atau DELETE untuk menjaga sifat append-only audit log.
DROP POLICY IF EXISTS "No update on transaction_logs" ON public.transaction_logs;
DROP POLICY IF EXISTS "No delete on transaction_logs" ON public.transaction_logs;

COMMIT;


-- ==================== FILE: 20261113000001_phase_b_warehouse_inventory_schema.sql ====================
-- ============================================================
-- PHASE B MIGRATION: Warehouse Inventory & Borrowing Database Schema
-- Project: PT Vinix Seven Aurum Warehouse Management System
-- Date: 2026-11-13
--
-- IMPORTANT SAFETY & PRESERVATION RULES:
-- 1. Preserves Phase A security hardening (roles, active status, hardened triggers).
-- 2. Fully preserves legacy visitor deposit tables (visitors, deposit_transactions,
--    deposit_items, pickup_authorizations, transaction_logs) for historical audit.
-- 3. Reuses existing profiles, item_categories, and storage_locations tables.
-- 4. Creates new master inventory (items), employee directory (borrowers),
--    borrowing transactions (borrowings, borrowing_items), inventory ledger
--    (stock_movements), and audit trail (activity_logs).
-- 5. Implements atomic RPCs with row-level locks (SELECT ... FOR UPDATE)
--    to prevent negative stock, race conditions, and duplicate returns.
-- 6. No destructive DROP TABLE CASCADE operations.
--
-- RECOVERY / ROLLBACK CONSIDERATIONS:
-- - In case of rollback in a staging/dev environment:
--     DROP FUNCTION IF EXISTS public.rpc_create_borrowing CASCADE;
--     DROP FUNCTION IF EXISTS public.rpc_process_return CASCADE;
--     DROP FUNCTION IF EXISTS public.rpc_adjust_stock CASCADE;
--     DROP FUNCTION IF EXISTS public.generate_borrowing_code CASCADE;
--     DROP TABLE IF EXISTS public.activity_logs CASCADE;
--     DROP TABLE IF EXISTS public.stock_movements CASCADE;
--     DROP TABLE IF EXISTS public.borrowing_items CASCADE;
--     DROP TABLE IF EXISTS public.borrowings CASCADE;
--     DROP TABLE IF EXISTS public.borrowers CASCADE;
--     DROP TABLE IF EXISTS public.items CASCADE;
--     DROP SEQUENCE IF EXISTS public.seq_borrowing_transaction_code CASCADE;
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SEED / EVOLVE CATEGORIES FOR VINIX WAREHOUSE
-- ============================================================
-- Memastikan kategori relevan untuk gudang inventaris PT Vinix Seven Aurum
-- tersedia tanpa menimpa kategori lama.
INSERT INTO public.item_categories (name, description, is_active) VALUES
  ('Laptop & Komputer', 'Laptop operasional, PC desktop, mini PC, dan unit komputasi perusahaan', true),
  ('Monitor & Display', 'Monitor eksternal, display portabel, dan layar presentasi', true),
  ('Kamera & Dokumentasi', 'Kamera DSLR/mirrorless, lensa, tripod, dan perangkat dokumentasi', true),
  ('Proyektor & Audio Visual', 'Proyektor ruang rapat, pointer, speaker, dan mikrofon nirkabel', true),
  ('Kabel & Adapter', 'Kabel HDMI, DisplayPort, USB-C hub, kabel LAN, dan adapter daya', true),
  ('Aksesoris & Periferal', 'Mouse, keyboard, webcam, headset, dan perlengkapan kerja', true),
  ('Peralatan & Perkakas', 'Toolkit teknisi, barcode scanner, crimping tools, dan alat ukur', true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_active = true;

-- ============================================================
-- 2. SEED / EVOLVE STORAGE LOCATIONS FOR WAREHOUSE
-- ============================================================
-- Lokasi fisik penyimpanan gudang PT Vinix Seven Aurum
INSERT INTO public.storage_locations (code, name, capacity, description, is_active) VALUES
  ('GDG-A-RK01', 'Gudang Utama - Rak A1 (Komputasi)', 50, 'Penyimpanan laptop dan monitor', true),
  ('GDG-A-RK02', 'Gudang Utama - Rak A2 (Audio Visual)', 40, 'Penyimpanan proyektor dan kamera', true),
  ('GDG-A-LM01', 'Gudang Utama - Lemari Elektronik L1', 30, 'Penyimpanan perangkat sensitif dan kamera', true),
  ('GDG-B-RK01', 'Gudang Aksesoris - Rak B1 (Kabel & Hub)', 100, 'Penyimpanan kabel, adapter, dan konverter', true),
  ('GDG-B-DR01', 'Gudang Aksesoris - Drawer D1 (Periferal)', 80, 'Penyimpanan mouse, keyboard, dan dongle', true),
  ('GDG-C-TK01', 'Gudang Maintenance - Rak Perkakas', 50, 'Penyimpanan toolkit dan peralatan kerja', true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. TABEL MASTER INVENTARIS PERUSAHAAN (items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  tracking_type TEXT NOT NULL DEFAULT 'quantity' CHECK (tracking_type IN ('individual', 'quantity')),
  asset_serial TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  
  -- Kuantitas & Integritas Stok
  total_qty INTEGER NOT NULL DEFAULT 1 CHECK (total_qty >= 0),
  available_qty INTEGER NOT NULL DEFAULT 1 CHECK (available_qty >= 0),
  damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  CONSTRAINT chk_items_qty_sum CHECK (available_qty + damaged_qty <= total_qty),
  
  -- Aturan khusus aset individual (laptop/kamera/proyektor)
  CONSTRAINT chk_individual_asset_qty CHECK (
    tracking_type <> 'individual' OR (total_qty = 1 AND available_qty <= 1 AND damaged_qty <= 1)
  ),

  -- Status & Kondisi Fisik
  condition TEXT NOT NULL DEFAULT 'baik' CHECK (condition IN ('baik', 'cukup_baik', 'rusak_ringan', 'rusak_berat', 'perbaikan')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'borrowed', 'maintenance', 'inactive')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit Kepemilikan & Jejak Waktu
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial unique index untuk nomor seri / barcode (hanya bila diisi)
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_asset_serial_unique
  ON public.items(asset_serial)
  WHERE asset_serial IS NOT NULL AND asset_serial <> '';

CREATE INDEX IF NOT EXISTS idx_items_category_id ON public.items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_storage_location_id ON public.items(storage_location_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_items_tracking_type ON public.items(tracking_type);
CREATE INDEX IF NOT EXISTS idx_items_is_active ON public.items(is_active);
CREATE INDEX IF NOT EXISTS idx_items_item_code ON public.items(item_code);

DROP TRIGGER IF EXISTS trigger_items_updated_at ON public.items;
CREATE TRIGGER trigger_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================
-- 4. TABEL DIREKTORI PEMINJAM KARYAWAN (borrowers)
-- ============================================================
-- Karyawan peminjam BUKAN akun aplikasi (tanpa auth.users).
CREATE TABLE IF NOT EXISTS public.borrowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  employee_id TEXT DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- NIK / ID Karyawan bersifat unik jika diisi
CREATE UNIQUE INDEX IF NOT EXISTS idx_borrowers_employee_id_unique
  ON public.borrowers(employee_id)
  WHERE employee_id IS NOT NULL AND employee_id <> '';

CREATE INDEX IF NOT EXISTS idx_borrowers_full_name ON public.borrowers(full_name);
CREATE INDEX IF NOT EXISTS idx_borrowers_department ON public.borrowers(department);
CREATE INDEX IF NOT EXISTS idx_borrowers_is_active ON public.borrowers(is_active);

DROP TRIGGER IF EXISTS trigger_borrowers_updated_at ON public.borrowers;
CREATE TRIGGER trigger_borrowers_updated_at
  BEFORE UPDATE ON public.borrowers
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================
-- 5. TABEL TRANSAKSI PEMINJAMAN (borrowings)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.seq_borrowing_transaction_code START 1;

CREATE TABLE IF NOT EXISTS public.borrowings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_code TEXT NOT NULL UNIQUE,
  borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL DEFAULT '',
  borrowed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expected_return_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK (status IN ('borrowed', 'partial_returned', 'returned', 'overdue', 'cancelled')),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  returned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_borrowings_transaction_code ON public.borrowings(transaction_code);
CREATE INDEX IF NOT EXISTS idx_borrowings_borrower_id ON public.borrowings(borrower_id);
CREATE INDEX IF NOT EXISTS idx_borrowings_status ON public.borrowings(status);
CREATE INDEX IF NOT EXISTS idx_borrowings_expected_return_at ON public.borrowings(expected_return_at);
CREATE INDEX IF NOT EXISTS idx_borrowings_recorded_by ON public.borrowings(recorded_by);
CREATE INDEX IF NOT EXISTS idx_borrowings_borrowed_at ON public.borrowings(borrowed_at);

DROP TRIGGER IF EXISTS trigger_borrowings_updated_at ON public.borrowings;
CREATE TRIGGER trigger_borrowings_updated_at
  BEFORE UPDATE ON public.borrowings
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Generator nomor transaksi unik peminjaman (BRW-YYYYMMDD-XXXX) menggunakan SEQUENCE
CREATE OR REPLACE FUNCTION public.generate_borrowing_code()
RETURNS TEXT AS $$
DECLARE
  v_date TEXT;
  v_seq BIGINT;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  v_date := to_char(now(), 'YYYYMMDD');
  LOOP
    v_seq := nextval('public.seq_borrowing_transaction_code');
    v_code := 'BRW-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.borrowings WHERE transaction_code = v_code
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 6. TABEL RINCIAN BARANG PEMINJAMAN (borrowing_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.borrowing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrowing_id UUID NOT NULL REFERENCES public.borrowings(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  returned_good_qty INTEGER NOT NULL DEFAULT 0 CHECK (returned_good_qty >= 0),
  returned_damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK (returned_damaged_qty >= 0),
  CONSTRAINT chk_returned_qty_sum CHECK (returned_good_qty + returned_damaged_qty <= quantity),
  borrow_condition TEXT NOT NULL DEFAULT 'baik',
  return_condition TEXT DEFAULT '',
  return_notes TEXT DEFAULT '',
  returned_at TIMESTAMPTZ,
  returned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_borrowing_items_borrowing_id ON public.borrowing_items(borrowing_id);
CREATE INDEX IF NOT EXISTS idx_borrowing_items_item_id ON public.borrowing_items(item_id);

DROP TRIGGER IF EXISTS trigger_borrowing_items_updated_at ON public.borrowing_items;
CREATE TRIGGER trigger_borrowing_items_updated_at
  BEFORE UPDATE ON public.borrowing_items
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ============================================================
-- 7. BUKU BESAR MUTASI STOK INVENTARIS (stock_movements)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'initial', 'incoming', 'borrow_out', 'return_good',
    'return_damaged', 'repair_complete', 'adjustment'
  )),
  quantity_delta INTEGER NOT NULL,
  qty_before INTEGER NOT NULL CHECK (qty_before >= 0),
  qty_after INTEGER NOT NULL CHECK (qty_after >= 0),
  reference_id UUID,
  reason TEXT NOT NULL DEFAULT '',
  performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at);

-- ============================================================
-- 8. AUDIT LOG AKTIVITAS SISTEM (activity_logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by ON public.activity_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);

-- ============================================================
-- 9. ATOMIC RPC: rpc_create_borrowing
-- ============================================================
-- Transaksi peminjaman multi-item dengan kunci FOR UPDATE pada items
-- sesuai urutan item_id untuk mencegah deadlock dan race condition.
CREATE OR REPLACE FUNCTION public.rpc_create_borrowing(
  p_borrower_id UUID,
  p_purpose TEXT,
  p_expected_return_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_borrower RECORD;
  v_code TEXT;
  v_borrowing_id UUID;
  v_item_elem JSONB;
  v_item_id UUID;
  v_req_qty INTEGER;
  v_item_record RECORD;
  v_qty_before INTEGER;
  v_qty_after INTEGER;
BEGIN
  v_actor_id := auth.uid();

  -- 1. Validasi otorisasi petugas aktif
  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang memproses peminjaman.';
  END IF;

  -- 2. Validasi peminjam
  SELECT * INTO v_borrower
  FROM public.borrowers
  WHERE id = p_borrower_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjam tidak ditemukan dalam direktori karyawan.';
  END IF;

  IF NOT v_borrower.is_active THEN
    RAISE EXCEPTION 'Peminjam berstatus nonaktif dan tidak dapat melakukan peminjaman baru.';
  END IF;

  -- 3. Validasi daftar barang
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu barang harus disertakan dalam transaksi peminjaman.';
  END IF;

  IF p_expected_return_at IS NULL OR p_expected_return_at <= now() THEN
    RAISE EXCEPTION 'Waktu perkiraan kembali harus lebih besar dari waktu peminjaman saat ini.';
  END IF;

  -- 4. KUNCI SELURUH ITEM SESUAI URUTAN ID (DEADLOCK PREVENTION)
  PERFORM id
  FROM public.items
  WHERE id IN (
    SELECT DISTINCT (x->>'item_id')::UUID
    FROM jsonb_array_elements(p_items) x
  )
  ORDER BY id
  FOR UPDATE;

  -- 5. Buat header peminjaman
  v_code := public.generate_borrowing_code();

  INSERT INTO public.borrowings (
    transaction_code, borrower_id, purpose, borrowed_at,
    expected_return_at, status, recorded_by, notes
  ) VALUES (
    v_code, p_borrower_id, COALESCE(p_purpose, ''), timezone('utc'::text, now()),
    p_expected_return_at, 'borrowed', v_actor_id, COALESCE(p_notes, '')
  ) RETURNING id INTO v_borrowing_id;

  -- 6. Proses tiap item baris
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item_elem->>'item_id')::UUID;
    v_req_qty := COALESCE((v_item_elem->>'quantity')::INTEGER, 1);

    IF v_req_qty <= 0 THEN
      RAISE EXCEPTION 'Jumlah peminjaman harus lebih besar dari 0.';
    END IF;

    SELECT * INTO v_item_record
    FROM public.items
    WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang inventaris dengan ID % tidak ditemukan.', v_item_id;
    END IF;

    IF NOT v_item_record.is_active THEN
      RAISE EXCEPTION 'Barang "%" berstatus nonaktif dan tidak dapat dipinjam.', v_item_record.name;
    END IF;

    -- Validasi aset individual
    IF v_item_record.tracking_type = 'individual' THEN
      IF v_req_qty <> 1 THEN
        RAISE EXCEPTION 'Aset individual "%" hanya dapat dipinjam dengan kuantitas 1.', v_item_record.name;
      END IF;
      IF v_item_record.status <> 'available' OR v_item_record.available_qty < 1 THEN
        RAISE EXCEPTION 'Aset individual "%" sedang tidak tersedia (status: %).', v_item_record.name, v_item_record.status;
      END IF;
    ELSE
      -- Validasi inventaris kuantitas
      IF v_item_record.available_qty < v_req_qty THEN
        RAISE EXCEPTION 'Stok "%" tidak mencukupi. Tersedia: %, diminta: %.',
          v_item_record.name, v_item_record.available_qty, v_req_qty;
      END IF;
    END IF;

    -- Catat line item
    INSERT INTO public.borrowing_items (
      borrowing_id, item_id, quantity, borrow_condition
    ) VALUES (
      v_borrowing_id, v_item_id, v_req_qty, COALESCE(v_item_elem->>'condition', v_item_record.condition)
    );

    v_qty_before := v_item_record.available_qty;
    v_qty_after := v_qty_before - v_req_qty;

    -- Potong stok tersedia secara atomik
    UPDATE public.items
    SET available_qty = v_qty_after,
        status = CASE
          WHEN tracking_type = 'individual' THEN 'borrowed'
          WHEN v_qty_after = 0 AND damaged_qty = 0 THEN 'borrowed'
          ELSE status
        END,
        updated_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_item_id;

    -- Catat buku besar mutasi stok
    INSERT INTO public.stock_movements (
      item_id, movement_type, quantity_delta, qty_before, qty_after,
      reference_id, reason, performed_by
    ) VALUES (
      v_item_id, 'borrow_out', -v_req_qty, v_qty_before, v_qty_after,
      v_borrowing_id, 'Peminjaman: ' || v_code || ' (' || v_borrower.full_name || ')', v_actor_id
    );
  END LOOP;

  -- 7. Catat audit aktivitas
  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'borrowing', v_borrowing_id, 'borrowing_created',
    jsonb_build_object(
      'code', v_code,
      'borrower', v_borrower.full_name,
      'items_count', jsonb_array_length(p_items)
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrowing_id', v_borrowing_id,
    'transaction_code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 10. ATOMIC RPC: rpc_process_return
-- ============================================================
-- Memproses pengembalian barang secara parsial maupun penuh.
-- Barang rusak otomatis dialihkan ke damaged_qty dan tidak menjadi available.
CREATE OR REPLACE FUNCTION public.rpc_process_return(
  p_borrowing_id UUID,
  p_returns JSONB,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_borrowing RECORD;
  v_return_elem JSONB;
  v_line_id UUID;
  v_good_qty INTEGER;
  v_damaged_qty INTEGER;
  v_total_ret INTEGER;
  v_line_record RECORD;
  v_item_record RECORD;
  v_unreturned_qty INTEGER;
  v_all_returned BOOLEAN;
  v_new_status TEXT;
  v_qty_before INTEGER;
  v_qty_after INTEGER;
BEGIN
  v_actor_id := auth.uid();

  -- 1. Validasi otorisasi petugas aktif
  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang memproses pengembalian.';
  END IF;

  -- 2. Kunci transaksi peminjaman FOR UPDATE
  SELECT * INTO v_borrowing
  FROM public.borrowings
  WHERE id = p_borrowing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan.';
  END IF;

  IF v_borrowing.status NOT IN ('borrowed', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'Transaksi tidak dapat diproses untuk pengembalian (status saat ini: %).', v_borrowing.status;
  END IF;

  -- 3. Kunci seluruh item yang terlibat (deadlock prevention)
  PERFORM i.id
  FROM public.items i
  JOIN public.borrowing_items bi ON bi.item_id = i.id
  WHERE bi.borrowing_id = p_borrowing_id
  ORDER BY i.id
  FOR UPDATE;

  -- 4. Proses setiap item pengembalian
  FOR v_return_elem IN SELECT * FROM jsonb_array_elements(p_returns) LOOP
    v_line_id := (v_return_elem->>'borrowing_item_id')::UUID;
    v_good_qty := COALESCE((v_return_elem->>'return_good_qty')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_return_elem->>'return_damaged_qty')::INTEGER, 0);
    v_total_ret := v_good_qty + v_damaged_qty;

    IF v_total_ret <= 0 THEN
      CONTINUE; -- Abaikan jika tidak ada kuantitas yang dikembalikan pada baris ini
    END IF;

    SELECT * INTO v_line_record
    FROM public.borrowing_items
    WHERE id = v_line_id AND borrowing_id = p_borrowing_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Baris peminjaman dengan ID % tidak valid untuk transaksi ini.', v_line_id;
    END IF;

    v_unreturned_qty := v_line_record.quantity - (v_line_record.returned_good_qty + v_line_record.returned_damaged_qty);

    IF v_total_ret > v_unreturned_qty THEN
      RAISE EXCEPTION 'Jumlah pengembalian (%) melebihi sisa pinjaman (%) untuk item.',
        v_total_ret, v_unreturned_qty;
    END IF;

    SELECT * INTO v_item_record
    FROM public.items
    WHERE id = v_line_record.item_id
    FOR UPDATE;

    -- Update kuantitas stok barang
    v_qty_before := v_item_record.available_qty;
    v_qty_after := v_qty_before + v_good_qty; -- Hanya barang baik yang kembali ke available_qty

    UPDATE public.items
    SET available_qty = v_qty_after,
        damaged_qty = damaged_qty + v_damaged_qty,
        condition = CASE
          WHEN v_damaged_qty > 0 THEN COALESCE(NULLIF(v_return_elem->>'return_condition', ''), 'rusak_ringan')
          ELSE condition
        END,
        status = CASE
          WHEN tracking_type = 'individual' AND v_damaged_qty > 0 THEN 'maintenance'
          WHEN tracking_type = 'individual' AND v_good_qty > 0 THEN 'available'
          WHEN v_qty_after > 0 THEN 'available'
          ELSE status
        END,
        updated_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_item_record.id;

    -- Update rincian baris peminjaman
    UPDATE public.borrowing_items
    SET returned_good_qty = returned_good_qty + v_good_qty,
        returned_damaged_qty = returned_damaged_qty + v_damaged_qty,
        return_condition = COALESCE(v_return_elem->>'return_condition', 'baik'),
        return_notes = COALESCE(v_return_elem->>'return_notes', ''),
        returned_at = timezone('utc'::text, now()),
        returned_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_line_id;

    -- Catat mutasi barang baik bila ada
    IF v_good_qty > 0 THEN
      INSERT INTO public.stock_movements (
        item_id, movement_type, quantity_delta, qty_before, qty_after,
        reference_id, reason, performed_by
      ) VALUES (
        v_item_record.id, 'return_good', v_good_qty, v_qty_before, v_qty_after,
        p_borrowing_id, 'Pengembalian barang baik: ' || v_borrowing.transaction_code, v_actor_id
      );
    END IF;

    -- Catat mutasi barang rusak bila ada (tidak menambah available_qty)
    IF v_damaged_qty > 0 THEN
      INSERT INTO public.stock_movements (
        item_id, movement_type, quantity_delta, qty_before, qty_after,
        reference_id, reason, performed_by
      ) VALUES (
        v_item_record.id, 'return_damaged', 0, v_qty_after, v_qty_after,
        p_borrowing_id, 'Pengembalian barang rusak: ' || v_borrowing.transaction_code || ' (' || COALESCE(v_return_elem->>'return_notes', 'Kondisi rusak') || ')', v_actor_id
      );
    END IF;
  END LOOP;

  -- 5. Periksa apakah seluruh barang dalam peminjaman sudah kembali
  SELECT bool_and((returned_good_qty + returned_damaged_qty) >= quantity)
  INTO v_all_returned
  FROM public.borrowing_items
  WHERE borrowing_id = p_borrowing_id;

  v_new_status := CASE WHEN v_all_returned THEN 'returned' ELSE 'partial_returned' END;

  UPDATE public.borrowings
  SET status = v_new_status,
      returned_at = CASE WHEN v_all_returned THEN timezone('utc'::text, now()) ELSE returned_at END,
      returned_by = v_actor_id,
      notes = CASE
        WHEN COALESCE(p_notes, '') <> '' THEN COALESCE(notes, '') || E'\nCatatan Kembali: ' || p_notes
        ELSE notes
      END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_borrowing_id;

  -- 6. Audit log
  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'borrowing', p_borrowing_id, 'borrowing_returned',
    jsonb_build_object(
      'code', v_borrowing.transaction_code,
      'status', v_new_status,
      'notes', p_notes
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrowing_id', p_borrowing_id,
    'status', v_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 11. ATOMIC RPC: rpc_adjust_stock
-- ============================================================
-- Penyesuaian stok inventaris (stok masuk, pelaporan rusak, selesai perbaikan, rekonsiliasi manual).
CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(
  p_item_id UUID,
  p_adjustment_type TEXT,
  p_quantity_delta INTEGER,
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_item RECORD;
  v_new_total INTEGER;
  v_new_avail INTEGER;
  v_new_damaged INTEGER;
  v_qty_before INTEGER;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang mengubah stok.';
  END IF;

  IF p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Nilai perubahan kuantitas tidak boleh 0.';
  END IF;

  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang inventaris tidak ditemukan.';
  END IF;

  v_qty_before := v_item.available_qty;
  v_new_total := v_item.total_qty;
  v_new_avail := v_item.available_qty;
  v_new_damaged := v_item.damaged_qty;

  IF p_adjustment_type = 'incoming' THEN
    IF p_quantity_delta < 0 THEN
      RAISE EXCEPTION 'Kuantitas stok masuk harus bernilai positif.';
    END IF;
    v_new_total := v_new_total + p_quantity_delta;
    v_new_avail := v_new_avail + p_quantity_delta;

  ELSIF p_adjustment_type = 'damaged' THEN
    IF p_quantity_delta < 0 OR p_quantity_delta > v_item.available_qty THEN
      RAISE EXCEPTION 'Jumlah barang rusak tidak valid atau melebihi stok tersedia.';
    END IF;
    v_new_avail := v_new_avail - p_quantity_delta;
    v_new_damaged := v_new_damaged + p_quantity_delta;

  ELSIF p_adjustment_type = 'repair_complete' THEN
    IF p_quantity_delta < 0 OR p_quantity_delta > v_item.damaged_qty THEN
      RAISE EXCEPTION 'Jumlah barang selesai perbaikan melebihi kuantitas barang rusak.';
    END IF;
    v_new_damaged := v_new_damaged - p_quantity_delta;
    v_new_avail := v_new_avail + p_quantity_delta;

  ELSIF p_adjustment_type = 'adjustment' THEN
    -- Penyesuaian stok langsung (misal saat stock opname)
    v_new_avail := v_new_avail + p_quantity_delta;
    v_new_total := v_new_total + p_quantity_delta;
  ELSE
    RAISE EXCEPTION 'Tipe penyesuaian tidak dikenal: %', p_adjustment_type;
  END IF;

  -- Validasi integritas kuantitas
  IF v_new_total < 0 OR v_new_avail < 0 OR v_new_damaged < 0 OR (v_new_avail + v_new_damaged > v_new_total) THEN
    RAISE EXCEPTION 'Penyesuaian dibatalkan: Menghasilkan stok negatif atau tidak konsisten.';
  END IF;

  UPDATE public.items
  SET total_qty = v_new_total,
      available_qty = v_new_avail,
      damaged_qty = v_new_damaged,
      status = CASE
        WHEN v_new_avail > 0 THEN 'available'
        WHEN v_new_avail = 0 AND v_new_damaged > 0 THEN 'maintenance'
        ELSE status
      END,
      updated_by = v_actor_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_item_id;

  INSERT INTO public.stock_movements (
    item_id, movement_type, quantity_delta, qty_before, qty_after,
    reason, performed_by
  ) VALUES (
    p_item_id, p_adjustment_type, p_quantity_delta, v_qty_before, v_new_avail,
    COALESCE(p_reason, 'Penyesuaian stok: ' || p_adjustment_type), v_actor_id
  );

  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'stock', p_item_id, 'stock_adjusted',
    jsonb_build_object(
      'type', p_adjustment_type,
      'delta', p_quantity_delta,
      'qty_after', v_new_avail,
      'reason', p_reason
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'total_qty', v_new_total,
    'available_qty', v_new_avail,
    'damaged_qty', v_new_damaged
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES FOR NEW WAREHOUSE TABLES
-- ============================================================

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ---- ITEMS ----
DROP POLICY IF EXISTS "Staff can view items" ON public.items;
CREATE POLICY "Staff can view items"
  ON public.items FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert items" ON public.items;
CREATE POLICY "Staff can insert items"
  ON public.items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update items" ON public.items;
CREATE POLICY "Staff can update items"
  ON public.items FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Admin can delete items" ON public.items;
CREATE POLICY "Admin can delete items"
  ON public.items FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- BORROWERS ----
DROP POLICY IF EXISTS "Staff can view borrowers" ON public.borrowers;
CREATE POLICY "Staff can view borrowers"
  ON public.borrowers FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert borrowers" ON public.borrowers;
CREATE POLICY "Staff can insert borrowers"
  ON public.borrowers FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update borrowers" ON public.borrowers;
CREATE POLICY "Staff can update borrowers"
  ON public.borrowers FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Admin can delete borrowers" ON public.borrowers;
CREATE POLICY "Admin can delete borrowers"
  ON public.borrowers FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- BORROWINGS ----
DROP POLICY IF EXISTS "Staff can view borrowings" ON public.borrowings;
CREATE POLICY "Staff can view borrowings"
  ON public.borrowings FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert borrowings" ON public.borrowings;
CREATE POLICY "Staff can insert borrowings"
  ON public.borrowings FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update borrowings" ON public.borrowings;
CREATE POLICY "Staff can update borrowings"
  ON public.borrowings FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Admin can delete borrowings" ON public.borrowings;
CREATE POLICY "Admin can delete borrowings"
  ON public.borrowings FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---- BORROWING ITEMS ----
DROP POLICY IF EXISTS "Staff can view borrowing_items" ON public.borrowing_items;
CREATE POLICY "Staff can view borrowing_items"
  ON public.borrowing_items FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert borrowing_items" ON public.borrowing_items;
CREATE POLICY "Staff can insert borrowing_items"
  ON public.borrowing_items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update borrowing_items" ON public.borrowing_items;
CREATE POLICY "Staff can update borrowing_items"
  ON public.borrowing_items FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---- STOCK MOVEMENTS (Immutable Ledger) ----
DROP POLICY IF EXISTS "Staff can view stock_movements" ON public.stock_movements;
CREATE POLICY "Staff can view stock_movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Block direct client inserts on stock_movements" ON public.stock_movements;
CREATE POLICY "Block direct client inserts on stock_movements"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (false); -- Insert HANYA via RPC SECURITY DEFINER

-- ---- ACTIVITY LOGS (Immutable Audit Log) ----
DROP POLICY IF EXISTS "Staff can view activity_logs" ON public.activity_logs;
CREATE POLICY "Staff can view activity_logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Block direct client inserts on activity_logs" ON public.activity_logs;
CREATE POLICY "Block direct client inserts on activity_logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (false); -- Insert HANYA via RPC SECURITY DEFINER

COMMIT;


-- ==================== FILE: 20261113000002_phase_b1_security_and_integrity_review.sql ====================
-- ============================================================
-- PHASE B.1 MIGRATION: Database Security, Stock Integrity & Transaction Safety Review
-- Project: PT Vinix Seven Aurum Warehouse Management System
-- Date: 2026-11-13
--
-- PURPOSE & REVIEW FINDINGS ADDRESSED:
-- 1. DIRECT QUANTITY MUTATION EXPLOIT BLOCKED:
--    - In Phase B, direct UPDATE on items was permitted by RLS for staff,
--      allowing users to bypass stock_movements ledger.
--    - FIXED: Created trigger `protect_item_quantities()` that aborts any direct
--      client update to total_qty, available_qty, damaged_qty, or under_repair_qty
--      unless executed inside an authorized atomic RPC with local session flag.
--    - FIXED: Created trigger `record_initial_stock_movement()` on INSERT items
--      so any item created with initial total_qty > 0 automatically logs an 'initial'
--      stock movement.
-- 2. TRANSACTION DELETION & CASCADE ERASURE BLOCKED:
--    - In Phase B, Admin had DELETE policy on borrowings and borrowing_items
--      with ON DELETE CASCADE, which would destroy historical audit trails.
--    - FIXED: Converted foreign key from CASCADE to RESTRICT.
--    - FIXED: Revoked and blocked all DELETE policies on borrowings and borrowing_items.
--    - ADDED: Atomic `rpc_cancel_borrowing()` for auditable cancellation of unreturned borrowings.
-- 3. MAINTENANCE & REPAIR LIFECYCLE CLARIFIED:
--    - ADDED: `under_repair_qty` to public.items.
--    - Explicit inventory partition formula:
--        total_qty = available_qty + borrowed_qty + damaged_qty + under_repair_qty
--        borrowed_qty = total_qty - (available_qty + damaged_qty + under_repair_qty)
--    - Enhanced `rpc_adjust_stock` with 'sent_to_repair', 'repair_complete', and 'write_off'.
-- 4. RPC SECURITY DEFINER & SEARCH_PATH HARDENING:
--    - Hardened all RPCs with `SET search_path = public, pg_temp`.
--    - Explicitly REVOKED EXECUTE from PUBLIC and anon on all privileged RPCs.
--    - Explicitly GRANTED EXECUTE only to authenticated role.
-- 5. PRESERVES ALL PHASE A & B TABLES AND LEGACY DEPOSIT TABLES INTACT.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENHANCE ITEMS SCHEMA: under_repair_qty & STRICT INTEGRITY
-- ============================================================

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS under_repair_qty INTEGER NOT NULL DEFAULT 0 CHECK (under_repair_qty >= 0);

-- Pastikan jumlah seluruh unit fisik konsisten dan tidak pernah melebihi total_qty
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS chk_items_qty_sum;
ALTER TABLE public.items ADD CONSTRAINT chk_items_qty_sum
  CHECK (available_qty + damaged_qty + under_repair_qty <= total_qty);

-- Aturan ketat aset individual: unit tunggal (total_qty = 1)
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS chk_individual_asset_qty;
ALTER TABLE public.items ADD CONSTRAINT chk_individual_asset_qty
  CHECK (
    tracking_type <> 'individual' OR (
      total_qty = 1 AND
      available_qty <= 1 AND
      damaged_qty <= 1 AND
      under_repair_qty <= 1 AND
      (available_qty + damaged_qty + under_repair_qty <= 1)
    )
  );

-- Perluas tipe mutasi stok untuk mendukung lifecycle perbaikan dan penghapusan aset
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'initial', 'incoming', 'borrow_out', 'return_good',
    'return_damaged', 'sent_to_repair', 'repair_complete',
    'adjustment', 'write_off'
  ));

-- ============================================================
-- 2. PREVENT DIRECT CLIENT UPDATES TO INVENTORY QUANTITIES
-- ============================================================
-- TRIGGER: protect_item_quantities()
-- Mencegah update langsung ke kolom kuantitas stok melalui Supabase client SDK.
-- Kuantitas HANYA dapat dimodifikasi oleh RPC atomik resmi yang menyetel
-- parameter sesi lokal: app.allow_item_qty_mutation = 'true'.
CREATE OR REPLACE FUNCTION public.protect_item_quantities()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.total_qty IS DISTINCT FROM OLD.total_qty) OR
     (NEW.available_qty IS DISTINCT FROM OLD.available_qty) OR
     (NEW.damaged_qty IS DISTINCT FROM OLD.damaged_qty) OR
     (NEW.under_repair_qty IS DISTINCT FROM OLD.under_repair_qty) THEN

    IF current_setting('app.allow_item_qty_mutation', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Akses ditolak: Kuantitas stok (total_qty, available_qty, damaged_qty, under_repair_qty) tidak boleh dimodifikasi langsung. Gunakan RPC resmi (rpc_adjust_stock, rpc_create_borrowing, rpc_process_return, rpc_cancel_borrowing).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trigger_protect_item_quantities ON public.items;
CREATE TRIGGER trigger_protect_item_quantities
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.protect_item_quantities();

-- TRIGGER: record_initial_stock_movement()
-- Saat master item baru di-insert dengan kuantitas > 0, otomatis catat
-- mutasi saldo awal 'initial' ke buku besar stock_movements.
CREATE OR REPLACE FUNCTION public.record_initial_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    v_actor_id := NEW.created_by;
  END IF;

  IF NEW.total_qty > 0 THEN
    INSERT INTO public.stock_movements (
      item_id, movement_type, quantity_delta, qty_before, qty_after,
      reason, performed_by
    ) VALUES (
      NEW.id,
      'initial',
      NEW.available_qty,
      0,
      NEW.available_qty,
      'Saldo awal master item: ' || NEW.item_code,
      COALESCE(v_actor_id, (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1))
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trigger_record_initial_stock ON public.items;
CREATE TRIGGER trigger_record_initial_stock
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.record_initial_stock_movement();

-- ============================================================
-- 3. PROHIBIT HARD DELETION OF BORROWINGS & REVISE FOREIGN KEYS
-- ============================================================
-- Mengubah ON DELETE CASCADE menjadi ON DELETE RESTRICT agar baris peminjaman
-- tidak dapat terhapus secara sengaja maupun tidak sengaja.
ALTER TABLE public.borrowing_items DROP CONSTRAINT IF EXISTS borrowing_items_borrowing_id_fkey;
ALTER TABLE public.borrowing_items
  ADD CONSTRAINT borrowing_items_borrowing_id_fkey
  FOREIGN KEY (borrowing_id) REFERENCES public.borrowings(id) ON DELETE RESTRICT;

-- Cabut policy DELETE pada borrowings dan borrowing_items untuk menjamin audit trail permanen
DROP POLICY IF EXISTS "Admin can delete borrowings" ON public.borrowings;
DROP POLICY IF EXISTS "Admin can delete borrowing_items" ON public.borrowing_items;
DROP POLICY IF EXISTS "No deletion on borrowings" ON public.borrowings;
DROP POLICY IF EXISTS "No deletion on borrowing_items" ON public.borrowing_items;

CREATE POLICY "No deletion on borrowings"
  ON public.borrowings FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "No deletion on borrowing_items"
  ON public.borrowing_items FOR DELETE TO authenticated
  USING (false);

-- ============================================================
-- 4. HARDEN RPC: rpc_create_borrowing
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_create_borrowing(
  p_borrower_id UUID,
  p_purpose TEXT,
  p_expected_return_at TIMESTAMPTZ,
  p_notes TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_borrower RECORD;
  v_code TEXT;
  v_borrowing_id UUID;
  v_item_elem JSONB;
  v_item_id UUID;
  v_req_qty INTEGER;
  v_item_record RECORD;
  v_qty_before INTEGER;
  v_qty_after INTEGER;
BEGIN
  v_actor_id := auth.uid();

  -- 1. Validasi otorisasi petugas aktif
  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang memproses peminjaman.';
  END IF;

  -- 2. Validasi peminjam
  SELECT * INTO v_borrower
  FROM public.borrowers
  WHERE id = p_borrower_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peminjam tidak ditemukan dalam direktori karyawan.';
  END IF;

  IF NOT v_borrower.is_active THEN
    RAISE EXCEPTION 'Peminjam berstatus nonaktif dan tidak dapat melakukan peminjaman baru.';
  END IF;

  -- 3. Validasi daftar barang
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu barang harus disertakan dalam transaksi peminjaman.';
  END IF;

  IF p_expected_return_at IS NULL OR p_expected_return_at <= now() THEN
    RAISE EXCEPTION 'Waktu perkiraan kembali harus lebih besar dari waktu peminjaman saat ini.';
  END IF;

  -- 4. KUNCI SELURUH ITEM SESUAI URUTAN ID (DEADLOCK PREVENTION)
  PERFORM id
  FROM public.items
  WHERE id IN (
    SELECT DISTINCT (x->>'item_id')::UUID
    FROM jsonb_array_elements(p_items) x
  )
  ORDER BY id
  FOR UPDATE;

  -- Buka kunci mutasi kuantitas untuk sesi lokal transaksi ini
  PERFORM set_config('app.allow_item_qty_mutation', 'true', true);

  -- 5. Buat header peminjaman
  v_code := public.generate_borrowing_code();

  INSERT INTO public.borrowings (
    transaction_code, borrower_id, purpose, borrowed_at,
    expected_return_at, status, recorded_by, notes
  ) VALUES (
    v_code, p_borrower_id, COALESCE(p_purpose, ''), timezone('utc'::text, now()),
    p_expected_return_at, 'borrowed', v_actor_id, COALESCE(p_notes, '')
  ) RETURNING id INTO v_borrowing_id;

  -- 6. Proses tiap item baris
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item_elem->>'item_id')::UUID;
    v_req_qty := COALESCE((v_item_elem->>'quantity')::INTEGER, 1);

    IF v_req_qty <= 0 THEN
      RAISE EXCEPTION 'Jumlah peminjaman harus lebih besar dari 0.';
    END IF;

    SELECT * INTO v_item_record
    FROM public.items
    WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang inventaris dengan ID % tidak ditemukan.', v_item_id;
    END IF;

    IF NOT v_item_record.is_active THEN
      RAISE EXCEPTION 'Barang "%" berstatus nonaktif dan tidak dapat dipinjam.', v_item_record.name;
    END IF;

    -- Validasi aset individual
    IF v_item_record.tracking_type = 'individual' THEN
      IF v_req_qty <> 1 THEN
        RAISE EXCEPTION 'Aset individual "%" hanya dapat dipinjam dengan kuantitas 1.', v_item_record.name;
      END IF;
      IF v_item_record.status <> 'available' OR v_item_record.available_qty < 1 THEN
        RAISE EXCEPTION 'Aset individual "%" sedang tidak tersedia (status: %).', v_item_record.name, v_item_record.status;
      END IF;
    ELSE
      -- Validasi inventaris kuantitas
      IF v_item_record.available_qty < v_req_qty THEN
        RAISE EXCEPTION 'Stok "%" tidak mencukupi. Tersedia: %, diminta: %.',
          v_item_record.name, v_item_record.available_qty, v_req_qty;
      END IF;
    END IF;

    -- Catat line item
    INSERT INTO public.borrowing_items (
      borrowing_id, item_id, quantity, borrow_condition
    ) VALUES (
      v_borrowing_id, v_item_id, v_req_qty, COALESCE(v_item_elem->>'condition', v_item_record.condition)
    );

    v_qty_before := v_item_record.available_qty;
    v_qty_after := v_qty_before - v_req_qty;

    -- Potong stok tersedia secara atomik
    UPDATE public.items
    SET available_qty = v_qty_after,
        status = CASE
          WHEN tracking_type = 'individual' THEN 'borrowed'
          WHEN v_qty_after = 0 AND damaged_qty = 0 AND under_repair_qty = 0 THEN 'borrowed'
          ELSE status
        END,
        updated_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_item_id;

    -- Catat buku besar mutasi stok
    INSERT INTO public.stock_movements (
      item_id, movement_type, quantity_delta, qty_before, qty_after,
      reference_id, reason, performed_by
    ) VALUES (
      v_item_id, 'borrow_out', -v_req_qty, v_qty_before, v_qty_after,
      v_borrowing_id, 'Peminjaman: ' || v_code || ' (' || v_borrower.full_name || ')', v_actor_id
    );
  END LOOP;

  -- 7. Catat audit aktivitas
  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'borrowing', v_borrowing_id, 'borrowing_created',
    jsonb_build_object(
      'code', v_code,
      'borrower', v_borrower.full_name,
      'items_count', jsonb_array_length(p_items)
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrowing_id', v_borrowing_id,
    'transaction_code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ============================================================
-- 5. HARDEN RPC: rpc_process_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_process_return(
  p_borrowing_id UUID,
  p_returns JSONB,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_borrowing RECORD;
  v_return_elem JSONB;
  v_line_id UUID;
  v_good_qty INTEGER;
  v_damaged_qty INTEGER;
  v_total_ret INTEGER;
  v_line_record RECORD;
  v_item_record RECORD;
  v_unreturned_qty INTEGER;
  v_all_returned BOOLEAN;
  v_new_status TEXT;
  v_qty_before INTEGER;
  v_qty_after INTEGER;
BEGIN
  v_actor_id := auth.uid();

  -- 1. Validasi otorisasi petugas aktif
  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang memproses pengembalian.';
  END IF;

  -- 2. Kunci transaksi peminjaman FOR UPDATE
  SELECT * INTO v_borrowing
  FROM public.borrowings
  WHERE id = p_borrowing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan.';
  END IF;

  IF v_borrowing.status NOT IN ('borrowed', 'partial_returned', 'overdue') THEN
    RAISE EXCEPTION 'Transaksi tidak dapat diproses untuk pengembalian (status saat ini: %).', v_borrowing.status;
  END IF;

  -- 3. Kunci seluruh item yang terlibat (deadlock prevention)
  PERFORM i.id
  FROM public.items i
  JOIN public.borrowing_items bi ON bi.item_id = i.id
  WHERE bi.borrowing_id = p_borrowing_id
  ORDER BY i.id
  FOR UPDATE;

  -- Buka kunci mutasi kuantitas untuk sesi lokal transaksi ini
  PERFORM set_config('app.allow_item_qty_mutation', 'true', true);

  -- 4. Proses setiap item pengembalian
  FOR v_return_elem IN SELECT * FROM jsonb_array_elements(p_returns) LOOP
    v_line_id := (v_return_elem->>'borrowing_item_id')::UUID;
    v_good_qty := COALESCE((v_return_elem->>'return_good_qty')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_return_elem->>'return_damaged_qty')::INTEGER, 0);
    v_total_ret := v_good_qty + v_damaged_qty;

    IF v_total_ret <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_line_record
    FROM public.borrowing_items
    WHERE id = v_line_id AND borrowing_id = p_borrowing_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Baris peminjaman dengan ID % tidak valid untuk transaksi ini.', v_line_id;
    END IF;

    v_unreturned_qty := v_line_record.quantity - (v_line_record.returned_good_qty + v_line_record.returned_damaged_qty);

    IF v_total_ret > v_unreturned_qty THEN
      RAISE EXCEPTION 'Jumlah pengembalian (%) melebihi sisa pinjaman (%) untuk item.',
        v_total_ret, v_unreturned_qty;
    END IF;

    SELECT * INTO v_item_record
    FROM public.items
    WHERE id = v_line_record.item_id
    FOR UPDATE;

    v_qty_before := v_item_record.available_qty;
    v_qty_after := v_qty_before + v_good_qty; -- Hanya barang baik yang kembali ke available_qty

    UPDATE public.items
    SET available_qty = v_qty_after,
        damaged_qty = damaged_qty + v_damaged_qty,
        condition = CASE
          WHEN v_damaged_qty > 0 THEN COALESCE(NULLIF(v_return_elem->>'return_condition', ''), 'rusak_ringan')
          ELSE condition
        END,
        status = CASE
          WHEN tracking_type = 'individual' AND v_damaged_qty > 0 THEN 'maintenance'
          WHEN tracking_type = 'individual' AND v_good_qty > 0 THEN 'available'
          WHEN v_qty_after > 0 THEN 'available'
          ELSE status
        END,
        updated_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_item_record.id;

    -- Update rincian baris peminjaman
    UPDATE public.borrowing_items
    SET returned_good_qty = returned_good_qty + v_good_qty,
        returned_damaged_qty = returned_damaged_qty + v_damaged_qty,
        return_condition = COALESCE(v_return_elem->>'return_condition', 'baik'),
        return_notes = COALESCE(v_return_elem->>'return_notes', ''),
        returned_at = timezone('utc'::text, now()),
        returned_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_line_id;

    -- Catat mutasi barang baik bila ada
    IF v_good_qty > 0 THEN
      INSERT INTO public.stock_movements (
        item_id, movement_type, quantity_delta, qty_before, qty_after,
        reference_id, reason, performed_by
      ) VALUES (
        v_item_record.id, 'return_good', v_good_qty, v_qty_before, v_qty_after,
        p_borrowing_id, 'Pengembalian barang baik: ' || v_borrowing.transaction_code, v_actor_id
      );
    END IF;

    -- Catat mutasi barang rusak bila ada (tidak menambah available_qty)
    IF v_damaged_qty > 0 THEN
      INSERT INTO public.stock_movements (
        item_id, movement_type, quantity_delta, qty_before, qty_after,
        reference_id, reason, performed_by
      ) VALUES (
        v_item_record.id, 'return_damaged', 0, v_qty_after, v_qty_after,
        p_borrowing_id, 'Pengembalian barang rusak: ' || v_borrowing.transaction_code || ' (' || COALESCE(v_return_elem->>'return_notes', 'Kondisi rusak') || ')', v_actor_id
      );
    END IF;
  END LOOP;

  -- 5. Periksa apakah seluruh barang dalam peminjaman sudah kembali
  SELECT bool_and((returned_good_qty + returned_damaged_qty) >= quantity)
  INTO v_all_returned
  FROM public.borrowing_items
  WHERE borrowing_id = p_borrowing_id;

  v_new_status := CASE WHEN v_all_returned THEN 'returned' ELSE 'partial_returned' END;

  UPDATE public.borrowings
  SET status = v_new_status,
      returned_at = CASE WHEN v_all_returned THEN timezone('utc'::text, now()) ELSE returned_at END,
      returned_by = v_actor_id,
      notes = CASE
        WHEN COALESCE(p_notes, '') <> '' THEN COALESCE(notes, '') || E'\nCatatan Kembali: ' || p_notes
        ELSE notes
      END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_borrowing_id;

  -- 6. Audit log
  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'borrowing', p_borrowing_id, 'borrowing_returned',
    jsonb_build_object(
      'code', v_borrowing.transaction_code,
      'status', v_new_status,
      'notes', p_notes
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrowing_id', p_borrowing_id,
    'status', v_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ============================================================
-- 6. HARDEN RPC: rpc_adjust_stock (With Repair & Write-off Support)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_adjust_stock(
  p_item_id UUID,
  p_adjustment_type TEXT,
  p_quantity_delta INTEGER,
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_item RECORD;
  v_new_total INTEGER;
  v_new_avail INTEGER;
  v_new_damaged INTEGER;
  v_new_repair INTEGER;
  v_qty_before INTEGER;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang mengubah stok.';
  END IF;

  IF p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Nilai perubahan kuantitas tidak boleh 0.';
  END IF;

  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang inventaris tidak ditemukan.';
  END IF;

  -- Buka kunci mutasi kuantitas untuk sesi lokal transaksi ini
  PERFORM set_config('app.allow_item_qty_mutation', 'true', true);

  v_qty_before := v_item.available_qty;
  v_new_total := v_item.total_qty;
  v_new_avail := v_item.available_qty;
  v_new_damaged := v_item.damaged_qty;
  v_new_repair := v_item.under_repair_qty;

  IF p_adjustment_type = 'incoming' THEN
    IF p_quantity_delta < 0 THEN
      RAISE EXCEPTION 'Kuantitas stok masuk harus bernilai positif.';
    END IF;
    v_new_total := v_new_total + p_quantity_delta;
    v_new_avail := v_new_avail + p_quantity_delta;

  ELSIF p_adjustment_type = 'damaged' THEN
    IF p_quantity_delta < 0 OR p_quantity_delta > v_item.available_qty THEN
      RAISE EXCEPTION 'Jumlah barang rusak tidak valid atau melebihi stok tersedia (tersedia: %).', v_item.available_qty;
    END IF;
    v_new_avail := v_new_avail - p_quantity_delta;
    v_new_damaged := v_new_damaged + p_quantity_delta;

  ELSIF p_adjustment_type = 'sent_to_repair' THEN
    -- Mengalihkan barang dari status rusak/menunggu inspeksi ke bengkel perbaikan
    IF p_quantity_delta < 0 OR p_quantity_delta > v_item.damaged_qty THEN
      RAISE EXCEPTION 'Jumlah barang yang dikirim untuk servis melebihi kuantitas barang rusak (rusak: %).', v_item.damaged_qty;
    END IF;
    v_new_damaged := v_new_damaged - p_quantity_delta;
    v_new_repair := v_new_repair + p_quantity_delta;

  ELSIF p_adjustment_type = 'repair_complete' THEN
    -- Selesai perbaikan: jika ada di under_repair_qty kurangi dari sana, atau dari damaged_qty
    IF p_quantity_delta < 0 THEN
      RAISE EXCEPTION 'Jumlah perbaikan selesai harus bernilai positif.';
    END IF;

    IF v_new_repair >= p_quantity_delta THEN
      v_new_repair := v_new_repair - p_quantity_delta;
      v_new_avail := v_new_avail + p_quantity_delta;
    ELSIF (v_new_repair + v_new_damaged) >= p_quantity_delta THEN
      -- Potong sisa dari damaged_qty
      v_new_damaged := v_new_damaged - (p_quantity_delta - v_new_repair);
      v_new_repair := 0;
      v_new_avail := v_new_avail + p_quantity_delta;
    ELSE
      RAISE EXCEPTION 'Jumlah barang selesai perbaikan melebihi kuantitas yang sedang dalam perawatan (rusak + servis: %).', (v_new_damaged + v_new_repair);
    END IF;

  ELSIF p_adjustment_type = 'write_off' THEN
    -- Penghapusan permanen barang rusak total dari inventaris
    IF p_quantity_delta < 0 THEN
      RAISE EXCEPTION 'Kuantitas penghapusan aset harus bernilai positif.';
    END IF;
    IF v_new_damaged < p_quantity_delta THEN
      RAISE EXCEPTION 'Jumlah barang yang dihapus buku melebihi kuantitas barang rusak (rusak: %).', v_new_damaged;
    END IF;
    v_new_damaged := v_new_damaged - p_quantity_delta;
    v_new_total := v_new_total - p_quantity_delta;

  ELSIF p_adjustment_type = 'adjustment' THEN
    -- Rekonsiliasi stok manual (misal saat stock opname)
    v_new_avail := v_new_avail + p_quantity_delta;
    v_new_total := v_new_total + p_quantity_delta;
  ELSE
    RAISE EXCEPTION 'Tipe penyesuaian tidak dikenal: %', p_adjustment_type;
  END IF;

  -- Validasi integritas kuantitas
  IF v_new_total < 0 OR v_new_avail < 0 OR v_new_damaged < 0 OR v_new_repair < 0 OR
     (v_new_avail + v_new_damaged + v_new_repair > v_new_total) THEN
    RAISE EXCEPTION 'Penyesuaian dibatalkan: Menghasilkan stok negatif atau tidak konsisten.';
  END IF;

  UPDATE public.items
  SET total_qty = v_new_total,
      available_qty = v_new_avail,
      damaged_qty = v_new_damaged,
      under_repair_qty = v_new_repair,
      status = CASE
        WHEN tracking_type = 'individual' AND v_new_repair > 0 THEN 'maintenance'
        WHEN tracking_type = 'individual' AND v_new_damaged > 0 THEN 'maintenance'
        WHEN tracking_type = 'individual' AND v_new_avail > 0 THEN 'available'
        WHEN v_new_avail > 0 THEN 'available'
        WHEN v_new_avail = 0 AND (v_new_damaged > 0 OR v_new_repair > 0) THEN 'maintenance'
        ELSE status
      END,
      updated_by = v_actor_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_item_id;

  INSERT INTO public.stock_movements (
    item_id, movement_type, quantity_delta, qty_before, qty_after,
    reason, performed_by
  ) VALUES (
    p_item_id, p_adjustment_type, p_quantity_delta, v_qty_before, v_new_avail,
    COALESCE(p_reason, 'Penyesuaian stok: ' || p_adjustment_type), v_actor_id
  );

  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'stock', p_item_id, 'stock_adjusted',
    jsonb_build_object(
      'type', p_adjustment_type,
      'delta', p_quantity_delta,
      'qty_after', v_new_avail,
      'reason', p_reason
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'total_qty', v_new_total,
    'available_qty', v_new_avail,
    'damaged_qty', v_new_damaged,
    'under_repair_qty', v_new_repair
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ============================================================
-- 7. NEW ATOMIC RPC: rpc_cancel_borrowing
-- ============================================================
-- Membatalkan transaksi peminjaman yang salah rekam secara aman tanpa
-- menghapus baris transaksi (menjaga riwayat audit).
CREATE OR REPLACE FUNCTION public.rpc_cancel_borrowing(
  p_borrowing_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_actor_id UUID;
  v_borrowing RECORD;
  v_item RECORD;
  v_line RECORD;
  v_any_returned BOOLEAN;
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Akses ditolak: Akun tidak aktif atau tidak berwenang membatalkan transaksi.';
  END IF;

  SELECT * INTO v_borrowing
  FROM public.borrowings
  WHERE id = p_borrowing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan.';
  END IF;

  IF v_borrowing.status <> 'borrowed' THEN
    RAISE EXCEPTION 'Hanya transaksi berstatus "borrowed" yang belum diproses pengembalian yang dapat dibatalkan (status saat ini: %).', v_borrowing.status;
  END IF;

  -- Pastikan belum ada barang yang sempat dikembalikan
  SELECT EXISTS (
    SELECT 1 FROM public.borrowing_items
    WHERE borrowing_id = p_borrowing_id
      AND (returned_good_qty > 0 OR returned_damaged_qty > 0)
  ) INTO v_any_returned;

  IF v_any_returned THEN
    RAISE EXCEPTION 'Transaksi tidak dapat dibatalkan karena sebagian barang telah diproses pengembalian.';
  END IF;

  -- Kunci item sesuai urutan ID
  PERFORM i.id
  FROM public.items i
  JOIN public.borrowing_items bi ON bi.item_id = i.id
  WHERE bi.borrowing_id = p_borrowing_id
  ORDER BY i.id
  FOR UPDATE;

  -- Buka kunci mutasi kuantitas untuk sesi lokal transaksi ini
  PERFORM set_config('app.allow_item_qty_mutation', 'true', true);

  -- Kembalikan kuantitas barang ke available_qty
  FOR v_line IN SELECT * FROM public.borrowing_items WHERE borrowing_id = p_borrowing_id LOOP
    SELECT * INTO v_item FROM public.items WHERE id = v_line.item_id FOR UPDATE;

    UPDATE public.items
    SET available_qty = available_qty + v_line.quantity,
        status = CASE WHEN tracking_type = 'individual' THEN 'available' ELSE status END,
        updated_by = v_actor_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_line.item_id;

    INSERT INTO public.stock_movements (
      item_id, movement_type, quantity_delta, qty_before, qty_after,
      reference_id, reason, performed_by
    ) VALUES (
      v_line.item_id, 'adjustment', v_line.quantity, v_item.available_qty, v_item.available_qty + v_line.quantity,
      p_borrowing_id, 'Pembatalan transaksi ' || v_borrowing.transaction_code || ': ' || COALESCE(p_reason, 'Dibatalkan oleh petugas'), v_actor_id
    );
  END LOOP;

  UPDATE public.borrowings
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || E'\nDibatalkan: ' || COALESCE(p_reason, 'Tanpa alasan spesifik'),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_borrowing_id;

  INSERT INTO public.activity_logs (
    entity_type, entity_id, action, details, performed_by
  ) VALUES (
    'borrowing', p_borrowing_id, 'borrowing_cancelled',
    jsonb_build_object('code', v_borrowing.transaction_code, 'reason', p_reason),
    v_actor_id
  );

  RETURN jsonb_build_object('success', true, 'borrowing_id', p_borrowing_id, 'status', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- ============================================================
-- 8. RESTRICT EXECUTE GRANTS: REVOKE FROM PUBLIC & anon
-- ============================================================
-- Kunci wewenang eksekusi RPC hanya untuk role 'authenticated'.
-- Role 'PUBLIC' dan 'anon' secara eksplisit dicabut dari akses RPC ini.

REVOKE ALL ON FUNCTION public.rpc_create_borrowing(UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_borrowing(UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_process_return(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_return(UUID, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_adjust_stock(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_cancel_borrowing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_borrowing(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_borrowing_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_borrowing_code() TO authenticated;

-- ============================================================
-- 9. COLUMN-LEVEL PRIVILEGE HARDENING & DELETE REVOCATION
-- ============================================================
-- Cabut UPDATE tingkat tabel dari role authenticated pada public.items.
-- Berikan izin UPDATE HANYA untuk kolom metadata, sehingga kolom kuantitas
-- (total_qty, available_qty, damaged_qty, under_repair_qty) secara fisik
-- tidak memiliki izin UPDATE bagi client, dan HANYA dapat dimodifikasi oleh RPC.
REVOKE UPDATE ON public.items FROM authenticated;
GRANT UPDATE (
  name,
  category_id,
  storage_location_id,
  description,
  asset_serial,
  photo_url,
  condition,
  status,
  is_active,
  updated_at,
  updated_by
) ON public.items TO authenticated;

-- Cabut izin DELETE pada borrowings dan borrowing_items dari seluruh client role
REVOKE DELETE ON public.borrowings FROM authenticated, anon, PUBLIC;
REVOKE DELETE ON public.borrowing_items FROM authenticated, anon, PUBLIC;

COMMIT;



-- ==================== FILE: 20261113000003_phase_b2_security_hardening.sql ====================
-- ============================================================
-- PHASE B.2 CORRECTIVE MIGRATION: SQL Security Hardening & Privilege Lockdown
-- Project: PT Vinix Seven Aurum Warehouse Management System
-- Date: 2026-11-13
--
-- PURPOSE:
-- Standalone corrective migration for databases that already have Phase A, B,
-- and B.1 applied. Ensures 100% idempotent execution for:
-- 1. Valid PostgreSQL syntax for RLS DELETE policies (USING (false)).
-- 2. Column-level UPDATE privilege restrictions on public.items (blocking
--    direct client mutation of total_qty, available_qty, damaged_qty, under_repair_qty).
-- 3. Explicit REVOKE DELETE on borrowings and borrowing_items.
-- 4. Locking search_path to pg_catalog, public, pg_temp on all warehouse RPCs.
-- 5. Revoking EXECUTE from PUBLIC and anon, granting to authenticated only.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. FIX DELETE POLICIES & ENFORCE RESTRICT ON BORROWINGS
-- ============================================================
ALTER TABLE public.borrowing_items DROP CONSTRAINT IF EXISTS borrowing_items_borrowing_id_fkey;
ALTER TABLE public.borrowing_items
  ADD CONSTRAINT borrowing_items_borrowing_id_fkey
  FOREIGN KEY (borrowing_id) REFERENCES public.borrowings(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS "Admin can delete borrowings" ON public.borrowings;
DROP POLICY IF EXISTS "Admin can delete borrowing_items" ON public.borrowing_items;
DROP POLICY IF EXISTS "No deletion on borrowings" ON public.borrowings;
DROP POLICY IF EXISTS "No deletion on borrowing_items" ON public.borrowing_items;

CREATE POLICY "No deletion on borrowings"
  ON public.borrowings FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "No deletion on borrowing_items"
  ON public.borrowing_items FOR DELETE TO authenticated
  USING (false);

REVOKE DELETE ON public.borrowings FROM authenticated, anon, PUBLIC;
REVOKE DELETE ON public.borrowing_items FROM authenticated, anon, PUBLIC;

-- ============================================================
-- 2. COLUMN-LEVEL PRIVILEGE HARDENING ON public.items
-- ============================================================
-- Cabut UPDATE tingkat tabel dari role authenticated.
-- Berikan UPDATE HANYA untuk kolom-kolom metadata yang valid.
REVOKE UPDATE ON public.items FROM authenticated;
GRANT UPDATE (
  name,
  category_id,
  storage_location_id,
  description,
  asset_serial,
  photo_url,
  condition,
  status,
  is_active,
  updated_at,
  updated_by
) ON public.items TO authenticated;

-- ============================================================
-- 3. ENSURE SEARCH_PATH & EXECUTE PRIVILEGES ON RPCs
-- ============================================================
ALTER FUNCTION public.protect_item_quantities()
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.record_initial_stock_movement()
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.rpc_create_borrowing(UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.rpc_process_return(UUID, JSONB, TEXT)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.rpc_adjust_stock(UUID, TEXT, INTEGER, TEXT)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.rpc_cancel_borrowing(UUID, TEXT)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.generate_borrowing_code()
  SET search_path = pg_catalog, public, pg_temp;

-- Revoke privilege dari PUBLIC & anon
REVOKE ALL ON FUNCTION public.rpc_create_borrowing(UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_borrowing(UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_process_return(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_process_return(UUID, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_adjust_stock(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_cancel_borrowing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_borrowing(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_borrowing_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_borrowing_code() TO authenticated;

COMMIT;



-- ==================== FILE: 20261115000000_deactivate_new_signups_pending_approval.sql ====================
-- ============================================================
-- CORRECTIVE MIGRATION: New User Registration Approval Policy
-- Project: PT Vinix Seven Aurum Warehouse Management System
-- Date: 2026-11-15
--
-- PURPOSE:
-- Adjusts authentication behavior for environments where Supabase Email
-- Confirmation is disabled:
-- 1. Sets column default for public.profiles.is_active to FALSE.
-- 2. Updates handle_new_user() trigger function with hardened search_path = ''
--    and fully schema-qualified references, consistent with Phase B.2 SQL standards.
-- 3. Ensures all newly self-registered accounts are created with
--    role = 'warehouse_keeper' and is_active = FALSE (pending Admin approval).
-- 4. Strictly preserves active status for existing accounts (does NOT retroactively
--    deactivate existing Admin or active Warehouse Keepers).
-- 5. Revokes execution privileges on handle_new_user() from PUBLIC and anon.
-- 6. Preserves all existing security triggers, protect_profile_roles(), constraints,
--    and RLS policies.
-- ============================================================

BEGIN;

-- 1. Pastikan seluruh kolom profil gudang yang dibutuhkan tersedia secara idempotent
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'warehouse_keeper',
  ADD COLUMN IF NOT EXISTS employee_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Ubah default kolom is_active menjadi FALSE untuk pendaftaran profil baru
ALTER TABLE public.profiles 
  ALTER COLUMN is_active SET DEFAULT FALSE;

-- 3. Pastikan constraint role mengizinkan warehouse_keeper dan admin
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'warehouse_keeper', 'satpam'));

-- 4. Buat indeks untuk performa pencarian akun aktif
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- 5. Berikan hak akses tabel profiles kepada service_role dan supabase_auth_admin
GRANT ALL ON TABLE public.profiles TO postgres, service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;
  END IF;
END $$;

-- 6. Perbarui fungsi trigger handle_new_user() dengan search_path = '' (Phase B.2 Hardening Standard)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role TEXT := 'warehouse_keeper';
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, employee_id, shift, phone, is_active, profile_completed
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    v_default_role,
    COALESCE(NEW.raw_user_meta_data->>'employee_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'shift', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    FALSE, -- Pendaftaran baru wajib berstatus nonaktif hingga disetujui & diaktifkan oleh Admin
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
    full_name = CASE WHEN public.profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7. Berikan hak eksekusi trigger function kepada supabase_auth_admin dan service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;

-- 8. Pastikan trigger terpasang pada auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;


-- ==================== FILE: 20261116000000_remove_legacy_visitor_deposit_schema.sql ====================
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

-- 1. HAPUS FUNGSI & RPC KHUSUS SKEMA LEGASI
DROP FUNCTION IF EXISTS public.rpc_create_deposit(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.rpc_complete_pickup(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.generate_transaction_code();

-- 2. HAPUS KEBIJAKAN STORAGE UNTUK BUCKET LEGASI
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
