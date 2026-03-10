import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callAliyunApi } from "../_shared/aliyun-signer.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";

const ALIYUN_AK_ID = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_ID")!;
const ALIYUN_AK_SECRET = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { phone } = await req.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的手机号" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await callAliyunApi({
      accessKeyId: ALIYUN_AK_ID,
      accessKeySecret: ALIYUN_AK_SECRET,
      action: "SendSmsVerifyCode",
      params: {
        PhoneNumber: phone,
        SignName: "速通互联验证码",
        TemplateCode: "100001",
        TemplateParam: '{"code":"##code##","min":"5"}',
        CodeLength: 6,
        ValidTime: 300,
        Interval: 60,
        CodeType: 1,
        DuplicatePolicy: 1,
      },
    });

    console.log("SendSmsVerifyCode response:", JSON.stringify(result));

    if (result.Code === "OK" && result.Success === true) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: (result.Message as string) || "发送失败", code: result.Code }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
