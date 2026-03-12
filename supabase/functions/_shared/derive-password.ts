const encoder = new TextEncoder();

export async function derivePassword(phone: string): Promise<string> {
  const secret = Deno.env.get("OTP_AUTH_SECRET") || "fallback-dev-secret-change-me";
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(phone));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
