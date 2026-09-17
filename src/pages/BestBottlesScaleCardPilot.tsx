/**
 * Localhost Cylinder scale-card pilot — current vs target at the same zoom.
 * Route: /best-bottles/scale-card-pilot
 */

import { Link } from "react-router-dom";
import { buildBestBottlesScaleCardPilot } from "./bestBottlesScaleCardPilotModel";
import { ScaleProofPanel } from "@/components/best-bottles/ScaleProofPanel";

function formatDelta(deltaPct: number): string {
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

function Silhouette({
  glassHeightPct,
  baselinePercent,
  tone,
}: {
  glassHeightPct: number;
  baselinePercent: number;
  tone: "current" | "target";
}) {
  const footTop = baselinePercent;
  const glassTop = baselinePercent - glassHeightPct;
  const fill =
    tone === "current"
      ? "linear-gradient(180deg, rgba(148,163,184,0.4), rgba(100,116,139,0.65))"
      : "linear-gradient(180deg, rgba(110,231,168,0.35), rgba(52,211,153,0.6))";

  return (
    <div
      className="relative w-full overflow-hidden rounded border"
      style={{
        aspectRatio: "1560 / 1716",
        background: "#161616",
        borderColor: "#2a2a2a",
      }}
    >
      <div
        className="absolute left-1/2 w-[30%] -translate-x-1/2 rounded-sm"
        style={{
          top: `${glassTop}%`,
          height: `${glassHeightPct}%`,
          background: fill,
          border: "1px solid rgba(226,232,240,0.3)",
        }}
      />
      <div
        className="pointer-events-none absolute left-[4%] right-[4%]"
        style={{
          top: `${glassTop}%`,
          borderTop: `1.5px dashed ${tone === "target" ? "rgba(126,211,33,0.9)" : "rgba(148,163,184,0.7)"}`,
        }}
      />
      <div
        className="pointer-events-none absolute left-[3%] right-[3%]"
        style={{
          top: `${footTop}%`,
          borderTop: "2px dashed rgba(255,59,48,0.85)",
        }}
      />
    </div>
  );
}

export default function BestBottlesScaleCardPilot() {
  const pilot = buildBestBottlesScaleCardPilot();

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#ececec]">
      <header className="sticky top-0 z-10 border-b border-[#2a2a2a] bg-[#0f0f0f]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#8b8b8b]">
              Best Bottles · Scale-card v1
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Cylinder scale proof</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#a3a3a3]">
              Same zoom for current (approved today) vs target (bare-glass PCHIP).
              Foot on the 91% baseline. No generation — localhost review only.
            </p>
          </div>
          <div className="text-right text-[11px] text-[#8b8b8b]">
            <div className="font-mono">{pilot.version}</div>
            <div>canvas deliver {pilot.canvasHeightPx}px · baseline {pilot.baselinePercent}%</div>
            <Link to="/best-bottles/pipeline" className="mt-1 inline-block text-[#93c5fd] hover:underline">
              ← Pipeline
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section className="overflow-x-auto rounded border border-[#2a2a2a]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#171717] text-[11px] uppercase tracking-wider text-[#8b8b8b]">
              <tr>
                <th className="px-4 py-3 font-medium">Body</th>
                <th className="px-4 py-3 font-medium">mm</th>
                <th className="px-4 py-3 font-medium">Current %</th>
                <th className="px-4 py-3 font-medium">Target %</th>
                <th className="px-4 py-3 font-medium">Δ vs today</th>
                <th className="px-4 py-3 font-medium">S-tag</th>
                <th className="px-4 py-3 font-medium">Target px</th>
              </tr>
            </thead>
            <tbody>
              {pilot.rows.map((row) => (
                <tr key={row.id} className="border-t border-[#242424]">
                  <td className="px-4 py-3 font-medium">{row.label}</td>
                  <td className="px-4 py-3 font-mono text-[#d4d4d4]">{row.heightWithoutCapMm}</td>
                  <td className="px-4 py-3 font-mono text-[#d4d4d4]">{row.currentGlassHeightPct.toFixed(1)}%</td>
                  <td className="px-4 py-3 font-mono text-[#d4d4d4]">{row.targetGlassHeightPct.toFixed(1)}%</td>
                  <td
                    className="px-4 py-3 font-mono"
                    style={{ color: row.deltaPct < 0 ? "#f87171" : row.deltaPct > 0 ? "#6ee7a8" : "#a3a3a3" }}
                  >
                    {formatDelta(row.deltaPct)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#93c5fd]">{row.tag}</td>
                  <td className="px-4 py-3 font-mono text-[#d4d4d4]">{row.targetGlassHeightPx}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Same-zoom silhouettes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {pilot.rows.map((row) => (
              <article key={row.id} className="space-y-2 rounded border border-[#2a2a2a] bg-[#141414] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{row.label}</h3>
                  <span className="font-mono text-[11px] text-[#93c5fd]">{row.tag}</span>
                </div>
                <div className="text-[11px] text-[#8b8b8b]">
                  {row.heightWithoutCapMm} mm · Δ {formatDelta(row.deltaPct)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#8b8b8b]">Current</div>
                    <Silhouette
                      glassHeightPct={row.currentGlassHeightPct}
                      baselinePercent={row.baselinePercent}
                      tone="current"
                    />
                    <div className="font-mono text-[11px] text-[#d4d4d4]">
                      {row.currentGlassHeightPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#8b8b8b]">Target</div>
                    <Silhouette
                      glassHeightPct={row.targetGlassHeightPct}
                      baselinePercent={row.baselinePercent}
                      tone="target"
                    />
                    <div className="font-mono text-[11px] text-[#d4d4d4]">
                      {row.targetGlassHeightPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Post-generation proof panel (preview)</h2>
          <p className="text-sm text-[#a3a3a3]">
            Same panel Studio mounts after a generate — target from resolveBestBottlesGlassScale,
            measured pending until framing QA fills glass height %.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {pilot.rows.slice(0, 2).map((row) => (
              <ScaleProofPanel
                key={`proof-${row.id}`}
                label={row.label}
                heightWithoutCapMm={row.heightWithoutCapMm}
                measuredGlassHeightPct={null}
              />
            ))}
            <ScaleProofPanel
              label="9 Classic (mock measured = current 53.2%)"
              heightWithoutCapMm={70}
              measuredGlassHeightPct={53.2}
            />
            <ScaleProofPanel
              label="9 Slim (mock measured = target)"
              heightWithoutCapMm={106}
              measuredGlassHeightPct={65.5}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
