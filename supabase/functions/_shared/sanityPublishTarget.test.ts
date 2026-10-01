import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BEST_BOTTLES_ORG_ID } from "./orgFeatures.ts";
import {
  BEST_BOTTLES_SCHEMA_PROFILE,
  describeSanityWriteError,
  isBestBottlesJournalLane,
  resolveSanityPublishTarget,
  TARIFE_SANITY_PROJECT_ID,
  type OrgSanityConnection,
} from "./sanityPublishTarget.ts";

const TARIFE_ORG = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const tarifeConnection = (overrides: Partial<OrgSanityConnection> = {}): OrgSanityConnection => ({
  project_id: TARIFE_SANITY_PROJECT_ID,
  dataset: "production",
  api_version: "2024-01-01",
  write_token_secret_name: "SANITY_API_TOKEN",
  schema_profile: "generic",
  ...overrides,
});

const bestBottlesConnection = (overrides: Partial<OrgSanityConnection> = {}): OrgSanityConnection => ({
  project_id: "gh97irjh",
  dataset: "production",
  api_version: "2024-10-01",
  write_token_secret_name: "SANITY_WRITE_TOKEN",
  schema_profile: BEST_BOTTLES_SCHEMA_PROFILE,
  ...overrides,
});

describe("isBestBottlesJournalLane", () => {
  it("requires both the Best Bottles org and the best-bottles profile", () => {
    assert.equal(isBestBottlesJournalLane(BEST_BOTTLES_ORG_ID, "best-bottles"), true);
    assert.equal(isBestBottlesJournalLane(BEST_BOTTLES_ORG_ID, "generic"), false);
    assert.equal(isBestBottlesJournalLane(TARIFE_ORG, "best-bottles"), false);
    assert.equal(isBestBottlesJournalLane(undefined, "best-bottles"), false);
  });
});

describe("resolveSanityPublishTarget", () => {
  it("keeps Tarife on the legacy lane even if schema_profile was copied from Best Bottles", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: tarifeConnection({ schema_profile: "best-bottles" }),
      get: (name) => (name === "SANITY_API_TOKEN" ? "tarife-token" : undefined),
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.lane, "legacy");
    assert.equal(target.credentials.projectId, TARIFE_SANITY_PROJECT_ID);
    assert.equal(target.credentials.token, "tarife-token");
    assert.equal(target.credentials.source, "connection");
  });

  it("uses the org connection for Tarife instead of a Best Bottles SANITY_PROJECT_ID", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: tarifeConnection(),
      get: (name) => {
        if (name === "SANITY_PROJECT_ID") return "gh97irjh";
        if (name === "SANITY_WRITE_TOKEN") return "best-bottles-token";
        if (name === "SANITY_API_TOKEN") return "tarife-token";
        return undefined;
      },
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.lane, "legacy");
    assert.equal(target.credentials.projectId, TARIFE_SANITY_PROJECT_ID);
    assert.equal(target.credentials.token, "tarife-token");
  });

  it("does not follow a overwritten SANITY_PROJECT_ID when Tarife has no connection row", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: null,
      get: (name) => {
        if (name === "SANITY_PROJECT_ID") return "gh97irjh";
        if (name === "SANITY_WRITE_TOKEN") return "shared-token";
        return undefined;
      },
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.lane, "legacy");
    assert.equal(target.credentials.projectId, TARIFE_SANITY_PROJECT_ID);
    assert.equal(target.credentials.source, "env");
    assert.equal(target.credentials.token, "shared-token");
  });

  it("accepts SANITY_API_TOKEN when SANITY_WRITE_TOKEN is missing (Tarife setup docs)", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: null,
      get: (name) => (name === "SANITY_API_TOKEN" ? "api-token" : undefined),
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.credentials.token, "api-token");
    assert.equal(target.credentials.tokenSecretName, "SANITY_API_TOKEN");
  });

  it("takes the journal lane only for the Best Bottles org + profile", () => {
    const target = resolveSanityPublishTarget({
      organizationId: BEST_BOTTLES_ORG_ID,
      connection: bestBottlesConnection(),
      get: (name) => (name === "SANITY_WRITE_TOKEN" ? "bb-token" : undefined),
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.lane, "journal");
    assert.equal(target.credentials.projectId, "gh97irjh");
    assert.equal(target.credentials.token, "bb-token");
  });

  it("allows SANITY_WRITE_TOKEN when the connection names SANITY_API_TOKEN", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: tarifeConnection({ write_token_secret_name: "SANITY_API_TOKEN" }),
      get: (name) => (name === "SANITY_WRITE_TOKEN" ? "shared-tarife-token" : undefined),
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;
    assert.equal(target.credentials.token, "shared-tarife-token");
  });

  it("errors clearly when no token is configured", () => {
    const target = resolveSanityPublishTarget({
      organizationId: TARIFE_ORG,
      connection: null,
      get: () => undefined,
    });
    assert.equal(target.ok, false);
    if (target.ok) return;
    assert.match(target.error, /SANITY_API_TOKEN/);
  });
});

describe("describeSanityWriteError", () => {
  it("rewrites the host-mismatch Sanity returns when the token is for another project", () => {
    const message = describeSanityWriteError(
      new Error("Unauthorized - Session does not match project host"),
      TARIFE_SANITY_PROJECT_ID,
    );
    assert.match(message, /8h5l91ut/);
    assert.match(message, /SANITY_API_TOKEN/);
  });

  it("passes through unrelated Sanity errors", () => {
    assert.equal(
      describeSanityWriteError(new Error("Unknown type: journalEntry"), TARIFE_SANITY_PROJECT_ID),
      "Unknown type: journalEntry",
    );
  });
});
