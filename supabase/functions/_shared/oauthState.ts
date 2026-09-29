/**
 * Signed, single-use OAuth state helpers (Google Calendar).
 *
 * The browser-visible `state` is `nonce.hmac(nonce)`. User id and redirect
 * origin live in the database row keyed by nonce, so a forged state cannot
 * retarget tokens or open-redirect.
 */

const TRUSTED_APP_HOSTS = new Set([
  "app.madisonstudio.io",
  "madison-studio-cursor.vercel.app",
  "localhost",
  "127.0.0.1",
]);

export function defaultTrustedAppOrigin(frontendUrl?: string | null): string {
  const fromEnv = (frontendUrl ?? "").trim();
  if (fromEnv) {
    const trusted = trustedAppOrigin(fromEnv, frontendUrl);
    if (trusted) return trusted;
  }
  return "https://app.madisonstudio.io";
}

export function trustedAppOrigin(
  requested: unknown,
  frontendUrl?: string | null,
): string | null {
  const candidate = typeof requested === "string" && requested.trim()
    ? requested.trim()
    : (frontendUrl ?? "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    const allowed = new Set(TRUSTED_APP_HOSTS);
    if (frontendUrl) {
      try {
        allowed.add(new URL(frontendUrl).hostname.toLowerCase());
      } catch {
        // ignore a malformed FRONTEND_URL
      }
    }
    const trusted =
      allowed.has(host) ||
      host.endsWith(".madisonstudio.io");
    const protocolOk = parsed.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
    if (!trusted || !protocolOk) return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function generateOAuthNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signOAuthNonce(nonce: string, secret: string): Promise<string> {
  const mac = await hmacSha256Hex(secret, nonce);
  return `${nonce}.${mac}`;
}

export async function parseSignedOAuthState(
  state: string | null | undefined,
  secret: string,
): Promise<{ nonce: string } | null> {
  if (!state || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [nonce, mac] = parts;
  if (!nonce || !mac || !/^[0-9a-f]{32,64}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(mac)) {
    return null;
  }
  const expected = await hmacSha256Hex(secret, nonce);
  if (!timingSafeEqual(mac.toLowerCase(), expected.toLowerCase())) return null;
  return { nonce };
}
