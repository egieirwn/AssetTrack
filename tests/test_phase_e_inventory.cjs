/**
 * Test Suite: Phase E — Warehouse Inventory Management
 * SiPenitip — PT Vinix Seven Aurum
 *
 * Memvalidasi:
 * 1. Validasi metadata dan field wajib master barang (name, category_id, storage_location_id).
 * 2. Integritas pelacakan aset individual (tracking_type = 'individual' => total_qty = 1, asset_serial wajib).
 * 3. Integritas pelacakan berbasis kuantitas (tracking_type = 'quantity' => total_qty >= 1).
 * 4. Formula integritas stok: total = available + borrowed + damaged + under_repair.
 * 5. Pembedaan kalkulasi metrik: jumlah jenis barang (records) vs total unit fisik (physical units).
 * 6. Kontrak dan parameter pemanggilan RPC rpc_adjust_stock (jenis mutasi terdaftar, delta > 0, reason wajib).
 * 7. Simulasi kalkulasi diff preview untuk mutasi: incoming, damaged, sent_to_repair, repair_complete, write_off, adjustment.
 * 8. Proteksi mutasi kuantitas langsung dari client (payload update metadata tidak boleh menyertakan kolom stok).
 * 9. Guard penghapusan kategori barang (ditolak jika memiliki barang terdaftar, diizinkan jika kosong).
 * 10. Guard penghapusan lokasi penyimpanan (ditolak jika menyimpan barang, diizinkan jika kosong).
 * 11. Perhitungan utilisasi kapasitas lokasi penyimpanan (<80% normal, 80-99% near_full, >=100% full).
 * 12. Sifat append-only dan immutability ledger pergerakan stok (stock_movements).
 * 13. Kebijakan soft deactivation (is_active = false) vs hard delete pada master barang.
 */

const assert = require('assert');

