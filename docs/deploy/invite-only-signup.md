# Invite-only signup rollout (PR #58)

Order matters. Do these steps in sequence; each needs Jordan.

1. **Deploy `send-team-invitation` first.** Run the manual workflow
   "Deploy Approved Supabase Edge Functions" (`deploy-optimized.yml`) with
   `send-team-invitation` and the production-approval box checked. Afterwards,
   invitation emails link to `/auth?mode=signup`. If the frontend ships first,
   invitees land on `/auth` with no Create Account tab.
2. **Merge #58.** The frontend auto-deploys to app.madisonstudio.io.
3. **Close open signup server-side.** Hiding the tab does not stop someone
   calling `supabase.auth.signUp()` directly. In the Supabase dashboard
   (project `likkskifwsrvszxdvufw`), go to Authentication → Sign In / Providers:
   - turn off **Allow new users to sign up**, then onboard invitees with
     **Invite user** or the admin API; or
   - if invitees must self-serve with email and password, leave signup on and
     add a `before-user-created` Auth hook that rejects emails with no pending
     `team_invitations` row (follow-up work).
   - Google OAuth: once "Allow new users to sign up" is off, Supabase also
     blocks first-time Google sign-ins, which is the intended effect.
4. **Smoke test.** Signed out, `/auth` shows only Sign In and Magic link.
   `/auth?mode=signup` shows Create Account. A fresh invite email opens on the
   signup tab.

Escape hatch: set `VITE_OPEN_SIGNUP=true` in Vercel to show the tab to everyone.
