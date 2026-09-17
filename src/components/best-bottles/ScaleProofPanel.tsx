/**
 * Scale proof panel — target vs measured glass height for Studio review.
 * Visual guide: 91% baseline + target glass band (no heavy deps).
 */

import { evaluateScaleProof, type ScaleProofEvaluation } from "@/lib/product-image/scaleProof";

export type ScaleProofPanelProps = {
  heightWithoutCapMm: number | null | undefined;
  measuredGlassHeightPct?: number | null;
  /** Optional “before” (approved / current) image. */
  beforeImageUrl?: string | null;
  /** Optional “after” (generated) image. */
  afterImageUrl?: string | null;
  label?: string;
  className?: string;
};

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function verdictLabel(verdict: ScaleProofEvaluation["verdict"]): string {
  if (verdict === "pass") return "PASS ±2%";
  if (verdict === "fail") return "FAIL ±2%";
  return "PENDING measure";
}

function verdictColor(verdict: ScaleProofEvaluation["verdict"]): string {
  if (verdict === "pass") return "#6ee7a8";
  if (verdict === "fail") return "#f87171";
  return "#fbbf24";
}

function GuideFrame({
  glassHeightPct,
  baselinePercent,
  caption,
  imageUrl,
}: {
  glassHeightPct: number;
  baselinePercent: number;
  caption: string;
  imageUrl?: string | null;
}) {
  // Foot on baselinePercent from top; glass rises glassHeightPct of frame height.
  const footTop = baselinePercent;
  const glassTop = baselinePercent - glassHeightPct;

  return (
    <div className="space-y-1.5 min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim, #9ca3af)" }}>
        {caption}
      </div>
      <div
        className="relative w-full overflow-hidden rounded border"
        style={{
          aspectRatio: "1560 / 1716",
          background: "var(--darkroom-surface, #1a1a1a)",
          borderColor: "var(--darkroom-border-subtle, #333)",
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={caption}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div
            className="absolute left-1/2 w-[28%] -translate-x-1/2 rounded-sm"
            style={{
              top: `${glassTop}%`,
              height: `${glassHeightPct}%`,
              background: "linear-gradient(180deg, rgba(148,163,184,0.35), rgba(100,116,139,0.55))",
              border: "1px solid rgba(226,232,240,0.35)",
            }}
            aria-hidden
          />
        )}
        {/* Target glass band (top edge of glass) */}
        <div
          className="pointer-events-none absolute left-[4%] right-[4%]"
          style={{
            top: `${glassTop}%`,
            borderTop: "1.5px dashed rgba(126,211,33,0.85)",
          }}
        />
        {/* 91% baseline */}
        <div
          className="pointer-events-none absolute left-[3%] right-[3%]"
          style={{
            top: `${footTop}%`,
            borderTop: "2px dashed rgba(255,59,48,0.85)",
          }}
        />
        <div
          className="pointer-events-none absolute left-2 text-[9px] font-semibold"
          style={{ top: `calc(${footTop}% + 3px)`, color: "rgba(255,59,48,0.95)" }}
        >
          91% baseline
        </div>
      </div>
    </div>
  );
}

export function ScaleProofPanel({
  heightWithoutCapMm,
  measuredGlassHeightPct = null,
  beforeImageUrl = null,
  afterImageUrl = null,
  label,
  className = "",
}: ScaleProofPanelProps) {
  if (heightWithoutCapMm == null || !Number.isFinite(heightWithoutCapMm) || heightWithoutCapMm <= 0) {
    return (
      <div
        className={`rounded border p-3 text-xs ${className}`}
        style={{
          borderColor: "var(--darkroom-border-subtle, #333)",
          background: "var(--darkroom-surface, #141414)",
          color: "var(--darkroom-text-dim, #9ca3af)",
        }}
      >
        Scale proof unavailable — verified heightWithoutCap (mm) is required.
      </div>
    );
  }

  const proof = evaluateScaleProof({
    heightWithoutCapMm,
    measuredGlassHeightPct,
  });

  const showBeforeAfter = Boolean(beforeImageUrl || afterImageUrl);

  return (
    <div
      className={`space-y-3 rounded border p-3 ${className}`}
      style={{
        borderColor: "var(--darkroom-border-subtle, #333)",
        background: "var(--darkroom-surface, #141414)",
      }}
      data-testid="scale-proof-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--darkroom-text-dim, #9ca3af)" }}>
            Scale proof{label ? ` · ${label}` : ""}
          </div>
          <div className="text-sm font-medium" style={{ color: "var(--darkroom-text, #eee)" }}>
            {heightWithoutCapMm} mm · {proof.target.tag} · target {formatPct(proof.target.glassHeightPct)}
          </div>
        </div>
        <div
          className="rounded px-2 py-1 text-[11px] font-semibold tracking-wide"
          style={{
            color: verdictColor(proof.verdict),
            background: "rgba(0,0,0,0.35)",
            border: `1px solid ${verdictColor(proof.verdict)}`,
          }}
        >
          {verdictLabel(proof.verdict)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--darkroom-text-dim, #9ca3af)" }}>
        <div>Target glassHeightPct</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {formatPct(proof.target.glassHeightPct)}
        </div>
        <div>Target glassHeightPx</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {proof.target.targetGlassHeightPx}px
        </div>
        <div>S-tag</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {proof.target.tag}
        </div>
        <div>Measured glass height %</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {proof.measuredGlassHeightPct == null ? "pending" : formatPct(proof.measuredGlassHeightPct)}
        </div>
        <div>Delta vs target</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {proof.deltaPct == null ? "—" : `${proof.deltaPct > 0 ? "+" : ""}${proof.deltaPct.toFixed(1)} pp`}
        </div>
        <div>Pass band (±{proof.tolerancePct}%)</div>
        <div className="font-mono" style={{ color: "var(--darkroom-text, #eee)" }}>
          {formatPct(proof.range.min)} – {formatPct(proof.range.max)}
        </div>
        <div>Contract</div>
        <div className="font-mono truncate" style={{ color: "var(--darkroom-text, #eee)" }} title={proof.version}>
          {proof.version}
        </div>
      </div>

      <div className="flex gap-3">
        {showBeforeAfter ? (
          <>
            <GuideFrame
              caption="Before / approved"
              glassHeightPct={proof.target.glassHeightPct}
              baselinePercent={proof.baselinePercent}
              imageUrl={beforeImageUrl}
            />
            <GuideFrame
              caption="After / generated"
              glassHeightPct={proof.measuredGlassHeightPct ?? proof.target.glassHeightPct}
              baselinePercent={proof.baselinePercent}
              imageUrl={afterImageUrl}
            />
          </>
        ) : (
          <GuideFrame
            caption={`Target silhouette · ${proof.target.tag}`}
            glassHeightPct={proof.target.glassHeightPct}
            baselinePercent={proof.baselinePercent}
          />
        )}
      </div>
    </div>
  );
}

export default ScaleProofPanel;
