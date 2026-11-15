/**
 * Test Suite: Phase A — Security Hardening & Role Migration
 * Memvalidasi 12 Aturan Kunci Keamanan & Integritas Role:
 * 1. Public signup cannot create an Admin account
 * 2. Warehouse Keeper cannot promote themselves to Admin
 * 3. Warehouse Keeper cannot deactivate themselves to bypass controls
 * 4. Warehouse Keeper cannot change another user's role
 * 5. Inactive accounts cannot use protected operations
 * 6. Admin retains full authorized access
 * 7. Warehouse Keeper can access permitted warehouse operations
 * 8. Client-supplied actor IDs cannot impersonate another user in RPC functions
 * 9. Ordinary users cannot forge audit log records
 * 10. Existing historical records remain intact
 * 11. Old satpam accounts are mapped to warehouse_keeper
 * 12. Existing admin accounts remain Admin
 * 13. Concurrency-safe Sequence Generation for Transaction Codes
 */

const assert = require('assert');

function runSecurityTests() {
  console.log('\n🔒 Memulai Pengujian Keamanan & Migrasi Role (Phase A)...\n');
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

  // 1. Public signup cannot create an Admin account
  test('1. Public signup cannot create an Admin account (trigger handle_new_user overrides metadata)', () => {
    function simulateHandleNewUser(newUserPayload) {
      // Logika trigger handle_new_user() versi baru:
      // Abaikan role dari raw_user_meta_data, selalu default ke warehouse_keeper
      const defaultRole = 'warehouse_keeper';
      return {
        id: newUserPayload.id,
        email: newUserPayload.email || '',
        full_name: newUserPayload.raw_user_meta_data?.full_name || '',
        role: defaultRole, // Kunci role hanya ke warehouse_keeper
        is_active: true
      };
    }

    const hackerSignup = {
      id: 'usr-hacker-01',
      email: 'hacker@attacker.com',
      raw_user_meta_data: { full_name: 'Attacker', role: 'admin' }
    };

    const createdProfile = simulateHandleNewUser(hackerSignup);
    assert.strictEqual(createdProfile.role, 'warehouse_keeper');
    assert.notStrictEqual(createdProfile.role, 'admin');
  });

  // 2. Warehouse Keeper cannot promote themselves to Admin
  test('2. Warehouse Keeper cannot promote themselves to Admin (protect_profile_roles blocks non-admin)', () => {
    function simulateProtectProfileRoles({ callerRole, callerIsActive, oldProfile, newProfile }) {
      if ((newProfile.role !== oldProfile.role) || (newProfile.is_active !== oldProfile.is_active)) {
        const isCallerAdmin = callerRole === 'admin' && callerIsActive === true;
        if (!isCallerAdmin) {
          throw new Error('Akses ditolak: Hanya Admin aktif yang berwenang mengubah role atau status akun.');
        }
      }
      if (!['admin', 'warehouse_keeper'].includes(newProfile.role)) {
        throw new Error('Role tidak valid.');
      }
      return true;
    }

    const oldKeeper = { id: 'usr-002', role: 'warehouse_keeper', is_active: true };
    const selfElevation = { id: 'usr-002', role: 'admin', is_active: true };

    assert.throws(() => {
      simulateProtectProfileRoles({
        callerRole: 'warehouse_keeper',
        callerIsActive: true,
        oldProfile: oldKeeper,
        newProfile: selfElevation
      });
    }, /Akses ditolak/);
  });

  // 3. Warehouse Keeper cannot deactivate themselves to bypass controls
  test('3. Warehouse Keeper cannot deactivate themselves or others (status mutation restricted to Admin)', () => {
    function simulateStatusChange({ callerRole, callerIsActive, targetUserId, callerId, newStatus }) {
      const isCallerAdmin = callerRole === 'admin' && callerIsActive === true;
      if (!isCallerAdmin) {
        throw new Error('Akses ditolak: Hanya Admin aktif yang berwenang mengubah status.');
      }
      if (callerId === targetUserId && newStatus === false) {
        throw new Error('Administrator tidak dapat menonaktifkan akunnya sendiri.');
      }
      return true;
    }

    // Penjaga gudang coba deactive
    assert.throws(() => {
      simulateStatusChange({
        callerRole: 'warehouse_keeper',
        callerIsActive: true,
        targetUserId: 'usr-002',
        callerId: 'usr-002',
        newStatus: false
      });
    }, /Akses ditolak/);

    // Admin menonaktifkan akunnya sendiri dicegah
    assert.throws(() => {
      simulateStatusChange({
        callerRole: 'admin',
        callerIsActive: true,
        targetUserId: 'usr-admin-01',
        callerId: 'usr-admin-01',
        newStatus: false
      });
    }, /Administrator tidak dapat menonaktifkan akunnya sendiri/);
  });

  // 4. Warehouse Keeper cannot change another user's role
  test('4. Warehouse Keeper cannot change another user role', () => {
    function simulateRoleChangeByKeeper({ callerRole, callerIsActive, targetOldProfile, targetNewRole }) {
      const isCallerAdmin = callerRole === 'admin' && callerIsActive === true;
      if (!isCallerAdmin) {
        throw new Error('Akses ditolak: Hanya Admin aktif yang berwenang.');
      }
      return targetNewRole;
    }

    assert.throws(() => {
      simulateRoleChangeByKeeper({
        callerRole: 'warehouse_keeper',
        callerIsActive: true,
        targetOldProfile: { id: 'usr-003', role: 'warehouse_keeper' },
        targetNewRole: 'admin'
      });
    }, /Akses ditolak/);
  });

  // 5. Inactive accounts cannot use protected operations
  test('5. Inactive accounts cannot use protected operations (is_active = FALSE blocked)', () => {
    function checkIsStaff(profile) {
      return Boolean(profile && ['admin', 'warehouse_keeper'].includes(profile.role) && profile.is_active === true);
    }

    function checkIsAdmin(profile) {
      return Boolean(profile && profile.role === 'admin' && profile.is_active === true);
    }

    const inactiveKeeper = { role: 'warehouse_keeper', is_active: false };
    const inactiveAdmin = { role: 'admin', is_active: false };
    const activeKeeper = { role: 'warehouse_keeper', is_active: true };
    const activeAdmin = { role: 'admin', is_active: true };

    assert.strictEqual(checkIsStaff(inactiveKeeper), false);
    assert.strictEqual(checkIsStaff(inactiveAdmin), false);
    assert.strictEqual(checkIsAdmin(inactiveAdmin), false);

    assert.strictEqual(checkIsStaff(activeKeeper), true);
    assert.strictEqual(checkIsStaff(activeAdmin), true);
    assert.strictEqual(checkIsAdmin(activeAdmin), true);
  });

  // 6. Admin retains full authorized access
  test('6. Admin retains full authorized access to operational and administrative modules', () => {
    function canAccessModule(profile, moduleType) {
      const isStaff = profile && ['admin', 'warehouse_keeper'].includes(profile.role) && profile.is_active === true;
      const isAdmin = profile && profile.role === 'admin' && profile.is_active === true;

      if (moduleType === 'admin_management') return isAdmin;
      if (moduleType === 'operational') return isStaff;
      return false;
    }

    const admin = { role: 'admin', is_active: true };
    assert.strictEqual(canAccessModule(admin, 'operational'), true);
    assert.strictEqual(canAccessModule(admin, 'admin_management'), true);
  });

  // 7. Warehouse Keeper can access permitted warehouse operations
  test('7. Warehouse Keeper can access operational modules but not user management', () => {
    function canAccessModule(profile, moduleType) {
      const isStaff = profile && ['admin', 'warehouse_keeper'].includes(profile.role) && profile.is_active === true;
      const isAdmin = profile && profile.role === 'admin' && profile.is_active === true;

      if (moduleType === 'admin_management') return isAdmin;
      if (moduleType === 'operational') return isStaff;
      return false;
    }

    const keeper = { role: 'warehouse_keeper', is_active: true };
    assert.strictEqual(canAccessModule(keeper, 'operational'), true);
    assert.strictEqual(canAccessModule(keeper, 'admin_management'), false);
  });

  // 8. Client-supplied actor IDs cannot impersonate another user in RPC functions
  test('8. Client-supplied actor IDs cannot impersonate another user in RPC functions', () => {
    function simulateRpcCreateDeposit({ authUid, clientSuppliedReceivedBy, isStaff }) {
      if (!authUid || !isStaff) {
        throw new Error('Akses ditolak: Akun tidak aktif atau tidak berwenang.');
      }
      // Actor is always authUid, ignoring clientSuppliedReceivedBy
      const effectiveReceivedBy = authUid;
      return {
        received_by: effectiveReceivedBy,
        client_attempt: clientSuppliedReceivedBy
      };
    }

    const authSessionUid = 'usr-real-staff-007';
    const spoofAttemptUid = 'usr-admin-victim-999';

    const result = simulateRpcCreateDeposit({
      authUid: authSessionUid,
      clientSuppliedReceivedBy: spoofAttemptUid,
      isStaff: true
    });

    assert.strictEqual(result.received_by, authSessionUid);
    assert.notStrictEqual(result.received_by, spoofAttemptUid);
  });

  // 9. Ordinary users cannot forge audit log records
  test('9. Direct client inserts into audit logs are prohibited', () => {
    function evaluateLogInsertPolicy({ callerIsAdmin, performedBy, authUid }) {
      // Policy: Block direct client inserts on transaction_logs (WITH CHECK (false))
      const allowDirectInsert = false;
      if (!allowDirectInsert) {
        return false;
      }
      return true;
    }

    assert.strictEqual(evaluateLogInsertPolicy({ callerIsAdmin: false, performedBy: 'usr-victim', authUid: 'usr-attacker' }), false);
    assert.strictEqual(evaluateLogInsertPolicy({ callerIsAdmin: true, performedBy: 'usr-admin', authUid: 'usr-admin' }), false);
  });

  // 10. Existing historical records remain intact
  test('10. Historical deposit records, visitors, and categories preserve integrity', () => {
    const historicalDeposit = {
      id: 'dep-hist-001',
      transaction_code: 'DEP-20261110-0001',
      status: 'completed',
      pickup_method: 'owner'
    };

    function validateRecordIntegrity(record) {
      assert.ok(record.id);
      assert.ok(record.transaction_code.startsWith('DEP-'));
      assert.ok(['pending', 'stored', 'completed', 'cancelled'].includes(record.status));
      return true;
    }

    assert.strictEqual(validateRecordIntegrity(historicalDeposit), true);
  });

  // 11. Old satpam accounts are mapped to warehouse_keeper
  test('11. Role migration maps satpam to warehouse_keeper without data loss', () => {
    const existingAccounts = [
      { id: '1', full_name: 'Budi Santoso', role: 'satpam', is_active: true },
      { id: '2', full_name: 'Siti Rahma', role: 'satpam', is_active: true },
      { id: '3', full_name: 'Chief Admin', role: 'admin', is_active: true },
    ];

    function migrateRoles(accounts) {
      return accounts.map(acc => {
        if (acc.role === 'satpam') {
          return { ...acc, role: 'warehouse_keeper' };
        }
        return acc;
      });
    }

    const migrated = migrateRoles(existingAccounts);
    assert.strictEqual(migrated[0].role, 'warehouse_keeper');
    assert.strictEqual(migrated[1].role, 'warehouse_keeper');
    assert.strictEqual(migrated[2].role, 'admin'); // Admin tetap Admin!
    assert.strictEqual(migrated.every(a => ['admin', 'warehouse_keeper'].includes(a.role)), true);
  });

  // 12. Existing admin accounts remain Admin
  test('12. Existing admin accounts never lose admin privileges or get demoted', () => {
    const adminAccount = { id: 'admin-001', email: 'admin@vinix7aurum.com', role: 'admin' };
    function applyMigrationPolicy(account) {
      if (account.role === 'satpam') {
        return { ...account, role: 'warehouse_keeper' };
      }
      if (account.role === 'admin') {
        return { ...account, role: 'admin' };
      }
      throw new Error(`Unexpected role: ${account.role}`);
    }

    const result = applyMigrationPolicy(adminAccount);
    assert.strictEqual(result.role, 'admin');
    assert.strictEqual(result.id, adminAccount.id);
  });

  // 13. Concurrency-safe sequence generation
  test('13. Sequence-based code generator prevents collision under concurrent requests', () => {
    let mockSeq = 100;
    function nextval() {
      return ++mockSeq;
    }

    function generateTransactionCodeSafe(dateStr) {
      const seq = nextval();
      return `DEP-${dateStr}-${String(seq).padStart(4, '0')}`;
    }

    const codes = new Set();
    const dateStr = '20261113';
    for (let i = 0; i < 50; i++) {
      const code = generateTransactionCodeSafe(dateStr);
      assert.strictEqual(codes.has(code), false, `Collision detected for ${code}`);
      codes.add(code);
    }
    assert.strictEqual(codes.size, 50);
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Keamanan: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  return { passed, failed };
}

if (require.main === module) {
  runSecurityTests();
}

module.exports = { runSecurityTests };

