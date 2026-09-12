# Social publishing — architecture and setup runbook

Madison publishes and schedules content to **Instagram, LinkedIn, Pinterest,
Facebook Pages and TikTok** from one composer. This document covers what is
built, what is already deployed, and the exact steps left on the platform side.

Written 2026-09-11. Project: `likkskifwsrvszxdvufw` (Madison Studio App).

---

## 1. Status

| Piece | State |
|---|---|
| Database schema (4 tables, RLS, claim function, safe view) | **Applied to production** |
| Edge functions (5) | **Deployed** |
| `pg_cron` + `pg_net` scheduler, every minute | **Live and verified** (`{"claimed":0}` at 200) |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | **Set** |
| Scheduler ↔ cron shared secret | **Generated inside Postgres**, stored in Vault |
| LinkedIn app credentials | **Already present** (reused from the old integration) |
| Meta / Pinterest / TikTok app credentials | **Not set — see §4** |

The composer and the connection UI are live in the app: Settings → Integrations
→ *Social publishing*, and Calendar → *Post to social*.

---

## 2. How it works

```
Composer (React)                 social-publish            platform API
  builds targets  ──────────────▶  validate  ──▶ insert ──▶ executePublish ──▶ Instagram/…
                                                   │
Calendar "schedule"                                ▼
                                          social_posts (status=scheduled)
                                                   │
pg_cron (every minute)                             │
  └─▶ invoke_social_edge_function ──▶ social-scheduler
            (Vault secret)                │
                                 claim_due_social_posts()   ← FOR UPDATE SKIP LOCKED
                                          │
                                   executePublish ──▶ platform API
                                          │
                              social_publish_attempts (ledger)
```

**One post row per platform target.** A single composer submission fans out to N
rows sharing a `group_id`, so Instagram failing does not hold up LinkedIn.

**One code path publishes.** `_shared/social/publishRunner.ts#executePublish` is
used by both "publish now" and the scheduler, so retry semantics, re-auth
flagging and the attempt ledger cannot drift between them.

**Leases, not locks.** `claim_due_social_posts()` flips due rows to `publishing`
with a 5-minute lease under `FOR UPDATE SKIP LOCKED`. Overlapping ticks can never
claim the same row, so a slow Instagram video upload cannot double-post. A row
whose lease expires (function died mid-flight) is re-claimed on a later tick.

**Failures are classified, not just recorded.** `retry.ts` splits them three ways:

| Class | Example | Behaviour |
|---|---|---|
| retryable | 429, 5xx, timeout | exponential backoff (60s → 1h, +20% jitter), up to `max_attempts` (5) |
| permanent | caption too long, bad aspect ratio | fails immediately — retrying cannot help |
| re-auth | token expired/revoked | fails **and** marks the connection `needs_reauth`, which surfaces in Settings |

**Validation runs three times** against the same rules (`platformRules.ts`): live
in the composer, in `social-publish` before any row is written, and again at
publish time — because media can be deleted between scheduling and posting.

### Files

| Path | Purpose |
|---|---|
| `supabase/functions/_shared/social/platformRules.ts` | Canonical per-platform limits |
| `supabase/functions/_shared/social/validation.ts` | Pre-flight checks |
| `supabase/functions/_shared/social/retry.ts` | Failure classification + backoff |
| `supabase/functions/_shared/social/tokenCrypto.ts` | AES-256-GCM token encryption |
| `supabase/functions/_shared/social/oauthConfig.ts` | Per-platform OAuth endpoints/scopes |
| `supabase/functions/_shared/social/publishRunner.ts` | The single publish decision tree |
| `supabase/functions/_shared/social/drivers/*` | Meta, LinkedIn, Pinterest, TikTok |
| `src/config/socialPlatforms.ts` | UI mirror of the rules (drift-tested) |
| `src/lib/social/composerPlan.ts` | Media fan-out + per-channel overrides |
| `src/components/social/*` | Composer, publish button, queue panel |
| `src/components/settings/SocialConnections.tsx` | Connect / disconnect |

`npm run test:social` — 84 tests over the rules, crypto, backoff, OAuth URL
construction, the publish decision tree, and the Meta driver's container flow.

### Token storage

The old LinkedIn integration stored tokens as `enc:` + base64, which is encoding,
not encryption. Social connections use **AES-256-GCM** under
`SOCIAL_TOKEN_ENCRYPTION_KEY`, which lives only in the edge runtime. A leaked
database dump therefore does not hand over posting rights. `decryptToken()` still
reads the legacy `enc:` form so existing LinkedIn rows keep working.

The client never sees ciphertext: the UI reads `social_connection_summaries`, a
view that omits the token columns entirely.

---

## 3. One callback URL for every platform

```
https://likkskifwsrvszxdvufw.supabase.co/functions/v1/social-oauth-callback
```

Register that exact URL on every platform app below. The platform is recovered
from the stored OAuth state row, so one redirect URI serves all five.

---

## 4. What you need to do per platform

### Instagram + Facebook Page — one Meta app covers both

The single biggest lift, and the one with a real review queue. Budget a few weeks.

1. **Preconditions on the accounts themselves:**
   - The Instagram account must be a **Business or Creator** account.
   - It must be **linked to a Facebook Page** you administer.
   - The Page should sit in a **Meta Business portfolio**.
2. Create an app at <https://developers.facebook.com/apps> → type **Business**.
3. Add the **Facebook Login** product. Under its settings add the callback URL
   from §3 to *Valid OAuth Redirect URIs*.
4. Complete **Business Verification** (Meta Business Suite → Security Centre).
   This requires company documents and is the slow step.
