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

