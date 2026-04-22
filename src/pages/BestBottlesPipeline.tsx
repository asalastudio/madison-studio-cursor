import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import {
  listPipelineGroups,
  groupByShape,
  importPipelineCsv,
  type PipelineGroup,
  type PipelineStatus,
  type ShapeGroup,
} from "@/lib/bestBottlesPipeline";
import { writePipelinePrefill } from "@/lib/bestBottlesPipelineBridge";

/**
 * Maps Best Bottles catalog glass-color names to Consistency Mode bottle-color
 * option ids. Kept here (not in the lib) because the string lineup is a
 * Pipeline-specific concern — the catalog uses "Cobalt Blue", the Consistency
 * Mode uses "blue". If the catalog grows a new color we add the mapping here
 * rather than renaming the stable option id.
 */
const GLASS_COLOR_TO_OPTION: Record<string, string> = {
  Clear: "clear",
  Frosted: "frosted",
  "Cobalt Blue": "blue",
  Amber: "amber",
  Swirl: "swirl",
};

/**
 * Maps the catalog's applicator-types free-text ("Metal Roller Ball, Plastic
 * Roller Ball") to Consistency Mode fitment option ids. Multiple applicators
 * in one cell are comma-split.
 */
const APPLICATOR_TO_FITMENT: Record<string, string> = {
  "Metal Roller Ball": "roller-ball",
  "Plastic Roller Ball": "roller-ball-plastic",
  "Fine Mist Sprayer": "fine-mist-metal",
  "Perfume Spray Pump": "perfume-spray-pump",
  Atomizer: "fine-mist-metal",
  "Vintage Bulb Sprayer": "vintage-bulb-sprayer",
  "Vintage Bulb Sprayer with Tassel": "vintage-bulb-sprayer-tassel",
  "Lotion Pump": "lotion-pump",
  Dropper: "dropper",
  Reducer: "reducer",
  "Glass Stopper": "glass-stopper",
  "Cap/Closure": "cap-closure",
};

type StatusFilter = "all" | PipelineStatus | "has-hero" | "no-hero";

