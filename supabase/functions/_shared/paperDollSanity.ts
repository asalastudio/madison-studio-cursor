import { BEST_BOTTLES_ORG_ID } from "./orgFeatures.ts";
import { PaperDollActionError } from "./paperDollLifecycle.ts";

function configured(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim().replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return "";
}

export interface SanityMutationResult {
  transactionId: string | null;
  documentId: string;
  revision: string | null;
}

export function assertBestBottlesSanityOrg(organizationId: string): void {
  if (organizationId !== BEST_BOTTLES_ORG_ID) {
    throw new PaperDollActionError(
      403,
      "organization_forbidden",
      "Paper-doll Sanity publish is limited to the Best Bottles organization.",
      [
        {
          field: "organizationId",
          message: "This organization cannot write to the shared Sanity project.",
        },
      ],
    );
  }
}

export async function writeSanityDocument(
  document: Record<string, unknown>,
): Promise<SanityMutationResult> {
  const projectId = configured("SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID");
  const dataset = configured("SANITY_DATASET", "SANITY_STUDIO_DATASET");
  const token = configured("SANITY_API_TOKEN", "SANITY_WRITE_TOKEN");
  if (!projectId || !dataset || !token) {
    throw new PaperDollActionError(
      422,
      "sanity_not_configured",
      "Sanity write credentials are not configured.",
      [
        {
          field: "sanity",
          message:
            "Project ID, dataset, and server-only write token are required.",
        },
      ],
    );
  }
  const response = await fetch(
    `https://${projectId}.api.sanity.io/v2025-02-19/data/mutate/${
      encodeURIComponent(dataset)
    }?returnDocuments=true&visibility=sync`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutations: [{ createOrReplace: document }] }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Sanity mutation failed (${response.status}): ${detail}`);
  }
  const result = await response.json();
  const first = result.results?.[0] ?? result.documents?.[0] ?? {};
  return {
    transactionId: typeof result.transactionId === "string"
      ? result.transactionId
      : null,
    documentId: String(document._id),
    revision: typeof first.document?._rev === "string"
      ? first.document._rev
      : typeof first._rev === "string"
      ? first._rev
      : null,
  };
}
