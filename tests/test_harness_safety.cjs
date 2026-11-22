/**
 * Test Suite: Safety Harness Unit Tests
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * Verifikasi 8 Guardrail Keamanan pada Test Harness Staging:
 * 1. Menolak eksekusi jika STAGING_SUPABASE_URL tidak disetel.
 * 2. Menolak eksekusi jika CONFIRM_STAGING_TESTS !== 'true'.
 * 3. Mendeteksi dan memblokir tabrakan URL produksi (Production Collision Detection).
 * 4. Mendeteksi dan memblokir tabrakan Project Reference produksi.
 * 5. Menolak eksekusi jika project ref tidak terdaftar pada STAGING_PROJECT_REF_ALLOWLIST.
 * 6. Lolos validasi jika kredensial staging valid, terkonfirmasi, dan terdaftar di allowlist.
 * 7. Memverifikasi redactSecret menyensor token rahasia secara aman tanpa kebocoran.
 * 8. Static code scan: Memastikan tidak ada perintah DROP, TRUNCATE, atau blanket delete (.neq).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateSafetyPreconditions, redactSecret } = require('./test_staging_integration.cjs');

function runHarnessSafetyTests() {
  console.log('\n🛡️ Memulai Verifikasi Guardrail Keamanan Test Harness Staging...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  🔒 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  const mockProdUrl = 'https://gtdnfymvjnebtjlacjko.supabase.co';

  // 1. Menolak jika kredensial staging tidak ada
  test('1. Menolak eksekusi jika STAGING_SUPABASE_URL kosong', () => {
    const res = validateSafetyPreconditions({});
    assert.strictEqual(res.canProceed, false);
    assert.strictEqual(res.reason, 'MISSING_STAGING_CREDENTIALS');
  });

  // 2. Menolak jika tidak ada flag CONFIRM_STAGING_TESTS='true'
  test('2. Menolak eksekusi jika CONFIRM_STAGING_TESTS !== "true"', () => {
    const res = validateSafetyPreconditions({
      STAGING_SUPABASE_URL: 'https://staging-proj-123.supabase.co',
      STAGING_SUPABASE_ANON_KEY: 'mock-key',
      CONFIRM_STAGING_TESTS: 'false'
    });
    assert.strictEqual(res.canProceed, false);
    assert.strictEqual(res.reason, 'CONFIRMATION_REQUIRED');
  });

  // 3. Mendeteksi tabrakan URL produksi
  test('3. Memblokir fatal jika STAGING_SUPABASE_URL sama dengan produksi', () => {
    const res = validateSafetyPreconditions({
      STAGING_SUPABASE_URL: mockProdUrl,
      STAGING_SUPABASE_ANON_KEY: 'mock-key',
      CONFIRM_STAGING_TESTS: 'true'
    });
    assert.strictEqual(res.canProceed, false);
    assert.strictEqual(res.reason, 'PRODUCTION_COLLISION_DETECTED');
  });

  // 4. Mendeteksi tabrakan Project Reference produksi
  test('4. Memblokir fatal jika Project Ref sama dengan produksi', () => {
    const res = validateSafetyPreconditions({
      STAGING_SUPABASE_URL: 'https://gtdnfymvjnebtjlacjko.supabase.co',
      STAGING_SUPABASE_ANON_KEY: 'mock-key',
      CONFIRM_STAGING_TESTS: 'true'
    });
    assert.strictEqual(res.canProceed, false);
    assert.strictEqual(res.reason, 'PRODUCTION_COLLISION_DETECTED');
  });

  // 5. Menolak jika tidak ada di allowlist
  test('5. Menolak eksekusi jika project ref tidak terdaftar di allowlist', () => {
    const res = validateSafetyPreconditions({
      STAGING_SUPABASE_URL: 'https://staging-proj-999.supabase.co',
      STAGING_SUPABASE_ANON_KEY: 'mock-key',
      CONFIRM_STAGING_TESTS: 'true',
      STAGING_PROJECT_REF_ALLOWLIST: 'approved-staging-alpha, approved-staging-beta'
    });
    assert.strictEqual(res.canProceed, false);
    assert.strictEqual(res.reason, 'PROJECT_NOT_IN_ALLOWLIST');
  });

  // 6. Lolos validasi jika semua parameter aman dan diizinkan
  test('6. Lolos validasi ketika URL valid, dikonfirmasi, dan terdaftar di allowlist', () => {
    const res = validateSafetyPreconditions({
      STAGING_SUPABASE_URL: 'https://approved-staging-alpha.supabase.co',
      STAGING_SUPABASE_ANON_KEY: 'mock-key',
      CONFIRM_STAGING_TESTS: 'true',
      STAGING_PROJECT_REF_ALLOWLIST: 'approved-staging-alpha, approved-staging-beta'
    });
    assert.strictEqual(res.canProceed, true);
    assert.strictEqual(res.stagingRef, 'approved-staging-alpha');
  });

  // 7. Sensor penyunting rahasia (Secret Redaction)
  test('7. redactSecret menyensor token dengan aman tanpa mengekspos isi penuh', () => {
    const token = 'sb_publishable_sZ6LUQ4ANd_0gU8RdCc9rQ_M2q01ESJ';
    const redacted = redactSecret(token);
    assert.strictEqual(redacted, 'sb_p...1ESJ');
    assert.strictEqual(redacted.includes('sZ6LUQ4ANd'), false);
    assert.strictEqual(redactSecret(''), '***');
  });

  // 8. Static code scan pada test harness staging
  test('8. Static scan: Memastikan tidak ada perintah DROP, TRUNCATE, atau blanket delete', () => {
    const harnessPath = path.join(__dirname, 'test_staging_integration.cjs');
    const rawContent = fs.readFileSync(harnessPath, 'utf8');

    // Hapus blok komentar sebelum memindai kode aktual
    const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    // Cek ketiadaan statement destruktif SQL
    assert.strictEqual(/\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i.test(codeOnly), false, 'Tidak boleh ada perintah DROP.');
    assert.strictEqual(/\bTRUNCATE\b/i.test(codeOnly), false, 'Tidak boleh ada perintah TRUNCATE.');

    // Cek ketiadaan blanket delete (.neq pada delete)
    assert.strictEqual(/\.delete\(\)\.neq/i.test(codeOnly), false, 'Tidak boleh ada blanket delete .delete().neq().');
  });

  console.log(`\n========================================`);
  console.log(`Hasil Verifikasi Safety Harness: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runHarnessSafetyTests };

if (require.main === module) {
  runHarnessSafetyTests();
}
