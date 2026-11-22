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
