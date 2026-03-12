import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAliyunApi } from "../_shared/aliyun-signer.ts";
import { derivePassword } from "../_shared/derive-password.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";

const ALIYUN_AK_ID = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_ID")!;
const ALIYUN_AK_SECRET = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { phone, code, household_id, confirmed } = await req.json();

    // Verify JWT — caller must be logged in
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "未登录" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate phone
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的手机号" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!code || !/^\d{4,8}$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的验证码" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!household_id) {
      return new Response(
        JSON.stringify({ error: "缺少 household_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Verify OTP with Aliyun
    const checkResult = await callAliyunApi({
      accessKeyId: ALIYUN_AK_ID,
      accessKeySecret: ALIYUN_AK_SECRET,
      action: "CheckSmsVerifyCode",
      params: { PhoneNumber: phone, VerifyCode: code },
    });

    const model = checkResult.Model as Record<string, unknown> | undefined;
    if (!checkResult.Success || model?.VerifyResult !== "PASS") {
      return new Response(
        JSON.stringify({ error: "验证码错误或已过期" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Create or find phone user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const phoneE164 = `+86${phone}`;
    const password = await derivePassword(phone);
    let phoneUserId: string;

    // Try to create user first; if already exists, find them
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: phoneE164,
      password,
      phone_confirm: true,
    });

    if (createError) {
      // User likely already exists — try to find by phone
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        filter: phoneE164,
      });
      const found = listData?.users?.[0];
      if (found) {
        phoneUserId = found.id;
      } else {
        return new Response(
          JSON.stringify({ error: "创建用户失败: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      phoneUserId = newUser.user.id;
    }

    // Step 3: Check for conflicts
    const { data: existingBinding } = await supabaseAdmin
      .from("household_users")
      .select("household_id")
      .eq("user_id", phoneUserId)
      .maybeSingle();

    if (existingBinding && existingBinding.household_id !== household_id) {
      if (!confirmed) {
        return new Response(
          JSON.stringify({ conflict: true, warning: "该手机号已绑定其他家庭数据" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await supabaseAdmin
        .from("household_users")
        .delete()
        .eq("user_id", phoneUserId);
    }

    // Step 4: Insert into household_users
    const { error: insertError } = await supabaseAdmin
      .from("household_users")
      .upsert(
        { household_id, user_id: phoneUserId, auth_method: "phone" },
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
    console.error("bind-phone error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
