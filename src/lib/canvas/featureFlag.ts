import { FEATURE_FLAG_KEY } from "./types";

export interface BrandConfigLike {
  features?: Record<string, unknown> | null;
}

export function isMadisonCanvasEnvEnabled(
  env: Record<string, string | undefined> | ImportMetaEnv | undefined = import.meta.env,
): boolean {
  const raw = env?.VITE_MADISON_CANVAS;
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true" || raw.trim() === "1";
}

export function isMadisonCanvasOrgEnabled(brandConfig: BrandConfigLike | null | undefined): boolean {
  return brandConfig?.features?.[FEATURE_FLAG_KEY] === true;
}

export function isMadisonCanvasEnabled(options: {
  brandConfig?: BrandConfigLike | null;
  env?: Record<string, string | undefined> | ImportMetaEnv;
}): boolean {
  return isMadisonCanvasEnvEnabled(options.env) || isMadisonCanvasOrgEnabled(options.brandConfig);
}