5. Request **App Review** for these permissions:
   - `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
   - `business_management`
   Meta requires a screencast of the flow. Record: connecting the account in
   Madison → composing a post → it appearing on Instagram.
6. Set the secrets:
   ```bash
   npx supabase secrets set --project-ref likkskifwsrvszxdvufw \
     META_APP_ID=... META_APP_SECRET=...
   ```

While the app is in Development mode you can already publish to accounts whose
users have a role on the app (add yourself under App Roles → Testers). That is
the fastest way to prove the pipeline before review completes.

**Limits that matter:** 50 published posts per IG account per rolling 24 hours.
Captions are 2200 characters and links in them are not clickable. Carousels take
up to 10 items. Images must be between 0.8 and 1.91 aspect ratio — Madison blocks
out-of-range media before it reaches Meta.

### LinkedIn — already configured

`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` are already set from the previous
integration, and `social-oauth-start` returns a valid authorize URL today. Two
things to finish:

1. Add the §3 callback URL to the app's *Authorized redirect URLs* at
   <https://www.linkedin.com/developers/apps> (the old integration registered
   `linkedin-oauth-callback`; the new one is a different path).
2. Personal-profile posting works with the products you already have. **Company
   page** posting additionally needs the **Community Management API** product,
   which is a request form, not an instant grant. Until then, connecting will
   still succeed — the company page simply will not appear in the account list.

### Pinterest — the easiest win, and the best fit for a catalogue

1. Create an app at <https://developers.pinterest.com/apps>.
2. Add the §3 callback URL as a redirect URI.
3. Request **Standard access** (the form is short; pin creation does not need the
   heavier review tiers).
4. The account must be a **Pinterest Business account** (free conversion).
5. Set the secrets:
   ```bash
   npx supabase secrets set --project-ref likkskifwsrvszxdvufw \
     PINTEREST_APP_ID=... PINTEREST_APP_SECRET=...
   ```

Boards are captured at connect time and cached on the connection, so the composer
offers a board picker without an API round trip. If you add a board later,
reconnect Pinterest to refresh the list.

### TikTok — read this before promising anything

1. Create an app at <https://developers.tiktok.com/apps>, add **Login Kit** and
   **Content Posting API**.
2. Add the §3 callback URL as a redirect URI.
3. **Verify the domain that hosts your media** (app settings → URL properties).
   Madison uses `PULL_FROM_URL`, so TikTok downloads the video itself and will
   refuse an unverified host.
4. Apply for the **content posting audit**.
5. Set the secrets:
   ```bash
   npx supabase secrets set --project-ref likkskifwsrvszxdvufw \
     TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=...
   ```

**Until that audit passes, every post is forced to `SELF_ONLY`** — visible only
to the posting account. The driver queries TikTok's `creator_info` endpoint
before posting and refuses a public post the account cannot actually make, rather
than silently publishing something nobody can see. TikTok is video-only here.

---

## 5. Media must be on a public HTTPS URL

Instagram, Pinterest and TikTok **download the media themselves**. Anything on
`localhost`, a private IP, a signed URL that expires quickly, or a Supabase
private bucket will fail. Madison validates this up front
(`isPubliclyFetchableUrl`) rather than letting the platform reject it.

The `generated-images` bucket is public, so Dark Room renders and paper-doll
exports work directly.

---

## 6. Operating it

**Watch the queue:** Calendar → *Social queue* shows upcoming, failed and
published posts, with retry and cancel.

**Check the scheduler is ticking:**
```sql
SELECT created, status_code, left(content, 120)
FROM net._http_response ORDER BY created DESC LIMIT 5;
```
A healthy idle tick is `200 {"claimed":0,...}`.

**Inspect why something failed:**
```sql
SELECT p.platform, p.status, p.error_code, p.error_message, a.attempt_number, a.outcome
FROM social_posts p
LEFT JOIN social_publish_attempts a ON a.post_id = p.id
WHERE p.status = 'failed'
ORDER BY p.updated_at DESC;
```

**Edge function logs:** Supabase dashboard → Edge Functions → `social-scheduler`
/ `social-publish` → Logs.

**Drain the queue manually** (service role key as bearer):
```bash
curl -X POST https://likkskifwsrvszxdvufw.supabase.co/functions/v1/social-scheduler \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"limit":10}'
```

**Cron jobs installed:**

| Job | Schedule |
|---|---|
| `social-scheduler-tick` | every minute |
| `social-token-refresh` | daily 04:00 UTC |
| `social-oauth-state-cleanup` | hourly |

Re-install them any time with `SELECT public.install_social_scheduler_cron();`.

### The scheduler's shared secret

`pg_cron` authenticates to `social-scheduler` with a secret **generated inside
Postgres** (`ensure_social_scheduler_secret()`) and held in Supabase Vault. The
edge function verifies a presented secret by calling
`verify_social_scheduler_secret()` rather than holding a copy. The plaintext
therefore never leaves the database — no operator, and no agent, ever handles it.
The service role key still works as a bearer token for manual drains.

---

## 7. Known limits of this build

- **Threads** is modelled but has no driver; it shows as "Coming soon".
- **Stories** are not implemented (feed, carousel, Reels and Pins are).
- **Analytics** are not pulled back — Madison records what it published and the
  permalink, not likes or reach.
- **Meta page tokens do not auto-refresh.** They are long-lived and effectively
  permanent, and the daily job probes them and flags `needs_reauth` when Meta
  stops accepting one. Pinterest, TikTok and LinkedIn refresh properly.
- **The old `linkedin_connections` tables are untouched.** The legacy
  LinkedInConnection card still works; the new system is additive. Retire the old
  path once the new one has been used in anger.