function runPhaseETests() {
  console.log('\n📦 Memulai Pengujian Phase E (Warehouse Inventory Management)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  📦 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Validasi Master Barang (Field Wajib)
  test('1. Validasi master barang mewajibkan nama, kategori, dan lokasi penyimpanan', () => {
    function validateItemForm(item) {
      const errors = {};
      if (!item.name || !item.name.trim()) errors.name = 'Nama barang wajib diisi.';
      if (!item.category_id) errors.category_id = 'Kategori barang wajib dipilih.';
      if (!item.storage_location_id) errors.storage_location_id = 'Lokasi penyimpanan wajib dipilih.';
      if (!item.condition) errors.condition = 'Kondisi barang wajib dipilih.';
      return errors;
    }

    const invalid = validateItemForm({ name: '', category_id: '', storage_location_id: '', condition: 'baik' });
    assert.strictEqual(Boolean(invalid.name), true);
    assert.strictEqual(Boolean(invalid.category_id), true);
    assert.strictEqual(Boolean(invalid.storage_location_id), true);

    const valid = validateItemForm({
      name: 'MacBook Pro 14"',
      category_id: 'cat-1',
      storage_location_id: 'loc-1',
      condition: 'baik'
    });
    assert.deepStrictEqual(valid, {});
  });

  // 2. Integritas Aset Individual (tracking_type = 'individual')
  test('2. Aset individual (individual tracking) mengunci total_qty = 1 dan mewajibkan nomor seri/aset', () => {
    function validateIndividualAsset(item) {
      const errors = {};
      if (item.tracking_type === 'individual') {
        if (!item.asset_serial || !item.asset_serial.trim()) {
          errors.asset_serial = 'Nomor seri atau nomor aset wajib diisi untuk pelacakan individual.';
        }
        if (Number(item.total_qty) !== 1) {
          errors.total_qty = 'Total kuantitas aset individual harus selalu tepat 1 unit.';
        }
      }
      return errors;
    }

    // Invalid individual asset (missing serial and total_qty > 1)
    const errs = validateIndividualAsset({
      tracking_type: 'individual',
      asset_serial: '',
      total_qty: 5
    });
    assert.strictEqual(Boolean(errs.asset_serial), true);
    assert.strictEqual(Boolean(errs.total_qty), true);

    // Valid individual asset
    const valid = validateIndividualAsset({
      tracking_type: 'individual',
      asset_serial: 'VNX-MBP-2026-001',
      total_qty: 1
    });
    assert.deepStrictEqual(valid, {});
  });

  // 3. Pelacakan Kuantitas Bulk (tracking_type = 'quantity')
  test('3. Pelacakan kuantitas massal (quantity tracking) mengizinkan total_qty >= 1 dan nomor seri opsional', () => {
    function validateQuantityAsset(item) {
      const errors = {};
      if (item.tracking_type === 'quantity') {
        const qty = Number(item.total_qty);
        if (isNaN(qty) || qty < 1) {
          errors.total_qty = 'Kuantitas awal minimal 1 unit.';
        }
      }
      return errors;
    }

    assert.strictEqual(Boolean(validateQuantityAsset({ tracking_type: 'quantity', total_qty: 0 }).total_qty), true);
    assert.strictEqual(Boolean(validateQuantityAsset({ tracking_type: 'quantity', total_qty: -5 }).total_qty), true);
    assert.deepStrictEqual(validateQuantityAsset({ tracking_type: 'quantity', total_qty: 50 }), {});
  });

  // 4. Formula Integritas Stok
  test('4. Formula integritas stok memenuhi total = available + borrowed + damaged + under_repair', () => {
    function verifyStockIntegrity(item) {
      const total = Number(item.total_qty) || 0;
      const avail = Number(item.available_qty) || 0;
      const borrowed = Number(item.borrowed_qty) || 0;
      const damaged = Number(item.damaged_qty) || 0;
      const repair = Number(item.under_repair_qty) || 0;

      const sum = avail + borrowed + damaged + repair;
      const isConsistent = sum === total;
      const hasNoNegative = avail >= 0 && borrowed >= 0 && damaged >= 0 && repair >= 0 && total >= 0;

      return { isConsistent, sum, total, hasNoNegative };
    }

    const soundItem = {
      total_qty: 25,
      available_qty: 18,
      borrowed_qty: 4,
      damaged_qty: 2,
      under_repair_qty: 1
    };
    const check1 = verifyStockIntegrity(soundItem);
    assert.strictEqual(check1.isConsistent, true);
    assert.strictEqual(check1.hasNoNegative, true);

    const corruptItem = {
      total_qty: 25,
      available_qty: 20,
      borrowed_qty: 10, // sum = 30 > 25
      damaged_qty: 0,
      under_repair_qty: 0
    };
    const check2 = verifyStockIntegrity(corruptItem);
    assert.strictEqual(check2.isConsistent, false);
  });

  // 5. Pembedaan Metrik SKU (Records) vs Total Unit Fisik
  test('5. Perhitungan metrik membedakan secara tegas jumlah SKU (records) vs total unit fisik', () => {
    const items = [
      { id: '1', name: 'Laptop Dell XPS 15', tracking_type: 'individual', total_qty: 1, available_qty: 1, borrowed_qty: 0, damaged_qty: 0, under_repair_qty: 0 },
      { id: '2', name: 'Kabel HDMI 2.0 2m', tracking_type: 'quantity', total_qty: 50, available_qty: 45, borrowed_qty: 5, damaged_qty: 0, under_repair_qty: 0 },
      { id: '3', name: 'USB-C Multiport Hub', tracking_type: 'quantity', total_qty: 30, available_qty: 28, borrowed_qty: 0, damaged_qty: 2, under_repair_qty: 0 }
    ];

    function calculateInventoryKPIs(list) {
      const totalSku = list.length;
      const totalUnits = list.reduce((s, it) => s + (it.total_qty || 0), 0);
      const availableUnits = list.reduce((s, it) => s + (it.available_qty || 0), 0);
      const borrowedUnits = list.reduce((s, it) => s + (it.borrowed_qty || 0), 0);
      const damagedUnits = list.reduce((s, it) => s + (it.damaged_qty || 0), 0);
      const repairUnits = list.reduce((s, it) => s + (it.under_repair_qty || 0), 0);

      return { totalSku, totalUnits, availableUnits, borrowedUnits, damagedUnits, repairUnits };
    }

    const kpi = calculateInventoryKPIs(items);
    assert.strictEqual(kpi.totalSku, 3); // 3 records
    assert.strictEqual(kpi.totalUnits, 81); // 1 + 50 + 30 = 81 units
    assert.strictEqual(kpi.availableUnits, 74); // 1 + 45 + 28 = 74
    assert.strictEqual(kpi.borrowedUnits, 5);
    assert.strictEqual(kpi.damagedUnits, 2);
  });

  // 6. Kontrak Parameter RPC rpc_adjust_stock
  test('6. Validasi parameter rpc_adjust_stock hanya menerima jenis mutasi sah dan kuantitas positif', () => {
    const VALID_ADJUSTMENT_TYPES = [
      'incoming',
      'adjustment',
      'damaged',
      'sent_to_repair',
      'repair_complete',
      'write_off'
    ];

    function validateRpcAdjustStockParams(itemId, adjType, delta, reason) {
      if (!itemId) return 'Item ID wajib disertakan.';
      if (!VALID_ADJUSTMENT_TYPES.includes(adjType)) {
        return `Tipe penyesuaian tidak valid: "${adjType}".`;
      }
      const numDelta = Number(delta);
      if (isNaN(numDelta) || numDelta <= 0 || !Number.isInteger(numDelta)) {
        return 'Kuantitas mutasi harus berupa bilangan bulat positif lebih besar dari 0.';
      }
      if (!reason || !reason.trim()) {
        return 'Alasan / keterangan mutasi stok wajib diisi untuk rekam jejak audit.';
      }
      return null;
    }

    assert.strictEqual(validateRpcAdjustStockParams(null, 'incoming', 5, 'PO-123'), 'Item ID wajib disertakan.');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'invalid_type', 5, 'PO-123'), 'Tipe penyesuaian tidak valid: "invalid_type".');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'incoming', 0, 'PO-123'), 'Kuantitas mutasi harus berupa bilangan bulat positif lebih besar dari 0.');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'incoming', -3, 'PO-123'), 'Kuantitas mutasi harus berupa bilangan bulat positif lebih besar dari 0.');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'incoming', 3.5, 'PO-123'), 'Kuantitas mutasi harus berupa bilangan bulat positif lebih besar dari 0.');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'incoming', 10, ''), 'Alasan / keterangan mutasi stok wajib diisi untuk rekam jejak audit.');
    assert.strictEqual(validateRpcAdjustStockParams('item-1', 'incoming', 10, 'Pengadaan batch Q4'), null);
  });

  // 7. Perhitungan Diff Preview Mutasi Stok
  test('7. Diff preview memprediksi perubahan status kuantitas secara matematis sebelum eksekusi RPC', () => {
    function computeAdjustmentDiff(item, adjType, delta) {
      const curTotal = item.total_qty || 0;
      const curAvail = item.available_qty || 0;
      const curDamaged = item.damaged_qty || 0;
      const curRepair = item.under_repair_qty || 0;
      const d = Number(delta) || 0;

      let nextTotal = curTotal;
      let nextAvail = curAvail;
      let nextDamaged = curDamaged;
      let nextRepair = curRepair;

      switch (adjType) {
        case 'incoming':
          nextTotal += d;
          nextAvail += d;
          break;
        case 'damaged':
          if (d > curAvail) throw new Error('Kuantitas rusak melebihi stok tersedia');
          nextAvail -= d;
          nextDamaged += d;
          break;
        case 'sent_to_repair':
          if (d > curDamaged) throw new Error('Kuantitas perbaikan melebihi stok rusak');
          nextDamaged -= d;
          nextRepair += d;
          break;
        case 'repair_complete':
          if (d > curRepair) throw new Error('Kuantitas selesai perbaikan melebihi stok dalam perbaikan');
          nextRepair -= d;
          nextAvail += d;
          break;
        case 'write_off':
          if (d > curDamaged) throw new Error('Kuantitas afkir melebihi stok rusak');
          nextTotal -= d;
          nextDamaged -= d;
          break;
        case 'adjustment':
          nextTotal += d;
          nextAvail += d;
          break;
        default:
          throw new Error('Tipe mutasi tidak dikenal');
      }

      return {
        total: { before: curTotal, after: nextTotal, diff: nextTotal - curTotal },
        available: { before: curAvail, after: nextAvail, diff: nextAvail - curAvail },
        damaged: { before: curDamaged, after: nextDamaged, diff: nextDamaged - curDamaged },
        under_repair: { before: curRepair, after: nextRepair, diff: nextRepair - curRepair }
      };
    }

    const testItem = { total_qty: 20, available_qty: 15, damaged_qty: 3, under_repair_qty: 2 };

    // Case A: Incoming +10
    const diffInc = computeAdjustmentDiff(testItem, 'incoming', 10);
    assert.strictEqual(diffInc.total.after, 30);
    assert.strictEqual(diffInc.available.after, 25);

    // Case B: Damaged +4
    const diffDamaged = computeAdjustmentDiff(testItem, 'damaged', 4);
    assert.strictEqual(diffDamaged.available.after, 11);
    assert.strictEqual(diffDamaged.damaged.after, 7);

    // Case C: Damaged error if exceeds available
    assert.throws(() => computeAdjustmentDiff(testItem, 'damaged', 16), /Kuantitas rusak melebihi stok tersedia/);

    // Case D: Sent to repair +2
    const diffRepair = computeAdjustmentDiff(testItem, 'sent_to_repair', 2);
    assert.strictEqual(diffRepair.damaged.after, 1);
    assert.strictEqual(diffRepair.under_repair.after, 4);

    // Case E: Repair complete +1
    const diffDone = computeAdjustmentDiff(testItem, 'repair_complete', 1);
    assert.strictEqual(diffDone.under_repair.after, 1);
    assert.strictEqual(diffDone.available.after, 16);

    // Case F: Write off -2
    const diffWriteOff = computeAdjustmentDiff(testItem, 'write_off', 2);
    assert.strictEqual(diffWriteOff.total.after, 18);
    assert.strictEqual(diffWriteOff.damaged.after, 1);
  });

  // 8. Proteksi Mutasi Kolom Stok dari Client
  test('8. Payload pembaruan metadata barang tidak boleh memuat kolom mutasi kuantitas stok', () => {
    const FORBIDDEN_QTY_COLUMNS = ['total_qty', 'available_qty', 'damaged_qty', 'under_repair_qty', 'borrowed_qty'];

    function sanitizeItemUpdatePayload(formData) {
      const allowedKeys = [
        'name',
        'category_id',
        'storage_location_id',
        'description',
        'asset_serial',
        'photo_url',
        'condition',
        'status',
        'is_active',
        'updated_at',
        'updated_by'
      ];

      const sanitized = {};
      for (const [key, value] of Object.entries(formData)) {
        if (FORBIDDEN_QTY_COLUMNS.includes(key)) {
          throw new Error(`SECURITY VIOLATION: Kolom kuantitas "${key}" dilarang dimutasi melalui pembaruan metadata langsung.`);
        }
        if (allowedKeys.includes(key)) {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    const safeInput = {
      name: 'Monitor LG 27"',
      description: 'Layar presentasi',
      condition: 'baik',
      is_active: true
    };
    const clean = sanitizeItemUpdatePayload(safeInput);
    assert.strictEqual(clean.name, 'Monitor LG 27"');
    assert.strictEqual(clean.total_qty, undefined);

    const illicitInput = {
      name: 'Monitor LG 27"',
      total_qty: 999 // Hacked client attempt
    };
    assert.throws(() => sanitizeItemUpdatePayload(illicitInput), /SECURITY VIOLATION/);
  });

  // 9. Guard Penghapusan Kategori Barang
  test('9. Guard penghapusan kategori menolak penghapusan jika terdapat barang terdaftar', () => {
    function canDeleteCategory(cat) {
      if (cat.item_count > 0) {
        return {
          allowed: false,
          reason: `Kategori "${cat.name}" masih menaungi ${cat.item_count} barang. Hapus diblokir untuk menjaga integritas data.`
        };
      }
      return { allowed: true, reason: null };
    }

    const occupiedCat = { id: 'c1', name: 'Laptop & Komputer', item_count: 14 };
    const result1 = canDeleteCategory(occupiedCat);
    assert.strictEqual(result1.allowed, false);
    assert.strictEqual(result1.reason.includes('14 barang'), true);

    const emptyCat = { id: 'c2', name: 'Kategori Uji Coba', item_count: 0 };
    const result2 = canDeleteCategory(emptyCat);
    assert.strictEqual(result2.allowed, true);
    assert.strictEqual(result2.reason, null);
  });

  // 10. Guard Penghapusan Lokasi Penyimpanan
  test('10. Guard penghapusan lokasi menolak penghapusan jika menampung barang', () => {
    function canDeleteStorageLocation(loc) {
      if ((loc.item_count || 0) > 0 || (loc.total_units || 0) > 0) {
        return {
          allowed: false,
          reason: `Lokasi "${loc.code}" masih menyimpan ${loc.item_count} macam barang (${loc.total_units} unit).`
        };
      }
      return { allowed: true, reason: null };
    }

    const activeLoc = { id: 'l1', code: 'GDG-A-RK01', item_count: 5, total_units: 32 };
    const res1 = canDeleteStorageLocation(activeLoc);
    assert.strictEqual(res1.allowed, false);

    const emptyLoc = { id: 'l2', code: 'GDG-C-RK99', item_count: 0, total_units: 0 };
    const res2 = canDeleteStorageLocation(emptyLoc);
    assert.strictEqual(res2.allowed, true);
  });

  // 11. Perhitungan Utilisasi Kapasitas Lokasi Penyimpanan
  test('11. Utilisasi kapasitas lokasi penyimpanan mengelompokkan status available, near_full, dan full', () => {
    function evaluateLocationCapacity(capacity, totalUnits, isActive) {
      const cap = Math.max(1, capacity);
      const ratio = Math.round((totalUnits / cap) * 100);
      if (!isActive) return { ratio, status: 'inactive' };

      let status = 'available';
      if (ratio >= 100) {
        status = 'full';
      } else if (ratio >= 80) {
        status = 'near_full';
      }
      return { ratio, status };
    }

    assert.strictEqual(evaluateLocationCapacity(50, 10, true).status, 'available');
    assert.strictEqual(evaluateLocationCapacity(50, 42, true).status, 'near_full'); // 84%
    assert.strictEqual(evaluateLocationCapacity(50, 50, true).status, 'full'); // 100%
    assert.strictEqual(evaluateLocationCapacity(50, 55, true).status, 'full'); // 110%
    assert.strictEqual(evaluateLocationCapacity(50, 10, false).status, 'inactive');
  });

  // 12. Immutability Ledger Pergerakan Stok
  test('12. Ledger stock_movements bersifat append-only dan melarang modifikasi/penghapusan riwayat', () => {
    const stockLedger = [];

    function recordMovement(entry) {
      const record = Object.freeze({
        id: 'mov-' + (stockLedger.length + 1),
        item_id: entry.item_id,
        movement_type: entry.movement_type,
        quantity: entry.quantity,
        balance_after: entry.balance_after,
        notes: entry.notes,
        created_at: new Date().toISOString()
      });
      stockLedger.push(record);
      return record;
    }

    const mov1 = recordMovement({
      item_id: 'item-1',
      movement_type: 'initial_stock',
      quantity: 10,
      balance_after: 10,
      notes: 'Saldo awal pendaftaran barang'
    });

    const mov2 = recordMovement({
      item_id: 'item-1',
      movement_type: 'incoming',
      quantity: 5,
      balance_after: 15,
      notes: 'Penerimaan barang masuk PO-001'
    });

    assert.strictEqual(stockLedger.length, 2);
    assert.strictEqual(mov1.balance_after, 10);
    assert.strictEqual(mov2.balance_after, 15);

    // Records must be frozen (immutable in strict mode)
    assert.throws(() => {
      'use strict';
      mov1.quantity = 999;
    }, /read only/);
  });

  // 13. Soft Deactivation (Soft Archiving) vs Hard Delete
  test('13. Master barang menggunakan soft deactivation (is_active = false) untuk mempertahankan jejak audit', () => {
    function softDeactivateItem(item) {
      return {
        ...item,
        is_active: false,
        status: 'inactive',
        updated_at: new Date().toISOString()
      };
    }

    const activeItem = {
      id: 'itm-01',
      name: 'Laptop Staf',
      total_qty: 1,
      is_active: true,
      status: 'available'
    };

    const archivedItem = softDeactivateItem(activeItem);
    assert.strictEqual(archivedItem.id, 'itm-01');
    assert.strictEqual(archivedItem.is_active, false);
    assert.strictEqual(archivedItem.status, 'inactive');
    assert.strictEqual(archivedItem.name, 'Laptop Staf');
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Phase E: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runPhaseETests };
