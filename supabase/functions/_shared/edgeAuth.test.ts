import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accessDeniedResponse,
  authorizeOrganization,
  bearerToken,
  edgeAuthEnv,
  firstMemberOrganization,
  guardOrganization,
  isOrgMember,
  isSuperAdmin,
  resolveCaller,
  type EdgeAuthEnv,
} from "./edgeAuth";

const USER = "11111111-2222-4333-8444-555555555555";
const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ORG = "99999999-8888-4777-8666-555555555555";

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    for (const [prefix, route] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return route(url, init);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function env(fetchImpl: typeof fetch): EdgeAuthEnv {
  return { supabaseUrl: "https://proj.supabase.co", anonKey: "anon-key", serviceRoleKey: "service-key", fetch: fetchImpl };
}

const request = (authorization?: string) =>
  new Request("https://proj.supabase.co/functions/v1/x", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });

describe("edgeAuth", () => {
  it("reads the env through a getter and strips pasted quotes", () => {
    const e = edgeAuthEnv((name) =>
      ({ SUPABASE_URL: "'https://proj.supabase.co/'", SUPABASE_ANON_KEY: '"anon"', SUPABASE_SERVICE_ROLE_KEY: " svc " })[name]
    );
    assert.deepEqual(e, { supabaseUrl: "https://proj.supabase.co", anonKey: "anon", serviceRoleKey: "svc" });
    assert.throws(() => edgeAuthEnv(() => undefined), /not configured/);
  });

  it("parses bearer tokens case-insensitively and rejects other schemes", () => {
    assert.equal(bearerToken(request("Bearer abc")), "abc");
    assert.equal(bearerToken(request("bearer   abc  ")), "abc");
    assert.equal(bearerToken(request("Basic abc")), null);
    assert.equal(bearerToken(request()), null);
  });

  it("classifies callers: missing, anon key, service key, valid user, rejected token", async () => {
    const calls: string[] = [];
    const e = env(fakeFetch({
      "https://proj.supabase.co/auth/v1/user": (_url, init) => {
        const auth = new Headers(init?.headers).get("Authorization");
        return auth === "Bearer good-jwt" ? json({ id: USER, email: "j@example.com" }) : json({ msg: "invalid" }, 401);
      },
    }, calls));

    assert.deepEqual(await resolveCaller(request(), e), { kind: "anonymous", reason: "missing" });
    assert.deepEqual(await resolveCaller(request("Bearer anon-key"), e), { kind: "anonymous", reason: "anon_key" });
    assert.deepEqual(await resolveCaller(request("Bearer service-key"), e), { kind: "service" });
    assert.equal(calls.length, 0, "no network for local classifications");

    assert.deepEqual(await resolveCaller(request("Bearer good-jwt"), e), { kind: "user", userId: USER, email: "j@example.com" });
    assert.deepEqual(await resolveCaller(request("Bearer forged"), e), { kind: "anonymous", reason: "invalid" });
    assert.equal(calls.length, 2);
  });

  it("treats an Auth reply without a uuid id as anonymous", async () => {
    const e = env(fakeFetch({ "https://proj.supabase.co/auth/v1/user": () => json({ id: "service_role" }) }));
    assert.deepEqual(await resolveCaller(request("Bearer x"), e), { kind: "anonymous", reason: "invalid" });
  });

  it("looks up membership with the service key and refuses non-uuid ids without a request", async () => {
    const calls: string[] = [];
    const e = env(fakeFetch({
      "https://proj.supabase.co/rest/v1/organization_members": (url, init) => {
        assert.equal(new Headers(init?.headers).get("apikey"), "service-key");
        return json(url.includes(`organization_id=eq.${ORG}`) ? [{ organization_id: ORG }] : []);
      },
    }, calls));
    assert.equal(await isOrgMember(e, USER, ORG), true);
    assert.equal(await isOrgMember(e, USER, OTHER_ORG), false);
    assert.equal(await isOrgMember(e, USER, "1 OR 1=1"), false);
    assert.equal(await isOrgMember(e, "not-a-uuid", ORG), false);
    assert.equal(calls.length, 2);
    assert.equal(await firstMemberOrganization(e, USER), null, "empty list for a filtered lookup");
  });

  it("returns the first organization for a user with no org in the body", async () => {
    const e = env(fakeFetch({
      "https://proj.supabase.co/rest/v1/organization_members": () => json([{ organization_id: ORG }]),
    }));
    assert.equal(await firstMemberOrganization(e, USER), ORG);
  });

  it("surfaces PostgREST failures instead of silently denying", async () => {
    const e = env(fakeFetch({ "https://proj.supabase.co/rest/v1/organization_members": () => json({ message: "boom" }, 500) }));
    await assert.rejects(isOrgMember(e, USER, ORG), /Authorization lookup failed \(500\)/);
  });

  it("authorizes service callers, members and super admins; denies everyone else", async () => {
    const e = env(fakeFetch({
      "https://proj.supabase.co/rest/v1/organization_members": (url) => json(url.includes(`organization_id=eq.${ORG}`) ? [{ organization_id: ORG }] : []),
      "https://proj.supabase.co/rest/v1/super_admins": (url) => json(url.includes(`user_id=eq.${USER}`) ? [] : [{ user_id: "x" }]),
    }));
    const user = { kind: "user" as const, userId: USER, email: null };
    const admin = { kind: "user" as const, userId: OTHER_ORG, email: null };

    assert.deepEqual(await authorizeOrganization({ kind: "service" }, e, "anything"), { ok: true, via: "service" });
    assert.deepEqual(await authorizeOrganization(user, e, ORG), { ok: true, via: "member" });
    assert.deepEqual(await authorizeOrganization(user, e, OTHER_ORG), { ok: false, status: 403, error: "You are not a member of this organization." });
    assert.deepEqual(await authorizeOrganization(admin, e, OTHER_ORG), { ok: true, via: "super_admin" });
    assert.deepEqual(await authorizeOrganization(user, e, undefined), { ok: false, status: 403, error: "Organization id is missing or not valid." });
    assert.deepEqual(await authorizeOrganization({ kind: "anonymous", reason: "missing" }, e, ORG), { ok: false, status: 401, error: "Authentication required." });
    assert.equal(await isSuperAdmin(e, "nope"), false);
  });

  it("renders a denial as JSON with CORS headers and the real status", async () => {
    const res = accessDeniedResponse({ status: 403, error: "no" }, { "Access-Control-Allow-Origin": "*" }, { reason: "test" });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(await res.json(), { error: "no", reason: "test" });
  });

  it("guardOrganization returns the caller when access is allowed and a Response when denied", async () => {
    const routes = {
      "https://proj.supabase.co/auth/v1/user": (_url: string, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get("Authorization");
        return auth === "Bearer member-jwt" ? json({ id: USER }) : json({ msg: "no" }, 401);
      },
      "https://proj.supabase.co/rest/v1/organization_members": (url: string) =>
        json(url.includes(`user_id=eq.${USER}`) && url.includes(`organization_id=eq.${ORG}`) ? [{ organization_id: ORG }] : []),
      "https://proj.supabase.co/rest/v1/super_admins": () => json([]),
    };
    const get = (name: string) =>
      ({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" } as Record<string, string>)[name];
    const opts = { get, fetch: fakeFetch(routes) };
    const cors = { "Access-Control-Allow-Origin": "*" };

    const ok = await guardOrganization(request("Bearer member-jwt"), ORG, cors, opts);
    assert.ok("caller" in ok && ok.via === "member");

    const foreign = await guardOrganization(request("Bearer member-jwt"), OTHER_ORG, cors, opts);
    assert.ok("response" in foreign && foreign.response.status === 403);

    const anon = await guardOrganization(request(), ORG, cors, opts);
    assert.ok("response" in anon && anon.response.status === 401);

    const svc = await guardOrganization(request("Bearer service-key"), OTHER_ORG, cors, opts);
    assert.ok("caller" in svc && svc.via === "service");
  });
});
