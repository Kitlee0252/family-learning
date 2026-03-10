/**
 * Aliyun ACS3-HMAC-SHA256 V3 Signature for Deno
 * Used to sign requests to Aliyun PNVS (号码认证服务) APIs
 */

const encoder = new TextEncoder();

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const keyData = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const sig = await hmacSha256(key, data);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/~/g, "%7E");
}

interface AliyunRequestParams {
  accessKeyId: string;
  accessKeySecret: string;
  action: string;
  version?: string;
  endpoint?: string;
  params: Record<string, string | number | boolean>;
}

export async function callAliyunApi({
  accessKeyId,
  accessKeySecret,
  action,
  version = "2017-05-25",
  endpoint = "dypnsapi.aliyuncs.com",
  params,
}: AliyunRequestParams): Promise<Record<string, unknown>> {
  const method = "POST";
  const canonicalUri = "/";

  // Build sorted query string from params
  const queryParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      queryParams[k] = String(v);
    }
  }
  const sortedKeys = Object.keys(queryParams).sort();
  const canonicalQueryString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(queryParams[k])}`)
    .join("&");

  // Headers
  const now = new Date();
  const xAcsDate = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = crypto.randomUUID();
  const hashedPayload = await sha256Hex(""); // empty body for RPC

  const headers: Record<string, string> = {
    host: endpoint,
    "x-acs-action": action,
    "x-acs-version": version,
    "x-acs-date": xAcsDate,
    "x-acs-signature-nonce": nonce,
    "x-acs-content-sha256": hashedPayload,
  };

  // Canonical headers (sorted by lowercase key)
  const signedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k]}`)
    .join("\n") + "\n";
  const signedHeaders = signedHeaderKeys.join(";");

  // Step 1: Canonical Request
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  // Step 2: String to Sign
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = `ACS3-HMAC-SHA256\n${hashedCanonicalRequest}`;

  // Step 3: Signature
  const signature = await hmacSha256Hex(accessKeySecret, stringToSign);

  // Step 4: Authorization header
  const authorization = `ACS3-HMAC-SHA256 Credential=${accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;

  // Build URL
  const url = `https://${endpoint}/${canonicalQueryString ? "?" + canonicalQueryString : ""}`;

  // Make request
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const body = await response.json();
  return body;
}
