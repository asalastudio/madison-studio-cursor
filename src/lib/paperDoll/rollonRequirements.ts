import { z } from "zod";

import snapshotJson from "../../../docs/paper-doll-rig/cyl9-rollon-requirements.json";

export const CYL9_BODY_VARIANT_KEYS = ["CLR", "AMB", "BLU", "FRS", "SWL"] as const;
export const CYL9_OVERCAP_VARIANT_KEYS = [
  "SHN-SL",
  "SHN-GL",
  "MAT-CU",
  "SHN-BLK",
  "MAT-SL",
  "MAT-GL",
  "WHT",
  "SL-DOT",
  "BLK-DOT",
  "PNK-DOT",
] as const;
export const CYL9_ROLLER_VARIANT_KEYS = ["PLASTIC", "METAL"] as const;

const BodyVariantKeySchema = z.enum(CYL9_BODY_VARIANT_KEYS);
const OvercapVariantKeySchema = z.enum(CYL9_OVERCAP_VARIANT_KEYS);
const RollerVariantKeySchema = z.enum(CYL9_ROLLER_VARIANT_KEYS);

const RequirementSchema = z.object({
  requirementKey: z.string().regex(/^CYL-9ML:(BODY|OVERCAP|ROLLER):/),
  componentKind: z.enum(["body", "overcap", "roller"]),
  variantKey: z.string().min(1),
  displayName: z.string().min(1),
  geometryFamilyId: z.string().min(1),
  materialFamily: z.string().min(1),
  releaseStatus: z.enum(["approved", "pending", "blocked"]),
  blockers: z.array(z.string().min(1)),
  stoneLayoutRequired: z.boolean(),
});

const AssemblyMappingSchema = z.object({
  mappingKey: z.string().regex(/^CYL-9ML:/),
  websiteSku: z.string().min(1),
  graceSku: z.string().min(1),
  bodyVariantKey: BodyVariantKeySchema,
  bodyRequirementKey: z.string().regex(/^CYL-9ML:BODY:/),
  rollerVariantKey: RollerVariantKeySchema,
  rollerRequirementKey: z.string().regex(/^CYL-9ML:ROLLER:/),
  overcapVariantKey: OvercapVariantKeySchema,
  overcapRequirementKey: z.string().regex(/^CYL-9ML:OVERCAP:/),
  identitySource: z.literal("websiteSku-exact-token-map"),
  sourceDimensionsMm: z.object({
    heightWithoutCap: z.number().positive(),
    diameter: z.number().positive(),
  }),
  sourceGeometryProfile: z.string().min(1),
  evidenceStatus: z.enum(["consistent", "dimension-conflict"]),
  evidenceIssues: z.array(z.string().min(1)),
});

export const Cyl9RollonRequirementSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  familyKey: z.literal("CYL-9ML"),
  sourceGeneratedAt: z.string().datetime(),
  sourcePath: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  identityPolicy: z.literal("websiteSku-exact-token-map"),
  bodyVariantKeys: z.tuple([
    z.literal("CLR"), z.literal("AMB"), z.literal("BLU"),
    z.literal("FRS"), z.literal("SWL"),
  ]),
  overcapVariantKeys: z.tuple([
    z.literal("SHN-SL"), z.literal("SHN-GL"), z.literal("MAT-CU"),
    z.literal("SHN-BLK"), z.literal("MAT-SL"), z.literal("MAT-GL"),
    z.literal("WHT"), z.literal("SL-DOT"), z.literal("BLK-DOT"),
    z.literal("PNK-DOT"),
  ]),
  rollerVariantKeys: z.tuple([z.literal("PLASTIC"), z.literal("METAL")]),
  requirements: z.array(RequirementSchema),
  assemblyMappings: z.array(AssemblyMappingSchema),
  evidenceSummary: z.object({
    sourceRowCount: z.number().int().positive(),
    eligibleAssemblyCount: z.number().int().nonnegative(),
    dimensionConflictCount: z.number().int().nonnegative(),
    unresolvedIdentityCount: z.number().int().nonnegative(),
  }),
  knownIssues: z.array(z.object({
    issueKey: z.string().min(1),
    severity: z.enum(["advisory", "blocking"]),
    summary: z.string().min(1),
    affectedWebsiteSkus: z.array(z.string().min(1)),
  })),
});

