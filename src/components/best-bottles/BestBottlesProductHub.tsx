import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  PackageCheck,
  Search,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useBestBottlesProductHub,
  type BestBottlesMediaStatus,
  type BestBottlesProductGroupHub,
  type BestBottlesSyncStatus,
} from "@/hooks/useBestBottlesProductHub";
import type { PipelineSkuJob, PipelineSkuJobStatus } from "@/lib/bestBottlesPipeline";

type GroupStatusFilter =
  | "all"
  | "needs-reference"
  | "ready-to-generate"
  | "generated"
  | "approved"
  | "shopify-pushed"
  | "synced";

const STATUS_LABELS: Record<PipelineSkuJobStatus, string> = {
  "needs-reference": "Needs ref",
  "ready-to-generate": "Ready",
  queued: "Queued",
  generating: "Generating",
  generated: "Generated",
  "qa-pending": "Review",
  approved: "Approved",
  rejected: "Rejected",
  "shopify-pushed": "Shopify",
  synced: "Convex",
};

function statusBadgeClass(status: PipelineSkuJobStatus): string {
  if (status === "synced") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700";
  if (status === "shopify-pushed") return "border-teal-500/40 bg-teal-500/10 text-teal-700";
  if (status === "approved") return "border-green-500/40 bg-green-500/10 text-green-700";
  if (status === "generated" || status === "qa-pending") return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  if (status === "ready-to-generate" || status === "queued" || status === "generating") {
    return "border-blue-500/40 bg-blue-500/10 text-blue-700";
  }
  if (status === "rejected") return "border-red-500/40 bg-red-500/10 text-red-700";
  return "border-muted-foreground/30 bg-muted text-muted-foreground";
}

function groupMatchesStatus(group: BestBottlesProductGroupHub, status: GroupStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "generated") return group.counts.generatedOrReview > 0;
  if (status === "approved") return group.counts.approvedOrLater > 0;
  if (status === "shopify-pushed") return group.counts.shopifyPushedOrLater > 0;
  if (status === "synced") return group.counts.convexSynced > 0;
  if (status === "ready-to-generate") return group.counts.ready > 0;
  return group.counts[status] > 0;
}

function groupMatchesMedia(group: BestBottlesProductGroupHub, status: BestBottlesMediaStatus): boolean {
  if (status === "all") return true;
  if (status === "has-primary") return group.hasPrimaryMedia;
  if (status === "missing-primary") return !group.hasPrimaryMedia;
  if (status === "has-approved") return group.hasApprovedMedia;
  return !group.hasApprovedMedia;
}

function groupMatchesSync(group: BestBottlesProductGroupHub, status: BestBottlesSyncStatus): boolean {
  if (status === "all") return true;
  if (status === "not-pushed") return group.counts.shopifyPushedOrLater === 0;
  if (status === "shopify-pushed") return group.counts.shopifyPushedOrLater > 0;
  if (status === "convex-synced") return group.counts.convexSynced > 0;
  if (status === "needs-seo") return !group.hasSeo;
  return !group.hasSpecs;
}