export default function BestBottlesPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enabled, isLoading: flagLoading, organizationId } = useGridPipelineFeatureFlag();

  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ["best-bottles-pipeline-groups", organizationId],
    queryFn: () => listPipelineGroups(organizationId!),
    enabled: !!organizationId && enabled,
    staleTime: 30 * 1000,
  });

  const families = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.family))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (familyFilter !== "all" && r.family !== familyFilter) return false;
      if (statusFilter === "has-hero") return r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced";
      if (statusFilter === "no-hero") return !r.legacy_has_hero_image && r.madison_status !== "approved" && r.madison_status !== "synced";
      if (statusFilter !== "all") return r.madison_status === statusFilter;
      return true;
    });
  }, [rows, familyFilter, statusFilter]);

  const shapeGroups = useMemo(() => groupByShape(filteredRows), [filteredRows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withHero = rows.filter(
      (r) => r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced",
    ).length;
    const inProgress = rows.filter(
      (r) => r.madison_status === "queued" || r.madison_status === "generating" || r.madison_status === "generated" || r.madison_status === "qa-pending",
    ).length;
    return { total, withHero, inProgress, remaining: total - withHero };
  }, [rows]);

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleCsvFile = async (file: File) => {
    if (!organizationId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importPipelineCsv(text, organizationId);
      console.log("[pipeline-import-ui] result:", result);
      if (result.errors.length > 0) {
        toast.error(`Import completed with errors`, {
          description: result.errors.join("\n"),
          duration: 30000,
        });
      } else if (result.inserted === 0 && result.skipped === 0) {
        toast.error("Import returned 0 rows", {
          description:
            "The CSV parsed but no rows were inserted. Check the browser console for [pipeline-import] logs with full details.",
          duration: 30000,
        });
      } else {
        toast.success(
          `Imported ${result.inserted} rows` +
            (result.skipped > 0 ? ` · ${result.skipped} skipped` : ""),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["best-bottles-pipeline-groups"] });
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Launch ──────────────────────────────────────────────────────────────
  //
  // Build a pre-fill from the shape group: pre-tick every unique
  // (color, applicator) present in the group's rows so the operator opens
  // Consistency Mode with the right matrix already selected.
  const handleLaunchShapeGroup = (group: ShapeGroup) => {
    const colorIds = new Set<string>();
    const fitmentIds = new Set<string>();

    for (const row of group.rows) {
      const colorKey = row.glass_color ?? "";
      const colorOpt = GLASS_COLOR_TO_OPTION[colorKey];
      if (colorOpt) colorIds.add(colorOpt);

      // applicator_types can hold multiple comma-separated values
      const apps = (row.applicator_types ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const app of apps) {
        const fitOpt = APPLICATOR_TO_FITMENT[app];
        if (fitOpt) fitmentIds.add(fitOpt);
      }
    }

    const shapeLabel =
      `${group.family}` +
      (group.capacityMl != null ? ` · ${group.capacityMl}ml` : "") +
      (group.threadSize ? ` · ${group.threadSize}` : "");

    writePipelinePrefill({
      shapeKey: group.key,
      shapeLabel,
      pipelineGroupIds: group.rows.map((r) => r.id),
      bottleColorIds: Array.from(colorIds),
      fitmentIds: Array.from(fitmentIds),
      family: group.family,
      capacityMl: group.capacityMl,
      threadSize: group.threadSize,
    });

    navigate("/darkroom?mode=consistency&from=pipeline");
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (flagLoading) {
    return <FullPageSpinner label="Checking permissions…" />;
  }

  if (!enabled) {
    return <FeatureDisabledNotice />;
  }

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[var(--darkroom-text,#e8e6e0)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header + stats */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Best Bottles Grid Pipeline</h1>
            <p className="text-sm text-white/60 mt-1">
              Hero-image tracker for the {stats.total} product groups in the
              Best Bottles catalog. Launch Consistency Mode for a whole shape
              group at once; status updates as you approve.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || !organizationId}
            >
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Import CSV
            </Button>
          </div>
        </header>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total groups" value={stats.total} />
          <StatCard label="Heroes done" value={stats.withHero} tone="ok" />
          <StatCard label="In progress" value={stats.inProgress} tone="live" />
          <StatCard label="Remaining" value={stats.remaining} tone="warn" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-white/50 uppercase tracking-wider">
            <Filter className="w-3 h-3" />
            Filters
          </div>

          <FilterChip
            label="All families"
            active={familyFilter === "all"}
            onClick={() => setFamilyFilter("all")}
          />
          {families.map((f) => (
            <FilterChip
              key={f}
              label={f}
              active={familyFilter === f}
              onClick={() => setFamilyFilter(f)}
            />
          ))}

          <div className="w-px h-4 bg-white/10 mx-1" />

          <FilterChip
            label="All status"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <FilterChip
            label="Needs hero"
            active={statusFilter === "no-hero"}
            onClick={() => setStatusFilter("no-hero")}
          />
          <FilterChip
            label="Has hero"
            active={statusFilter === "has-hero"}
            onClick={() => setStatusFilter("has-hero")}
          />
          <FilterChip
            label="In progress"
            active={statusFilter === "generating"}
            onClick={() => setStatusFilter("generating")}
          />
        </div>

        {/* Shape group cards */}
        {rowsLoading ? (
          <FullPageSpinner label="Loading pipeline…" />
        ) : shapeGroups.length === 0 ? (
          <EmptyState
            onImport={() => fileInputRef.current?.click()}
            hasAnyRows={rows.length > 0}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shapeGroups.map((group) => (
              <ShapeGroupCard
                key={group.key}
                group={group}
                onLaunch={() => handleLaunchShapeGroup(group)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "live" | "warn";
}) {
  return (
    <Card
      className={cn(
        "p-3 border-white/[0.06] bg-white/[0.02] text-white",
        tone === "ok" && "border-emerald-500/25",
        tone === "live" && "border-amber-500/25",
        tone === "warn" && "border-rose-500/25",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 text-white">{value}</div>
    </Card>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded text-xs border transition-all",
        active
          ? "border-white/50 bg-white/10 text-white"
          : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/20",
      )}
    >
      {label}
    </button>
  );
}

function ShapeGroupCard({
  group,
  onLaunch,
}: {
  group: ShapeGroup;
  onLaunch: () => void;
}) {
  const withHero = group.rows.filter(
    (r) => r.legacy_has_hero_image || r.madison_status === "approved" || r.madison_status === "synced",
  ).length;
  const label =
    `${group.family}` +
    (group.capacityMl != null ? ` · ${group.capacityMl}ml` : "") +
    (group.threadSize ? ` · ${group.threadSize}` : "");

  return (
    <Card className="p-4 border-white/[0.06] bg-white/[0.02] text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-xs text-white/50 mt-0.5">
            {group.rows.length} {group.rows.length === 1 ? "product" : "products"} ·
            {" "}
            <span className={withHero === group.rows.length ? "text-emerald-400" : "text-amber-400"}>
              {withHero}/{group.rows.length} heroes
            </span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onLaunch}
          className="bg-[var(--darkroom-accent,#B8956A)] text-black hover:bg-[var(--darkroom-accent,#B8956A)]/90"
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Launch
        </Button>
      </div>

      {/* SKU list */}
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
        {group.rows.map((row) => (
          <SkuRow key={row.id} row={row} />
        ))}
      </div>
    </Card>
  );
}

function SkuRow({ row }: { row: PipelineGroup }) {
  const done =
    row.legacy_has_hero_image ||
    row.madison_status === "approved" ||
    row.madison_status === "synced";
  const inProgress =
    row.madison_status === "queued" ||
    row.madison_status === "generating" ||
    row.madison_status === "generated" ||
    row.madison_status === "qa-pending";

  return (
    <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white/[0.03] transition-colors">
      {done ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
      ) : inProgress ? (
        <Loader2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-spin" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
      )}
      <span className="flex-1 truncate text-white/80">{row.display_name}</span>
      {row.applicator_types ? (
        <Badge
          variant="outline"
          className="text-[9px] font-mono uppercase tracking-wider border-white/[0.1] text-white/50"
        >
          {row.applicator_types.split(",")[0].trim()}
        </Badge>
      ) : null}
      <StatusPill status={row.madison_status} />
    </div>
  );
}

function StatusPill({ status }: { status: PipelineStatus }) {
  const palette: Record<PipelineStatus, string> = {
    "not-started": "border-white/10 text-white/40",
    queued: "border-sky-500/30 text-sky-400",
    generating: "border-amber-500/30 text-amber-400",
    generated: "border-violet-500/30 text-violet-400",
    "qa-pending": "border-amber-500/30 text-amber-400",
    approved: "border-emerald-500/30 text-emerald-400",
    rejected: "border-rose-500/30 text-rose-400",
    synced: "border-emerald-500/40 text-emerald-300",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border",
        palette[status],
      )}
    >
      {status}
    </span>
  );
}

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/50">
      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
      {label}
    </div>
  );
}

function FeatureDisabledNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center text-white/60 p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-white">Grid Pipeline unavailable</h1>
        <p className="text-sm">
          This workspace doesn't have the Grid Pipeline feature enabled. Ask an
          admin to flip <code className="text-xs bg-white/5 px-1 py-0.5 rounded">brand_config.features.grid_pipeline</code> to{" "}
          <code className="text-xs bg-white/5 px-1 py-0.5 rounded">true</code> on the organization.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  onImport,
  hasAnyRows,
}: {
  onImport: () => void;
  hasAnyRows: boolean;
}) {
  return (
    <Card className="p-8 border-dashed border-white/10 bg-white/[0.02] text-center">
      <h3 className="text-white font-medium">
        {hasAnyRows ? "No groups match your filters" : "No pipeline groups yet"}
      </h3>
      <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">
        {hasAnyRows
          ? "Adjust the filters above to see more groups, or import a fresh CSV from the best-bottles-website repo's Grid-Image-Tracker."
          : "Export Grid-Image-Tracker.xlsx from the best-bottles-website repo as CSV and upload it here to seed the pipeline."}
      </p>
      {!hasAnyRows ? (
        <Button className="mt-4" onClick={onImport}>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      ) : null}
    </Card>
  );
}
