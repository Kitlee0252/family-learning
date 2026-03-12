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
    const { phone, code } = await req.json();

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

    // Step 1: Verify OTP with Aliyun PNVS
    const checkResult = await callAliyunApi({
      accessKeyId: ALIYUN_AK_ID,
      accessKeySecret: ALIYUN_AK_SECRET,
      action: "CheckSmsVerifyCode",
      params: {
        PhoneNumber: phone,
        VerifyCode: code,
      },
    });

    console.log("CheckSmsVerifyCode response:", JSON.stringify(checkResult));

    const model = checkResult.Model as Record<string, unknown> | undefined;
    if (!checkResult.Success || model?.VerifyResult !== "PASS") {
      return new Response(
        JSON.stringify({ error: "验证码错误或已过期" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Create or sign in Supabase Auth user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const phoneE164 = `+86${phone}`;
    const password = await derivePassword(phone);

    // Try sign in first (returning user)
    let { data: signInData, error: signInError } =
      await supabaseAnon.auth.signInWithPassword({ phone: phoneE164, password });

    if (signInError) {
      console.log("User not found, creating:", signInError.message);
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        phone: phoneE164,
        password,
        phone_confirm: true,
      });

      if (createError) {
        console.error("createUser error:", createError);
        return new Response(
          JSON.stringify({ error: "创建用户失败" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log("User created:", createData.user.id);

      ({ data: signInData, error: signInError } =
        await supabaseAnon.auth.signInWithPassword({ phone: phoneE164, password }));

      if (signInError) {
        console.error("signIn after create error:", signInError);
        return new Response(
          JSON.stringify({ error: "登录失败" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log("Login success, user:", signInData?.user?.id);

    // Step 3: Enforce max 5 device sessions — delete oldest if exceeded
    const MAX_SESSIONS = 5;
    const userId = signInData!.user!.id;
    try {
      await supabaseAdmin.rpc("cleanup_old_sessions", {
        p_user_id: userId,
        p_max_sessions: MAX_SESSIONS,
      });
    } catch (cleanupErr) {
      // Non-blocking: session cleanup failure should not break login
      console.warn("Session cleanup error (non-blocking):", cleanupErr);
    }

    return new Response(
      JSON.stringify({ session: signInData!.session }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
