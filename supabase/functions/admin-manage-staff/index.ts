// ============================================================
// Supabase Edge Function: admin-manage-staff
// PT Vinix Seven Aurum Warehouse Management System
//
// Description:
// Trusted server-side endpoint for Admin users to invite, create,
// or toggle active status of Warehouse Keeper accounts using the
// Supabase Admin API (auth.admin).
//
// Security Constraints:
// 1. Validates the caller's JWT from the Authorization header.
// 2. Checks public.profiles to verify the caller has role = 'admin'
//    and is_active = TRUE.
// 3. Service role key (SUPABASE_SERVICE_ROLE_KEY) is used ONLY
//    within this server-side execution context, never on frontend.
// 4. Enforces target role to only be 'warehouse_keeper' (cannot create
//    additional Admins unless explicitly extended with multi-admin policy).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Konfigurasi server Supabase belum lengkap (SUPABASE_URL atau SERVICE_ROLE_KEY tidak ditemukan).");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Otorisasi diperlukan: Token JWT tidak ditemukan." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: callerUser }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Sesi tidak valid atau telah kedaluwarsa." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "Akses ditolak: Hanya Administrator aktif yang berwenang mengelola akun petugas." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, email, fullName, employeeId, shift, phone, targetUserId, newStatus, redirectTo } = await req.json();

    // 1. ACTION: INVITE WAREHOUSE KEEPER
    if (action === "invite_staff") {
      if (!email || !email.trim()) {
        return new Response(
          JSON.stringify({ error: "Alamat email wajib diisi." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Undang pengguna baru via Supabase Admin API; trigger handle_new_user() selalu menetapkan role 'warehouse_keeper'.
      const { data: invitedData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email.trim(),
        {
          data: {
            full_name: (fullName || "").trim(),
            employee_id: (employeeId || "").trim(),
            shift: (shift || "").trim(),
            phone: (phone || "").trim(),
          },
          redirectTo: redirectTo || undefined,
        }
      );

      if (inviteError) {
        return new Response(
          JSON.stringify({ error: inviteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sinkronkan metadata profil di public.profiles (role dikunci sebagai 'warehouse_keeper')
      if (invitedData?.user) {
        await adminClient
          .from("profiles")
          .update({
            email: email.trim(),
            full_name: (fullName || "").trim(),
            role: "warehouse_keeper",
            employee_id: (employeeId || "").trim(),
            shift: (shift || "").trim(),
            phone: (phone || "").trim(),
            is_active: true,
          })
          .eq("id", invitedData.user.id);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Undangan Penjaga Gudang berhasil dikirim.", user: invitedData?.user }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. ACTION: TOGGLE ACTIVE / DEACTIVATE
    if (action === "toggle_active") {
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: "ID pengguna target wajib disertakan." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetUserId === callerUser.id) {
        return new Response(
          JSON.stringify({ error: "Administrator tidak dapat menonaktifkan akunnya sendiri." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updatedProfile, error: updateError } = await adminClient
        .from("profiles")
        .update({ is_active: Boolean(newStatus), updated_at: new Date().toISOString() })
        .eq("id", targetUserId)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, profile: updatedProfile }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Aksi tidak dikenal: '${action}'` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Terjadi kesalahan internal server." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
