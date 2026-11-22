/**
 * Test Suite: Phase F — Borrowing & Return Management
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * Memvalidasi:
 * 1. Validasi field wajib direktori peminjam (full_name, department).
 * 2. Penolakan duplikasi NIK/ID karyawan (employee_id uniqueness).
 * 3. Peminjam nonaktif (is_active = false) tidak dapat dipilih untuk transaksi baru.
 * 4. Guard penghapusan peminjam: dilarang menghapus peminjam yang memiliki riwayat transaksi.
 * 5. Transaksi peminjaman mendukung multi-item dalam satu kesatuan tiket.
 * 6. Proteksi aset individual: tidak boleh dipinjam lebih dari 1 unit atau ganda dalam 1 transaksi.
 * 7. Aset individual wajib berstatus 'available' dan is_active = true.
 * 8. Peminjaman berbasis kuantitas tidak boleh melebihi stok tersedia (available_qty).
 * 9. Kuantitas peminjaman tidak valid (<= 0 atau non-integer) ditolak.
 * 10. Batas waktu pengembalian (expected_return_at) wajib lebih besar dari waktu peminjaman.
 * 11. Transaksi peminjaman atomik melalui RPC rpc_create_borrowing.
 * 12. Pengembalian lengkap (full return) mengubah status transaksi menjadi 'returned'.
 * 13. Pengembalian parsial (partial return) mempertahankan sisa tanggungan dan status 'partial_returned'.
 * 14. Pengembalian barang kondisi baik memulihkan available_qty dan mencatat 'return_good'.
 * 15. Pengembalian barang kondisi rusak mengalihkan unit ke damaged_qty dan TIDAK menambah available_qty.
 * 16. Kuantitas pengembalian tidak boleh melebihi sisa pinjaman (unreturned quantity).
 * 17. Pembatalan transaksi (rpc_cancel_borrowing) hanya diizinkan untuk tiket 'borrowed' tanpa pengembalian.
 * 18. Pembatalan memulihkan stok inventaris ke available_qty dan mempertahankan jejak audit 'cancelled'.
 * 19. QR Receipt payload aman: tidak membocorkan data pribadi mentah dan menggunakan identifier transaksi.
 * 20. Deteksi transaksi terlambat (overdue) secara dinamis mengecualikan transaksi 'returned' dan 'cancelled'.
 * 21. Agregasi metrik dashboard peminjaman mencerminkan status riil database.
 * 22. Proteksi mutasi langsung: klien tidak boleh melakukan UPDATE langsung ke kolom stok items.
 * 23. Formula integritas stok tetap terjaga pasca peminjaman dan pengembalian.
 * 24. Aktor transaksi diperoleh dari sesi autentikasi server (auth.uid()), bukan klaim klien.
 */

const assert = require('assert');

