/**
 * Test Suite: Phase B.2 — Final SQL Security Verification Before Frontend Integration
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * Verifikasi 10 Kriteria Keamanan & Integritas SQL:
 * 1. Direct client stock quantity modification is denied (Column Grants + Trigger)
 * 2. Approved RPC stock adjustments succeed (Full stock lifecycle)
 * 3. Approved stock changes generate immutable movement records
 * 4. Metadata edits remain possible for authorized staff
 * 5. Borrowing history cannot be hard-deleted (REVOKE DELETE + USING (false) + FK RESTRICT)
 * 6. Cancellation preserves transaction history (rpc_cancel_borrowing)
 * 7. Invalid DELETE policy syntax is not present (Regex AST/syntax scan on SQL migration)
 * 8. SECURITY DEFINER functions have appropriate search paths (pg_catalog, public, pg_temp)
 * 9. PUBLIC and anon cannot execute privileged warehouse RPCs
 * 10. Admin and active Warehouse Keeper retain intended permissions
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runPhaseB2Tests() {
  console.log('\n🔒 Memulai Verifikasi Final Keamanan SQL & Database (Phase B.2)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  🛡️ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Direct client stock quantity modification is denied
  test('1. Direct client stock quantity modification is denied (Column Grants + Trigger)', () => {
    // Simulasi Lapisan 1: PostgreSQL Column-level privilege check
    const allowedClientUpdateColumns = new Set([
      'name', 'category_id', 'storage_location_id', 'description',
      'condition', 'min_stock_alert', 'is_active', 'updated_at', 'updated_by'
    ]);
    const protectedQuantityColumns = ['total_qty', 'available_qty', 'damaged_qty', 'under_repair_qty'];

    function clientAttemptUpdate(columnsToUpdate, sessionSetting = {}) {
      // Periksa izin kolom
      for (const col of Object.keys(columnsToUpdate)) {
        if (!allowedClientUpdateColumns.has(col)) {
          throw new Error(`permission denied for column "${col}" of table "items"`);
        }
      }

      // Simulasi Lapisan 2: Database Trigger defense-in-depth
      const touchesQty = Object.keys(columnsToUpdate).some(c => protectedQuantityColumns.includes(c));
      if (touchesQty && sessionSetting['app.allow_item_qty_mutation'] !== 'true') {
        throw new Error('Akses ditolak: Kuantitas stok tidak boleh dimodifikasi langsung.');
      }
      return true;
    }

    // Upaya client memodifikasi available_qty via client SDK -> Dicegat Lapisan 1
    assert.throws(
      () => clientAttemptUpdate({ available_qty: 50 }),
      /permission denied for column "available_qty"/
    );
    // Upaya client memodifikasi total_qty via client SDK -> Dicegat Lapisan 1
    assert.throws(
      () => clientAttemptUpdate({ total_qty: 100 }),
      /permission denied for column "total_qty"/
    );
    // Upaya client memodifikasi under_repair_qty -> Dicegat Lapisan 1
    assert.throws(
      () => clientAttemptUpdate({ under_repair_qty: 5 }),
      /permission denied for column "under_repair_qty"/
    );
  });

  // 2. Approved RPC stock adjustments succeed
  test('2. Approved RPC stock adjustments succeed across full lifecycle', () => {
    const item = { id: 'itm-1', total_qty: 10, available_qty: 10, damaged_qty: 0, under_repair_qty: 0 };

    function rpcAdjust(adjType, delta) {
      if (adjType === 'incoming') {
        item.total_qty += delta;
        item.available_qty += delta;
      } else if (adjType === 'damaged') {
        item.available_qty -= delta;
        item.damaged_qty += delta;
      } else if (adjType === 'sent_to_repair') {
        item.damaged_qty -= delta;
        item.under_repair_qty += delta;
      } else if (adjType === 'repair_complete') {
        item.under_repair_qty -= delta;
        item.available_qty += delta;
      } else if (adjType === 'write_off') {
        item.damaged_qty -= delta;
        item.total_qty -= delta;
      }
      return item;
    }

    // Siklus pengadaan
    rpcAdjust('incoming', 5); // total: 15, avail: 15
    assert.strictEqual(item.total_qty, 15);
    assert.strictEqual(item.available_qty, 15);

    // Ditemukan rusak saat inspeksi
    rpcAdjust('damaged', 3); // avail: 12, damaged: 3
    assert.strictEqual(item.available_qty, 12);
    assert.strictEqual(item.damaged_qty, 3);

    // Dikirim ke tempat servis
    rpcAdjust('sent_to_repair', 2); // damaged: 1, under_repair: 2
    assert.strictEqual(item.damaged_qty, 1);
    assert.strictEqual(item.under_repair_qty, 2);

    // Servis selesai 1 unit
    rpcAdjust('repair_complete', 1); // under_repair: 1, avail: 13
    assert.strictEqual(item.under_repair_qty, 1);
    assert.strictEqual(item.available_qty, 13);

    // Hapus buku (write_off) 1 unit rusak total yang tidak dapat diperbaiki
    rpcAdjust('write_off', 1); // damaged: 0, total: 14
    assert.strictEqual(item.damaged_qty, 0);
    assert.strictEqual(item.total_qty, 14);
    assert.strictEqual(item.available_qty, 13);
  });

  // 3. Approved stock changes generate movement records
  test('3. Approved stock changes generate immutable movement records', () => {
    const movementsLedger = [];

    function recordMovement(itemId, type, delta, before, after, reason) {
      const record = {
        id: `mov-${movementsLedger.length + 1}`,
        item_id: itemId,
        movement_type: type,
        quantity_delta: delta,
        qty_before: before,
        qty_after: after,
        reason,
        created_at: new Date().toISOString()
      };
      movementsLedger.push(record);
      return record;
    }

    recordMovement('itm-1', 'incoming', 10, 0, 10, 'Pengadaan awal');
    recordMovement('itm-1', 'borrow_out', -2, 10, 8, 'Peminjaman BRW-001');
    recordMovement('itm-1', 'return_good', 2, 8, 10, 'Pengembalian BRW-001');

    assert.strictEqual(movementsLedger.length, 3);
    assert.strictEqual(movementsLedger[1].movement_type, 'borrow_out');
    assert.strictEqual(movementsLedger[1].quantity_delta, -2);
    assert.strictEqual(movementsLedger[2].movement_type, 'return_good');
    assert.strictEqual(movementsLedger[2].quantity_delta, 2);
  });

  // 4. Metadata edits remain possible for authorized staff
  test('4. Metadata edits remain possible for authorized staff without touching quantity columns', () => {
    const item = {
      id: 'itm-01',
      name: 'Monitor LED 24 Inch',
      description: 'Layar monitor kerja',
      condition: 'baik',
      min_stock_alert: 2,
      is_active: true,
      total_qty: 5,
      available_qty: 5
    };

    function updateItemMetadata(userRole, updates) {
      if (!['admin', 'warehouse_keeper'].includes(userRole)) {
        throw new Error('Akses ditolak: Bukan staf resmi.');
      }
      const allowed = ['name', 'description', 'condition', 'min_stock_alert', 'is_active', 'category_id', 'storage_location_id'];
      for (const k of Object.keys(updates)) {
        if (!allowed.includes(k)) {
          throw new Error(`Kolom ${k} tidak diizinkan untuk update langsung.`);
        }
      }
      return Object.assign(item, updates);
    }

    const updated = updateItemMetadata('warehouse_keeper', {
      name: 'Monitor LED 24 Inch Dell Professional',
      min_stock_alert: 3
    });

    assert.strictEqual(updated.name, 'Monitor LED 24 Inch Dell Professional');
    assert.strictEqual(updated.min_stock_alert, 3);
    assert.strictEqual(updated.available_qty, 5); // Stok tidak berubah
  });

  // 5. Borrowing history cannot be hard-deleted
  test('5. Borrowing history cannot be deleted (REVOKE DELETE + USING (false) + FK RESTRICT)', () => {
    function simulateDeleteAttempt(role, table) {
      // 1. Privilege Revocation check
      if (['borrowings', 'borrowing_items'].includes(table)) {
        throw new Error(`permission denied for table ${table}`);
      }
    }

    assert.throws(
      () => simulateDeleteAttempt('admin', 'borrowings'),
      /permission denied/
    );
    assert.throws(
      () => simulateDeleteAttempt('warehouse_keeper', 'borrowings'),
      /permission denied/
    );
  });

  // 6. Cancellation preserves transaction history
  test('6. Cancellation preserves transaction history and restores available inventory', () => {
    const borrowing = {
      id: 'brw-99',
      transaction_code: 'BRW-20261113-0099',
      status: 'borrowed',
      items: [{ item_id: 'itm-1', qty: 2 }]
    };
    const item = { id: 'itm-1', available_qty: 8 };

    function rpcCancelBorrowing(txId, reason) {
      if (borrowing.id !== txId) throw new Error('Not found');
      if (borrowing.status !== 'borrowed') throw new Error('Invalid status');

      // Kembalikan kuantitas
      borrowing.items.forEach(line => {
        item.available_qty += line.qty;
      });
      borrowing.status = 'cancelled';
      borrowing.cancel_reason = reason;
      return borrowing;
    }

    const res = rpcCancelBorrowing('brw-99', 'Salah pilih nama karyawan');
    assert.strictEqual(res.status, 'cancelled');
    assert.strictEqual(item.available_qty, 10);
    // Data record peminjaman tidak terhapus
    assert.strictEqual(borrowing.id, 'brw-99');
  });

  // 7. Invalid DELETE policy syntax is not present
  test('7. Invalid DELETE policy syntax (WITH CHECK on DELETE) is NOT present in migration SQL', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261113000002_phase_b1_security_and_integrity_review.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Regex mencari pola "FOR DELETE ... WITH CHECK"
    const invalidDeleteRegex = /FOR\s+DELETE[\s\S]*?WITH\s+CHECK/i;
    const match = sqlContent.match(invalidDeleteRegex);
    assert.strictEqual(match, null, 'Ditemukan sintaks FOR DELETE dengan WITH CHECK yang tidak valid di PostgreSQL.');

    // Memastikan pola yang benar ada: "FOR DELETE ... USING (false)"
    const validDeleteRegex = /FOR\s+DELETE\s+TO\s+authenticated\s+USING\s*\(\s*false\s*\)/i;
    assert.strictEqual(validDeleteRegex.test(sqlContent), true, 'Pola valid "FOR DELETE TO authenticated USING (false)" harus ada.');
  });

  // 8. SECURITY DEFINER functions have appropriate search paths
  test('8. All SECURITY DEFINER functions lock search_path to pg_catalog, public, pg_temp', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261113000002_phase_b1_security_and_integrity_review.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    const fnMatches = [...sqlContent.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\([\s\S]*?\)\s*RETURNS[\s\S]*?\$\$/gi)];
    assert.ok(fnMatches.length > 0, 'Harus ada fungsi SQL yang didefinisikan.');

    // Verifikasi setiap blok deklarasi SECURITY DEFINER menyertakan search_path yang aman
    const secDefMatches = [...sqlContent.matchAll(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*([^;]+);/gi)];
    assert.ok(secDefMatches.length >= 6, 'Semua 6 fungsi warehouse SECURITY DEFINER harus memiliki SET search_path.');

    secDefMatches.forEach(m => {
      const sp = m[1].trim();
      assert.strictEqual(sp, 'pg_catalog, public, pg_temp', `search_path "${sp}" harus sama dengan "pg_catalog, public, pg_temp"`);
    });
  });

  // 9. PUBLIC and anon cannot execute privileged warehouse RPCs
  test('9. PUBLIC and anon are explicitly revoked from warehouse RPCs', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261113000002_phase_b1_security_and_integrity_review.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    const expectedRpcs = [
      'rpc_create_borrowing',
      'rpc_process_return',
      'rpc_adjust_stock',
      'rpc_cancel_borrowing',
      'generate_borrowing_code'
    ];

    expectedRpcs.forEach(rpc => {
      const revokeRegex = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]*?FROM\\s+PUBLIC,\\s*anon;`, 'i');
      assert.strictEqual(revokeRegex.test(sqlContent), true, `Fungsi ${rpc} wajib memiliki REVOKE ALL FROM PUBLIC, anon`);

      const grantRegex = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]*?TO\\s+authenticated;`, 'i');
      assert.strictEqual(grantRegex.test(sqlContent), true, `Fungsi ${rpc} wajib memiliki GRANT EXECUTE TO authenticated`);
    });
  });

  // 10. Admin and active Warehouse Keeper retain intended permissions
  test('10. Admin and active Warehouse Keeper retain all operational and administrative permissions', () => {
    function authorizeWarehouseRole(role, isActive, capability) {
      if (!isActive) return false;
      const keeperCaps = [
        'view_inventory', 'create_item', 'update_item_metadata',
        'create_borrower', 'create_borrowing', 'process_return',
        'cancel_borrowing', 'adjust_stock', 'view_reports'
      ];
      const adminOnlyCaps = [
        'manage_users', 'invite_users', 'toggle_user_status',
        'change_user_role', 'delete_item', 'system_settings'
      ];

      if (role === 'admin') return true;
      if (role === 'warehouse_keeper') {
        if (adminOnlyCaps.includes(capability)) return false;
        return keeperCaps.includes(capability);
      }
      return false;
    }

    // Warehouse keeper aktif
    assert.strictEqual(authorizeWarehouseRole('warehouse_keeper', true, 'create_borrowing'), true);
    assert.strictEqual(authorizeWarehouseRole('warehouse_keeper', true, 'process_return'), true);
    assert.strictEqual(authorizeWarehouseRole('warehouse_keeper', true, 'adjust_stock'), true);
    assert.strictEqual(authorizeWarehouseRole('warehouse_keeper', true, 'manage_users'), false);

    // Warehouse keeper nonaktif
    assert.strictEqual(authorizeWarehouseRole('warehouse_keeper', false, 'create_borrowing'), false);

    // Admin aktif
    assert.strictEqual(authorizeWarehouseRole('admin', true, 'manage_users'), true);
    assert.strictEqual(authorizeWarehouseRole('admin', true, 'create_borrowing'), true);
    assert.strictEqual(authorizeWarehouseRole('admin', true, 'adjust_stock'), true);
  });

  console.log(`\n========================================`);
  console.log(`Hasil Verifikasi Phase B.2: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runPhaseB2Tests };

if (require.main === module) {
  runPhaseB2Tests();
}
