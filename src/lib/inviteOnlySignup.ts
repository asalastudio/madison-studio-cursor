/**
 * Madison is invite-only. The Create Account tab, and account creation through
 * magic link, only apply on invite links (/auth?mode=signup or ?invite=...) or
 * when VITE_OPEN_SIGNUP=true. This is UX only: the real gate is the
 * `before-user-created` Auth hook (public.hook_before_user_created_invite_only).
 */
export function isSignupAllowed(search: string, openSignupFlag: string | undefined): boolean {
  if (openSignupFlag === "true") return true;
  const params = new URLSearchParams(search);
  return params.get("mode") === "signup" || params.has("invite");
}