export type Cyl9RollonRequirementSnapshot = z.infer<typeof Cyl9RollonRequirementSnapshotSchema>;
export type RollonComponentRequirement = z.infer<typeof RequirementSchema>;
export type RollonAssemblyRequirement = z.infer<typeof AssemblyMappingSchema>;

export interface CatalogRollonProduct {
  websiteSku: string | null;
  graceSku: string | null;
  family: string | null;
  capacityMl: number | null;
  heightWithoutCap: string | null;
  diameter: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
}

interface CatalogSnapshotInput {
  products: CatalogRollonProduct[];
}

const BODY_TOKENS = [
  { token: "GBCylAmb9", key: "AMB", sourceGeometryProfile: "70x20" },
  { token: "GBCylBlu9", key: "BLU", sourceGeometryProfile: "70x20" },
  { token: "GBCylFrst9", key: "FRS", sourceGeometryProfile: "74x21" },
  { token: "GBCylSwrl9", key: "SWL", sourceGeometryProfile: "74x21" },
  { token: "GBCyl9", key: "CLR", sourceGeometryProfile: "70x20" },
] as const;

const OVERCAP_TOKENS = [
  { token: "ShnSl", key: "SHN-SL" },
  { token: "ShnGl", key: "SHN-GL" },
  { token: "MattCu", key: "MAT-CU" },
  { token: "ShBlk", key: "SHN-BLK" },
  { token: "MattSl", key: "MAT-SL" },
  { token: "MattGl", key: "MAT-GL" },
  { token: "Wht", key: "WHT" },
  { token: "SlDot", key: "SL-DOT" },
  { token: "BlkDot", key: "BLK-DOT" },
  { token: "PnkDot", key: "PNK-DOT" },
] as const;

const BODY_REQUIREMENTS: RollonComponentRequirement[] = [
  ["CLR", "Clear glass"], ["AMB", "Amber glass"], ["BLU", "Cobalt glass"],
  ["FRS", "Frosted glass"], ["SWL", "Swirl glass"],
].map(([variantKey, displayName]) => ({
  requirementKey: `CYL-9ML:BODY:${variantKey}`,
  componentKind: "body" as const,
  variantKey,
  displayName: `CYL-9ML ${displayName} locked body plate`,
  geometryFamilyId: "body__cylinder__9ml__70x20__v1",
  materialFamily: `${variantKey.toLowerCase()}-glass`,
  releaseStatus: "approved" as const,
  blockers: [],
  stoneLayoutRequired: false,
}));

const OVERCAP_REQUIREMENT_DETAILS = [
  ["SHN-SL", "Mirror silver", "vacuum-metallized-mirror"],
  ["SHN-GL", "Mirror gold", "vacuum-metallized-mirror"],
  ["MAT-CU", "Matte copper", "matte-coating"],
  ["SHN-BLK", "Glossy black", "gloss-coating"],
  ["MAT-SL", "Matte silver", "matte-coating"],
  ["MAT-GL", "Matte gold", "matte-coating"],
  ["WHT", "Glossy white", "gloss-coating"],
  ["SL-DOT", "Silver rhinestone", "deterministic-rhinestone-layout"],
  ["BLK-DOT", "Black rhinestone", "deterministic-rhinestone-layout"],
  ["PNK-DOT", "Pink rhinestone", "deterministic-rhinestone-layout"],
] as const;

const OVERCAP_REQUIREMENTS: RollonComponentRequirement[] = OVERCAP_REQUIREMENT_DETAILS.map(
  ([variantKey, displayName, finishFamily]) => ({
    requirementKey: `CYL-9ML:OVERCAP:${variantKey}`,
    componentKind: "overcap",
    variantKey,
    displayName: `${displayName} phenolic roll-on overcap`,
    geometryFamilyId: "closure__cylinder__17-415__rollon-overcap__v1",
    materialFamily: `moulded-phenolic-plastic:${finishFamily}`,
    releaseStatus: "pending",
    blockers: ["No mask-and-clamp verified production asset is approved yet."],
    stoneLayoutRequired: variantKey.endsWith("-DOT"),
  }),
);

