/**
 * Caller identity for edge functions that run with the service-role key.
 *
 * Gateway JWT verification only proves the caller holds *some* project token,
 * and the anon key that ships in the browser bundle qualifies. So a handler
 * that writes with the service role has to establish who is calling before it
 * trusts an organization id or user id taken from the request body.
 *
 * Three kinds of caller:
 *   - `service`   — the bearer token is the project's service-role key
 *                   (batch scripts, sibling functions). Body ids are trusted.
 *   - `user`      — a real session token, resolved through Supabase Auth.
 *                   The user acts as themselves and only inside organizations
 *                   they belong to (super admins are allowed everywhere).
 *   - `anonymous` — no token, the anon key, or a token Auth rejects.
 *
 * Pure `fetch` against Supabase Auth and PostgREST, no Deno or supabase-js
 * imports, so this module runs under the repo's node `tsx --test` runner.
 */

export type EdgeCaller =
  | { kind: "service" }
  | { kind: "user"; userId: string; email: string | null }
  | { kind: "anonymous"; reason: "missing" | "anon_key" | "invalid" };

export interface EdgeAuthEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export type OrganizationAccess =
  | { ok: true; via: "service" | "member" | "super_admin" }
  | { ok: false; status: 401 | 403; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Strips whitespace and the quotes some dashboards wrap around pasted secrets. */
export function cleanSecret(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

/** Builds the env from a getter so Deno code passes `Deno.env.get` and tests pass a map. */
export function edgeAuthEnv(get: (name: string) => string | undefined): EdgeAuthEnv {
  const supabaseUrl = cleanSecret(get("SUPABASE_URL")).replace(/\/$/, "");
  const anonKey = cleanSecret(get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = cleanSecret(get("SUPABASE_SERVICE_ROLE_KEY")) || cleanSecret(get("SUPABASE_SERVICE_KEY"));
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Edge auth is not configured: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return { supabaseUrl, anonKey, serviceRoleKey };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function resolveCaller(req: Request, env: EdgeAuthEnv): Promise<EdgeCaller> {
  const token = bearerToken(req);
  if (!token) return { kind: "anonymous", reason: "missing" };
  if (token === env.serviceRoleKey) return { kind: "service" };
  if (token === env.anonKey) return { kind: "anonymous", reason: "anon_key" };

  const doFetch = env.fetch ?? fetch;
  const response = await doFetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { kind: "anonymous", reason: "invalid" };
  const user = (await response.json()) as { id?: unknown; email?: unknown };
  if (!isUuid(user.id)) return { kind: "anonymous", reason: "invalid" };
  return { kind: "user", userId: user.id, email: typeof user.email === "string" ? user.email : null };
}

async function restRows<T>(env: EdgeAuthEnv, pathAndQuery: string): Promise<T[]> {
  const doFetch = env.fetch ?? fetch;
  const response = await doFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
  });
  if (!response.ok) {
    throw new Error(`Authorization lookup failed (${response.status}) for ${pathAndQuery.split("?")[0]}.`);
  }
  const rows = (await response.json()) as unknown;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function isOrgMember(env: EdgeAuthEnv, userId: string, organizationId: string): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(organizationId)) return false;
  const rows = await restRows(
    env,
    `organization_members?select=organization_id&user_id=eq.${userId}&organization_id=eq.${organizationId}&limit=1`,
  );
  return rows.length > 0;
}

export async function isSuperAdmin(env: EdgeAuthEnv, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const rows = await restRows(env, `super_admins?select=user_id&user_id=eq.${userId}&limit=1`);
  return rows.length > 0;
}

/** The first organization a user belongs to, for callers that omit one. */
export async function firstMemberOrganization(env: EdgeAuthEnv, userId: string): Promise<string | null> {
  if (!isUuid(userId)) return null;
  const rows = await restRows<{ organization_id?: unknown }>(
    env,
    `organization_members?select=organization_id&user_id=eq.${userId}&limit=1`,
  );
  const first = rows[0]?.organization_id;
  return isUuid(first) ? first : null;
}

/**
 * May this caller act inside `organizationId`? Service callers always may;
 * users must be members or super admins; anonymous callers never may.
 */
export async function authorizeOrganization(
  caller: EdgeCaller,
  env: EdgeAuthEnv,
  organizationId: string | null | undefined,
): Promise<OrganizationAccess> {
  if (caller.kind === "anonymous") {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (caller.kind === "service") return { ok: true, via: "service" };
  if (!isUuid(organizationId)) {
    return { ok: false, status: 403, error: "Organization id is missing or not valid." };
  }
  if (await isOrgMember(env, caller.userId, organizationId)) return { ok: true, via: "member" };
  if (await isSuperAdmin(env, caller.userId)) return { ok: true, via: "super_admin" };
  return { ok: false, status: 403, error: "You are not a member of this organization." };
}

export function accessDeniedResponse(
  access: Extract<OrganizationAccess, { ok: false }> | { status: 401 | 403; error: string },
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: access.error, ...extra }), {
    status: access.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
