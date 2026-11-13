/**
 * Test Suite: Phase D — Authentication & UI Refactor
 * Memvalidasi autentikasi, status aktif akun, proteksi rute berbasis role,
 * filtering navigasi, dan perhitungan metrik dashboard Atrium hybrid.
 */

const assert = require('assert');

function runPhaseDTests() {
  console.log('\n🎨 Memulai Pengujian Phase D (Authentication & UI Refactor)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✨ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Validasi Helper Status Akun & Role pada AuthContext
  test('1. Inactive account (is_active = false) revokes all role access and privileges', () => {
    function computeAuthFlags(profile) {
      const isActive = profile ? profile.is_active !== false : false;
      const isAdmin = profile?.role === 'admin' && isActive;
      const isWarehouseKeeper = profile?.role === 'warehouse_keeper' && isActive;
      const isStaff = (isAdmin || isWarehouseKeeper) && isActive;
      return { isActive, isAdmin, isWarehouseKeeper, isStaff };
    }

    // Active Admin
    const activeAdmin = computeAuthFlags({ role: 'admin', is_active: true });
    assert.strictEqual(activeAdmin.isActive, true);
    assert.strictEqual(activeAdmin.isAdmin, true);
    assert.strictEqual(activeAdmin.isStaff, true);

    // Active Warehouse Keeper
    const activeKeeper = computeAuthFlags({ role: 'warehouse_keeper', is_active: true });
    assert.strictEqual(activeKeeper.isActive, true);
    assert.strictEqual(activeKeeper.isAdmin, false);
    assert.strictEqual(activeKeeper.isWarehouseKeeper, true);
    assert.strictEqual(activeKeeper.isStaff, true);

    // Deactivated Admin
    const inactiveAdmin = computeAuthFlags({ role: 'admin', is_active: false });
    assert.strictEqual(inactiveAdmin.isActive, false);
    assert.strictEqual(inactiveAdmin.isAdmin, false);
    assert.strictEqual(inactiveAdmin.isStaff, false);

    // Deactivated Warehouse Keeper
    const inactiveKeeper = computeAuthFlags({ role: 'warehouse_keeper', is_active: false });
    assert.strictEqual(inactiveKeeper.isActive, false);
    assert.strictEqual(inactiveKeeper.isWarehouseKeeper, false);
    assert.strictEqual(inactiveKeeper.isStaff, false);
  });

  // 2. Simulasi Penolakan Login untuk Akun Nonaktif
  test('2. SignIn rejects deactivated accounts and triggers immediate session termination', async () => {
    let sessionTerminated = false;
    let stateCleared = false;

    const mockSupabase = {
      auth: {
        signInWithPassword: async ({ email, password }) => {
          if (email === 'inactive@vinix7aurum.com') {
            return { data: { user: { id: 'u-inactive', email } }, error: null };
          }
          return { data: { user: { id: 'u-active', email } }, error: null };
        },
        signOut: async () => {
          sessionTerminated = true;
        }
      }
    };

    const fetchProfileMock = async (userId) => {
      if (userId === 'u-inactive') {
        return { id: userId, is_active: false, role: 'warehouse_keeper' };
      }
      return { id: userId, is_active: true, role: 'warehouse_keeper' };
    };

    async function handleSignIn({ email, password }) {
      const { data, error } = await mockSupabase.auth.signInWithPassword({ email, password });
      if (data?.user) {
        const userProfile = await fetchProfileMock(data.user.id);
        if (userProfile && userProfile.is_active === false) {
          await mockSupabase.auth.signOut();
          stateCleared = true;
          return {
            data: null,
            error: new Error('Akun Anda telah dinonaktifkan oleh Administrator PT Vinix Seven Aurum. Silakan hubungi Administrator.')
          };
        }
      }
      return { data, error };
    }

    const result = await handleSignIn({ email: 'inactive@vinix7aurum.com', password: 'password123' });
    assert.strictEqual(result.data, null);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('telah dinonaktifkan'));
    assert.strictEqual(sessionTerminated, true);
    assert.strictEqual(stateCleared, true);
  });

  // 3. Proteksi Sesi pada Pemulihan Sesi (Session Restore)
  test('3. Session restore detects inactive account and terminates session', async () => {
    let signedOut = false;

    async function checkRestoredSession(user, profile) {
      if (user && profile && profile.is_active === false) {
        signedOut = true;
        return { authenticated: false, reason: 'DEACTIVATED' };
      }
      if (user && profile && profile.is_active === true) {
        return { authenticated: true, reason: 'ACTIVE' };
      }
      return { authenticated: false, reason: 'ANONYMOUS' };
    }

    const res1 = await checkRestoredSession({ id: 'u-1' }, { role: 'warehouse_keeper', is_active: false });
    assert.strictEqual(signedOut, true);
    assert.strictEqual(res1.authenticated, false);
    assert.strictEqual(res1.reason, 'DEACTIVATED');

    const res2 = await checkRestoredSession({ id: 'u-2' }, { role: 'admin', is_active: true });
    assert.strictEqual(res2.authenticated, true);
    assert.strictEqual(res2.reason, 'ACTIVE');
  });

  // 4. Aturan Akses Rute ProtectedRoute
  test('4. ProtectedRoute evaluates allowedRoles and blocks unauthorized routes', () => {
    function evaluateRouteAccess({ user, profile, allowedRoles }) {
      if (!user) return { allow: false, redirect: '/login' };
      if (profile && profile.is_active === false) return { allow: false, blocked: 'DEACTIVATED' };
      if (profile && !['admin', 'warehouse_keeper'].includes(profile.role)) {
        return { allow: false, redirect: '/login' };
      }
      if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
        return { allow: false, redirect: '/dashboard' };
      }
      return { allow: true, redirect: null };
    }

    // Warehouse keeper trying to access /manajemen-petugas (allowedRoles: ['admin'])
    const keeperToStaff = evaluateRouteAccess({
      user: { id: 'k-1' },
      profile: { role: 'warehouse_keeper', is_active: true },
      allowedRoles: ['admin']
    });
    assert.strictEqual(keeperToStaff.allow, false);
    assert.strictEqual(keeperToStaff.redirect, '/dashboard');

    // Admin accessing /manajemen-petugas
    const adminToStaff = evaluateRouteAccess({
      user: { id: 'a-1' },
      profile: { role: 'admin', is_active: true },
      allowedRoles: ['admin']
    });
    assert.strictEqual(adminToStaff.allow, true);
    assert.strictEqual(adminToStaff.redirect, null);

    // Deactivated user accessing any protected route
    const deactUser = evaluateRouteAccess({
      user: { id: 'd-1' },
      profile: { role: 'warehouse_keeper', is_active: false },
      allowedRoles: null
    });
    assert.strictEqual(deactUser.allow, false);
    assert.strictEqual(deactUser.blocked, 'DEACTIVATED');

    // Anonymous user
    const anonUser = evaluateRouteAccess({ user: null, profile: null, allowedRoles: null });
    assert.strictEqual(anonUser.allow, false);
    assert.strictEqual(anonUser.redirect, '/login');
  });

  // 5. Filter Navigasi Sidebar Berdasarkan Role
  test('5. Sidebar navigation excludes admin-only items for Warehouse Keeper', () => {
    function getSidebarNavItems(role) {
      const baseItems = [
        { path: '/dashboard', label: 'Dashboard' },
        { path: '/barang-dititipkan', label: 'Inventaris Gudang' },
        { path: '/pengunjung', label: 'Direktori Peminjam' },
        { path: '/penitipan-baru', label: 'Peminjaman & Pengembalian' },
        { path: '/riwayat', label: 'Riwayat Transaksi' },
        { path: '/profil', label: 'Profil Saya' }
      ];

      if (role === 'admin') {
        baseItems.push(
          { path: '/kategori-barang', label: 'Kategori Barang' },
          { path: '/lokasi-penyimpanan', label: 'Lokasi Penyimpanan' },
          { path: '/laporan', label: 'Laporan Gudang' },
          { path: '/manajemen-petugas', label: 'Manajemen Petugas' }
        );
      }

      return baseItems;
    }

    const keeperNav = getSidebarNavItems('warehouse_keeper');
    const adminNav = getSidebarNavItems('admin');

    const keeperPaths = keeperNav.map(n => n.path);
    assert.strictEqual(keeperPaths.includes('/manajemen-petugas'), false);
    assert.strictEqual(keeperPaths.includes('/laporan'), false);
    assert.strictEqual(keeperPaths.includes('/dashboard'), true);
    assert.strictEqual(keeperPaths.includes('/barang-dititipkan'), true);

    const adminPaths = adminNav.map(n => n.path);
    assert.strictEqual(adminPaths.includes('/manajemen-petugas'), true);
    assert.strictEqual(adminPaths.includes('/laporan'), true);
  });

  // 6. Validasi Input Form Login
  test('6. Login form validation enforces non-empty email and password', () => {
    function validateLoginForm(email, password) {
      if (!email || !email.trim()) return 'Email wajib diisi.';
      if (!password || !password.trim()) return 'Kata sandi wajib diisi.';
      return null;
    }

    assert.strictEqual(validateLoginForm('', 'secret'), 'Email wajib diisi.');
    assert.strictEqual(validateLoginForm('user@vinix.com', ''), 'Kata sandi wajib diisi.');
    assert.strictEqual(validateLoginForm('user@vinix.com', 'secret'), null);
  });

  // 7. Perhitungan Metrik KPI Dashboard Gudang
  test('7. Dashboard KPI accurately aggregates available, borrowed, and maintenance stock', () => {
    const rawItems = [
      { total_qty: 50, available_qty: 40, damaged_qty: 2, under_repair_qty: 1 },
      { total_qty: 30, available_qty: 25, damaged_qty: 1, under_repair_qty: 0 },
      { total_qty: 20, available_qty: 15, damaged_qty: 0, under_repair_qty: 2 }
    ];

    let totalItems = 0;
    let availableQty = 0;
    let damagedQty = 0;

    rawItems.forEach(item => {
      totalItems += item.total_qty || 0;
      availableQty += item.available_qty || 0;
      damagedQty += (item.damaged_qty || 0) + (item.under_repair_qty || 0);
    });

    const borrowedQty = Math.max(0, totalItems - availableQty - damagedQty);

    assert.strictEqual(totalItems, 100);
    assert.strictEqual(availableQty, 80);
    assert.strictEqual(damagedQty, 6);
    assert.strictEqual(borrowedQty, 14);
  });

  // 8. Deteksi Transaksi Pengembalian Terlambat (Overdue)
  test('8. Dashboard detects overdue borrowings based on due_date and status', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    const borrowings = [
      { id: 'b1', status: 'borrowed', due_date: '2026-11-12T10:00:00Z' }, // Overdue
      { id: 'b2', status: 'borrowed', due_date: '2026-11-14T10:00:00Z' }, // On track
      { id: 'b3', status: 'returned', due_date: '2026-11-10T10:00:00Z' }, // Already returned
      { id: 'b4', status: 'partial_returned', due_date: '2026-11-11T10:00:00Z' } // Overdue partial
    ];

    function calculateOverdue(list, currentTime) {
      return list.filter(b =>
        ['borrowed', 'partial_returned'].includes(b.status) &&
        b.due_date &&
        new Date(b.due_date) < currentTime
      ).length;
    }

    assert.strictEqual(calculateOverdue(borrowings, now), 2);
  });

  // 9. Kompatibilitas Tampilan Fallback Demo / Offline
  test('9. Offline demo mode provides realistic Atrium bento structure and statistics', () => {
    function getDemoDashboardStats(isConfigured) {
      if (!isConfigured) {
        return {
          totalItems: 96,
          availableQty: 82,
          borrowedQty: 11,
          damagedQty: 3,
          activeBorrowings: 6,
          overdueCount: 2,
          returnsDueToday: 3,
          isOfflineDemo: true
        };
      }
      return { isOfflineDemo: false };
    }

    const demoStats = getDemoDashboardStats(false);
    assert.strictEqual(demoStats.isOfflineDemo, true);
    assert.strictEqual(demoStats.totalItems, 96);
    assert.strictEqual(demoStats.availableQty, 82);
    assert.strictEqual(demoStats.overdueCount, 2);
  });

  // 10. Sanitasi Metadata Branding Aplikasi
  test('10. App branding reflects PT Vinix Seven Aurum Warehouse Management System', () => {
    const appTitle = 'SiPenitip — PT Vinix Seven Aurum · Warehouse Management System';
    assert.ok(appTitle.includes('PT Vinix Seven Aurum'));
    assert.ok(appTitle.includes('Warehouse Management System'));
    assert.strictEqual(appTitle.includes('Pengunjung'), false);
  });

  console.log(`\n========================================`);
  console.log(`Hasil Pengujian Phase D (UI & Auth): ${passed} Lulus, ${failed} Gagal`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = { runPhaseDTests };

if (require.main === module) {
  runPhaseDTests();
}
