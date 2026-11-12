-- ============================================================
-- PHASE B.1 MIGRATION: Database Security, Stock Integrity & Transaction Safety Review
-- Project: SiPenitip — PT Vinix Seven Aurum Warehouse Management System
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
  condition,
  min_stock_alert,
  is_active,
  updated_at,
  updated_by
) ON public.items TO authenticated;

-- Cabut izin DELETE pada borrowings dan borrowing_items dari seluruh client role
REVOKE DELETE ON public.borrowings FROM authenticated, anon, PUBLIC;
REVOKE DELETE ON public.borrowing_items FROM authenticated, anon, PUBLIC;

COMMIT;