function bestGroupImage(group: BestBottlesProductGroupHub): string | null {
  return (
    group.productHub?.hero_image_url ||
    group.approvedImageUrl ||
    group.shopifyImageUrl ||
    group.generatedImageUrl ||
    group.referenceImageUrl ||
    null
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  helper?: string;
  icon: typeof Boxes;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <Card
      className={cn(
        "border-border bg-card",
        tone === "warning" && "border-amber-500/30",
        tone === "success" && "border-emerald-500/30",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        {helper && <p className="mt-2 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  );
}

function StatusPills({ group }: { group: BestBottlesProductGroupHub }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {group.counts.needsReference > 0 && (
        <Badge variant="outline" className="border-amber-500/40 text-amber-700">
          {group.counts.needsReference} needs ref
        </Badge>
      )}
      {group.counts.ready > 0 && (
        <Badge variant="outline" className="border-blue-500/40 text-blue-700">
          {group.counts.ready} ready
        </Badge>
      )}
      {group.counts.generatedOrReview > 0 && (
        <Badge variant="outline" className="border-purple-500/40 text-purple-700">
          {group.counts.generatedOrReview} generated
        </Badge>
      )}
      {group.counts.approvedOrLater > 0 && (
        <Badge variant="outline" className="border-green-500/40 text-green-700">
          {group.counts.approvedOrLater} approved
        </Badge>
      )}
      {group.counts.shopifyPushedOrLater > 0 && (
        <Badge variant="outline" className="border-teal-500/40 text-teal-700">
          {group.counts.shopifyPushedOrLater} Shopify
        </Badge>
      )}
      {group.counts.convexSynced > 0 && (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
          {group.counts.convexSynced} Convex
        </Badge>
      )}
    </div>
  );
}

function QualityBadges({ group }: { group: BestBottlesProductGroupHub }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className={group.hasSeo ? "border-emerald-500/40 text-emerald-700" : "border-amber-500/40 text-amber-700"}>
        {group.hasSeo ? "SEO" : "Needs SEO"}
      </Badge>
      <Badge variant="outline" className={group.hasSpecs ? "border-emerald-500/40 text-emerald-700" : "border-amber-500/40 text-amber-700"}>
        {group.hasSpecs ? "Specs" : "Needs specs"}
      </Badge>
      {!group.hasSpecs && group.missingSpecFields.length > 0 && (
        <Badge
          variant="outline"
          className="max-w-[220px] truncate border-amber-500/30 text-amber-700"
          title={group.missingSpecFields.join(", ")}
        >
          Missing {group.missingSpecFields.slice(0, 2).join(", ")}
          {group.missingSpecFields.length > 2 ? ` +${group.missingSpecFields.length - 2}` : ""}
        </Badge>
      )}
      <Badge variant="outline" className={group.hasPrimaryMedia ? "border-emerald-500/40 text-emerald-700" : "border-muted-foreground/30 text-muted-foreground"}>
        {group.hasPrimaryMedia ? "Primary" : "No primary"}
      </Badge>
    </div>
  );
}

function SkuRows({ jobs }: { jobs: Array<PipelineSkuJob & { is_report_only?: boolean }> }) {
  if (jobs.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/30 text-sm text-muted-foreground">
          No SKU jobs have been seeded for this product group yet.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {jobs.map((job) => (
        <TableRow key={job.id} className="bg-muted/20 hover:bg-muted/30">
          <TableCell className="pl-12 font-mono text-xs">{job.grace_sku}</TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{job.website_sku}</TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{job.shopify_sku || "—"}</TableCell>
          <TableCell>{job.capacity_ml ? `${job.capacity_ml} ml` : "—"}</TableCell>
          <TableCell>{job.applicator || "—"}</TableCell>
          <TableCell>{job.canonical_color || "—"}</TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className={statusBadgeClass(job.status)}>
                {STATUS_LABELS[job.status]}
              </Badge>
              {job.is_report_only && (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                  Report-only
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {job.shopify_pushed_at || job.shopify_image_url || job.shopify_media_id ? "Shopify" : "Not pushed"}
            {" · "}
            {job.convex_synced_at || job.status === "synced" ? "Convex synced" : "Convex pending"}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function MediaPreview({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {url ? (
        <img src={url} alt={label} className="h-36 w-full rounded-md border border-border object-contain bg-background" />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          No image
        </div>
      )}
    </div>
  );
}

export default function BestBottlesProductHub() {
  const navigate = useNavigate();
  const {
    groups,
    families,
    summary,
    isLoading,
    error,
    setPrimaryImageFromGroup,
    pushApprovedGroupToShopify,
  } = useBestBottlesProductHub();
  const [searchQuery, setSearchQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [groupStatusFilter, setGroupStatusFilter] = useState<GroupStatusFilter>("all");
  const [mediaStatusFilter, setMediaStatusFilter] = useState<BestBottlesMediaStatus>("all");
  const [syncStatusFilter, setSyncStatusFilter] = useState<BestBottlesSyncStatus>("all");
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.slug === selectedSlug) ?? null,
    [groups, selectedSlug],
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groups.filter((group) => {
      if (familyFilter !== "all" && group.family !== familyFilter) return false;
      if (!groupMatchesStatus(group, groupStatusFilter)) return false;
      if (!groupMatchesMedia(group, mediaStatusFilter)) return false;
      if (!groupMatchesSync(group, syncStatusFilter)) return false;
      if (!query) return true;
      return (
        group.displayName.toLowerCase().includes(query) ||
        group.slug.toLowerCase().includes(query) ||
        group.family.toLowerCase().includes(query) ||
        group.jobs.some((job) =>
          [job.grace_sku, job.website_sku, job.shopify_sku, job.applicator, job.canonical_color]
            .some((value) => String(value ?? "").toLowerCase().includes(query)),
        )
      );
    });
  }, [familyFilter, groupStatusFilter, groups, mediaStatusFilter, searchQuery, syncStatusFilter]);

  const toggleExpanded = (slug: string) => {
    setExpandedSlugs((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                Best Bottles mode
              </Badge>
              <Badge variant="secondary">PIM + DAM</Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Best Bottles Product Hub</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Product group hierarchy, SKU workflow state, Shopify/Convex visibility, and Product Hub media assignment in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/best-bottles/pipeline")}>
              <Layers className="mr-2 h-4 w-4" />
              Pipeline
            </Button>
            <Button variant="outline" onClick={() => navigate("/image-library")}>
              <ImageIcon className="mr-2 h-4 w-4" />
              Library
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
          <SummaryCard label="Groups" value={summary.totalGroups} icon={Boxes} />
          <SummaryCard
            label="SKUs"
            value={summary.totalSkus}
            helper={`${summary.liveSkus} live · ${summary.reportOnlySkus} report-only`}
            icon={Layers}
          />
          <SummaryCard
            label="Needs Specs"
            value={summary.missingSpecs}
            helper={`${Math.max(summary.totalGroups - summary.missingSpecs, 0)} complete`}
            icon={TriangleAlert}
            tone={summary.missingSpecs > 0 ? "warning" : "success"}
          />
          <SummaryCard label="Needs SEO" value={summary.missingSeo} icon={Search} tone="warning" />
          <SummaryCard label="No Primary" value={summary.missingPrimaryMedia} icon={ImageIcon} tone="warning" />
          <SummaryCard label="Generated" value={summary.generated} icon={Sparkles} />
          <SummaryCard label="Approved" value={summary.approved} icon={CheckCircle2} tone="success" />
          <SummaryCard label="Shopify" value={summary.shopifyPushed} icon={ShoppingBag} tone="success" />
          <SummaryCard label="Convex" value={summary.convexSynced} icon={Database} tone="success" />
        </div>

        <Card className="mb-5 border-border bg-card">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search group, SKU, applicator, color..."
                className="pl-9"
              />
            </div>
            <Select value={familyFilter} onValueChange={setFamilyFilter}>
              <SelectTrigger className="w-full lg:w-[210px]">
                <SelectValue placeholder="Family" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
                {families.map((family) => (
                  <SelectItem key={family} value={family}>
                    {family}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={groupStatusFilter} onValueChange={(value) => setGroupStatusFilter(value as GroupStatusFilter)}>
              <SelectTrigger className="w-full lg:w-[190px]">
                <SelectValue placeholder="Workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workflow</SelectItem>
                <SelectItem value="needs-reference">Needs reference</SelectItem>
                <SelectItem value="ready-to-generate">Ready</SelectItem>
                <SelectItem value="generated">Generated/review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="shopify-pushed">Shopify pushed</SelectItem>
                <SelectItem value="synced">Convex synced</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mediaStatusFilter} onValueChange={(value) => setMediaStatusFilter(value as BestBottlesMediaStatus)}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Media" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All media</SelectItem>
                <SelectItem value="has-primary">Has primary</SelectItem>
                <SelectItem value="missing-primary">Missing primary</SelectItem>
                <SelectItem value="has-approved">Has approved</SelectItem>
                <SelectItem value="missing-approved">Missing approved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={syncStatusFilter} onValueChange={(value) => setSyncStatusFilter(value as BestBottlesSyncStatus)}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Sync/QA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sync</SelectItem>
                <SelectItem value="not-pushed">Not pushed</SelectItem>
                <SelectItem value="shopify-pushed">Shopify pushed</SelectItem>
                <SelectItem value="convex-synced">Convex synced</SelectItem>
                <SelectItem value="needs-seo">Needs SEO</SelectItem>
                <SelectItem value="needs-specs">Needs specs</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-destructive">{error.message}</div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-12 text-center">
                <PackageCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <h3 className="font-medium text-foreground">No product groups match these filters</h3>
                <p className="mt-1 text-sm text-muted-foreground">Clear one of the filters or seed SKU jobs from the Best Bottles pipeline.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[34%]">Product group</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead>Specs</TableHead>
                    <TableHead>SKU jobs</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => {
                    const expanded = expandedSlugs.has(group.slug);
                    const preview = bestGroupImage(group);
                    return (
                      <Fragment key={group.slug}>
                        <TableRow className="cursor-pointer" onClick={() => toggleExpanded(group.slug)}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                                {preview ? (
                                  <img src={preview} alt="" className="h-full w-full object-contain" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{group.displayName}</p>
                                <p className="truncate font-mono text-xs text-muted-foreground">{group.slug}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{group.family}</p>
                            <p className="text-xs text-muted-foreground">{group.category || "Uncategorized"}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{group.capacityMl ? `${group.capacityMl} ml` : "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {[group.threadSize, group.material, group.canonicalColor]
                                .filter(Boolean)
                                .join(" · ") || "No stored specs"}
                            </p>
                            {group.heightWithoutCapMm && group.diameterMm && (
                              <p className="text-xs text-muted-foreground">
                                {group.heightWithoutCapMm} x {group.diameterMm} mm
                              </p>
                            )}
                            {!group.hasSpecs && (
                              <p className="mt-1 max-w-[220px] truncate text-xs text-amber-700" title={group.missingSpecFields.join(", ")}>
                                Missing {group.missingSpecFields.join(", ")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="mb-2 text-sm font-medium">{group.counts.total} SKU{group.counts.total === 1 ? "" : "s"}</p>
                            <StatusPills group={group} />
                          </TableCell>
                          <TableCell>
                            <QualityBadges group={group} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                              <Button variant="outline" size="sm" onClick={() => setSelectedSlug(group.slug)}>
                                Details
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => navigate(`/best-bottles/studio/${group.slug}`)}>
                                Studio
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <SkuRows jobs={group.jobs} />
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedSlug(null)}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-3xl">
          {selectedGroup && (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border p-6">
                <div className="flex items-start justify-between gap-4 pr-6">
                  <div>
                    <SheetTitle className="text-2xl">{selectedGroup.displayName}</SheetTitle>
                    <SheetDescription className="mt-2 font-mono text-xs">
                      {selectedGroup.slug}
                    </SheetDescription>
                  </div>
                  <Badge variant="outline">{selectedGroup.family}</Badge>
                </div>
              </SheetHeader>

              <ScrollArea className="flex-1">
                <div className="space-y-6 p-6">
                  <section>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Canonical Product Fields</h3>
                    <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                      <DetailField label="Family" value={selectedGroup.family} />
                      <DetailField label="Category" value={selectedGroup.category} />
                      <DetailField label="Capacity" value={selectedGroup.capacityMl ? `${selectedGroup.capacityMl} ml` : null} />
                      <DetailField label="Thread / finish" value={selectedGroup.threadSize} />
                      <DetailField label="Material" value={selectedGroup.material} />
                      <DetailField label="Color" value={selectedGroup.canonicalColor} />
                      <DetailField
                        label="Dimensions"
                        value={
                          selectedGroup.heightWithoutCapMm && selectedGroup.diameterMm
                            ? `${selectedGroup.heightWithoutCapMm} x ${selectedGroup.diameterMm} mm`
                            : null
                        }
                      />
                      <DetailField label="Catalog pages" value={selectedGroup.catalogReferencePages} />
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product Hub Copy + QA</h3>
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-4 flex flex-wrap gap-2">
                        <QualityBadges group={selectedGroup} />
                      </div>
                      {!selectedGroup.hasSpecs && (
                        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
                          Missing Product Hub specs: {selectedGroup.missingSpecFields.join(", ")}
                        </div>
                      )}
                      {selectedGroup.hasSpecs && (
                        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
                          Product Hub specs are complete for the required Best Bottles fields.
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DetailField label="SEO title" value={selectedGroup.productHub?.seo_title} />
                        <DetailField label="SEO description" value={selectedGroup.productHub?.seo_description} />
                        <DetailField label="Short description" value={selectedGroup.productHub?.short_description} />
                        <DetailField label="Long description" value={selectedGroup.productHub?.long_description} />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Media</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MediaPreview label="Product Hub primary" url={selectedGroup.productHub?.hero_image_url ?? null} />
                      <MediaPreview label="Reference" url={selectedGroup.referenceImageUrl} />
                      <MediaPreview label="Approved" url={selectedGroup.approvedImageUrl} />
                      <MediaPreview label="Shopify" url={selectedGroup.shopifyImageUrl} />
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">SKU Variants</h3>
                    <div className="rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Grace SKU</TableHead>
                            <TableHead>Website</TableHead>
                            <TableHead>Shopify</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedGroup.jobs.map((job) => (
                            <TableRow key={job.id}>
                              <TableCell className="font-mono text-xs">{job.grace_sku}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{job.website_sku}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{job.shopify_sku || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusBadgeClass(job.status)}>
                                  {STATUS_LABELS[job.status]}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </div>
              </ScrollArea>

              <Separator />
              <SheetFooter className="gap-2 p-4 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate(`/best-bottles/studio/${selectedGroup.slug}`)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Studio
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/image-library?bestBottlesGroup=${selectedGroup.slug}`)}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Library
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      (!selectedGroup.approvedImageUrl && !selectedGroup.generatedImageUrl) ||
                      setPrimaryImageFromGroup.isPending
                    }
                    onClick={() => setPrimaryImageFromGroup.mutate(selectedGroup)}
                  >
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Set primary
                  </Button>
                  <Button
                    disabled={selectedGroup.counts.approved === 0 || pushApprovedGroupToShopify.isPending}
                    onClick={() => pushApprovedGroupToShopify.mutate(selectedGroup)}
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Push approved
                  </Button>
                </div>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
