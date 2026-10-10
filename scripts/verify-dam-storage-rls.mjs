import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
// Usage: npm i --no-save @electric-sql/pglite && node scripts/verify-dam-storage-rls.mjs
// Reproduces audit V17 on an in-memory Postgres with the original 2025 policies,
// applies the fix migration twice (idempotency) and asserts tenant isolation.
const R=new URL("../supabase/migrations/", import.meta.url).pathname;
const db = new PGlite();
const A='00000000-0000-0000-0000-00000000000a',B='00000000-0000-0000-0000-00000000000b',U='00000000-0000-0000-0000-0000000000a1';
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid primary key, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.claims',true)::json->>'sub','')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ select coalesce(current_setting('request.jwt.claims',true)::json->>'role','anon') $$;
CREATE TABLE public.organizations(id uuid primary key, name text);
CREATE TABLE public.organization_members(organization_id uuid, user_id uuid, role text);
CREATE TABLE storage.buckets(id text primary key, name text, public bool);
CREATE TABLE storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage, auth, public TO anon, authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
`);
const fnd=fs.readFileSync(R+"20251219211155_dam_foundation.sql","utf8");
const m=fnd.match(/CREATE OR REPLACE FUNCTION public\.get_user_organization_ids\(\)[\s\S]*?STABLE;/)[0];
await db.exec(m);
const old=fs.readFileSync(R+"20251219211156_dam_storage_buckets.sql","utf8");
await db.exec(old.slice(old.indexOf("CREATE OR REPLACE FUNCTION storage.user_has_org_access")));
await db.exec(`INSERT INTO auth.users VALUES ('${U}','a@x');
INSERT INTO organizations VALUES ('${A}','A'),('${B}','B');
INSERT INTO organization_members VALUES ('${A}','${U}','owner');
INSERT INTO storage.objects(bucket_id,name) VALUES ('dam-assets','${A}/a.png'),('dam-assets','${B}/b.png'),('dam-thumbnails','${B}/b.webp'),('dam-thumbnails','${A}/a.webp');`);
async function q(role,claims,sql){await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims','${claims}',false); SET ROLE ${role};`);const r=await db.query(sql);await db.exec("RESET ROLE");return r.rows;}
const cnt="select bucket_id||':'||split_part(name,'/',1) k from storage.objects where bucket_id in ('dam-assets','dam-thumbnails') order by 1";
const member=`{"sub":"${U}","role":"authenticated"}`, other='{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}';
const show=async(t)=>console.log(t, JSON.stringify({anon:(await q('anon','{}',cnt)).map(r=>r.k),member:(await q('authenticated',member,cnt)).map(r=>r.k),nonmember:(await q('authenticated',other,cnt)).map(r=>r.k)}));
await show("BEFORE");
const mig=fs.readFileSync(R+"20261010050000_dam_storage_org_scoped_select.sql","utf8");
await db.exec(mig); await db.exec(mig); // idempotent
await show("AFTER ");
const ok=JSON.stringify((await q('anon','{}',cnt)))==='[]' && (await q('authenticated',member,cnt)).every(r=>r.k.endsWith(A)) && (await q('authenticated',member,cnt)).length===2 && (await q('authenticated',other,cnt)).length===0;
console.log(ok?"PASS":"FAIL"); process.exit(ok?0:1);