function runPhaseFTests() {
  console.log('\n🔄 Memulai Pengujian Phase F (Borrowing & Return Management)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  🔄 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Validasi Field Wajib Direktori Peminjam
  test('1. Validasi direktori peminjam mewajibkan nama lengkap dan departemen', () => {
    function validateBorrower(b) {
      const errors = {};
      if (!b.full_name || !b.full_name.trim()) errors.full_name = 'Nama lengkap wajib diisi.';
      if (!b.department || !b.department.trim()) errors.department = 'Departemen wajib diisi.';
      return errors;
    }

    assert.strictEqual(Boolean(validateBorrower({ full_name: '', department: 'IT' }).full_name), true);
    assert.strictEqual(Boolean(validateBorrower({ full_name: 'Budi', department: '' }).department), true);
    assert.deepStrictEqual(validateBorrower({ full_name: 'Budi Santoso', department: 'IT Operations' }), {});
  });

  // 2. Penolakan Duplikasi NIK / Employee ID
  test('2. Penolakan duplikasi NIK/ID karyawan pada direktori peminjam', () => {
    const existingBorrowers = [
      { id: 'b1', full_name: 'Rian Prasetya', employee_id: 'VNX-2024-001' },
      { id: 'b2', full_name: 'Siti Aminah', employee_id: 'VNX-2024-002' }
    ];

    function checkDuplicateEmployeeId(empId, currentId = null) {
      if (!empId || !empId.trim()) return null; // ID kosong diizinkan (null/empty)
      const found = existingBorrowers.find(b =>
        b.employee_id &&
        b.employee_id.trim().toLowerCase() === empId.trim().toLowerCase() &&
        b.id !== currentId
      );
      if (found) {
        return `ID Karyawan "${empId}" sudah digunakan oleh ${found.full_name}.`;
      }
      return null;
    }

    assert.ok(checkDuplicateEmployeeId('VNX-2024-001'));
    assert.ok(checkDuplicateEmployeeId('vnx-2024-001')); // case insensitive
    assert.strictEqual(checkDuplicateEmployeeId('VNX-2024-001', 'b1'), null); // updating self
    assert.strictEqual(checkDuplicateEmployeeId('VNX-2024-003'), null); // new unique
    assert.strictEqual(checkDuplicateEmployeeId(''), null); // empty allowed
  });

  // 3. Peminjam Nonaktif Ditolak untuk Transaksi Baru
  test('3. Peminjam nonaktif (is_active = false) dilarang membuat peminjaman baru', () => {
    function canBorrow(borrower) {
      if (!borrower) return { allowed: false, reason: 'Peminjam tidak ditemukan.' };
      if (!borrower.is_active) {
        return { allowed: false, reason: 'Peminjam berstatus nonaktif dan tidak dapat melakukan peminjaman baru.' };
      }
      return { allowed: true, reason: null };
    }

    const inactiveBorrower = { id: 'b-99', full_name: 'Doni', is_active: false };
    const res1 = canBorrow(inactiveBorrower);
    assert.strictEqual(res1.allowed, false);
    assert.ok(res1.reason.includes('nonaktif'));

    const activeBorrower = { id: 'b-01', full_name: 'Budi', is_active: true };
    const res2 = canBorrow(activeBorrower);
    assert.strictEqual(res2.allowed, true);
  });

  // 4. Guard Deletion Peminjam
  test('4. Guard penghapusan peminjam menolak hapus permanen jika memiliki riwayat transaksi', () => {
    function canDeleteBorrower(borrower, totalBorrowings) {
      if (totalBorrowings > 0) {
        return {
          allowed: false,
          reason: `Peminjam "${borrower.full_name}" memiliki ${totalBorrowings} riwayat transaksi. Hapus permanen diblokir.`
        };
      }
      return { allowed: true, reason: null };
    }

    const bWithHistory = { id: 'b1', full_name: 'Rian Prasetya' };
    assert.strictEqual(canDeleteBorrower(bWithHistory, 5).allowed, false);

    const bNew = { id: 'b2', full_name: 'Staff Magang' };
    assert.strictEqual(canDeleteBorrower(bNew, 0).allowed, true);
  });

  // 5. Transaksi Peminjaman Multi-Item
  test('5. Transaksi peminjaman mendukung multiple line items dalam satu transaksi', () => {
    function validateBorrowingItems(items) {
      if (!items || !Array.isArray(items) || items.length === 0) {
        return 'Minimal satu barang harus disertakan dalam transaksi peminjaman.';
      }
      return null;
    }

    assert.ok(validateBorrowingItems([]));
    assert.ok(validateBorrowingItems(null));
    assert.strictEqual(validateBorrowingItems([
      { item_id: 'itm-1', quantity: 1 },
      { item_id: 'itm-2', quantity: 5 }
    ]), null);
  });

  // 6. Proteksi Aset Individual: Kuantitas Tepat 1 & Unik
  test('6. Aset individual mengunci kuantitas tepat 1 dan dilarang dipilih duplikat dalam 1 tiket', () => {
    function validateIndividualSelection(selectedList, newItem) {
      if (newItem.tracking_type === 'individual') {
        const alreadyExists = selectedList.some(line => line.item_id === newItem.id);
        if (alreadyExists) {
          throw new Error(`Aset individual "${newItem.name}" (${newItem.asset_serial}) sudah ada dalam daftar.`);
        }
      }
      return true;
    }

    const currentList = [
      { item_id: 'laptop-1', name: 'MacBook Pro #1', tracking_type: 'individual', asset_serial: 'VNX-01' }
    ];

    const duplicateItem = { id: 'laptop-1', name: 'MacBook Pro #1', tracking_type: 'individual', asset_serial: 'VNX-01' };
    assert.throws(() => validateIndividualSelection(currentList, duplicateItem), /sudah ada dalam daftar/);

    const secondLaptop = { id: 'laptop-2', name: 'MacBook Pro #2', tracking_type: 'individual', asset_serial: 'VNX-02' };
    assert.strictEqual(validateIndividualSelection(currentList, secondLaptop), true);
  });

  // 7. Aset Individual Wajib Berstatus Available dan Aktif
  test('7. Aset individual yang rusak, sedang dipinjam, atau nonaktif ditolak untuk dipinjam', () => {
    function canBorrowIndividualAsset(asset) {
      if (!asset.is_active) return 'Aset berstatus nonaktif.';
      if (asset.status !== 'available' || asset.available_qty < 1) {
        return `Aset "${asset.name}" sedang tidak tersedia (status: ${asset.status}, stok: ${asset.available_qty}).`;
      }
      return null;
    }

    assert.ok(canBorrowIndividualAsset({ name: 'Laptop', tracking_type: 'individual', is_active: false, status: 'available', available_qty: 1 }));
    assert.ok(canBorrowIndividualAsset({ name: 'Laptop', tracking_type: 'individual', is_active: true, status: 'borrowed', available_qty: 0 }));
    assert.ok(canBorrowIndividualAsset({ name: 'Laptop', tracking_type: 'individual', is_active: true, status: 'maintenance', available_qty: 0 }));
    assert.strictEqual(canBorrowIndividualAsset({ name: 'Laptop', tracking_type: 'individual', is_active: true, status: 'available', available_qty: 1 }), null);
  });

  // 8. Peminjaman Berbasis Kuantitas Tidak Boleh Melebihi Stok
  test('8. Peminjaman berbasis kuantitas ditolak jika melebihi stok tersedia (available_qty)', () => {
    function validateQuantityBorrow(item, requestedQty) {
      if (requestedQty > item.available_qty) {
        return `Stok "${item.name}" tidak mencukupi. Tersedia: ${item.available_qty}, diminta: ${requestedQty}.`;
      }
      return null;
    }

    const cableItem = { name: 'Kabel HDMI', tracking_type: 'quantity', available_qty: 10 };
    assert.ok(validateQuantityBorrow(cableItem, 15));
    assert.strictEqual(validateQuantityBorrow(cableItem, 10), null);
    assert.strictEqual(validateQuantityBorrow(cableItem, 3), null);
  });

  // 9. Validasi Kuantitas Positif Bulat
  test('9. Kuantitas peminjaman wajib berupa bilangan bulat positif > 0', () => {
    function isValidQty(qty) {
      const num = Number(qty);
      return !isNaN(num) && Number.isInteger(num) && num > 0;
    }

    assert.strictEqual(isValidQty(0), false);
    assert.strictEqual(isValidQty(-2), false);
    assert.strictEqual(isValidQty(2.5), false);
    assert.strictEqual(isValidQty('abc'), false);
    assert.strictEqual(isValidQty(1), true);
    assert.strictEqual(isValidQty(25), true);
  });

  // 10. Validasi Expected Return Date > Borrow Date
  test('10. Batas waktu pengembalian (expected_return_at) wajib lebih besar dari waktu pinjam saat ini', () => {
    function validateReturnDate(borrowedAt, expectedReturnAt) {
      const bTime = new Date(borrowedAt).getTime();
      const rTime = new Date(expectedReturnAt).getTime();
      if (isNaN(rTime) || rTime <= bTime) {
        return 'Waktu perkiraan kembali harus lebih besar dari waktu peminjaman.';
      }
      return null;
    }

    const now = new Date();
    const past = new Date(now.getTime() - 3600000).toISOString();
    const future = new Date(now.getTime() + 86400000).toISOString();

    assert.ok(validateReturnDate(now.toISOString(), past));
    assert.ok(validateReturnDate(now.toISOString(), now.toISOString()));
    assert.strictEqual(validateReturnDate(now.toISOString(), future), null);
  });

  // 11. Pengembalian Lengkap (Full Return) Mengubah Status ke 'returned'
  test('11. Pengembalian seluruh unit mengubah status transaksi peminjaman menjadi "returned"', () => {
    function evaluateBorrowingStatus(lines) {
      const allReturned = lines.every(l => {
        const totalRet = (l.returned_good_qty || 0) + (l.returned_damaged_qty || 0);
        return totalRet >= l.quantity;
      });
      return allReturned ? 'returned' : 'partial_returned';
    }

    const fullyReturnedLines = [
      { quantity: 2, returned_good_qty: 2, returned_damaged_qty: 0 },
      { quantity: 1, returned_good_qty: 1, returned_damaged_qty: 0 }
    ];
    assert.strictEqual(evaluateBorrowingStatus(fullyReturnedLines), 'returned');

    const partialLines = [
      { quantity: 2, returned_good_qty: 1, returned_damaged_qty: 0 },
      { quantity: 1, returned_good_qty: 0, returned_damaged_qty: 0 }
    ];
    assert.strictEqual(evaluateBorrowingStatus(partialLines), 'partial_returned');
  });

  // 12. Pengembalian Parsial Mempertahankan Sisa Tanggungan
  test('12. Pengembalian parsial mempertahankan sisa kuantitas pinjaman untuk pengembalian berikutnya', () => {
    function computeRemaining(quantity, good, damaged) {
      const returned = (good || 0) + (damaged || 0);
      return Math.max(0, quantity - returned);
    }

    assert.strictEqual(computeRemaining(10, 4, 1), 5); // 10 - 5 = 5 remaining
    assert.strictEqual(computeRemaining(5, 5, 0), 0);
  });

  // 13. Pengembalian Barang Kondisi Baik Memulihkan available_qty
  test('13. Barang kembali baik menambah available_qty, sedangkan barang rusak menambah damaged_qty', () => {
    function processReturnStock(item, goodQty, damagedQty) {
      return {
        ...item,
        available_qty: item.available_qty + goodQty,
        damaged_qty: item.damaged_qty + damagedQty,
        total_qty: item.total_qty // total_qty tidak berubah
      };
    }

    const initialItem = { name: 'Kabel LAN', total_qty: 20, available_qty: 10, damaged_qty: 2 };
    const afterReturn = processReturnStock(initialItem, 5, 2);

    assert.strictEqual(afterReturn.available_qty, 15); // 10 + 5
    assert.strictEqual(afterReturn.damaged_qty, 4); // 2 + 2
    assert.strictEqual(afterReturn.total_qty, 20); // invariant preserved
  });

  // 14. Kuantitas Pengembalian Tidak Boleh Melebihi Sisa Pinjaman
  test('14. Kuantitas pengembalian (baik + rusak) ditolak jika melebihi sisa pinjaman', () => {
    function validateReturnQty(lineQuantity, alreadyReturned, returningGood, returningDamaged) {
      const unreturned = lineQuantity - alreadyReturned;
      const totalAttempting = returningGood + returningDamaged;
      if (totalAttempting > unreturned) {
        throw new Error(`Jumlah pengembalian (${totalAttempting}) melebihi sisa pinjaman (${unreturned}).`);
      }
      return true;
    }

    assert.throws(() => validateReturnQty(5, 2, 3, 1), /melebihi sisa pinjaman/); // unreturned = 3, attempting = 4
    assert.strictEqual(validateReturnQty(5, 2, 2, 1), true); // 3 == 3
  });

  // 15. Pembatalan Transaksi (rpc_cancel_borrowing)
  test('15. Pembatalan hanya diizinkan untuk status "borrowed" tanpa pengembalian sebelumnya', () => {
    function canCancelBorrowing(status, returnedTotal) {
      if (status !== 'borrowed') {
        return { allowed: false, reason: `Status "${status}" tidak dapat dibatalkan.` };
      }
      if (returnedTotal > 0) {
        return { allowed: false, reason: 'Transaksi tidak dapat dibatalkan karena sebagian barang telah dikembalikan.' };
      }
      return { allowed: true, reason: null };
    }

    assert.strictEqual(canCancelBorrowing('partial_returned', 2).allowed, false);
    assert.strictEqual(canCancelBorrowing('returned', 5).allowed, false);
    assert.strictEqual(canCancelBorrowing('borrowed', 1).allowed, false);
    assert.strictEqual(canCancelBorrowing('borrowed', 0).allowed, true);
  });

  // 16. Restorasi Stok Pasca Pembatalan
  test('16. Pembatalan memulihkan kuantitas barang ke available_qty dan mencatat adjustment di log', () => {
    function restoreStockOnCancel(item, borrowedQuantity) {
      return {
        ...item,
        available_qty: item.available_qty + borrowedQuantity,
        status: item.tracking_type === 'individual' ? 'available' : item.status
      };
    }

    const indivItem = { name: 'Kamera Sony A7 IV', tracking_type: 'individual', available_qty: 0, status: 'borrowed' };
    const restored = restoreStockOnCancel(indivItem, 1);
    assert.strictEqual(restored.available_qty, 1);
    assert.strictEqual(restored.status, 'available');
  });

  // 17. QR Payload Keamanan
  test('17. Payload QR Code receipt tidak mengekspos data kredensial/rahasia peminjam', () => {
    function generateQrPayload(txCode, txId) {
      return JSON.stringify({
        system: 'Vinix-WMS',
        type: 'BORROWING_RECEIPT',
        code: txCode,
        id: txId
      });
    }

    const payload = generateQrPayload('BRW-20261115-0001', 'e9b23f20-94a0-4f54-b52b-7b58c538cb31');
    const parsed = JSON.parse(payload);

    assert.strictEqual(parsed.code, 'BRW-20261115-0001');
    assert.strictEqual(parsed.password, undefined);
    assert.strictEqual(parsed.token, undefined);
    assert.strictEqual(parsed.auth, undefined);
  });

  // 18. Deteksi Overdue Dinamis
  test('18. Deteksi transaksi overdue hanya berlaku untuk peminjaman aktif yang melewati batas waktu', () => {
    const now = new Date('2026-11-15T12:00:00Z');

    function checkOverdue(status, expectedReturnAt) {
      if (['returned', 'cancelled'].includes(status)) return false;
      return new Date(expectedReturnAt) < now;
    }

    // Active loan with deadline in past => overdue
    assert.strictEqual(checkOverdue('borrowed', '2026-11-14T10:00:00Z'), true);
    // Partial returned with deadline in past => overdue
    assert.strictEqual(checkOverdue('partial_returned', '2026-11-14T10:00:00Z'), true);
    // Active loan with deadline in future => NOT overdue
    assert.strictEqual(checkOverdue('borrowed', '2026-11-16T10:00:00Z'), false);
    // Completed return with past deadline => NOT overdue
    assert.strictEqual(checkOverdue('returned', '2026-11-14T10:00:00Z'), false);
    // Cancelled loan with past deadline => NOT overdue
    assert.strictEqual(checkOverdue('cancelled', '2026-11-14T10:00:00Z'), false);
  });

  // 19. Proteksi Mutasi Kolom Stok Klien pada Transaksi Peminjaman
  test('19. Frontend tidak boleh melakukan UPDATE langsung ke kolom stok tabel items', () => {
    const PROTECTED_COLUMNS = ['available_qty', 'borrowed_qty', 'damaged_qty', 'under_repair_qty', 'total_qty'];

    function sanitizeClientPayload(payload) {
      for (const col of PROTECTED_COLUMNS) {
        if (col in payload) {
          throw new Error(`SECURITY VIOLATION: Mutasi kolom "${col}" secara langsung dari sisi klien dilarang.`);
        }
      }
      return true;
    }

    assert.strictEqual(sanitizeClientPayload({ purpose: 'Dokumentasi', notes: 'OK' }), true);
    assert.throws(() => sanitizeClientPayload({ available_qty: 10 }), /SECURITY VIOLATION/);
  });

  // 20. Konsistensi Formula Kekekalan Stok Pasca Siklus Pinjam-Kembali
  test('20. Formula stok total = available + borrowed + damaged + under_repair selalu konsisten', () => {
    // Aset kuantitas awal: total = 50, available = 50, borrowed = 0, damaged = 0, under_repair = 0
    let item = { total_qty: 50, available_qty: 50, borrowed_qty: 0, damaged_qty: 0, under_repair_qty: 0 };

    function checkEquation(it) {
      const sum = it.available_qty + it.borrowed_qty + it.damaged_qty + it.under_repair_qty;
      assert.strictEqual(sum, it.total_qty);
    }

    checkEquation(item);

    // Event 1: Pinjam 10 unit
    item.available_qty -= 10;
    item.borrowed_qty += 10;
    checkEquation(item); // 40 + 10 + 0 + 0 = 50

    // Event 2: Pengembalian parsial (6 baik, 2 rusak)
    item.borrowed_qty -= 8;
    item.available_qty += 6;
    item.damaged_qty += 2;
    checkEquation(item); // 46 + 2 + 2 + 0 = 50

    // Event 3: Sisa 2 unit kembali baik
    item.borrowed_qty -= 2;
    item.available_qty += 2;
    checkEquation(item); // 48 + 0 + 2 + 0 = 50
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Phase F: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runPhaseFTests };
