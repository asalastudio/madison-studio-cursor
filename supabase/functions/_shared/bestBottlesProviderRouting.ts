export interface BestBottlesProviderRoutingInput {
  isBestBottlesReferenceLocked: boolean;
  allowBestBottlesProviderOverride?: boolean | null;
}

export interface BestBottlesResolutionRoutingInput {
  isBestBottlesReferenceLocked: boolean;
  resolution?: string | null;
}

export const BEST_BOTTLES_PRODUCTION_PROVIDER = "openai" as const;
export const BEST_BOTTLES_PRODUCTION_MODEL = "gpt-image-2.5-sunburst" as const;

export interface BestBottlesResolvedProviderInput {
  isBestBottlesReferenceLocked: boolean;
  comparisonOnly: boolean;
  provider: string;
  model: string;
}

export function getBestBottlesProductionProviderIssue(
  input: BestBottlesResolvedProviderInput,
): string | null {
  if (!input.isBestBottlesReferenceLocked || input.comparisonOnly) return null;
  if (
    input.provider === BEST_BOTTLES_PRODUCTION_PROVIDER
    && input.model === BEST_BOTTLES_PRODUCTION_MODEL
  ) {
    return null;
  }
  return `Best Bottles production generation requires provider=${BEST_BOTTLES_PRODUCTION_PROVIDER} and model=${BEST_BOTTLES_PRODUCTION_MODEL}.`;
}

export function shouldForceBestBottlesOpenAIProvider(
  input: BestBottlesProviderRoutingInput,
): boolean {
  return input.isBestBottlesReferenceLocked && input.allowBestBottlesProviderOverride !== true;
}

export function resolveBestBottlesProductionResolution(
  input: BestBottlesResolutionRoutingInput,
): string | undefined {
  if (input.isBestBottlesReferenceLocked) return "high";
  return input.resolution ?? undefined;
}
