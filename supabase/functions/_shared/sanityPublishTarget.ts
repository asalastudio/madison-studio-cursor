/**
 * Decide which Sanity project and document lane a Madison publish uses.
 *
 * Best Bottles journal publishing (PR #30) introduced org-scoped
 * `sanity_connections` rows, but `push-to-sanity` only consulted them when
 * `schema_profile === "best-bottles"`. Every other org — including Tarife
 * Attar — fell through to the shared `SANITY_PROJECT_ID` /
 * `SANITY_WRITE_TOKEN` secrets. After those secrets were pointed at Best
 * Bottles, a Tarife publish either wrote to the wrong project or Sanity
 * rejected it with "Unauthorized – Session does not match project host".
 *
 * Rules:
 *   - An active org connection always supplies project / dataset / token.
 *   - The Best Bottles *journal* document builder is only used for the
 *     Best Bottles org *and* a `best-bottles` schema profile.
 *   - Everyone else stays on the legacy Tarife-shaped `journalEntry` path,
 *     against that org's own project (or the Tarife default).
 */
import { cleanSecret } from "./edgeAuth.ts";
import { isBestBottlesOrgId } from "./orgFeatures.ts";

/** Tarife Attar's Sanity project. Used when an org has no connection row. */
export const TARIFE_SANITY_PROJECT_ID = "8h5l91ut";

export const BEST_BOTTLES_SCHEMA_PROFILE = "best-bottles";

export type SanityPublishLane = "journal" | "legacy";

export type OrgSanityConnection = {
  project_id: string;
  dataset: string;
  api_version: string | null;
  write_token_secret_name: string;
  schema_profile: string | null;
};

export type SanityPublishCredentials = {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string;
  source: "connection" | "env";
  tokenSecretName: string;
};

export type SanityPublishTarget =
  | { ok: true; lane: SanityPublishLane; credentials: SanityPublishCredentials }
  | { ok: false; error: string };

export type EnvGetter = (name: string) => string | undefined;

export function isBestBottlesJournalLane(
  organizationId: string | null | undefined,
  schemaProfile: string | null | undefined,
): boolean {
  return isBestBottlesOrgId(organizationId) && schemaProfile === BEST_BOTTLES_SCHEMA_PROFILE;
}

/** Shared-secret names the Tarife setup docs and the product push already accept. */
export function resolveEnvSanityToken(get: EnvGetter): { token: string; secretName: string } | null {
  const write = cleanSecret(get("SANITY_WRITE_TOKEN"));
  if (write) return { token: write, secretName: "SANITY_WRITE_TOKEN" };
  const api = cleanSecret(get("SANITY_API_TOKEN"));
  if (api) return { token: api, secretName: "SANITY_API_TOKEN" };
  return null;
}

function resolveConnectionToken(
  connection: OrgSanityConnection,
  get: EnvGetter,
): { token: string; secretName: string } | null {
  const named = cleanSecret(get(connection.write_token_secret_name));
  if (named) return { token: named, secretName: connection.write_token_secret_name };
  // Only the two canonical secret names are interchangeable. Do not grab
  // an unrelated org's token just because a differently named secret exists.
  const aliases = ["SANITY_WRITE_TOKEN", "SANITY_API_TOKEN"] as const;
  if ((aliases as readonly string[]).includes(connection.write_token_secret_name)) {
    return resolveEnvSanityToken(get);
  }
  return null;
}

/**
 * Legacy (non-Best-Bottles) env fallback.
 *
 * Do **not** use `SANITY_PROJECT_ID` here: that secret is now the Best
 * Bottles project on the shared Madison deployment. Tarife keeps its
 * original project id unless the org has its own connection row.
 */
export function resolveLegacyEnvCredentials(get: EnvGetter): SanityPublishCredentials | { error: string } {
  const token = resolveEnvSanityToken(get);
  if (!token) {
    return {
      error:
        "Missing Sanity write token. Set SANITY_API_TOKEN (Tarife Attar) or add a sanity_connections row for this organization.",
    };
  }
  const dataset = cleanSecret(get("SANITY_DATASET")) || "production";
  const apiVersion = cleanSecret(get("SANITY_API_VERSION")) || "2024-01-01";
  return {
    projectId: TARIFE_SANITY_PROJECT_ID,
    dataset,
    apiVersion,
    token: token.token,
    source: "env",
    tokenSecretName: token.secretName,
  };
}

export function resolveSanityPublishTarget(params: {
  organizationId?: string | null;
  connection: OrgSanityConnection | null;
  get: EnvGetter;
}): SanityPublishTarget {
  const { organizationId, connection, get } = params;
  const journalLane = isBestBottlesJournalLane(organizationId, connection?.schema_profile);

  if (connection) {
    const token = resolveConnectionToken(connection, get);
    if (!token) {
      return {
        ok: false,
        error:
          `Sanity write token secret "${connection.write_token_secret_name}" is not configured.`,
      };
    }
    return {
      ok: true,
      lane: journalLane ? "journal" : "legacy",
      credentials: {
        projectId: connection.project_id,
        dataset: connection.dataset || "production",
        apiVersion: connection.api_version || (journalLane ? "2024-10-01" : "2024-01-01"),
        token: token.token,
        source: "connection",
        tokenSecretName: token.secretName,
      },
    };
  }

  if (journalLane) {
    return {
      ok: false,
      error: "Best Bottles journal publishing requires an active sanity_connections row.",
    };
  }

  const env = resolveLegacyEnvCredentials(get);
  if ("error" in env) return { ok: false, error: env.error };
  return { ok: true, lane: "legacy", credentials: env };
}

/** Rewrite the Sanity host-mismatch that Tarife hits when the shared token is Best Bottles. */
export function describeSanityWriteError(error: unknown, projectId: string): string {
  const message = error instanceof Error && error.message ? error.message : String(error ?? "");
  if (/session does not match project host|unauthorized|401/i.test(message)) {
    return (
      `Sanity rejected the write to project ${projectId} — the configured token belongs to a different project. ` +
      `Tarife Attar is ${TARIFE_SANITY_PROJECT_ID}. Set SANITY_API_TOKEN to the Tarife write token, ` +
      `or add a sanity_connections row for this organization.`
    );
  }
  return message.trim() || "Failed to push content to Sanity";
}
