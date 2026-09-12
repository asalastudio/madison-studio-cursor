/**
 * Envelope encryption for stored OAuth tokens.
 *
 * The pre-existing LinkedIn integration stored tokens as `enc:` + base64, which
 * is encoding, not encryption — anything with read access to the row had the
 * token. Social connections use AES-256-GCM under a key held only in the edge
 * runtime (SOCIAL_TOKEN_ENCRYPTION_KEY), so a leaked database dump does not hand
 * over posting rights to every connected account.
 *
 * Ciphertext format:  v1:<base64 iv (12 bytes)>:<base64 ciphertext+tag>
 *
 * decryptToken() still accepts the legacy `enc:` form so existing LinkedIn rows
 * keep working through the migration window; encryptToken() only ever emits v1.
 *
 * Uses WebCrypto only, so this runs unchanged under Deno (edge functions) and
 * Node 20 (`tsx --test`).
 */

const VERSION = "v1";
const IV_BYTES = 12;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Accepts the key as base64 (preferred, 32 raw bytes) or as a 64-character hex
 * string, so an operator pasting either form from `openssl rand` still works.
 */
export async function importEncryptionKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.trim().length === 0) {
    throw new TokenCryptoError(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const trimmed = secret.trim();
  let raw: Uint8Array;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    raw = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      raw[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    try {
      raw = fromBase64(trimmed);
    } catch {
      throw new TokenCryptoError(
        "SOCIAL_TOKEN_ENCRYPTION_KEY must be base64 or hex encoded 32 bytes.",
      );
    }
  }

  if (raw.length !== 32) {
    throw new TokenCryptoError(
      `SOCIAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${raw.length}).`,
    );
  }

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string, key: CryptoKey): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new TokenCryptoError("Refusing to encrypt an empty token.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded),
  );
  return `${VERSION}:${toBase64(iv)}:${toBase64(ciphertext)}`;
}

export function isLegacyCipher(value: string): boolean {
  return typeof value === "string" && value.startsWith("enc:");
}

export function isVersionedCipher(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export async function decryptToken(cipher: string, key: CryptoKey): Promise<string> {
  if (typeof cipher !== "string" || cipher.length === 0) {
    throw new TokenCryptoError("Cannot decrypt an empty value.");
  }

  // Legacy LinkedIn format: base64 only, no confidentiality. Accepted on read so
  // existing connections survive; re-encrypted to v1 on the next token refresh.
  if (isLegacyCipher(cipher)) {
    try {
      return atob(cipher.slice(4));
    } catch {
      throw new TokenCryptoError("Legacy token could not be decoded.");
    }
  }

  if (!isVersionedCipher(cipher)) {
    throw new TokenCryptoError("Unrecognised token ciphertext format.");
  }

  const parts = cipher.split(":");
  if (parts.length !== 3) {
    throw new TokenCryptoError("Malformed token ciphertext.");
  }

  const iv = fromBase64(parts[1]);
  const payload = fromBase64(parts[2]);
  if (iv.length !== IV_BYTES) {
    throw new TokenCryptoError("Malformed token ciphertext: bad IV length.");
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
  } catch {
    throw new TokenCryptoError(
      "Token could not be decrypted. SOCIAL_TOKEN_ENCRYPTION_KEY may have been rotated.",
    );
  }

  return new TextDecoder().decode(plaintext);
}
