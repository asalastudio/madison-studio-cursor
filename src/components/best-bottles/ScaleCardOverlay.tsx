/**
 * Toggleable scale-card overlay for catalog-hero review.
 * Aligns to the 10:11 canvas: red baseline, green target rim, S-tag ticks.
 */

import React from "react";
import type { ScaleCardOverlayModel } from "@/lib/bestBottlesScaleCardOverlay";
import type { BestBottlesScaleVerdict } from "@/lib/bestBottlesScaleVerdict";

export type ScaleCardOverlayDensity = "compact" | "full";

export type ScaleCardOverlayProps = {
  model: ScaleCardOverlayModel;
  density?: ScaleCardOverlayDensity;
  className?: string;
  /** Pixel-grounded Library verdict. Never infer a pass from model.proof. */
  verdict?: BestBottlesScaleVerdict | null;
};

export function ScaleCardOverlay({
  model,
  density = "full",
  className = "",
  verdict,
}: ScaleCardOverlayProps) {
  const compact = density === "compact";
  const target = model.target;
  const assembledTarget = model.assembledTarget;
  const shoulder = model.shoulder;
  const visibleTopPercent =
    verdict?.visibleHeightPct != null
      ? model.baselinePercent - verdict.visibleHeightPct
      : null;

  if (model.mode === "shoulder-lock" && shoulder) {
    return (
      <div
        className={`pointer-events-none absolute inset-0 ${className}`}
        data-testid="scale-card-overlay"
        data-density={density}
        data-mode="shoulder-lock"
        aria-hidden
      >
        <div
          className="absolute left-[6%] right-[12%]"
          style={{
            top: `${shoulder.targetTopPercent}%`,
            borderTop: "2px dashed rgba(126,211,33,0.98)",
          }}
        >
          {!compact && (
            <span className="absolute right-0 top-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-[#9be43a]">
              Shoulder lock · {shoulder.targetShoulderPct.toFixed(1)}%
            </span>
          )}
        </div>

        {shoulder.measuredTopPercent != null && (
          <div
            className="absolute left-[10%] right-[16%]"
            style={{
              top: `${shoulder.measuredTopPercent}%`,
              borderTop: "2px solid rgba(196,92,38,0.98)",
            }}
          >
            {!compact && (
              <span className="absolute left-0 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-[#f39a69]">
                Current shoulder · {shoulder.measuredShoulderPct?.toFixed(1)}%
              </span>
            )}
          </div>
        )}

        <div
          className="absolute left-[3%] right-[3%]"
          style={{
            top: `${model.baselinePercent}%`,
            borderTop: "2px dashed rgba(255,59,48,0.9)",
          }}
        />
        {!compact && (
          <div
            className="absolute left-1.5 font-semibold"
            style={{
              top: `calc(${model.baselinePercent}% + 3px)`,
              fontSize: 9,
              color: "rgba(255,59,48,0.95)",
              textShadow: "0 0 4px rgba(0,0,0,0.8)",
            }}
          >
            91% foot baseline
          </div>
        )}

        <div
          className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono"
          style={{
            fontSize: compact ? 9 : 10,
            color: "rgba(126,211,33,1)",
            background: "rgba(0,0,0,0.62)",
            border: "1px solid rgba(126,211,33,0.95)",
          }}
        >
          {shoulder.label} · shoulder {shoulder.targetShoulderPct.toFixed(1)}%
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      data-testid="scale-card-overlay"
      data-density={density}
      data-mode="scale-card"
      aria-hidden
    >
      {model.ticks.map((tick) => (
        <div
          key={`${tick.tag}-${tick.mm}`}
          className="absolute right-0 flex items-center"
          style={{ top: `${tick.topPercent}%`, transform: "translateY(-50%)" }}
        >
          <div
            style={{
              width: tick.isTarget ? 14 : 8,
              height: 0,
              borderTop: tick.isTarget
                ? "1.5px solid rgba(126,211,33,0.95)"
                : "1px solid rgba(255,255,255,0.38)",
            }}
          />
          {!compact && (
            <span
              className="ml-1 rounded bg-black/60 px-1 py-0.5 font-mono leading-none"
              style={{
                fontSize: 9,
                color: tick.isTarget ? "rgba(126,211,33,1)" : "rgba(255,255,255,0.9)",
                textShadow: "0 0 3px rgba(0,0,0,0.85)",
              }}
            >
              {tick.mm} mm · {tick.glassHeightPct.toFixed(1)}%
            </span>
          )}
        </div>
      ))}

      {target && (
        <div
          className="absolute left-[6%] right-[12%]"
          style={{
            top: `${target.topPercent}%`,
            borderTop: "1.5px dashed rgba(126,211,33,0.92)",
          }}
        />
      )}

      {assembledTarget && (
        <div
          className="absolute left-[5%] right-[11%]"
          style={{
            top: `${assembledTarget.topPercent}%`,
            borderTop: "1.5px dashed rgba(96,165,250,0.95)",
          }}
        >
          {!compact && (
            <span className="absolute right-0 top-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-blue-200">
              Max assembled · {assembledTarget.heightWithCapMm} mm ·{" "}
              {assembledTarget.heightPct.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {visibleTopPercent != null && (
        <div
          className="absolute left-[8%] right-[14%]"
          style={{
            top: `${visibleTopPercent}%`,
            borderTop: "1.5px dashed rgba(251,191,36,0.9)",
          }}
        >
          {!compact && (
            <span className="absolute left-0 top-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-amber-200">
              Visible top · {verdict?.visibleHeightPct?.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      <div
        className="absolute left-[3%] right-[3%]"
        style={{
          top: `${model.baselinePercent}%`,
          borderTop: "2px dashed rgba(255,59,48,0.9)",
        }}
      />

      {!compact && (
        <div
          className="absolute left-1.5 font-semibold"
          style={{
            top: `calc(${model.baselinePercent}% + 3px)`,
            fontSize: 9,
            color: "rgba(255,59,48,0.95)",
            textShadow: "0 0 4px rgba(0,0,0,0.8)",
          }}
        >
          91% baseline
        </div>
      )}

      <div
        className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono"
        style={{
          fontSize: compact ? 9 : 10,
          color: "rgba(126,211,33,1)",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(126,211,33,0.95)",
          textShadow: "none",
        }}
      >
        {target
          ? `Target glass · ${target.heightWithoutCapMm} mm · ${target.glassHeightPct.toFixed(1)}%`
          : "Scale card"}
      </div>
    </div>
  );
}

export default ScaleCardOverlay;
