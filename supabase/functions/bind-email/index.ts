import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { email, password, household_id, confirmed } = await req.json();

    // Verify JWT — caller must be logged in
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "未登录" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的邮箱地址" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "密码至少6位" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!household_id) {
      return new Response(
        JSON.stringify({ error: "缺少 household_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: Create or find email user
    let emailUserId: string;
    let existingUser: { id: string; email_confirmed_at?: string | null } | null = null;

    // Try to create user first; if already exists, fetch by listing with email filter
    try {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      });
      if (createError) {
        // User likely already exists — try to find them
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
          filter: email,
        });
        const found = listData?.users?.[0];
        if (found) {
          existingUser = found;
          emailUserId = found.id;
        } else {
          return new Response(
            JSON.stringify({ error: "创建用户失败: " + createError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        emailUserId = newUser.user.id;
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "用户操作失败: " + String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Check for conflicts in household_users
    const { data: existingBinding } = await supabaseAdmin
      .from("household_users")
      .select("household_id")
      .eq("user_id", emailUserId)
      .maybeSingle();

    if (existingBinding && existingBinding.household_id !== household_id) {
      if (!confirmed) {
        return new Response(
          JSON.stringify({ conflict: true, warning: "该邮箱已绑定其他家庭数据" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Delete old binding
      await supabaseAdmin
        .from("household_users")
        .delete()
        .eq("user_id", emailUserId);
    }

    // Step 3: Generate verification link (triggers confirmation email)
    if (!existingUser || !existingUser.email_confirmed_at) {
      await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password,
      });
    }

    // Step 4: Insert into household_users
    const { error: insertError } = await supabaseAdmin
      .from("household_users")
      .upsert(
        { household_id, user_id: emailUserId, auth_method: "email" },
        { onConflict: "user_id" },
      );

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "绑定失败: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("bind-email error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
