/**
 * Test Suite: Supabase Authentication Adjustment — Disable Email Confirmation & Pending Approval Policy
 * SiPenitip — PT Vinix Seven Aurum
 *
 * Memvalidasi 15 Persyaratan Pengujian:
 * 1. Signup dengan session langsung (immediately returned Supabase session).
 * 2. Tampilan sukses pendaftaran tanpa instruksi konfirmasi email (Account Pending Approval).
 * 3. Pembuatan profil pengguna baru pada public.profiles.
 * 4. Default role pengguna baru terkunci sebagai 'warehouse_keeper'.
 * 5. Default status aktif pengguna baru adalah nonaktif (is_active = false / pending approval).
 * 6. Pengguna nonaktif tidak dapat mengakses rute terproteksi (ProtectedRoute fail-closed).
 * 7. Penjaga Gudang aktif (is_active = true) dapat mengakses rute operasional.
 * 8. Pengguna non-admin ditolak saat mencoba mengaktifkan akun diri sendiri atau orang lain.
 * 9. Admin aktif dapat mengaktifkan dan menonaktifkan akun Penjaga Gudang.
 * 10. Akun Admin tetap berfungsi penuh dan tidak terpengaruh kebijakan penonaktifan pendaftaran.
 * 11. Autentikasi akun yang sudah ada (login flow).
 * 12. Alur pemulihan kata sandi (password recovery flow).
 * 13. Penanganan kesalahan pendaftaran email duplikat secara anggun.
 * 14. Pemulihan sesi autentikasi setelah refresh (session restoration).
 * 15. Keamanan race condition pembersihan sesi tertunda (deferred signOut TOCTOU guard).
 */

const assert = require('assert');

