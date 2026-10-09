export interface InvitationRpcError {
  code?: string;
  message?: string;
  status?: number;
}

export interface InvitationRpcResult {
  data: unknown;
  error: InvitationRpcError | null;
}

export type InvitationRpc = (
  fn: "accept_pending_invitations_for_user",
  args?: { _user_id: string; _user_email: string },
) => Promise<InvitationRpcResult>;

export function isMissingInvitationRpc(error: InvitationRpcError | null): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  const blob = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return blob.includes("pgrst202")
    || blob.includes("404")
    || blob.includes("could not find the function")
    || blob.includes("schema cache");
}

/**
 * Production still exposes the two-argument invitation function. The
 * zero-argument rewrite 404s there, and AuthContext calls it on every
 * signed-in page. Try the live signature first so the console stays quiet,
 * then the zero-argument function once that migration is applied.
 */
export async function acceptPendingInvitations(
  rpc: InvitationRpc,
  user: { id: string; email: string },
): Promise<InvitationRpcResult & { via: "legacy-args" | "zero-arg" | "unavailable" }> {
  const legacy = await rpc("accept_pending_invitations_for_user", {
    _user_id: user.id,
    _user_email: user.email,
  });
  if (!legacy.error) return { ...legacy, via: "legacy-args" };
  if (!isMissingInvitationRpc(legacy.error)) return { ...legacy, via: "legacy-args" };

  const current = await rpc("accept_pending_invitations_for_user");
  if (!current.error) return { ...current, via: "zero-arg" };
  return { ...current, via: "unavailable" };
}
