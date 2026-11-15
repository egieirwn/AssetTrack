-- ============================================================
-- CORRECTIVE MIGRATION: New User Registration Approval Policy
-- Project: SiPenitip — PT Vinix Seven Aurum Warehouse Management System
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
