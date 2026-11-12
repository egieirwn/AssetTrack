-- ============================================================
-- PHASE B MIGRATION: Warehouse Inventory & Borrowing Database Schema
-- Project: SiPenitip — PT Vinix Seven Aurum Warehouse Management System
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
