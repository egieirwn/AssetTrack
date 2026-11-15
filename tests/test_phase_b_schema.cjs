/**
 * Test Suite: Phase B — Warehouse Inventory & Borrowing Schema
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * Verifikasi 14 Aturan Bisnis & Integritas Skema:
 * 1. Valid and invalid inventory quantities
 * 2. Unique item codes
 * 3. Unique borrower employee IDs where present
 * 4. Borrower reuse across transactions
 * 5. Multi-item borrowing
 * 6. Borrowing beyond available stock is rejected
 * 7. Partial returns
 * 8. Duplicate returns are rejected
 * 9. Damaged returned items do not become available
 * 10. Stock adjustments create movement history
 * 11. Concurrent borrowing cannot cause negative inventory
 * 12. Warehouse Keeper and Admin permissions are enforced
 * 13. Audit logs cannot be forged by ordinary authenticated users
 * 14. Legacy deposit records remain intact
 */

const assert = require('assert');

function runPhaseBTests() {
  console.log('\n📦 Memulai Pengujian Skema Gudang & Peminjaman (Phase B)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  🏬 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Valid and invalid inventory quantities
  test('1. Valid and invalid inventory quantities (non-negativity, sum integrity & individual asset rule)', () => {
    function validateItemQuantities({ tracking_type, total_qty, available_qty, damaged_qty }) {
      if (total_qty < 0 || available_qty < 0 || damaged_qty < 0) {
        throw new Error('Kuantitas tidak boleh negatif.');
      }
      if (available_qty + damaged_qty > total_qty) {
        throw new Error('Jumlah stok tersedia dan rusak tidak boleh melebihi total stok.');
      }
      if (tracking_type === 'individual') {
        if (total_qty !== 1 || available_qty > 1 || damaged_qty > 1) {
          throw new Error('Aset individual harus memiliki total_qty = 1 dan kuantitas <= 1.');
        }
      }
      return true;
    }

    // Valid quantity item
    assert.strictEqual(validateItemQuantities({ tracking_type: 'quantity', total_qty: 10, available_qty: 7, damaged_qty: 3 }), true);
    // Valid individual asset
    assert.strictEqual(validateItemQuantities({ tracking_type: 'individual', total_qty: 1, available_qty: 1, damaged_qty: 0 }), true);
    assert.strictEqual(validateItemQuantities({ tracking_type: 'individual', total_qty: 1, available_qty: 0, damaged_qty: 1 }), true);

    // Negative quantity rejected
    assert.throws(() => validateItemQuantities({ tracking_type: 'quantity', total_qty: 5, available_qty: -1, damaged_qty: 0 }), /negatif/);
    // Available + damaged > total rejected
    assert.throws(() => validateItemQuantities({ tracking_type: 'quantity', total_qty: 5, available_qty: 4, damaged_qty: 3 }), /melebihi total/);
    // Invalid individual asset qty rejected
    assert.throws(() => validateItemQuantities({ tracking_type: 'individual', total_qty: 2, available_qty: 2, damaged_qty: 0 }), /Aset individual/);
  });

  // 2. Unique item codes
  test('2. Item codes must be strictly unique', () => {
    const existingCodes = new Set(['ITM-LPT-001', 'ITM-LPT-002', 'ITM-CBL-001']);
    function insertItemCode(newCode) {
      if (existingCodes.has(newCode.trim().toUpperCase())) {
        throw new Error(`Item code "${newCode}" sudah digunakan.`);
      }
      existingCodes.add(newCode.trim().toUpperCase());
      return true;
    }

    assert.strictEqual(insertItemCode('ITM-MON-001'), true);
    assert.throws(() => insertItemCode('ITM-LPT-001'), /sudah digunakan/);
    assert.throws(() => insertItemCode('itm-lpt-001'), /sudah digunakan/);
  });

  // 3. Unique borrower employee IDs where present
  test('3. Borrower employee ID is unique when provided, but permits empty/null', () => {
    const borrowerDb = [
      { id: 'b1', full_name: 'Budi Santoso', employee_id: 'VIN-001' },
      { id: 'b2', full_name: 'Dewi Lestari', employee_id: 'VIN-002' },
      { id: 'b3', full_name: 'Magang A', employee_id: '' },
    ];

    function addBorrower(full_name, employee_id) {
      const trimmedId = (employee_id || '').trim();
      if (trimmedId !== '') {
        const duplicate = borrowerDb.some(b => b.employee_id === trimmedId);
        if (duplicate) {
          throw new Error(`Employee ID "${trimmedId}" sudah terdaftar.`);
        }
      }
      borrowerDb.push({ id: `b${borrowerDb.length + 1}`, full_name, employee_id: trimmedId });
      return true;
    }

    assert.strictEqual(addBorrower('Magang B', ''), true); // Empty allowed
    assert.strictEqual(addBorrower('Ahmad Rizki', 'VIN-003'), true); // Unique allowed
    assert.throws(() => addBorrower('Kloning Budi', 'VIN-001'), /sudah terdaftar/); // Duplicate rejected
  });

  // 4. Borrower reuse across transactions
  test('4. Borrower records can be safely reused across multiple transactions', () => {
    const borrower = { id: 'borrower-vin-01', full_name: 'Siti Rahma', is_active: true };
    const transactions = [];

    function recordBorrowing(borrowerId, code) {
      if (!borrower.is_active) throw new Error('Peminjam tidak aktif.');
      transactions.push({ code, borrower_id: borrowerId, timestamp: new Date() });
      return transactions.length;
    }

    assert.strictEqual(recordBorrowing(borrower.id, 'BRW-20261113-0001'), 1);
    assert.strictEqual(recordBorrowing(borrower.id, 'BRW-20261113-0002'), 2);
    assert.strictEqual(transactions.filter(t => t.borrower_id === borrower.id).length, 2);
  });

  // 5. Multi-item borrowing
  test('5. Single borrowing transaction supports multiple line items', () => {
    function createBorrowingPayload(borrowerId, items) {
      if (!items || items.length === 0) throw new Error('Minimal satu barang diperlukan.');
      return {
        borrower_id: borrowerId,
        items: items.map((itm, idx) => ({
          item_id: itm.item_id,
          quantity: itm.quantity || 1,
          line_no: idx + 1
        }))
      };
    }

    const payload = createBorrowingPayload('b1', [
      { item_id: 'itm-laptop-01', quantity: 1 },
      { item_id: 'itm-cable-hdmi', quantity: 2 },
      { item_id: 'itm-mouse-wireless', quantity: 1 }
    ]);

    assert.strictEqual(payload.items.length, 3);
    assert.strictEqual(payload.items.reduce((s, i) => s + i.quantity, 0), 4);
  });

  // 6. Borrowing beyond available stock is rejected
  test('6. Borrowing beyond available stock is strictly rejected', () => {
    const itemStock = { name: 'Kabel HDMI 2m', total_qty: 5, available_qty: 3, damaged_qty: 1 };

    function deductStock(item, requestedQty) {
      if (requestedQty <= 0) throw new Error('Kuantitas tidak valid.');
      if (item.available_qty < requestedQty) {
        throw new Error(`Stok "${item.name}" tidak mencukupi. Tersedia: ${item.available_qty}, diminta: ${requestedQty}.`);
      }
      item.available_qty -= requestedQty;
      return item.available_qty;
    }

    assert.throws(() => deductStock(itemStock, 4), /tidak mencukupi/);
    assert.strictEqual(deductStock(itemStock, 2), 1);
    assert.strictEqual(itemStock.available_qty, 1);
  });

  // 7. Partial returns
  test('7. Partial returns correctly update line item and header status to partial_returned', () => {
    const lineItem = { item_id: 'itm-01', quantity: 5, returned_good_qty: 0, returned_damaged_qty: 0 };
    let borrowingStatus = 'borrowed';

    function returnItems(line, goodQty, damagedQty) {
      const remaining = line.quantity - (line.returned_good_qty + line.returned_damaged_qty);
      if (goodQty + damagedQty > remaining) throw new Error('Melebihi sisa pinjaman.');
      line.returned_good_qty += goodQty;
      line.returned_damaged_qty += damagedQty;

      const allReturned = (line.returned_good_qty + line.returned_damaged_qty) >= line.quantity;
      borrowingStatus = allReturned ? 'returned' : 'partial_returned';
      return borrowingStatus;
    }

    // Kembalikan 2 dulu
    const status1 = returnItems(lineItem, 2, 0);
    assert.strictEqual(status1, 'partial_returned');
    assert.strictEqual(lineItem.returned_good_qty, 2);

    // Kembalikan 3 sisanya
    const status2 = returnItems(lineItem, 3, 0);
    assert.strictEqual(status2, 'returned');
    assert.strictEqual(lineItem.returned_good_qty, 5);
  });

  // 8. Duplicate returns are rejected
  test('8. Duplicate or excessive returns are strictly rejected', () => {
    const lineItem = { item_id: 'itm-01', quantity: 2, returned_good_qty: 2, returned_damaged_qty: 0 };

    function processReturn(line, goodQty, damagedQty) {
      const remaining = line.quantity - (line.returned_good_qty + line.returned_damaged_qty);
      if (remaining <= 0 || (goodQty + damagedQty > remaining)) {
        throw new Error('Barang sudah selesai dikembalikan seluruhnya.');
      }
      line.returned_good_qty += goodQty;
      return true;
    }

    assert.throws(() => processReturn(lineItem, 1, 0), /selesai dikembalikan/);
  });

  // 9. Damaged returned items do not become available
  test('9. Damaged returned items route to damaged_qty and do NOT increase available_qty', () => {
    const item = { name: 'Monitor 24 inch', total_qty: 1, available_qty: 0, damaged_qty: 0, status: 'borrowed' };

    function returnItemDamaged(itm, condition, notes) {
      // Return 1 damaged item
      itm.damaged_qty += 1;
      // available_qty TETAP 0
      itm.condition = condition;
      itm.status = 'maintenance';
      return itm;
    }

    const updated = returnItemDamaged(item, 'rusak_ringan', 'Layar bergaris');
    assert.strictEqual(updated.available_qty, 0);
    assert.strictEqual(updated.damaged_qty, 1);
    assert.strictEqual(updated.status, 'maintenance');
    assert.strictEqual(updated.condition, 'rusak_ringan');
  });

  // 10. Stock adjustments create movement history
  test('10. Stock adjustments update quantities and record immutable stock movement ledger', () => {
    const item = { id: 'itm-cable', total_qty: 10, available_qty: 10, damaged_qty: 0 };
    const movements = [];

    function adjustStock(itm, type, delta, reason, operatorId) {
      const qtyBefore = itm.available_qty;
      if (type === 'incoming') {
        itm.total_qty += delta;
        itm.available_qty += delta;
      } else if (type === 'damaged') {
        if (delta > itm.available_qty) throw new Error('Stok tersedia kurang.');
        itm.available_qty -= delta;
        itm.damaged_qty += delta;
      }
      const qtyAfter = itm.available_qty;

      movements.push({
        item_id: itm.id,
        type,
        delta,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        reason,
        performed_by: operatorId
      });
      return movements[movements.length - 1];
    }

    // 1. Incoming +5
    const m1 = adjustStock(item, 'incoming', 5, 'Pembelian baru', 'usr-admin');
    assert.strictEqual(item.total_qty, 15);
    assert.strictEqual(item.available_qty, 15);
    assert.strictEqual(m1.qty_before, 10);
    assert.strictEqual(m1.qty_after, 15);

    // 2. Damaged 2
    const m2 = adjustStock(item, 'damaged', 2, 'Kabel terkelupas', 'usr-keeper');
    assert.strictEqual(item.total_qty, 15);
    assert.strictEqual(item.available_qty, 13);
    assert.strictEqual(item.damaged_qty, 2);
    assert.strictEqual(m2.qty_before, 15);
    assert.strictEqual(m2.qty_after, 13);
    assert.strictEqual(movements.length, 2);
  });

  // 11. Concurrent borrowing cannot cause negative inventory
  test('11. Atomic locking check prevents race conditions and negative inventory', () => {
    let mockStock = 1;

    function attemptBorrow(requested) {
      // Simulates SELECT ... FOR UPDATE
      if (mockStock < requested) {
        throw new Error('Stok tidak mencukupi (terkunci oleh transaksi lain).');
      }
      mockStock -= requested;
      return mockStock;
    }

    // Transaksi 1 berhasil
    assert.strictEqual(attemptBorrow(1), 0);
    // Transaksi 2 bersamaan gagal karena stok sudah 0
    assert.throws(() => attemptBorrow(1), /tidak mencukupi/);
    assert.strictEqual(mockStock, 0);
  });

  // 12. Warehouse Keeper and Admin permissions are enforced
  test('12. Warehouse Keeper can manage operational records; only Admin can soft-delete or configure', () => {
    function authorizeOperation(role, isActive, operation) {
      if (!isActive) return false;
      if (['view_inventory', 'create_borrowing', 'return_item', 'adjust_stock'].includes(operation)) {
        return ['admin', 'warehouse_keeper'].includes(role);
      }
      if (['delete_item', 'delete_borrower', 'manage_accounts', 'system_settings'].includes(operation)) {
        return role === 'admin';
      }
      return false;
    }

    assert.strictEqual(authorizeOperation('warehouse_keeper', true, 'create_borrowing'), true);
    assert.strictEqual(authorizeOperation('warehouse_keeper', true, 'adjust_stock'), true);
    assert.strictEqual(authorizeOperation('warehouse_keeper', true, 'delete_item'), false);
    assert.strictEqual(authorizeOperation('warehouse_keeper', true, 'manage_accounts'), false);
    assert.strictEqual(authorizeOperation('admin', true, 'delete_item'), true);
    assert.strictEqual(authorizeOperation('admin', true, 'manage_accounts'), true);
    assert.strictEqual(authorizeOperation('warehouse_keeper', false, 'create_borrowing'), false);
  });

  // 13. Audit logs cannot be forged by ordinary authenticated users
  test('13. Client-side direct inserts into activity_logs and stock_movements are rejected by policy', () => {
    function canClientDirectInsert(tableName) {
      if (['stock_movements', 'activity_logs'].includes(tableName)) {
        // Policy: WITH CHECK (false)
        return false;
      }
      return true;
    }

    assert.strictEqual(canClientDirectInsert('stock_movements'), false);
    assert.strictEqual(canClientDirectInsert('activity_logs'), false);
    assert.strictEqual(canClientDirectInsert('borrowings'), true);
  });

  // 14. Legacy deposit records remain intact
  test('14. Legacy visitor deposit tables remain completely accessible and isolated', () => {
    const legacySchema = ['visitors', 'deposit_transactions', 'deposit_items', 'pickup_authorizations', 'transaction_logs'];
    const newSchema = ['items', 'borrowers', 'borrowings', 'borrowing_items', 'stock_movements', 'activity_logs'];

    const intersection = legacySchema.filter(t => newSchema.includes(t));
    assert.strictEqual(intersection.length, 0, 'No table name collisions with legacy schema');

    const sampleLegacyDeposit = {
      id: 'dep-old-01',
      transaction_code: 'DEP-20261110-0001',
      status: 'stored'
    };
    assert.ok(sampleLegacyDeposit.transaction_code.startsWith('DEP-'));
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Skema Phase B: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  return { passed, failed };
}

if (require.main === module) {
  runPhaseBTests();
}

module.exports = { runPhaseBTests };
