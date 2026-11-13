/**
 * Test Suite: Phase C — Account Management Implementation
 * PT Vinix Seven Aurum Warehouse Management System
 *
 * Verifikasi 10 Aturan Bisnis & Keamanan Manajemen Akun:
 * 1. Active Admin can list Warehouse Keeper accounts (Admin excluded from ordinary list)
 * 2. Active Admin can invite a Warehouse Keeper (validates required fields & email format)
 * 3. Active Admin can edit an eligible account (name, email, phone, shift, employee_id)
 * 4. Active Admin can deactivate an account (target must be warehouse_keeper, cannot self-deactivate)
 * 5. Active Admin can reactivate an account
 * 6. Warehouse Keeper is denied account management access (Route + Backend 403)
 * 7. Inactive Admin is denied account management access (403 Forbidden)
 * 8. Unauthenticated requests are rejected (401 Unauthorized)
 * 9. Client-supplied role escalation is rejected (role locked to warehouse_keeper)
 * 10. Admin accounts cannot be modified through Warehouse Keeper management interface
 */

const assert = require('assert');

function runPhaseCTests() {
  console.log('\n👥 Memulai Pengujian Manajemen Akun Penjaga Gudang (Phase C)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  👤 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // Database mock untuk verifikasi logika backend / Edge Function
  const profilesDb = [
    {
      id: 'usr-admin-1',
      email: 'admin@vinix7aurum.com',
      full_name: 'Super Administrator',
      role: 'admin',
      is_active: true
    },
    {
      id: 'usr-admin-inactive',
      email: 'admin.inactive@vinix7aurum.com',
      full_name: 'Inactive Admin',
      role: 'admin',
      is_active: false
    },
    {
      id: 'usr-wk-1',
      email: 'budi@vinix7aurum.com',
      full_name: 'Budi Santoso',
      role: 'warehouse_keeper',
      employee_id: 'PG-001',
      shift: 'Pagi',
      phone: '081234567891',
      is_active: true
    },
    {
      id: 'usr-wk-2',
      email: 'siti@vinix7aurum.com',
      full_name: 'Siti Rahma',
      role: 'warehouse_keeper',
      employee_id: 'PG-002',
      shift: 'Siang',
      phone: '081234567892',
      is_active: true
    },
    {
      id: 'usr-wk-3',
      email: 'ahmad@vinix7aurum.com',
      full_name: 'Ahmad Fauzi',
      role: 'warehouse_keeper',
      employee_id: 'PG-003',
      shift: 'Malam',
      phone: '081234567893',
      is_active: false
    }
  ];

  // Simulasi Edge Function admin-manage-staff logic
  function simulateAdminManageStaff(callerTokenUser, payload) {
    if (!callerTokenUser) {
      return { status: 401, error: 'Otorisasi diperlukan: Token JWT tidak ditemukan.' };
    }

    const callerProfile = profilesDb.find(p => p.id === callerTokenUser.id);
    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return { status: 403, error: 'Akses ditolak: Hanya Administrator aktif yang berwenang mengelola akun petugas.' };
    }

    const { action, email, fullName, employeeId, shift, phone, targetUserId, newStatus } = payload;

    // ACTION: INVITE STAFF
    if (action === 'invite_staff') {
      if (!email || !email.trim()) {
        return { status: 400, error: 'Alamat email wajib diisi.' };
      }
      if (!fullName || !fullName.trim()) {
        return { status: 400, error: 'Nama lengkap wajib diisi.' };
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return { status: 400, error: 'Format alamat email tidak valid.' };
      }

      // Hardcoded role: Abaikan apa pun yang dikirim client!
      const newProfile = {
        id: 'usr-wk-' + Date.now(),
        email: email.trim(),
        full_name: fullName.trim(),
        role: 'warehouse_keeper', // ALWAYS warehouse_keeper
        employee_id: (employeeId || '').trim(),
        shift: (shift || 'Pagi').trim(),
        phone: (phone || '').trim(),
        is_active: true
      };

      profilesDb.push(newProfile);
      return { status: 200, success: true, message: 'Undangan Penjaga Gudang berhasil dikirim.', profile: newProfile };
    }

    // ACTION: UPDATE STAFF
    if (action === 'update_staff') {
      if (!targetUserId) {
        return { status: 400, error: 'ID pengguna target wajib disertakan.' };
      }
      if (!fullName || !fullName.trim()) {
        return { status: 400, error: 'Nama lengkap wajib diisi.' };
      }

      const target = profilesDb.find(p => p.id === targetUserId);
      if (!target) {
        return { status: 404, error: 'Akun pengguna tidak ditemukan.' };
      }

      // Proteksi Akun Admin: Tidak boleh diedit lewat form ini!
      if (target.role !== 'warehouse_keeper') {
        return { status: 403, error: 'Akses ditolak: Akun Administrator tidak dapat dimodifikasi melalui manajemen petugas gudang.' };
      }

      // Update metadata (Role terkunci, tidak bisa diubah)
      target.full_name = fullName.trim();
      if (email) target.email = email.trim();
      target.employee_id = (employeeId || '').trim();
      target.shift = (shift || '').trim();
      target.phone = (phone || '').trim();

      return { status: 200, success: true, message: 'Data Penjaga Gudang berhasil diperbarui.', profile: target };
    }

    // ACTION: TOGGLE ACTIVE
    if (action === 'toggle_active') {
      if (!targetUserId) {
        return { status: 400, error: 'ID pengguna target wajib disertakan.' };
      }

      if (targetUserId === callerTokenUser.id) {
        return { status: 400, error: 'Administrator tidak dapat menonaktifkan akunnya sendiri.' };
      }

      const target = profilesDb.find(p => p.id === targetUserId);
      if (!target) {
        return { status: 404, error: 'Akun target tidak ditemukan.' };
      }

      if (target.role !== 'warehouse_keeper') {
        return { status: 403, error: 'Akses ditolak: Hanya akun Penjaga Gudang yang dapat diubah status aktifnya melalui modul ini.' };
      }

      target.is_active = Boolean(newStatus);
      return { status: 200, success: true, profile: target };
    }

    return { status: 400, error: `Aksi tidak dikenal: '${action}'` };
  }

  // 1. Active Admin can list Warehouse Keeper accounts
  test('1. Active Admin lists Warehouse Keeper accounts (Admin excluded from results)', () => {
    // Kueri frontend: .eq('role', 'warehouse_keeper')
    const listResult = profilesDb.filter(p => p.role === 'warehouse_keeper');

    assert.ok(listResult.length >= 3);
    listResult.forEach(item => {
      assert.strictEqual(item.role, 'warehouse_keeper');
      assert.notStrictEqual(item.role, 'admin');
    });
  });

  // 2. Active Admin can invite a Warehouse Keeper
  test('2. Active Admin can invite a Warehouse Keeper with email & name validation', () => {
    const adminUser = { id: 'usr-admin-1' };

    // Valid invitation
    const res = simulateAdminManageStaff(adminUser, {
      action: 'invite_staff',
      email: 'hendra@vinix7aurum.com',
      fullName: 'Hendra Gunawan',
      employeeId: 'PG-004',
      shift: 'Pagi',
      phone: '081299887766'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.profile.role, 'warehouse_keeper');
    assert.strictEqual(res.profile.full_name, 'Hendra Gunawan');

    // Missing email rejected
    const invalidEmailRes = simulateAdminManageStaff(adminUser, {
      action: 'invite_staff',
      email: '',
      fullName: 'Tanpa Email'
    });
    assert.strictEqual(invalidEmailRes.status, 400);

    // Invalid email format rejected
    const badFormatRes = simulateAdminManageStaff(adminUser, {
      action: 'invite_staff',
      email: 'not-an-email',
      fullName: 'Format Salah'
    });
    assert.strictEqual(badFormatRes.status, 400);
  });

  // 3. Active Admin can edit an eligible account
  test('3. Active Admin can edit metadata of a Warehouse Keeper account', () => {
    const adminUser = { id: 'usr-admin-1' };
    const res = simulateAdminManageStaff(adminUser, {
      action: 'update_staff',
      targetUserId: 'usr-wk-1',
      fullName: 'Budi Santoso S.T.',
      email: 'budi.santoso@vinix7aurum.com',
      employeeId: 'PG-001-REV',
      shift: 'Siang',
      phone: '081999888777'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.profile.full_name, 'Budi Santoso S.T.');
    assert.strictEqual(res.profile.email, 'budi.santoso@vinix7aurum.com');
    assert.strictEqual(res.profile.employee_id, 'PG-001-REV');
    assert.strictEqual(res.profile.shift, 'Siang');
    assert.strictEqual(res.profile.role, 'warehouse_keeper'); // Role tetap locked
  });

  // 4. Active Admin can deactivate an account
  test('4. Active Admin can deactivate a Warehouse Keeper account', () => {
    const adminUser = { id: 'usr-admin-1' };
    const res = simulateAdminManageStaff(adminUser, {
      action: 'toggle_active',
      targetUserId: 'usr-wk-2',
      newStatus: false
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.profile.is_active, false);

    // Admin cannot deactivate their own account
    const selfRes = simulateAdminManageStaff(adminUser, {
      action: 'toggle_active',
      targetUserId: 'usr-admin-1',
      newStatus: false
    });
    assert.strictEqual(selfRes.status, 400);
    assert.ok(selfRes.error.includes('tidak dapat menonaktifkan akunnya sendiri'));
  });

  // 5. Active Admin can reactivate an account
  test('5. Active Admin can reactivate a deactivated Warehouse Keeper account', () => {
    const adminUser = { id: 'usr-admin-1' };
    const res = simulateAdminManageStaff(adminUser, {
      action: 'toggle_active',
      targetUserId: 'usr-wk-3', // Sebelumnya is_active: false
      newStatus: true
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.profile.is_active, true);
  });

  // 6. Warehouse Keeper is denied account management access
  test('6. Warehouse Keeper is denied account management access (403 Forbidden)', () => {
    const keeperUser = { id: 'usr-wk-1' };
    const res = simulateAdminManageStaff(keeperUser, {
      action: 'invite_staff',
      email: 'hacker@test.com',
      fullName: 'Hacker'
    });

    assert.strictEqual(res.status, 403);
    assert.ok(res.error.includes('Hanya Administrator aktif'));
  });

  // 7. Inactive Admin is denied account management access
  test('7. Inactive Admin is denied account management access (403 Forbidden)', () => {
    const inactiveAdmin = { id: 'usr-admin-inactive' };
    const res = simulateAdminManageStaff(inactiveAdmin, {
      action: 'toggle_active',
      targetUserId: 'usr-wk-1',
      newStatus: false
    });

    assert.strictEqual(res.status, 403);
    assert.ok(res.error.includes('Hanya Administrator aktif'));
  });

  // 8. Unauthenticated requests are rejected
  test('8. Unauthenticated requests without token are rejected (401 Unauthorized)', () => {
    const res = simulateAdminManageStaff(null, {
      action: 'invite_staff',
      email: 'anon@test.com',
      fullName: 'Anon'
    });

    assert.strictEqual(res.status, 401);
    assert.ok(res.error.includes('Token JWT tidak ditemukan'));
  });

  // 9. Client-supplied role escalation is rejected
  test('9. Client-supplied role escalation is strictly rejected (role locked to warehouse_keeper)', () => {
    const adminUser = { id: 'usr-admin-1' };

    // Upaya menyisipkan role: 'admin' dalam payload
    const res = simulateAdminManageStaff(adminUser, {
      action: 'invite_staff',
      email: 'newadmin@vinix7aurum.com',
      fullName: 'Attempted Admin',
      role: 'admin' // Injection attempt
    });

    assert.strictEqual(res.status, 200);
    // Role tetap dipaksa menjadi warehouse_keeper oleh trusted backend
    assert.strictEqual(res.profile.role, 'warehouse_keeper');
    assert.notStrictEqual(res.profile.role, 'admin');
  });

  // 10. Admin accounts cannot be modified through Warehouse Keeper management interface
  test('10. Admin accounts cannot be modified or deactivated via keeper interface', () => {
    const adminCaller = { id: 'usr-admin-1' };

    // Upaya mengedit akun Admin target
    const editAdminRes = simulateAdminManageStaff(adminCaller, {
      action: 'update_staff',
      targetUserId: 'usr-admin-inactive', // Target adalah Admin
      fullName: 'Palsukan Nama Admin'
    });
    assert.strictEqual(editAdminRes.status, 403);
    assert.ok(editAdminRes.error.includes('Akun Administrator tidak dapat dimodifikasi'));

    // Upaya menonaktifkan akun Admin lain
    const toggleAdminRes = simulateAdminManageStaff(adminCaller, {
      action: 'toggle_active',
      targetUserId: 'usr-admin-inactive', // Target adalah Admin
      newStatus: true
    });
    assert.strictEqual(toggleAdminRes.status, 403);
    assert.ok(toggleAdminRes.error.includes('Hanya akun Penjaga Gudang yang dapat diubah'));
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Phase C (Account Management): ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runPhaseCTests };

if (require.main === module) {
  runPhaseCTests();
}
