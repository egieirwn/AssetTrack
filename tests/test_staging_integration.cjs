/**
 * Test Suite: Phase B.3 — Staging Database Integration & Live Transaction Verification
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * SAFETY INSTRUCTION:
 * - Runs ONLY when dedicated staging environment variables (STAGING_SUPABASE_URL,
 *   STAGING_SUPABASE_ANON_KEY or STAGING_SUPABASE_SERVICE_ROLE_KEY) are explicitly provided.
 * - Under NO circumstance does it substitute or run against the production database in .env.
 */

const assert = require('assert');

async function runStagingVerification() {
  console.log('\n🌐 Memulai Verifikasi Integrasi Database Staging (Phase B.3)...\n');

  const stagingUrl = process.env.STAGING_SUPABASE_URL;
  const stagingKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_ANON_KEY;

  if (!stagingUrl || !stagingKey) {
    console.log('  ⚠️  [STATUS: WAITING_FOR_STAGING_CREDENTIALS]');
    console.log('  ----------------------------------------------------------------------');
    console.log('  Variabel lingkungan STAGING_SUPABASE_URL dan STAGING_SUPABASE_ANON_KEY');
    console.log('  belum dikonfigurasi di environment atau file terpisah.');
    console.log('  Sesuai ATURAN KEAMANAN Phase B.3:');
    console.log('  - Kredensial database utama/produksi di .env TIDAK BOLEH digunakan sebagai pengganti.');
    console.log('  - Tidak ada eksekusi write/test langsung ke instans produksi.');
    console.log('  ----------------------------------------------------------------------');
    console.log('  Petunjuk Menjalankan Live Integration Test Staging:');
    console.log('  1. Buat project baru di https://supabase.com (khusus Dev/Staging).');
    console.log('  2. Jalankan urutan migrasi SQL: Phase A -> Phase B -> Phase B.1 -> Phase B.2.');
    console.log('  3. Set environment variable:');
    console.log('     $env:STAGING_SUPABASE_URL = "https://<your-staging-project>.supabase.co"');
    console.log('     $env:STAGING_SUPABASE_ANON_KEY = "<your-staging-anon-key>"');
    console.log('  4. Jalankan kembali: node tests/test_staging_integration.cjs\n');
    return { executed: false, reason: 'STAGING_CREDENTIALS_NOT_PROVIDED' };
  }

  // Jika kredensial staging terdeteksi, inisialisasi Supabase client staging
  const { createClient } = require('@supabase/supabase-js');
  const stagingClient = createClient(stagingUrl, stagingKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log(`  🔌 Terhubung ke Staging DB: ${stagingUrl.slice(0, 25)}...`);
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  🟢 [STAGING PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  🔴 [STAGING FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Verifikasi Eksistensi Tabel & Akses Katalog
  await test('1. Verifikasi tabel items & katalog dapat diakses via SELECT', async () => {
    const { data, error } = await stagingClient.from('items').select('id, name, available_qty').limit(1);
    if (error) throw new Error(`Query items gagal: ${error.message}`);
    assert.ok(Array.isArray(data));
  });

  // 2. Verifikasi Direct Update Kuantitas Ditolak Mesin PostgreSQL
  await test('2. Upaya modifikasi kuantitas langsung via SDK client ditolak', async () => {
    // Ambil 1 item contoh
    const { data: items } = await stagingClient.from('items').select('id, available_qty').limit(1);
    if (items && items.length > 0) {
      const targetId = items[0].id;
      const { error } = await stagingClient
        .from('items')
        .update({ available_qty: items[0].available_qty + 10 })
        .eq('id', targetId);

      // Harus menghasilkan error penolakan (permission denied atau trigger abort)
      assert.ok(error !== null, 'Update kuantitas langsung seharusnya gagal!');
    }
  });

  // 3. Verifikasi Hard Deletion Borrowing Ditolak
  await test('3. Upaya hard delete pada tabel borrowings ditolak', async () => {
    const { error } = await stagingClient
      .from('borrowings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    assert.ok(error !== null, 'Delete borrowings seharusnya ditolak oleh policy/grant!');
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Live Staging: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  return { executed: true, passed, failed };
}

module.exports = { runStagingVerification };

if (require.main === module) {
  runStagingVerification().catch(console.error);
}