const ROLLER_REQUIREMENTS: RollonComponentRequirement[] = [
  {
    requirementKey: "CYL-9ML:ROLLER:PLASTIC",
    componentKind: "roller",
    variantKey: "PLASTIC",
    displayName: "Plastic roller-ball fitment",
    geometryFamilyId: "fitment__17-415__roller-ball__v1",
    materialFamily: "moulded-plastic",
    releaseStatus: "pending",
    blockers: ["Assembly-context QA has not passed in the candidate loop."],
    stoneLayoutRequired: false,
  },
  {
    requirementKey: "CYL-9ML:ROLLER:METAL",
    componentKind: "roller",
    variantKey: "METAL",
    displayName: "Steel roller-ball fitment",
    geometryFamilyId: "fitment__17-415__roller-ball__v1",
    materialFamily: "steel-ball-with-plastic-fitment",
    releaseStatus: "blocked",
    blockers: ["Frozen source contains 72.8% opaque white junk and must be repaired and requalified."],
    stoneLayoutRequired: false,
  },
];

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function canonicalizeCyl9RollonSnapshot(
  snapshot: Cyl9RollonRequirementSnapshot,
): string {
  const { snapshotSha256: _storedHash, ...payload } = snapshot;
  return JSON.stringify(sortValue(payload));
}

