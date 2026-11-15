import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  const fetchProfile = useCallback(async (userId, userMetadata = {}) => {
    if (!isConfigured || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) console.warn('Gagal mengambil data profil:', error.message);

      if (data) {
        setProfile(data);
        return data;
      }

      // Fallback profile untuk user baru (default role: warehouse_keeper, nonaktif menunggu persetujuan Admin)
      const fallbackProfile = {
        id: userId,
        full_name: userMetadata?.full_name || '',
        role: 'warehouse_keeper',
        employee_id: '',
        shift: '',
        phone: '',
        is_active: false,
        profile_completed: false
      };

      const { data: insertedData, error: insertError } = await supabase
        .from('profiles')
        .insert(fallbackProfile)
        .select()
        .maybeSingle();

      if (insertError) {
        const { data: retryProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (retryProfile) {
          setProfile(retryProfile);
          return retryProfile;
        }
      }

      const finalProfile = insertedData || fallbackProfile;
      setProfile(finalProfile);
      return finalProfile;
    } catch (err) {
      console.error('Error saat fetchProfile:', err);
      return null;
    }
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured) {
      const mockProfile = {
        id: 'local-mock-001',
        full_name: 'Admin Demo',
        email: 'admin@vinix7aurum.com',
        role: 'admin',
        employee_id: 'ADM-001',
        shift: 'Pagi',
        phone: '081234567890',
        is_active: true,
        profile_completed: true
      };
      setUser({ id: 'local-mock-001', email: 'admin@vinix7aurum.com' });
      setProfile(mockProfile);
      setLoading(false);
      return;
    }

    let mounted = true;

    // Initial session restoration
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return;
      if (!currentSession?.user) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userProf = await fetchProfile(currentSession.user.id, currentSession.user.user_metadata);
        if (!mounted) return;

        if (userProf && userProf.is_active === true) {
          setSession(currentSession);
          setUser(currentSession.user);
          setProfile(userProf);
        } else {
          const invalidUserId = currentSession.user.id;
          const invalidAccessToken = currentSession.access_token;
          // Defer signOut to event loop to avoid locking during mount,
          // verifying session identity & token so it cannot race with a subsequent valid login.
          setTimeout(async () => {
            try {
              const { data: activeData } = await supabase.auth.getSession();
              const activeUserId = activeData?.session?.user?.id;
              const activeToken = activeData?.session?.access_token;
              if (activeUserId === invalidUserId && (!invalidAccessToken || activeToken === invalidAccessToken)) {
                await supabase.auth.signOut();
              }
            } catch (_) {}
          }, 0);
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.warn('Error saat inisialisasi profil sesi:', err);
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    // Reactive auth event subscriber — Deadlock-safe state transition
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !currentSession?.user) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userProf = await fetchProfile(currentSession.user.id, currentSession.user.user_metadata);
        if (!mounted) return;

        if (userProf && userProf.is_active === true) {
          setSession(currentSession);
          setUser(currentSession.user);
          setProfile(userProf);
        } else {
          const invalidUserId = currentSession.user.id;
          const invalidAccessToken = currentSession.access_token;
          // IMPORTANT: Never await supabase.auth.signOut() directly inside onAuthStateChange callback.
          // In @supabase/supabase-js, calling an auth API method while processing an auth event
          // can deadlock the internal subscriber queue.
          // We immediately clear React state (fail closed) and defer remote signOut,
          // checking session identity & token so it cannot interfere with a subsequent valid session.
          setTimeout(async () => {
            try {
              const { data: activeData } = await supabase.auth.getSession();
              const activeUserId = activeData?.session?.user?.id;
              const activeToken = activeData?.session?.access_token;
              if (activeUserId === invalidUserId && (!invalidAccessToken || activeToken === invalidAccessToken)) {
                await supabase.auth.signOut();
              }
            } catch (_) {}
          }, 0);
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.warn('Error saat memperbarui profil pada auth state change:', err);
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, fetchProfile]);

  const signUp = async ({ email, password, fullName }) => {
    if (!isConfigured) {
      return { data: { user: { email } }, error: null, isPendingApproval: true };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      return { data, error, isPendingApproval: false };
    }

    // Saat Email Confirmation dinonaktifkan di Supabase, signUp langsung mengembalikan sesi (session).
    // Namun karena akun pendaftaran baru berstatus nonaktif (is_active = false) menunggu persetujuan Admin,
    // batalkan sesi aktif seketika agar pengguna tidak dapat menembus rute terproteksi.
    if (data?.session) {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
    }

    return { data, error: null, isPendingApproval: true };
  };

  const signIn = async ({ email, password }) => {
    if (!isConfigured) return { data: { user: { email } }, error: null };
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (data?.user) {
      const userProfile = await fetchProfile(data.user.id, data.user.user_metadata);
      if (!userProfile || userProfile.is_active !== true) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        const msg = !userProfile
          ? 'Profil akun tidak ditemukan di server. Hubungi Administrator.'
          : 'Akun Anda sedang menunggu persetujuan aktivasi dari Administrator PT Vinix Seven Aurum. Silakan hubungi Administrator untuk mengaktifkan akun Anda.';
        const err = new Error(msg);
        err.isPendingApproval = userProfile ? userProfile.is_active === false : false;
        return { data: null, error: err };
      }
    }
    return { data, error };
  };

  const signOut = async () => {
    if (isConfigured) await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const updateUserProfile = async (updates) => {
    // Strip privileged fields regardless of client state; DB trigger enforces this too
    const { role, is_active, ...safeUpdates } = updates;
    if (!isConfigured) {
      setProfile(prev => ({ ...prev, ...safeUpdates }));
      return { data: { ...profile, ...safeUpdates }, error: null };
    }
    if (!user) return { data: null, error: new Error('User belum terautentikasi') };

    const { data, error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (!error && data) setProfile(data);
    return { data, error };
  };

  const updateUserEmail = async (newEmail) => {
    if (!isConfigured) return { data: {}, error: null };
    return supabase.auth.updateUser(
      { email: newEmail.trim() },
      { emailRedirectTo: `${window.location.origin}/auth/callback` }
    );
  };

  const resetPassword = async (email) => {
    if (!isConfigured) return { data: {}, error: null };
    return supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`
    });
  };

  const updatePassword = async (newPassword) => {
    if (!isConfigured) return { data: {}, error: null };
    return supabase.auth.updateUser({ password: newPassword });
  };

  const refreshProfile = async () => {
    if (user) return await fetchProfile(user.id, user?.user_metadata);
    return null;
  };

  // Revalidasi status profil langsung ke server Supabase (mencegah akun yang dinonaktifkan tetap beroperasi)
  const revalidateActiveProfile = useCallback(async () => {
    if (!isConfigured || !user?.id) return { valid: false, reason: 'UNAUTHENTICATED' };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        // Gangguan jaringan ditangani terpisah dari deaktivasi akun
        console.warn('Kendala jaringan saat revalidasi profil:', error.message);
        return { valid: null, networkError: true, error };
      }

      if (!data) {
        // Profil tidak ditemukan di server
        if (isConfigured) await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        return { valid: false, reason: 'PROFILE_NOT_FOUND' };
      }

      if (data.is_active !== true) {
        // Konfirmasi eksplisit akun nonaktif oleh Admin
        if (isConfigured) await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        return { valid: false, reason: 'DEACTIVATED' };
      }

      // Profil valid dan aktif
      setProfile(prev => (prev ? { ...prev, ...data } : data));
      return { valid: true, profile: data };
    } catch (err) {
      return { valid: null, networkError: true, error: err };
    }
  }, [isConfigured, user?.id]);

  // Role & active status helpers — FAIL CLOSED
  const isActive = profile?.is_active === true;
  const isAdmin = profile?.role === 'admin' && isActive;
  const isWarehouseKeeper = profile?.role === 'warehouse_keeper' && isActive;
  const isSatpam = isWarehouseKeeper; // alias kompatibilitas selama transisi
  const isStaff = (isAdmin || isWarehouseKeeper) && isActive;

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, isConfigured,
      isAdmin, isWarehouseKeeper, isSatpam, isStaff, isActive,
      signUp, signIn, signOut,
      updateUserProfile, updateUserEmail,
      resetPassword, updatePassword, refreshProfile,
      revalidateActiveProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
