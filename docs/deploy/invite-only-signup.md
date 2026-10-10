# Invite-only signup rollout (PR #58)

**Keep "Allow new users to sign up" ON.** Invitees self-serve through
`/auth?mode=signup` (email and password), magic link or Google. Turning signup
off would break that. The server-side gate is a `before-user-created` Auth hook.

## What enforces what
| Layer | What it does |
|---|---|
| Auth hook `public.hook_before_user_created_invite_only` (migration `20261010170000`) | **The real gate.** It runs before *any* user is created: email/password, magic link/OTP, Google OAuth and admin invites. It allows the signup only if the email has a pending (`accepted_at IS NULL`), unexpired `team_invitations` row (case-insensitive), or if `auth_signup_config.open_signup = true`. Otherwise Auth returns 403 "Madison is invite-only..." |
| `/auth` UI | Create Account only shows on `?mode=signup` / `?invite=`. Magic link sends `shouldCreateUser: false` off-invite. The Google button reads "Sign in with Google" plus an invite-only note. |
| `send-team-invitation` | The accept link is `/auth?mode=signup`. |

## Steps (each needs Jordan's approval, summarized through ASALA)
1. **Apply migration** `20261010170000_auth_hook_invite_only_signup.sql`. It adds the hook function and the `auth_signup_config` table, with open_signup set to false. It does nothing until the hook is enabled.
2. **Deploy `send-team-invitation`** so invite emails link to `/auth?mode=signup`.
3. **Merge #58.** The frontend auto-deploys.
4. **Enable the hook.** In the dashboard, go to Authentication → Hooks → *Before User Created* → type Postgres → schema `public`, function `hook_before_user_created_invite_only` → Enable.
5. **Smoke test:**
   - A stranger's email via magic link or email signup is refused.
   - A first-time Google sign-in with an uninvited account is refused.
   - A fresh invite → `/auth?mode=signup` → account created.
   - An existing user can still sign in with any method.

## Open signup (escape hatch)
- Server: `UPDATE public.auth_signup_config SET open_signup = true;`
- UI: set `VITE_OPEN_SIGNUP=true` in Vercel.

## Rollback
- Disable the hook in the dashboard (instant).
- Optionally: `DROP FUNCTION public.hook_before_user_created_invite_only(jsonb); DROP TABLE public.auth_signup_config;`

## Verify locally
`npm i --no-save @electric-sql/pglite && node scripts/verify-invite-only-hook.mjs` covers 7 signup cases, the anon execute denial and the open flag.