function parsePositiveDimension(value: string | null, label: string, websiteSku: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${websiteSku} has invalid ${label}: ${String(value)}`);
  }
  return parsed;
}

function exactIdentity(websiteSku: string) {
  const body = BODY_TOKENS.find(({ token }) => websiteSku.startsWith(token));
  const overcap = OVERCAP_TOKENS.find(({ token }) => websiteSku.endsWith(token));
  if (!body || !overcap) return null;

  const middle = websiteSku.slice(body.token.length, websiteSku.length - overcap.token.length);
  const roller = middle === "MtlRoll" ? "METAL" : middle === "Roll" ? "PLASTIC" : null;
  if (!roller) return null;
  return { body, overcap, roller } as const;
}

export function buildCyl9RollonRequirementSnapshot(input: {
  catalog: CatalogSnapshotInput;
  sourceGeneratedAt: string;
  sourcePath: string;
  sourceSha256: string;
  snapshotSha256?: string;
}): Cyl9RollonRequirementSnapshot {
  const candidateRows = input.catalog.products.filter((product) => (
    product.family === "Cylinder"
    && product.capacityMl === 9
    && product.neckThreadSize === "17-415"
    && (product.applicator === "Metal Roller Ball" || product.applicator === "Plastic Roller Ball")
    && BODY_TOKENS.some(({ token }) => product.websiteSku?.startsWith(token))
  ));

  const seenWebsiteSkus = new Set<string>();
  for (const product of candidateRows) {
    if (!product.websiteSku) continue;
    if (seenWebsiteSkus.has(product.websiteSku)) {
      throw new Error(`Duplicate websiteSku in CYL-9ML catalog scope: ${product.websiteSku}`);
    }
    seenWebsiteSkus.add(product.websiteSku);
  }

  const unresolved = candidateRows.filter((product) => (
    !product.websiteSku || !exactIdentity(product.websiteSku)
  ));
  if (unresolved.length > 0) {
    throw new Error(`Unresolved CYL-9ML roll-on identities: ${unresolved.map((row) => row.websiteSku).join(", ")}`);
  }

  const assemblyMappings: RollonAssemblyRequirement[] = candidateRows.map((product): RollonAssemblyRequirement => {
    const websiteSku = product.websiteSku as string;
    const graceSku = product.graceSku?.trim();
    if (!graceSku) throw new Error(`${websiteSku} is missing graceSku.`);
    const identity = exactIdentity(websiteSku);
    if (!identity) throw new Error(`${websiteSku} did not resolve through the exact token map.`);

    const expectedApplicator = identity.roller === "METAL" ? "Metal Roller Ball" : "Plastic Roller Ball";
    if (product.applicator !== expectedApplicator) {
      throw new Error(`${websiteSku} token/applicator conflict: ${product.applicator}`);
    }

    const heightWithoutCap = parsePositiveDimension(product.heightWithoutCap, "heightWithoutCap", websiteSku);
    const diameter = parsePositiveDimension(product.diameter, "diameter", websiteSku);
    const actualProfile = `${heightWithoutCap}x${diameter}`;
    const dimensionConflict = actualProfile !== identity.body.sourceGeometryProfile;
    const evidenceIssues = dimensionConflict
      ? [`Catalog dimensions ${actualProfile} disagree with ${identity.body.key} source profile ${identity.body.sourceGeometryProfile}; locked body plate remains geometry authority.`]
      : [];

    return {
      mappingKey: `CYL-9ML:${websiteSku}`,
      websiteSku,
      graceSku,
      bodyVariantKey: identity.body.key,
      bodyRequirementKey: `CYL-9ML:BODY:${identity.body.key}`,
      rollerVariantKey: identity.roller,
      rollerRequirementKey: `CYL-9ML:ROLLER:${identity.roller}`,
      overcapVariantKey: identity.overcap.key,
      overcapRequirementKey: `CYL-9ML:OVERCAP:${identity.overcap.key}`,
      identitySource: "websiteSku-exact-token-map",
      sourceDimensionsMm: { heightWithoutCap, diameter },
      sourceGeometryProfile: identity.body.sourceGeometryProfile,
      evidenceStatus: dimensionConflict ? "dimension-conflict" : "consistent",
      evidenceIssues,
    };
  }).sort((left, right) => left.websiteSku.localeCompare(right.websiteSku));

  const dimensionConflictSkus = assemblyMappings
    .filter(({ evidenceStatus }) => evidenceStatus === "dimension-conflict")
    .map(({ websiteSku }) => websiteSku);
  const requirements = [
    ...BODY_REQUIREMENTS,
    ...OVERCAP_REQUIREMENTS,
    ...ROLLER_REQUIREMENTS,
  ];

  const snapshot: Cyl9RollonRequirementSnapshot = {
    schemaVersion: 1,
    familyKey: "CYL-9ML",
    sourceGeneratedAt: input.sourceGeneratedAt,
    sourcePath: input.sourcePath,
    sourceSha256: input.sourceSha256,
    snapshotSha256: input.snapshotSha256 ?? "0".repeat(64),
    identityPolicy: "websiteSku-exact-token-map",
    bodyVariantKeys: [...CYL9_BODY_VARIANT_KEYS],
    overcapVariantKeys: [...CYL9_OVERCAP_VARIANT_KEYS],
    rollerVariantKeys: [...CYL9_ROLLER_VARIANT_KEYS],
    requirements,
    assemblyMappings,
    evidenceSummary: {
      sourceRowCount: input.catalog.products.length,
      eligibleAssemblyCount: assemblyMappings.length,
      dimensionConflictCount: dimensionConflictSkus.length,
      unresolvedIdentityCount: 0,
    },
    knownIssues: [
      {
        issueKey: "catalog-dimension-conflicts",
        severity: "blocking",
        summary: "Source dimensions conflict with the mapped body profile; the locked plate is authoritative and each conflict requires catalog review.",
        affectedWebsiteSkus: dimensionConflictSkus,
      },
      {
        issueKey: "metal-roller-white-junk",
        severity: "blocking",
        summary: "The frozen metal roller asset contains 72.8% opaque white junk and cannot ship until repaired and requalified.",
        affectedWebsiteSkus: assemblyMappings
          .filter(({ rollerVariantKey }) => rollerVariantKey === "METAL")
          .map(({ websiteSku }) => websiteSku),
      },
      {
        issueKey: "copper-finish-identity-correction",
        severity: "advisory",
        summary: "Catalog truth consistently names matte copper (MAT-CU); the earlier SHN-CU plan token is rejected.",
        affectedWebsiteSkus: assemblyMappings
          .filter(({ overcapVariantKey }) => overcapVariantKey === "MAT-CU")
          .map(({ websiteSku }) => websiteSku),
      },
    ],
  };

  const parsed = Cyl9RollonRequirementSnapshotSchema.parse(snapshot);
  const requirementKeys = new Set(parsed.requirements.map(({ requirementKey }) => requirementKey));
  if (parsed.requirements.length !== 17 || requirementKeys.size !== 17) {
    throw new Error("CYL-9ML denominator must contain exactly 17 unique component requirements.");
  }
  for (const mapping of parsed.assemblyMappings) {
    for (const key of [mapping.bodyRequirementKey, mapping.rollerRequirementKey, mapping.overcapRequirementKey]) {
      if (!requirementKeys.has(key)) throw new Error(`${mapping.websiteSku} references missing requirement ${key}.`);
    }
  }
  return parsed;
}

export function parseCyl9RollonRequirements(value: unknown): Cyl9RollonRequirementSnapshot {
  return Cyl9RollonRequirementSnapshotSchema.parse(value);
}

export function loadCyl9RollonRequirements(): Cyl9RollonRequirementSnapshot {
  return parseCyl9RollonRequirements(snapshotJson);
}
