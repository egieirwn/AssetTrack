/**
 * Test Suite & Safety Harness: Phase B.3 — Staging Database Integration & Live Verification
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * SAFETY HARNESS REQUIREMENTS:
 * 1. Strict Environment Isolation: Uses ONLY explicit staging environment variables.
 * 2. Production Collision Refusal: Automatically aborts if staging URL matches production VITE_SUPABASE_URL.
 * 3. Mandatory Confirmation: Requires CONFIRM_STAGING_TESTS='true' to prevent accidental execution.
 * 4. Project Reference Allowlist: Validates project reference against allowed list.
 * 5. Zero Secret Exposure: Never logs JWTs, service keys, passwords, or full credentials.
 * 6. Non-Destructive Operations: Absolutely NO DROP, TRUNCATE, or table-wide DELETE/UPDATE.
 * 7. Scoped Identification: All test records use isolated, unique run IDs (TEST_STG_<runId>).
 * 8. Targeted Cleanup: Cleans up ONLY records created during the current test execution.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Validates safety gates before any network connection or client initialization.
 */
function validateSafetyPreconditions(env = process.env) {
  const stagingUrl = env.STAGING_SUPABASE_URL ? env.STAGING_SUPABASE_URL.trim() : '';
  const stagingKey = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.STAGING_SUPABASE_ANON_KEY || '';
  const confirmFlag = env.CONFIRM_STAGING_TESTS ? env.CONFIRM_STAGING_TESTS.trim() : '';
  const allowlistRaw = env.STAGING_PROJECT_REF_ALLOWLIST ? env.STAGING_PROJECT_REF_ALLOWLIST.trim() : '';

  // 1. Periksa ketersediaan kredensial staging
  if (!stagingUrl || !stagingKey) {
    return {
      safe: false,
      canProceed: false,
      reason: 'MISSING_STAGING_CREDENTIALS',
      message: 'STAGING_SUPABASE_URL atau STAGING_SUPABASE_ANON_KEY belum dikonfigurasi.'
    };
  }

  // 2. Periksa flag konfirmasi eksplisit
  if (confirmFlag !== 'true') {
    return {
      safe: false,
      canProceed: false,
      reason: 'CONFIRMATION_REQUIRED',
      message: 'Eksekusi dibatalkan: Memerlukan flag konfirmasi eksplisit CONFIRM_STAGING_TESTS="true".'
    };
  }

  // 3. Baca production URL dari .env untuk deteksi tabrakan (Collision Detection)
  let productionUrl = '';
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/VITE_SUPABASE_URL\s*=\s*([^\r\n]+)/);
      if (match) {
        productionUrl = match[1].trim();
      }
    }
  } catch (err) {
    // Abaikan kegagalan baca file env lokal
  }

  // Ekstrak project reference dari URL
  function extractProjectRef(url) {
    try {
      const parsed = new URL(url);
      const hostParts = parsed.hostname.split('.');
      return hostParts[0].toLowerCase();
    } catch {
      return '';
    }
  }

  const stagingRef = extractProjectRef(stagingUrl);
  const prodRef = extractProjectRef(productionUrl);

  if (!stagingRef) {
    return {
      safe: false,
      canProceed: false,
      reason: 'INVALID_STAGING_URL',
      message: 'Format STAGING_SUPABASE_URL tidak valid.'
    };
  }

  // 4. Deteksi Tabrakan Produksi (Production Collision Guard)
  if (prodRef && stagingRef === prodRef) {
    return {
      safe: false,
      canProceed: false,
      reason: 'PRODUCTION_COLLISION_DETECTED',
      message: `FATAL SAFETY VIOLATION: STAGING_SUPABASE_URL terdeteksi sama dengan project produksi (${prodRef})! Eksekusi diblokir permanen.`
    };
  }

  if (productionUrl && stagingUrl.toLowerCase() === productionUrl.toLowerCase()) {
    return {
      safe: false,
      canProceed: false,
      reason: 'PRODUCTION_COLLISION_DETECTED',
      message: 'FATAL SAFETY VIOLATION: STAGING_SUPABASE_URL persis sama dengan VITE_SUPABASE_URL!'
    };
  }

  // 5. Validasi Allowlist Project Staging (jika disetel)
  if (allowlistRaw) {
    const allowedRefs = allowlistRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!allowedRefs.includes(stagingRef)) {
      return {
        safe: false,
        canProceed: false,
        reason: 'PROJECT_NOT_IN_ALLOWLIST',
        message: `Project staging "${stagingRef}" tidak terdaftar dalam STAGING_PROJECT_REF_ALLOWLIST (${allowedRefs.join(', ')}).`
      };
    }
  }

  return {
    safe: true,
    canProceed: true,
    stagingRef,
    prodRef
  };
}

