// Usage: npm i --no-save @electric-sql/pglite && node scripts/verify-invite-only-hook.mjs
// Applies the before-user-created hook migration to an in-memory Postgres and
// checks allow/deny for every signup method (the hook sees the same payload).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const mig = fs.readFileSync(new URL("../supabase/migrations/20261010170000_auth_hook_invite_only_signup.sql", import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin;
CREATE TABLE public.team_invitations(id uuid default gen_random_uuid(), email text not null, organization_id uuid, accepted_at timestamptz, expires_at timestamptz not null default now() + interval '7 days');
INSERT INTO team_invitations(email, accepted_at, expires_at) VALUES
 ('Invited@Example.com', null, now() + interval '1 day'),
 ('accepted@example.com', now(), now() + interval '1 day'),
 ('expired@example.com', null, now() - interval '1 minute');`);
await db.exec(mig);
await db.exec(mig); // idempotent
const call = async (email, provider = "email") => {
  await db.exec("SET ROLE supabase_auth_admin");
  const ev = JSON.stringify({ metadata: { name: "before-user-created" }, user: { email, app_metadata: { provider } } });
  const r = await db.query("select public.hook_before_user_created_invite_only($1::jsonb) r", [ev]);
  await db.exec("RESET ROLE");
  return r.rows[0].r;
};
const cases = [
  ["invited@example.com", "email", true], ["INVITED@example.com", "google", true],
  ["accepted@example.com", "email", false], ["expired@example.com", "email", false],
  ["stranger@example.com", "google", false], ["stranger@example.com", "email", false], [null, "phone", false],
];
let ok = true;
for (const [email, provider, allow] of cases) {
  const out = await call(email, provider);
  const allowed = !out.error;
  const pass = allowed === allow && (allowed || out.error.http_code === 403);
  ok &&= pass;
  console.log(pass ? "ok  " : "FAIL", provider.padEnd(6), String(email).padEnd(22), allowed ? "allowed" : "rejected");
}
let denied = false;
try { await db.exec("SET ROLE anon"); await db.query("select public.hook_before_user_created_invite_only('{}'::jsonb)"); } catch { denied = true; } finally { await db.exec("RESET ROLE"); }
console.log(denied ? "ok   anon cannot execute the hook" : "FAIL anon can execute the hook"); ok &&= denied;
await db.exec("UPDATE auth_signup_config SET open_signup = true");
const open = await call("stranger@example.com");
console.log(!open.error ? "ok   open_signup flag allows anyone" : "FAIL open flag"); ok &&= !open.error;
console.log(ok ? "PASS" : "FAIL"); process.exit(ok ? 0 : 1);