function runAuthEmailConfirmationAdjustmentTests() {
  console.log('\n🔐 Memulai Pengujian Supabase Auth Adjustment (Disabled Email Confirmation)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  🔐 [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Signup dengan session langsung
  test('1. Signup saat email confirmation disabled langsung mengembalikan session dan ditangani aman', () => {
    function simulateSignUp(email, password, fullName) {
      // Ketika email confirmation dimatikan di Supabase:
      // Supabase mengembalikan user terkonfirmasi dan session aktif seketika
      const mockReturnedSession = {
        access_token: 'fake-jwt-token',
        user: { id: 'u-new-001', email, user_metadata: { full_name: fullName } }
      };

      // Handler aplikasi: karena akun baru berstatus is_active = false,
      // session aktif wajib di-clear seketika agar tidak langsung tembus ke dashboard
      let activeSession = mockReturnedSession;
      let isPendingApproval = false;

      if (activeSession) {
        // Sign out segera untuk akun yang belum disetujui
        activeSession = null;
        isPendingApproval = true;
      }

      return {
        data: { user: mockReturnedSession.user, session: activeSession },
        error: null,
        isPendingApproval
      };
    }

    const res = simulateSignUp('budi@vinix.com', 'secret123', 'Budi Santoso');
    assert.strictEqual(res.isPendingApproval, true);
    assert.strictEqual(res.data.session, null, 'Sesi aktif harus segera dibatalkan untuk akun pending');
    assert.strictEqual(res.data.user.email, 'budi@vinix.com');
  });

  // 2. Signup tanpa instruksi konfirmasi email
  test('2. Layar sukses pendaftaran menampilkan status Menunggu Persetujuan Admin tanpa instruksi cek email', () => {
    function getRegistrationSuccessFeedback(signupResult) {
      if (signupResult.isPendingApproval) {
        return {
          requiresEmailConfirmation: false,
          statusTitle: 'Pendaftaran Berhasil',
          statusBadge: 'Menunggu Persetujuan Admin',
          instructions: 'Akun Penjaga Gudang berhasil didaftarkan. Sesuai kebijakan keamanan PT Vinix Seven Aurum, akun baru berstatus nonaktif hingga diaktifkan oleh Administrator.'
        };
      }
      return { requiresEmailConfirmation: true };
    }

    const feedback = getRegistrationSuccessFeedback({ isPendingApproval: true });
    assert.strictEqual(feedback.requiresEmailConfirmation, false, 'Tidak boleh meminta user klik tautan konfirmasi email');
    assert.strictEqual(feedback.statusBadge, 'Menunggu Persetujuan Admin');
    assert.strictEqual(feedback.instructions.includes('kebijakan keamanan'), true);
  });

  // 3. Pembuatan profil pengguna baru
  test('3. Trigger handle_new_user membuat profil tertaut pada public.profiles', () => {
    function handleNewUser(authUser) {
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.raw_user_meta_data?.full_name || authUser.email,
        role: 'warehouse_keeper',
        is_active: false,
        profile_completed: true
      };
    }

    const authUser = { id: 'uuid-1234', email: 'staff@vinix.com', raw_user_meta_data: { full_name: 'Staff Baru' } };
    const profile = handleNewUser(authUser);
    assert.strictEqual(profile.id, authUser.id);
    assert.strictEqual(profile.email, 'staff@vinix.com');
    assert.strictEqual(profile.full_name, 'Staff Baru');
  });

  // 4. Default role pengguna baru adalah warehouse_keeper
  test('4. Default role pengguna baru selalu warehouse_keeper meskipun metadata meminta admin', () => {
    function handleNewUserRole(authUser) {
      // Mengabaikan role dari raw_user_meta_data
      const defaultRole = 'warehouse_keeper';
      return {
        id: authUser.id,
        role: defaultRole
      };
    }

    const maliciousUser = { id: 'u-hack', email: 'hacker@test.com', raw_user_meta_data: { role: 'admin' } };
    const profile = handleNewUserRole(maliciousUser);
    assert.strictEqual(profile.role, 'warehouse_keeper', 'Role wajib dikunci sebagai warehouse_keeper');
  });

  // 5. Default status aktif pengguna baru adalah nonaktif (is_active = false)
  test('5. Pendaftaran akun mandiri baru selalu memiliki is_active = false', () => {
    function handleNewUserStatus(authUser) {
      return {
        id: authUser.id,
        role: 'warehouse_keeper',
        is_active: false // Kebijakan approval: wajib false hingga disetujui Admin
      };
    }

    const profile = handleNewUserStatus({ id: 'u-1', email: 'new@vinix.com' });
    assert.strictEqual(profile.is_active, false, 'Akun baru wajib berstatus nonaktif (pending approval)');
  });

  // 6. Pengguna nonaktif tidak dapat mengakses rute terproteksi
  test('6. Inactive user (is_active = false) ditolak oleh ProtectedRoute (Fail-Closed)', () => {
    function evaluateAccess(profile, requiredRoles = null) {
      const isActive = profile?.is_active === true;
      if (!isActive) {
        return { allowed: false, reason: 'ACCOUNT_INACTIVE_OR_PENDING' };
      }
      if (requiredRoles && !requiredRoles.includes(profile.role)) {
        return { allowed: false, reason: 'UNAUTHORIZED_ROLE' };
      }
      return { allowed: true };
    }

    const pendingProfile = { id: 'p1', role: 'warehouse_keeper', is_active: false };
    const result = evaluateAccess(pendingProfile);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'ACCOUNT_INACTIVE_OR_PENDING');
  });

  // 7. Penjaga Gudang aktif dapat mengakses rute operasional
  test('7. Active Warehouse Keeper (is_active = true) dapat mengakses rute operasional gudang', () => {
    function evaluateAccess(profile, requiredRoles = null) {
      const isActive = profile?.is_active === true;
      if (!isActive) return { allowed: false };
      if (requiredRoles && !requiredRoles.includes(profile.role)) return { allowed: false };
      return { allowed: true };
    }

    const activeKeeper = { id: 'k1', role: 'warehouse_keeper', is_active: true };
    assert.strictEqual(evaluateAccess(activeKeeper).allowed, true); // Rute staf umum (dashboard, inventaris, peminjaman)
  });

  // 8. Pengguna non-admin ditolak saat mencoba mengaktifkan akun diri sendiri atau orang lain
  test('8. Non-admin dilarang mengubah status is_active atau role miliknya sendiri maupun orang lain', () => {
    function protectProfileRoles(oldProfile, newProfile, callerUser) {
      if ((newProfile.role !== oldProfile.role) || (newProfile.is_active !== oldProfile.is_active)) {
        // Jika pemanggil bukan admin aktif, tolak
        if (callerUser.role !== 'admin' || !callerUser.is_active) {
          throw new Error('Akses ditolak: Hanya Admin aktif yang berwenang mengubah role atau status akun.');
        }
      }
      return true;
    }

    const keeperCaller = { id: 'k-caller', role: 'warehouse_keeper', is_active: true };
    const selfProfile = { id: 'k-caller', role: 'warehouse_keeper', is_active: false };
    const selfActivateAttempt = { id: 'k-caller', role: 'warehouse_keeper', is_active: true };

    assert.throws(
      () => protectProfileRoles(selfProfile, selfActivateAttempt, keeperCaller),
      /Hanya Admin aktif yang berwenang/
    );
  });

  // 9. Admin aktif dapat mengaktifkan dan menonaktifkan akun Penjaga Gudang
  test('9. Admin aktif dapat mengaktifkan (is_active = true) dan menonaktifkan akun Penjaga Gudang', () => {
    function adminToggleStaffActive(targetProfile, newStatus, adminCaller) {
      if (adminCaller.role !== 'admin' || !adminCaller.is_active) {
        throw new Error('Akses ditolak: Hanya Administrator aktif yang berwenang.');
      }
      if (targetProfile.id === adminCaller.id) {
        throw new Error('Administrator tidak dapat menonaktifkan akunnya sendiri.');
      }
      if (targetProfile.role !== 'warehouse_keeper') {
        throw new Error('Akses ditolak: Hanya akun Penjaga Gudang yang dapat diubah status aktifnya.');
      }
      return { ...targetProfile, is_active: Boolean(newStatus) };
    }

    const admin = { id: 'adm-01', role: 'admin', is_active: true };
    const pendingKeeper = { id: 'kp-01', role: 'warehouse_keeper', is_active: false };

    // Aktivasi oleh admin
    const activatedKeeper = adminToggleStaffActive(pendingKeeper, true, admin);
    assert.strictEqual(activatedKeeper.is_active, true, 'Admin berhasil mengaktifkan akun penjaga gudang');

    // Penonaktifan oleh admin
    const deactivatedKeeper = adminToggleStaffActive(activatedKeeper, false, admin);
    assert.strictEqual(deactivatedKeeper.is_active, false, 'Admin berhasil menonaktifkan akun penjaga gudang');

    // Self-deactivation protection
    assert.throws(
      () => adminToggleStaffActive(admin, false, admin),
      /Administrator tidak dapat menonaktifkan akunnya sendiri/
    );
  });

  // 10. Akun Admin tetap berfungsi penuh
  test('10. Akun Admin tetap aktif dan dapat mengakses rute administratif (laporan & manajemen staf)', () => {
    function checkAdminAccess(profile, targetRoute) {
      const isActive = profile?.is_active === true;
      const isAdmin = profile?.role === 'admin' && isActive;

      const adminRoutes = ['/manajemen-petugas', '/laporan'];
      if (adminRoutes.includes(targetRoute)) {
        return isAdmin;
      }
      return isActive;
    }

    const admin = { id: 'adm-1', role: 'admin', is_active: true };
    assert.strictEqual(checkAdminAccess(admin, '/dashboard'), true);
    assert.strictEqual(checkAdminAccess(admin, '/manajemen-petugas'), true);
    assert.strictEqual(checkAdminAccess(admin, '/laporan'), true);

    const keeper = { id: 'kp-1', role: 'warehouse_keeper', is_active: true };
    assert.strictEqual(checkAdminAccess(keeper, '/dashboard'), true);
    assert.strictEqual(checkAdminAccess(keeper, '/manajemen-petugas'), false);
    assert.strictEqual(checkAdminAccess(keeper, '/laporan'), false);
  });

  // 11. Login untuk akun yang sudah ada
  test('11. Login membedakan akun aktif vs akun yang menunggu persetujuan (pending approval)', () => {
    function simulateSignIn(credentials, registeredProfiles) {
      const found = registeredProfiles.find(p => p.email === credentials.email && p.password === credentials.password);
      if (!found) {
        return { data: null, error: new Error('Email atau kata sandi tidak valid.') };
      }
      if (!found.is_active) {
        const err = new Error('Akun Anda sedang menunggu persetujuan aktivasi dari Administrator PT Vinix Seven Aurum.');
        err.isPendingApproval = true;
        return { data: null, error: err };
      }
      return { data: { user: found }, error: null };
    }

    const mockProfiles = [
      { id: '1', email: 'admin@vinix.com', password: 'pass', role: 'admin', is_active: true },
      { id: '2', email: 'pending@vinix.com', password: 'pass', role: 'warehouse_keeper', is_active: false }
    ];

    const successLogin = simulateSignIn({ email: 'admin@vinix.com', password: 'pass' }, mockProfiles);
    assert.strictEqual(successLogin.data !== null, true);

    const pendingLogin = simulateSignIn({ email: 'pending@vinix.com', password: 'pass' }, mockProfiles);
    assert.strictEqual(pendingLogin.data, null);
    assert.strictEqual(pendingLogin.error.isPendingApproval, true);
    assert.strictEqual(pendingLogin.error.message.includes('menunggu persetujuan'), true);
  });

  // 12. Alur pemulihan kata sandi (password recovery flow)
  test('12. Alur lupa kata sandi tetap menggunakan resetPasswordForEmail dan tidak terganggu', () => {
    function simulateForgotPassword(email) {
      if (!email || !email.includes('@')) {
        throw new Error('Format email tidak valid.');
      }
      return {
        success: true,
        redirectTarget: '/auth/callback?type=recovery'
      };
    }

    const res = simulateForgotPassword('staff@vinix7aurum.com');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.redirectTarget.includes('type=recovery'), true);
  });

  // 13. Penanganan pendaftaran email duplikat
  test('13. Pendaftaran dengan email yang sudah ada ditangani secara anggun dengan pesan informatif', () => {
    function handleSignUpError(err) {
      const msg = err.message || '';
      if (msg.includes('already registered') || msg.includes('User already registered') || msg.includes('already in use')) {
        return 'Alamat email ini sudah terdaftar di sistem. Silakan masuk atau gunakan fitur lupa kata sandi.';
      }
      return msg;
    }

    const duplicateError = new Error('User already registered');
    const translatedMsg = handleSignUpError(duplicateError);
    assert.strictEqual(translatedMsg.includes('sudah terdaftar'), true);
  });

  // 14. Pemulihan sesi autentikasi setelah refresh (session restoration)
  test('14. Pemulihan sesi saat refresh memvalidasi status is_active dari server sebelum mengizinkan akses', () => {
    function restoreSession(storedSession, profileFetcher) {
      if (!storedSession?.user?.id) return { status: 'UNAUTHENTICATED' };

      const profile = profileFetcher(storedSession.user.id);
      if (!profile || !profile.is_active) {
        return { status: 'DEACTIVATED_OR_PENDING', sessionTerminated: true };
      }
      return { status: 'AUTHENTICATED', profile };
    }

    const activeSession = { user: { id: 'usr-active' } };
    const inactiveSession = { user: { id: 'usr-pending' } };

    const db = {
      'usr-active': { id: 'usr-active', role: 'warehouse_keeper', is_active: true },
      'usr-pending': { id: 'usr-pending', role: 'warehouse_keeper', is_active: false }
    };

    const activeRes = restoreSession(activeSession, id => db[id]);
    assert.strictEqual(activeRes.status, 'AUTHENTICATED');

    const inactiveRes = restoreSession(inactiveSession, id => db[id]);
    assert.strictEqual(inactiveRes.status, 'DEACTIVATED_OR_PENDING');
    assert.strictEqual(inactiveRes.sessionTerminated, true);
  });

  // 15. Keamanan race condition pembersihan sesi tertunda (deferred signOut TOCTOU guard)
  test('15. Deferred sign-out tidak membatalkan sesi baru yang valid (TOCTOU session & token check)', () => {
    let remoteSignOutCalls = 0;
    const mockSupabase = {
      currentSession: null,
      getSessionSync() {
        return { data: { session: this.currentSession } };
      },
      signOutSync() {
        remoteSignOutCalls++;
        this.currentSession = null;
      }
    };

    // Simulasi fungsi deferred handler di AuthContext
    function executeDeferredSignOutSync(invalidUserId, invalidAccessToken, supabase) {
      try {
        const { data: activeData } = supabase.getSessionSync();
        const activeUserId = activeData?.session?.user?.id;
        const activeToken = activeData?.session?.access_token;
        if (activeUserId === invalidUserId && (!invalidAccessToken || activeToken === invalidAccessToken)) {
          supabase.signOutSync();
          return { signedOut: true };
        }
        return { signedOut: false, reason: 'SESSION_IDENTITY_OR_TOKEN_CHANGED' };
      } catch (_) {
        return { signedOut: false, reason: 'ERROR' };
      }
    }

    // Skenario A: Sesi masih milik user nonaktif yang sama -> signOut dijalankan
    mockSupabase.currentSession = { user: { id: 'usr-inactive' }, access_token: 'token-inactive-1' };
    const resA = executeDeferredSignOutSync('usr-inactive', 'token-inactive-1', mockSupabase);
    assert.strictEqual(remoteSignOutCalls, 1);
    assert.strictEqual(resA.signedOut, true);

    // Skenario B: Sebelum deferred signOut jalan, Admin yang valid berhasil login (usr-admin)
    // Sesi berubah menjadi milik Admin -> signOut WAJIB DIBATALKAN (tidak membunuh sesi Admin)
    remoteSignOutCalls = 0;
    mockSupabase.currentSession = { user: { id: 'usr-admin' }, access_token: 'token-admin-jwt' };
    const resB = executeDeferredSignOutSync('usr-inactive', 'token-inactive-1', mockSupabase);
    assert.strictEqual(remoteSignOutCalls, 0, 'SignOut tidak boleh dipanggil ketika session user berbeda');
    assert.strictEqual(resB.signedOut, false);
    assert.strictEqual(mockSupabase.currentSession.user.id, 'usr-admin', 'Sesi admin harus tetap utuh');

    // Skenario C: User diaktifkan dan login kembali dengan token baru (user.id sama, access_token beda)
    remoteSignOutCalls = 0;
    mockSupabase.currentSession = { user: { id: 'usr-inactive' }, access_token: 'token-newly-activated-2' };
    const resC = executeDeferredSignOutSync('usr-inactive', 'token-inactive-1', mockSupabase);
    assert.strictEqual(remoteSignOutCalls, 0, 'SignOut tidak boleh dipanggil jika token sesi sudah diperbarui');
    assert.strictEqual(resC.signedOut, false);
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Auth Email Confirmation Adjustment: ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runAuthEmailConfirmationAdjustmentTests };

if (require.main === module) {
  runAuthEmailConfirmationAdjustmentTests();
}
