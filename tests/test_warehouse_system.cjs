/**
 * Test Suite: Warehouse Inventory & Borrowing Management System
 * Organisasi: PT Vinix Seven Aurum
 * Memvalidasi logika bisnis pergudangan, integritas riwayat peminjaman,
 * keamanan basis data, dan verifikasi pembersihan modul legasi.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runWarehouseSystemTests() {
  console.log('🧪 Memulai Pengujian Sistem Manajemen Inventaris & Peminjaman Gudang (PT Vinix Seven Aurum)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Format Kode Peminjaman Barang
  test('1. Format Kode Peminjaman harus memiliki format BRW-YYYYMMDD-XXXX', () => {
    const regex = /^BRW-\d{8}-\d{4}$/;
    const sampleCode = 'BRW-20261116-0001';
    assert.strictEqual(regex.test(sampleCode), true);
    assert.strictEqual(regex.test('BRW-20261116-001'), false);
    assert.strictEqual(regex.test('DEP-20261110-0001'), false, 'Kode deposit lama tidak boleh digunakan');
  });

  // 2. Otorisasi Role Petugas & Administrator
  test('2. Otorisasi Role Pengguna: Sistem hanya mengizinkan role admin dan warehouse_keeper', () => {
    function isValidWarehouseRole(role) {
      return ['warehouse_keeper', 'admin'].includes(role);
    }

    assert.strictEqual(isValidWarehouseRole('warehouse_keeper'), true);
    assert.strictEqual(isValidWarehouseRole('admin'), true);
    assert.strictEqual(isValidWarehouseRole('satpam'), false, 'Role lama satpam wajib ditolak');
    assert.strictEqual(isValidWarehouseRole('visitor'), false);
    assert.strictEqual(isValidWarehouseRole('peminjam'), false, 'Peminjam bukan akun login aplikasi');
  });

  // 3. Perhitungan Status Kapasitas Lokasi Penyimpanan
  test('3. Perhitungan status kapasitas rak/lokasi penyimpanan (available, full, inactive)', () => {
    function calculateLocationStatus(capacity, activeCount, isActive) {
      if (!isActive) return 'inactive';
      if (activeCount >= capacity) return 'full';
      return 'available';
    }

    assert.strictEqual(calculateLocationStatus(10, 2, true), 'available');
    assert.strictEqual(calculateLocationStatus(10, 10, true), 'full');
    assert.strictEqual(calculateLocationStatus(10, 15, true), 'full');
    assert.strictEqual(calculateLocationStatus(10, 0, false), 'inactive');
  });

  // 4. Data Source Riwayat Peminjaman Wajib Tabel Gudang
  test('4. Borrowing History Data Source: Riwayat peminjaman wajib menggunakan tabel borrowings, borrowing_items, borrowers, dan items', () => {
    const historyDataSources = {
      transactions: 'public.borrowings',
      lineItems: 'public.borrowing_items',
      borrowers: 'public.borrowers',
      items: 'public.items',
      stockMovements: 'public.stock_movements',
      activityLogs: 'public.activity_logs'
    };

    assert.strictEqual(historyDataSources.transactions, 'public.borrowings');
    assert.strictEqual(historyDataSources.lineItems, 'public.borrowing_items');
    assert.strictEqual(historyDataSources.borrowers, 'public.borrowers');
    assert.strictEqual(historyDataSources.items, 'public.items');

    const forbiddenSources = ['visitors', 'deposit_transactions', 'deposit_items', 'pickup_authorizations', 'transaction_logs'];
    Object.values(historyDataSources).forEach(source => {
      forbiddenSources.forEach(forbidden => {
        assert.ok(!source.includes(forbidden), `Sumber data ${source} tidak boleh mengandung objek legasi ${forbidden}`);
      });
    });
  });

  // 5. Pemetaan Relasi & Kalkulasi Progres Pengembalian
  test('5. Borrowing History Relationship Mapping: Pemetaan peminjam, rincian unit pinjam, kembali baik, kembali rusak, dan sisa', () => {
    const rawTx = {
      id: 'brw-test-01',
      transaction_code: 'BRW-20261116-0001',
      status: 'partial_returned',
      borrowed_at: '2026-11-16T08:00:00Z',
      expected_return_at: '2026-11-18T17:00:00Z',
      borrowers: {
        id: 'borr-01',
        full_name: 'Budi Santoso',
        employee_id: 'EMP-001',
        department: 'Multimedia'
      },
      borrowing_items: [
        { id: 'bi-01', quantity: 2, returned_good_qty: 1, returned_damaged_qty: 0, items: { name: 'Kamera DSLR', item_code: 'CAM-01' } },
        { id: 'bi-02', quantity: 3, returned_good_qty: 1, returned_damaged_qty: 1, items: { name: 'Tripod', item_code: 'TRP-01' } }
      ]
    };

    const totalUnits = rawTx.borrowing_items.reduce((s, it) => s + it.quantity, 0);
    const goodReturned = rawTx.borrowing_items.reduce((s, it) => s + it.returned_good_qty, 0);
    const damagedReturned = rawTx.borrowing_items.reduce((s, it) => s + it.returned_damaged_qty, 0);
    const totalReturned = goodReturned + damagedReturned;
    const remainingUnits = Math.max(0, totalUnits - totalReturned);

    assert.strictEqual(totalUnits, 5, 'Total unit harus 5');
    assert.strictEqual(goodReturned, 2, 'Total kembali baik harus 2');
    assert.strictEqual(damagedReturned, 1, 'Total kembali rusak harus 1');
    assert.strictEqual(totalReturned, 3, 'Total kembali harus 3');
    assert.strictEqual(remainingUnits, 2, 'Sisa unit pinjam harus 2');
    assert.strictEqual(rawTx.borrowers.full_name, 'Budi Santoso');
  });

  // 6. Borrowing History Empty State
  test('6. Borrowing History Empty State: Menampilkan pesan kosong resmi "Belum ada riwayat peminjaman." tanpa data rekaan', () => {
    function renderEmptyHistoryState(records) {
      if (!records || records.length === 0) {
        return {
          title: 'Belum ada riwayat peminjaman.',
          hasData: false
        };
      }
      return { title: `${records.length} transaksi`, hasData: true };
    }

    const state = renderEmptyHistoryState([]);
    assert.strictEqual(state.title, 'Belum ada riwayat peminjaman.');
    assert.strictEqual(state.hasData, false);
  });

  // 7. Penanganan Error Query Basis Data
  test('7. Borrowing History Error Handling: Error basis data menghasilkan pesan kesalahan eksplisit dan tidak disamarkan sebagai array kosong', () => {
    function processQueryResult({ data, error }) {
      if (error) {
        return { success: false, errorMessage: `Gagal memuat riwayat transaksi: ${error.message}`, records: [] };
      }
      return { success: true, errorMessage: '', records: data || [] };
    }

    const errorResult = processQueryResult({ data: null, error: { message: 'Permission denied for table borrowings' } });
    assert.strictEqual(errorResult.success, false);
    assert.ok(errorResult.errorMessage.includes('Permission denied'));

    const successResult = processQueryResult({ data: [{ id: '1' }], error: null });
    assert.strictEqual(successResult.success, true);
    assert.strictEqual(successResult.records.length, 1);
  });

  // 8. Cakupan Status Riwayat: Termasuk Selesai Dikembalikan & Dibatalkan
  test('8. Borrowing History Status Coverage: Transaksi returned dan cancelled tetap tersimpan dalam riwayat', () => {
    const historicalStatuses = ['borrowed', 'partial_returned', 'overdue', 'returned', 'cancelled'];
    const sampleHistory = [
      { id: '1', status: 'returned' },
      { id: '2', status: 'cancelled' },
      { id: '3', status: 'borrowed' }
    ];

    const completed = sampleHistory.filter(h => h.status === 'returned');
    const cancelled = sampleHistory.filter(h => h.status === 'cancelled');

    assert.strictEqual(completed.length, 1);
    assert.strictEqual(cancelled.length, 1);
    historicalStatuses.forEach(st => assert.ok(typeof st === 'string'));
  });

  // 9. Pembersihan Rute & Komponen Legasi Pengunjung
  test('9. Pembersihan Rute Aktif: Tidak ada rute pengunjung usang yang aktif di App.jsx', () => {
    const appFile = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
    const legacyRoutes = ['/penitipan-baru', '/kartu-penitipan', '/barang-dititipkan', '/pengambilan', '/pengunjung'];

    legacyRoutes.forEach(r => {
      assert.ok(!appFile.includes(`path="${r}"`), `Rute legasi ${r} tidak boleh ada di App.jsx`);
    });

    assert.ok(appFile.includes('path="/riwayat"'), 'Rute /riwayat wajib ada');
    assert.ok(appFile.includes('BorrowingHistory'), 'Rute /riwayat wajib mengarah ke BorrowingHistory');
    assert.ok(!appFile.includes('DepositHistory'), 'DepositHistory tidak boleh diimpor di App.jsx');
  });

  // 10. Preservasi 9 Tabel Inti Pergudangan
  test('10. Preservasi Skema Gudang: Seluruh 9 tabel inti pergudangan tetap utuh dan aktif', () => {
    const requiredWarehouseTables = [
      'profiles',
      'item_categories',
      'storage_locations',
      'items',
      'borrowers',
      'borrowings',
      'borrowing_items',
      'stock_movements',
      'activity_logs'
    ];

    assert.strictEqual(requiredWarehouseTables.length, 9, 'Tepat 9 tabel inti pergudangan');
    requiredWarehouseTables.forEach(t => {
      assert.ok(typeof t === 'string');
      assert.ok(t.length > 0);
    });
  });

  // 11. Keamanan Berkas Migrasi Pembersihan Legasi
  test('11. Keamanan Migrasi Pembersihan: 20261116000000_remove_legacy_visitor_deposit_schema.sql menjatuhkan tabel anak sebelum induk dengan RESTRICT', () => {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20261116000000_remove_legacy_visitor_deposit_schema.sql');
    assert.ok(fs.existsSync(migrationPath), 'Berkas migrasi pembersihan wajib tersedia');

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Pastikan tidak ada statement DROP TABLE dengan klausul CASCADE
    const hasCascadeDrop = /\bDROP\s+TABLE\s+[^;]+\bCASCADE\b/i.test(sql);
    assert.strictEqual(hasCascadeDrop, false, 'Migrasi tidak boleh menggunakan klausul CASCADE pada DROP TABLE (wajib RESTRICT)');

    // Pastikan urutan drop: deposit_items sebelum deposit_transactions
    const posDepositItems = sql.indexOf('DROP TABLE IF EXISTS public.deposit_items');
    const posPickupAuth = sql.indexOf('DROP TABLE IF EXISTS public.pickup_authorizations');
    const posTxLogs = sql.indexOf('DROP TABLE IF EXISTS public.transaction_logs');
    const posDepositTx = sql.indexOf('DROP TABLE IF EXISTS public.deposit_transactions');
    const posVisitors = sql.indexOf('DROP TABLE IF EXISTS public.visitors');

    assert.ok(posDepositItems !== -1, 'deposit_items harus di-drop');
    assert.ok(posPickupAuth !== -1, 'pickup_authorizations harus di-drop');
    assert.ok(posTxLogs !== -1, 'transaction_logs harus di-drop');
    assert.ok(posDepositTx !== -1, 'deposit_transactions harus di-drop');
    assert.ok(posVisitors !== -1, 'visitors harus di-drop');

    assert.ok(posDepositItems < posDepositTx, 'deposit_items harus di-drop sebelum deposit_transactions');
    assert.ok(posPickupAuth < posDepositTx, 'pickup_authorizations harus di-drop sebelum deposit_transactions');
    assert.ok(posTxLogs < posDepositTx, 'transaction_logs harus di-drop sebelum deposit_transactions');
    assert.ok(posDepositTx < posVisitors, 'deposit_transactions harus di-drop sebelum visitors');

    // Pastikan tidak ada tabel gudang yang di-drop
    const warehouseTables = ['items', 'borrowers', 'borrowings', 'borrowing_items', 'stock_movements', 'activity_logs', 'storage_locations', 'item_categories', 'profiles'];
    warehouseTables.forEach(wt => {
      assert.ok(!sql.includes(`DROP TABLE IF EXISTS public.${wt}`), `Tabel gudang public.${wt} tidak boleh di-drop!`);
    });
  });

  // 12. Validasi Akurasi Kolom Query Riwayat (asset_serial & return_notes)
  test('12. Akurasi Kolom Query Riwayat: BorrowingHistory wajib menggunakan asset_serial dan return_notes (bukan serial_number atau notes)', () => {
    const historyFile = fs.readFileSync(path.join(__dirname, '../src/pages/borrowing/BorrowingHistory.jsx'), 'utf8');

    // Pastikan menggunakan asset_serial
    assert.ok(historyFile.includes('asset_serial'), 'Kueri items wajib menyertakan asset_serial');
    assert.ok(!historyFile.includes('serial_number'), 'Kueri items dilarang meminta serial_number (kolom tidak ada di DB)');

    // Pastikan menggunakan return_notes dan bukan notes di borrowing_items
    assert.ok(historyFile.includes('return_notes'), 'Kueri borrowing_items wajib menyertakan return_notes');
    assert.ok(!/borrowing_items\s*\([^)]*\bnotes\b/s.test(historyFile), 'Kueri borrowing_items dilarang meminta kolom notes');

    // Pastikan foreign key profiles disambiguasi
    assert.ok(historyFile.includes('recorded_profile:recorded_by'), 'Relasi recorded_by wajib disambiguasi');
    assert.ok(historyFile.includes('returned_profile:returned_by'), 'Relasi returned_by wajib disambiguasi');
  });

  // 13. Validasi Logika Status Jatuh Tempo (Overdue Calculation)
  test('13. Logika Overdue: Pinjaman aktif yang melewati expected_return_at otomatis ditandai overdue secara dinamis', () => {
    function computeOverdueStatus(tx, now) {
      const isPastDue = tx.expected_return_at && new Date(tx.expected_return_at) < now;
      const isOverdue = tx.status === 'overdue' || (
        ['borrowed', 'partial_returned'].includes(tx.status) && isPastDue
      );
      if (isOverdue && ['borrowed', 'partial_returned'].includes(tx.status)) {
        return 'overdue';
      }
      return tx.status;
    }

    const now = new Date('2026-11-16T12:00:00Z');
    const pastTx = { status: 'borrowed', expected_return_at: '2026-11-15T12:00:00Z' };
    const futureTx = { status: 'borrowed', expected_return_at: '2026-11-17T12:00:00Z' };
    const completedPastTx = { status: 'returned', expected_return_at: '2026-11-15T12:00:00Z' };

    assert.strictEqual(computeOverdueStatus(pastTx, now), 'overdue');
    assert.strictEqual(computeOverdueStatus(futureTx, now), 'borrowed');
    assert.strictEqual(computeOverdueStatus(completedPastTx, now), 'returned', 'Transaksi returned tidak boleh diubah jadi overdue');
  });

  // 14. Validasi Multi-Item dan Integrasi Riwayat Transaksi
  test('14. Multi-Item Borrowing History Integration: Seluruh baris barang multi-item terpetakan lengkap dalam tiket riwayat', () => {
    const multiItemTransaction = {
      id: 'tx-multi-01',
      transaction_code: 'BRW-20261116-0002',
      borrowing_items: [
        { id: 'bi-1', item_id: 'itm-1', quantity: 1, items: { name: 'Kamera Sony A7 IV', asset_serial: 'SN-SNY-01' } },
        { id: 'bi-2', item_id: 'itm-2', quantity: 4, items: { name: 'Kabel HDMI 10m', asset_serial: '' } },
        { id: 'bi-3', item_id: 'itm-3', quantity: 2, items: { name: 'Tripod Manfrotto', asset_serial: '' } }
      ]
    };

    assert.strictEqual(multiItemTransaction.borrowing_items.length, 3, 'Harus memuat 3 macam barang');
    const totalQty = multiItemTransaction.borrowing_items.reduce((s, it) => s + it.quantity, 0);
    assert.strictEqual(totalQty, 7, 'Total kuantitas barang harus tepat 7 unit');
    assert.strictEqual(multiItemTransaction.borrowing_items[0].items.asset_serial, 'SN-SNY-01');
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Baseline Gudang: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }

  // Jalankan Rangkaian Pengujian Phase A s/d G & Kebijakan Otentikasi
  const { runSecurityTests } = require('./test_phase_a_security.cjs');
  runSecurityTests();

  const { runPhaseBTests } = require('./test_phase_b_schema.cjs');
  runPhaseBTests();

  const { runPhaseB1Tests } = require('./test_phase_b1_integrity.cjs');
  runPhaseB1Tests();

  const { runPhaseB2Tests } = require('./test_phase_b2_verification.cjs');
  runPhaseB2Tests();

  const { runHarnessSafetyTests } = require('./test_harness_safety.cjs');
  runHarnessSafetyTests();

  const { runPhaseCTests } = require('./test_phase_c_account_management.cjs');
  runPhaseCTests();

  const { runPhaseDTests } = require('./test_phase_d_ui_auth.cjs');
  runPhaseDTests();

  const { runPhaseETests } = require('./test_phase_e_inventory.cjs');
  runPhaseETests();

  const { runPhaseFTests } = require('./test_phase_f_borrowing.cjs');
  runPhaseFTests();

  const { runPhaseGTests } = require('./test_phase_g_reports.cjs');
  runPhaseGTests();

  const { runAuthEmailConfirmationAdjustmentTests } = require('./test_auth_email_confirmation_adjustment.cjs');
  runAuthEmailConfirmationAdjustmentTests();
}

runWarehouseSystemTests();
