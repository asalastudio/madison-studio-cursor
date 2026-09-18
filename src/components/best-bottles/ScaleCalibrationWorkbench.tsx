import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import {
  getProductsByFamily,
  getProductGroupsByFamily,
} from "@/integrations/convex/bestBottles";
import {
  approveBestBottlesScaleCalibration,
  buildBestBottlesScaleCalibrationKeys,
  listBestBottlesScaleCalibrations,
  upsertBestBottlesScaleCalibrationDraft,
  type NormalizedBounds,
} from "@/lib/bestBottlesScaleCalibration";
import { resolveBestBottlesGlassScale } from "@/config/bestBottlesCatalogScale";
import { parseDimensionMm } from "@/lib/product-image/skuInjector";

type GuideKind = "rim" | "foot" | "fitment";

const DEFAULT_PRIMARY_BOUNDS: NormalizedBounds = {
  left: 0.3,
  top: 0.2,
  right: 0.7,
  bottom: 0.91,
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function parseMm(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseDimensionMm(typeof value === "string" ? value : null);
}

function boundsStyle(bounds: NormalizedBounds): React.CSSProperties {
  return {
    left: `${bounds.left * 100}%`,
    top: `${bounds.top * 100}%`,
    width: `${(bounds.right - bounds.left) * 100}%`,
    height: `${(bounds.bottom - bounds.top) * 100}%`,
  };
}

export function ScaleCalibrationWorkbench() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedSku, setSelectedSku] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [capState, setCapState] = useState<"assembled" | "detached">("detached");
  const [sourceSize, setSourceSize] = useState({ width: 2080, height: 2288 });
  const [rimPct, setRimPct] = useState(50);
  const [footPct, setFootPct] = useState(91);
  const [fitmentPct, setFitmentPct] = useState(35);
  const [primaryBounds, setPrimaryBounds] =
    useState<NormalizedBounds>(DEFAULT_PRIMARY_BOUNDS);
  const [includeDetached, setIncludeDetached] = useState(true);
  const [detachedBounds, setDetachedBounds] = useState<NormalizedBounds>({
    left: 0.7,
    top: 0.68,
    right: 0.88,
    bottom: 0.91,
  });
  const [dragging, setDragging] = useState<GuideKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["best-bottles-scale-calibration-products", "Cylinder"],
    queryFn: () => getProductsByFamily("Cylinder"),
  });
  const { data: productGroups = [] } = useQuery({
    queryKey: ["best-bottles-scale-calibration-groups", "Cylinder"],
    queryFn: () => getProductGroupsByFamily("Cylinder"),
  });

  const { data: calibrations = [] } = useQuery({
    queryKey: ["best-bottles-scale-calibrations", organizationId, "Cylinder"],
    queryFn: () =>
      listBestBottlesScaleCalibrations({
        organizationId: organizationId!,
        family: "Cylinder",
      }),
    enabled: Boolean(organizationId),
  });

  const selectedProduct = useMemo(
    () => products.find((product) => product.graceSku === selectedSku) ?? null,
    [products, selectedSku],
  );
  const selectedProductGroupSlug =
    selectedProduct?.productGroupSlug ??
    productGroups.find((group) => group._id === selectedProduct?.productGroupId)
      ?.slug ??
    null;
  const keys = selectedProduct
    ? buildBestBottlesScaleCalibrationKeys({
        family: selectedProduct.family,
        heightWithoutCap: selectedProduct.heightWithoutCap,
        diameter: selectedProduct.diameter,
        neckThreadSize: selectedProduct.neckThreadSize,
        applicator: selectedProduct.applicator,
        capState,
      })
    : null;
  const currentCalibration = keys
    ? calibrations.find(
        (row) =>
          row.geometryKey === keys.geometryKey &&
          row.topologyKey === keys.topologyKey &&
          row.status !== "archived",
      ) ?? null
    : null;
  const glassMm = parseMm(selectedProduct?.heightWithoutCap);
  const targetPct =
    glassMm != null ? resolveBestBottlesGlassScale(glassMm).glassHeightPct : null;
  const annotatedPct = Math.round((footPct - rimPct) * 10) / 10;
  const inferredMm =
    glassMm != null && targetPct != null
      ? Math.round((annotatedPct / targetPct) * glassMm * 10) / 10
      : null;

  useEffect(() => {
    if (!selectedProduct) return;
    const defaultCapState =
      selectedProduct.applicator === "Cap/Closure" ||
      selectedProduct.applicator?.toLowerCase().includes("vintage")
        ? "assembled"
        : "detached";
    setCapState(defaultCapState);
    const defaultTarget =
      parseMm(selectedProduct.heightWithoutCap) != null
        ? resolveBestBottlesGlassScale(parseMm(selectedProduct.heightWithoutCap)!)
            .glassHeightPct
        : 40;
    setSourceUrl(selectedProduct.imageUrl ?? "");
    setFootPct(91);
    setRimPct(clampPct(91 - defaultTarget));
    setFitmentPct(clampPct(91 - defaultTarget - 12));
    setPrimaryBounds({
      ...DEFAULT_PRIMARY_BOUNDS,
      top: Math.max(0, (91 - defaultTarget - 12) / 100),
    });
    setIncludeDetached(defaultCapState === "detached");
    setMessage(null);
  }, [selectedProduct]);

  useEffect(() => {
    if (!currentCalibration) return;
    setSourceUrl(currentCalibration.sourceReferenceUrl);
    setSourceSize({
      width: currentCalibration.sourceWidthPx,
      height: currentCalibration.sourceHeightPx,
    });
    setRimPct(currentCalibration.glassRimYPct);
    setFootPct(currentCalibration.glassFootYPct);
    setFitmentPct(
      currentCalibration.fitmentTopYPct ?? currentCalibration.glassRimYPct,
    );
    setPrimaryBounds(currentCalibration.primaryBounds);
    setIncludeDetached(Boolean(currentCalibration.detachedComponentBounds));
    if (currentCalibration.detachedComponentBounds) {
      setDetachedBounds(currentCalibration.detachedComponentBounds);
    }
  }, [currentCalibration]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const pct = clampPct(((event.clientY - box.top) / box.height) * 100);
      if (dragging === "rim") setRimPct(Math.min(pct, footPct - 1));
      if (dragging === "foot") setFootPct(Math.max(pct, rimPct + 1));
      if (dragging === "fitment") setFitmentPct(pct);
    };
    const stop = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging, footPct, rimPct]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user || !selectedProduct || !keys) {
        throw new Error("Select a Cylinder product before saving.");
      }
      if (!sourceUrl.trim()) {
        throw new Error("An authoritative source-reference URL is required.");
      }
      if (!selectedProductGroupSlug) {
        throw new Error("The selected SKU is missing exact product-group membership.");
      }
      return await upsertBestBottlesScaleCalibrationDraft({
        organizationId,
        userId: user.id,
        family: "Cylinder",
        geometryKey: keys.geometryKey,
        topologyKey: keys.topologyKey,
        graceSku: selectedProduct.graceSku,
        websiteSku: selectedProduct.websiteSku,
        productGroupSlug: selectedProductGroupSlug,
        sourceReferenceUrl: sourceUrl.trim(),
        sourceWidthPx: sourceSize.width,
        sourceHeightPx: sourceSize.height,
        glassFootYPct: footPct,
        glassRimYPct: rimPct,
        fitmentTopYPct: fitmentPct,
        primaryBounds,
        detachedComponentBounds: includeDetached ? detachedBounds : null,
      });
    },
    onSuccess: async () => {
      setMessage("Draft calibration saved.");
      await queryClient.invalidateQueries({
        queryKey: ["best-bottles-scale-calibrations", organizationId, "Cylinder"],
      });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Calibration save failed.");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !currentCalibration) {
        throw new Error("Save the draft before approval.");
      }
      return await approveBestBottlesScaleCalibration({
        organizationId,
        calibrationId: currentCalibration.id,
      });
    },
    onSuccess: async () => {
      setMessage("Calibration approved for this geometry + topology.");
      await queryClient.invalidateQueries({
        queryKey: ["best-bottles-scale-calibrations", organizationId, "Cylinder"],
      });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Approval failed.");
    },
  });

  const updateBound = (
    target: "primary" | "detached",
    field: keyof NormalizedBounds,
    raw: string,
  ) => {
    const value = Math.max(0, Math.min(1, Number(raw)));
    const setter = target === "primary" ? setPrimaryBounds : setDetachedBounds;
    setter((bounds) => ({ ...bounds, [field]: value }));
  };

  return (
    <section className="space-y-5 rounded border border-[#2a2a2a] bg-[#141414] p-4">
      <div>
        <h2 className="text-lg font-medium">Cylinder reference calibration</h2>
        <p className="mt-1 text-sm text-[#a3a3a3]">
          Annotate glass foot/rim and fitment topology once. Color and finish
          variants reuse the same geometry key.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <label className="block text-xs text-[#a3a3a3]">
            Exact Cylinder SKU
            <select
              value={selectedSku}
              onChange={(event) => setSelectedSku(event.target.value)}
              className="mt-1 w-full rounded border border-[#3a3a3a] bg-[#0f0f0f] p-2 text-sm"
            >
              <option value="">
                {productsLoading ? "Loading…" : "Select a product"}
              </option>
              {products.map((product) => (
                <option key={product._id} value={product.graceSku}>
                  {product.graceSku} · {product.capacity ?? "?"} ·{" "}
                  {product.applicator ?? "N/A"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-[#a3a3a3]">
            Authoritative source URL
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              className="mt-1 w-full rounded border border-[#3a3a3a] bg-[#0f0f0f] p-2 text-sm"
              placeholder="https://…"
            />
          </label>

          <label className="block text-xs text-[#a3a3a3]">
            Output topology
            <select
              value={capState}
              onChange={(event) =>
                setCapState(event.target.value as "assembled" | "detached")
              }
              className="mt-1 w-full rounded border border-[#3a3a3a] bg-[#0f0f0f] p-2 text-sm"
            >
              <option value="assembled">Assembled fitment</option>
              <option value="detached">Sidecar / detached component</option>
            </select>
          </label>

          {selectedProduct && keys && (
            <div className="space-y-1 rounded border border-[#2a2a2a] p-2 font-mono text-[11px] text-[#a3a3a3]">
              <div>{keys.geometryKey}</div>
              <div>{keys.topologyKey}</div>
              <div>
                Target: {glassMm ?? "?"} mm · {targetPct?.toFixed(1) ?? "?"}%
              </div>
              <div>
                Annotation: {annotatedPct.toFixed(1)}% · inferred{" "}
                {inferredMm?.toFixed(1) ?? "?"} mm
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Rim", rimPct, setRimPct],
                ["Foot", footPct, setFootPct],
                ["Fitment", fitmentPct, setFitmentPct],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="text-[10px] text-[#8b8b8b]">
                {label} %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={value}
                  onChange={(event) => setter(clampPct(Number(event.target.value)))}
                  className="mt-1 w-full rounded border border-[#3a3a3a] bg-[#0f0f0f] p-1.5 font-mono text-xs"
                />
              </label>
            ))}
          </div>

          {(["primary", "detached"] as const).map((target) => {
            if (target === "detached" && !includeDetached) return null;
            const bounds = target === "primary" ? primaryBounds : detachedBounds;
            return (
              <fieldset key={target} className="rounded border border-[#2a2a2a] p-2">
                <legend className="px-1 text-[10px] uppercase tracking-wide text-[#8b8b8b]">
                  {target} bounds (0–1)
                </legend>
                <div className="grid grid-cols-4 gap-1">
                  {(Object.keys(bounds) as Array<keyof NormalizedBounds>).map(
                    (field) => (
                      <label key={field} className="text-[9px] text-[#8b8b8b]">
                        {field}
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={bounds[field]}
                          onChange={(event) =>
                            updateBound(target, field, event.target.value)
                          }
                          className="mt-1 w-full rounded border border-[#3a3a3a] bg-[#0f0f0f] p-1 font-mono text-[10px]"
                        />
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            );
          })}

          <label className="flex items-center gap-2 text-xs text-[#a3a3a3]">
            <input
              type="checkbox"
              checked={includeDetached}
              onChange={(event) => setIncludeDetached(event.target.checked)}
            />
            Detached component is present
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedProduct}
              className="rounded border border-[#4a4a4a] px-3 py-2 text-xs disabled:opacity-40"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={
                approveMutation.isPending ||
                !currentCalibration ||
                currentCalibration.status === "approved"
              }
              className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-xs text-emerald-100 disabled:opacity-40"
            >
              Approve calibration
            </button>
          </div>
          {message && <p className="text-xs text-[#d4d4d4]">{message}</p>}
        </div>

        <div
          ref={stageRef}
          className="relative mx-auto w-full max-w-[620px] overflow-hidden rounded border border-[#3a3a3a] bg-[#f5f3ef]"
          style={{ aspectRatio: `${sourceSize.width} / ${sourceSize.height}` }}
        >
          {sourceUrl ? (
            <img
              src={sourceUrl}
              alt={selectedProduct?.itemName ?? "Calibration source"}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) =>
                setSourceSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-[#68645e]">
              Select a SKU and authoritative reference
            </div>
          )}

          <div
            className="pointer-events-none absolute border border-cyan-500"
            style={boundsStyle(primaryBounds)}
          />
          {includeDetached && (
            <div
              className="pointer-events-none absolute border border-fuchsia-500"
              style={boundsStyle(detachedBounds)}
            />
          )}

          {(
            [
              ["rim", rimPct, "Glass rim", "bg-emerald-500"],
              ["foot", footPct, "Glass foot", "bg-red-500"],
              ["fitment", fitmentPct, "Fitment top", "bg-amber-500"],
            ] as const
          ).map(([kind, pct, label, color]) => (
            <button
              key={kind}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                setDragging(kind);
              }}
              className="absolute left-0 right-0 z-10 h-4 -translate-y-1/2 cursor-row-resize"
              style={{ top: `${pct}%` }}
              aria-label={`Drag ${label}`}
            >
              <span className={`absolute left-0 right-0 top-1/2 h-px ${color}`} />
              <span className="absolute left-1 top-1/2 -translate-y-1/2 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-white">
                {label} · {pct.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ScaleCalibrationWorkbench;
