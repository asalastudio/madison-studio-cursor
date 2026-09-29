/**
 * Basic SSRF guards for edge functions that fetch a caller-supplied URL.
 *
 * Blocks private/loopback/link-local addresses and cloud metadata hosts.
 * This is a hostname check only — it does not re-resolve after redirects.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
]);

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan"];

export function isBlockedSsrfHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host === "[::1]" || host === "::1") return true;

  if (host === "169.254.169.254" || host.startsWith("169.254.")) return true;
  if (/^(10|127)\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^0+\.0+\.0+\.0+$/.test(host)) return true;
  if (host === "0" || host === "0.0.0.0") return true;

  return false;
}

export type PublicFetchProtocol = "https" | "http" | "https-only";

export function isPubliclyFetchableUrl(
  value: string,
  options: { protocol?: PublicFetchProtocol } = {},
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const protocol = options.protocol ?? "https-only";
  if (protocol === "https-only") {
    if (parsed.protocol !== "https:") return false;
  } else if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  return !isBlockedSsrfHostname(parsed.hostname);
}

export function publicFetchRejection(url: string): { error: string } {
  return { error: `URL is not allowed: ${url}` };
}