/**
 * Sensor penyunting rahasia (Secret Redaction Utility).
 */
function redactSecret(secret) {
  if (!secret || typeof secret !== 'string') return '***';
  if (secret.length <= 8) return '********';
  return secret.slice(0, 4) + '...' + secret.slice(-4);
}

/**
 * Runner verifikasi integrasi staging utama.
 */
async function runStagingVerification() {
  console.log('\n🛡️ Memeriksa Safety Preconditions Test Harness Staging (Phase B.3)...\n');

  const check = validateSafetyPreconditions(process.env);

  if (!check.canProceed) {
    console.log(`  🔒 [SAFETY GUARD ACTIVATED: ${check.reason}]`);
    console.log('  ----------------------------------------------------------------------');
    console.log(`  ${check.message}`);
    console.log('  ----------------------------------------------------------------------');
    console.log('  Petunjuk Menjalankan Live Integration Test Staging Secara Aman:');
    console.log('  1. Siapkan project staging terpisah di Supabase Dashboard (bukan project produksi).');
    console.log('  2. Jalankan seluruh migrasi di staging: Phase A -> Phase B -> Phase B.1 -> Phase B.2.');
    console.log('  3. Di PowerShell, set environment variabel sementara:');
    console.log('     $env:STAGING_SUPABASE_URL = "https://<your-staging-project-ref>.supabase.co"');
    console.log('     $env:STAGING_SUPABASE_ANON_KEY = "<your-staging-anon-key>"');
    console.log('     $env:CONFIRM_STAGING_TESTS = "true"');
    console.log('     $env:STAGING_PROJECT_REF_ALLOWLIST = "<your-staging-project-ref>"');
    console.log('  4. Jalankan: node tests/test_staging_integration.cjs\n');
    return { executed: false, safetyStatus: check.reason, message: check.message };
  }

  console.log(`  ✅ Safety Check Lolos! Project Ref Staging: ${check.stagingRef}`);
  console.log(`  🛡️ Proteksi Produksi Aktif: Project Produksi (${check.prodRef}) terisolasi.`);

  const stagingUrl = process.env.STAGING_SUPABASE_URL;
  const stagingKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_ANON_KEY;

  console.log(`  🔌 Menginisialisasi Client Staging: ${stagingUrl} (Key: ${redactSecret(stagingKey)})`);

  const { createClient } = require('@supabase/supabase-js');
  const stagingClient = createClient(stagingUrl, stagingKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Track ID data uji unik untuk cleanup terkontrol
  const runId = Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  const createdRecordIds = {
    items: [],
    borrowers: [],
    borrowings: []
  };

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

  try {
    // 1. Verifikasi Akses SELECT Terbuka untuk Katalog
    await test('1. Verifikasi query SELECT katalog items berjalan normal', async () => {
      const { data, error } = await stagingClient.from('items').select('id, item_code, name').limit(1);
      if (error) throw new Error(`Query items gagal: ${error.message}`);
      assert.ok(Array.isArray(data));
    });

    // 2. Verifikasi Direct Update Kuantitas Ditolak
    await test('2. Upaya modifikasi kuantitas langsung via SDK client ditolak oleh permission/trigger', async () => {
      const { data: items } = await stagingClient.from('items').select('id, available_qty').limit(1);
      if (items && items.length > 0) {
        const targetId = items[0].id;
        const { error } = await stagingClient
          .from('items')
          .update({ available_qty: items[0].available_qty + 10 })
          .eq('id', targetId);

        assert.ok(error !== null, 'Update kuantitas langsung seharusnya gagal!');
      }
    });

    // 3. Verifikasi Hard Deletion Borrowing Ditolak (Menggunakan Dummy ID, BUKAN table-wide delete)
    await test('3. Upaya DELETE spesifik pada borrowings ditolak oleh policy USING (false) dan grants', async () => {
      const dummyTestId = crypto.randomUUID();
      const { error } = await stagingClient
        .from('borrowings')
        .delete()
        .eq('id', dummyTestId); // Strictly scoped ke 1 dummy UUID

      assert.ok(error !== null, 'Delete borrowings seharusnya ditolak oleh policy/grant!');
    });

  } finally {
    // Scoped Cleanup: Hanya menghapus record yang dibuat oleh test ini (jika ada)
    if (createdRecordIds.items.length > 0) {
      console.log(`  🧹 Membersihkan ${createdRecordIds.items.length} item uji...`);
      for (const id of createdRecordIds.items) {
        await stagingClient.from('items').delete().eq('id', id);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Live Staging: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  return { executed: true, passed, failed, runId };
}

module.exports = {
  validateSafetyPreconditions,
  redactSecret,
  runStagingVerification
};

if (require.main === module) {
  runStagingVerification().catch(err => {
    console.error('Fatal Test Harness Error:', err.message);
    process.exit(1);
  });
}
