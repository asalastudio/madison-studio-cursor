import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildSanityPlacementMetadata,
  getDefaultSanityPlacementDestination,
  getSanityPlacementDestination,
  SANITY_PLACEMENT_DESTINATIONS,
  SANITY_PLACEMENT_GROUPS,
  type SanityPlacementDestinationKey,
  type SanityPlacementTargetChoice,
  validateSanityPlacementForm,
} from "@/lib/sanityPlacementUi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type SanityMediaPlacementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string | null;
  image: {
    id?: string | null;
    image_url: string;
    session_name?: string | null;
    final_prompt?: string | null;
  } | null;
  isBestBottlesOrg: boolean;
  initialFamilySlug?: string | null;
  initialWebsiteSku?: string | null;
  initialGraceSku?: string | null;
};

type TargetsState =
  | { status: "idle" | "loading"; targets: SanityPlacementTargetChoice[] }
  | { status: "ready"; targets: SanityPlacementTargetChoice[] }
  | { status: "error"; targets: SanityPlacementTargetChoice[]; message: string };

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Stable identity for a picked target: its metadata is what addresses the field. */
function targetKey(target: SanityPlacementTargetChoice): string {
  return Object.entries(target.metadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

const fieldClassName =
  "bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]";

/**
 * Push one library image into one Sanity field.
 *
 * The destination decides where; the target decides which one. Homepage and
 * editorial destinations list their targets (a slide, a card, a post) from
 * the registry, so nobody types a document ID — that box asked for something
 * no destination actually used. Product destinations still take the SKU
 * truth the pipeline needs.
 */
export function SanityMediaPlacementDialog({
  open,
  onOpenChange,
  organizationId,
  image,
  isBestBottlesOrg,
  initialFamilySlug,
  initialWebsiteSku,
  initialGraceSku,
}: SanityMediaPlacementDialogProps) {
  const { toast } = useToast();
  const [destinationKey, setDestinationKey] = useState<SanityPlacementDestinationKey>(
    getDefaultSanityPlacementDestination({ familySlug: initialFamilySlug }),
  );
  const [target, setTarget] = useState<SanityPlacementTargetChoice | null>(null);
  const [targetsState, setTargetsState] = useState<TargetsState>({ status: "idle", targets: [] });
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [familySlug, setFamilySlug] = useState(initialFamilySlug ?? "");
  const [role, setRole] = useState("");
  const [websiteSku, setWebsiteSku] = useState(initialWebsiteSku ?? "");
  const [graceSku, setGraceSku] = useState(initialGraceSku ?? "");
  const [dryRun, setDryRun] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestinationKey(getDefaultSanityPlacementDestination({ familySlug: initialFamilySlug }));
    setTarget(null);
    setAltText(image?.session_name || image?.final_prompt || "");
    setCaption("");
    setFamilySlug(initialFamilySlug ?? "");
    setRole("");
    setWebsiteSku(initialWebsiteSku ?? "");
    setGraceSku(initialGraceSku ?? "");
    setDryRun(false);
  }, [
    image?.final_prompt,
    image?.session_name,
    initialFamilySlug,
    initialGraceSku,
    initialWebsiteSku,
    open,
  ]);

  const destination = useMemo(
    () => getSanityPlacementDestination(destinationKey),
    [destinationKey],
  );

  const loadTargets = useCallback(async () => {
    if (!organizationId || !destination?.pickTarget) {
      setTargetsState({ status: "idle", targets: [] });
      return;
    }
    setTargetsState({ status: "loading", targets: [] });
    try {
      const { data, error } = await supabase.functions.invoke("push-sanity-placement", {
        body: { action: "targets", organizationId, destinationKey: destination.key },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const targets = Array.isArray(data?.targets)
        ? (data.targets as SanityPlacementTargetChoice[])
        : [];
      setTargetsState({ status: "ready", targets });
      // One target is no choice; pre-select it. Several is a decision.
      setTarget(targets.length === 1 ? targets[0] : null);
    } catch (error) {
      setTargetsState({
        status: "error",
        targets: [],
        message: errorText(error, "Could not load targets from Sanity."),
      });
    }
  }, [destination?.key, destination?.pickTarget, organizationId]);

  useEffect(() => {
    if (!open) return;
    setTarget(null);
    void loadTargets();
  }, [open, loadTargets]);

  const handlePush = async () => {
    if (!image?.image_url) {
      toast({
        title: "Missing image",
        description: "This library item does not have an image URL.",
        variant: "destructive",
      });
      return;
    }
    if (!organizationId) {
      toast({
        title: "Missing organization",
        description: "Choose an organization before pushing to Sanity.",
        variant: "destructive",
      });
      return;
    }

    const validation = validateSanityPlacementForm({
      destinationKey,
      target,
      altText,
      caption,
      familySlug,
      role,
      websiteSku,
      graceSku,
      isBestBottlesOrg,
    });
    if (!validation.ok) {
      toast({
        title: "Sanity placement needs details",
        description: validation.errors.join(" "),
        variant: "destructive",
      });
      return;
    }

    setIsPushing(true);
    try {
      const metadata = buildSanityPlacementMetadata({
        destinationKey,
        target,
        altText,
        caption,
        familySlug,
        role,
        websiteSku,
        graceSku,
        generatedImageId: image.id ?? null,
      });
      const { data, error } = await supabase.functions.invoke(
        "push-sanity-placement",
        {
          body: {
            action: "publish",
            organizationId,
            destinationKey,
            imageUrl: image.image_url,
            metadata,
            dryRun,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const landedAsDraft = data?.publishMode === "draft";
      toast({
        title: dryRun
          ? "Sanity dry run passed"
          : landedAsDraft
            ? "Saved as a draft in Sanity"
            : "Pushed to Sanity",
        description: dryRun
          ? `Resolved ${target?.label ?? destination?.label ?? "the destination"} without writing media.`
          : landedAsDraft
            ? `${target?.label ?? "The target"} now has this image on its draft. Publish it in Sanity Studio to make it live.`
            : "The image was uploaded and patched into the configured Sanity field.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Sanity push failed",
        description: errorText(error, "Unable to push this image to Sanity."),
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  const selectedTargetKey = target ? targetKey(target) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Push to Sanity</DialogTitle>
          <DialogDescription className="text-[var(--darkroom-text)]/70">
            Pick where on the site this image goes. Homepage changes land as drafts;
            an editor publishes them in Sanity Studio.
          </DialogDescription>
        </DialogHeader>

        {image && (
          <div className="flex gap-3 items-center">
            <img
              src={image.image_url}
              alt=""
              className="w-20 h-20 rounded-md object-contain bg-[var(--darkroom-bg)] border border-[var(--darkroom-border)] shrink-0"
            />
            <p className="text-xs text-[var(--darkroom-text)]/60 line-clamp-4">
              {destination?.description}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sanity-placement-destination">Destination</Label>
            <Select
              value={destinationKey}
              onValueChange={(value) => {
                setDestinationKey(value as SanityPlacementDestinationKey);
                setTarget(null);
              }}
              disabled={isPushing}
            >
              <SelectTrigger id="sanity-placement-destination" className={fieldClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SANITY_PLACEMENT_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {SANITY_PLACEMENT_DESTINATIONS.filter((option) => option.group === group).map(
                      (option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {destination?.pickTarget && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sanity-placement-target">Where on the site</Label>
                {targetsState.status === "ready" && (
                  <span className="text-[11px] text-[var(--darkroom-text)]/50">
                    {targetsState.targets.length} target{targetsState.targets.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {targetsState.status === "loading" ? (
                <div className="flex items-center gap-2 text-sm text-[var(--darkroom-text)]/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading targets from Sanity…
                </div>
              ) : targetsState.status === "error" ? (
                <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--darkroom-border)] p-2 text-xs text-[var(--darkroom-text)]/70">
                  <span>{targetsState.message}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadTargets()}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                </div>
              ) : targetsState.status === "ready" && targetsState.targets.length === 0 ? (
                <p className="rounded-md border border-[var(--darkroom-border)] p-2 text-xs text-[var(--darkroom-text)]/70">
                  Nothing to push into yet — add the slide, card or post in Sanity Studio first,
                  then come back and pick it here.
                </p>
              ) : (
                <Select
                  value={selectedTargetKey}
                  onValueChange={(value) =>
                    setTarget(targetsState.targets.find((entry) => targetKey(entry) === value) ?? null)
                  }
                  disabled={isPushing || targetsState.status !== "ready"}
                >
                  <SelectTrigger id="sanity-placement-target" className={fieldClassName}>
                    <SelectValue placeholder="Choose a target" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetsState.targets.map((entry) => (
                      <SelectItem key={targetKey(entry)} value={targetKey(entry)}>
                        {entry.label}
                        {entry.hasImage ? " · replaces current image" : " · empty"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sanity-alt-text">Alt text</Label>
            <Input
              id="sanity-alt-text"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Describe the image"
              className={fieldClassName}
              disabled={isPushing}
            />
          </div>

          {(destination?.requiresFamilySlug || destination?.requiresRole) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {destination.requiresFamilySlug && (
                <div className="space-y-2">
                  <Label htmlFor="sanity-family-slug">Family slug</Label>
                  <Input
                    id="sanity-family-slug"
                    value={familySlug}
                    onChange={(event) => setFamilySlug(event.target.value)}
                    placeholder="e.g. sleek-5ml-clear-13-415-rollon"
                    className={fieldClassName}
                    disabled={isPushing}
                  />
                </div>
              )}
              {destination.requiresRole && (
                <div className="space-y-2">
                  <Label htmlFor="sanity-component-role">Component role</Label>
                  <Input
                    id="sanity-component-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="e.g. cap, pump, bottle"
                    className={fieldClassName}
                    disabled={isPushing}
                  />
                </div>
              )}
            </div>
          )}

          {isBestBottlesOrg && destination?.requiresBestBottlesSkuTruth && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sanity-website-sku">Website SKU</Label>
                <Input
                  id="sanity-website-sku"
                  value={websiteSku}
                  onChange={(event) => setWebsiteSku(event.target.value)}
                  placeholder="e.g. GB09BlackCapApp"
                  className={fieldClassName}
                  disabled={isPushing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sanity-grace-sku">Grace SKU</Label>
                <Input
                  id="sanity-grace-sku"
                  value={graceSku}
                  onChange={(event) => setGraceSku(event.target.value)}
                  placeholder="e.g. GB-CYL-CLR-9ML-T-01"
                  className={fieldClassName}
                  disabled={isPushing}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sanity-caption">Caption</Label>
            <Input
              id="sanity-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Optional"
              className={fieldClassName}
              disabled={isPushing}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--darkroom-text)]/80">
            <Checkbox
              checked={dryRun}
              onCheckedChange={(checked) => setDryRun(checked === true)}
              disabled={isPushing}
            />
            Test destination without writing media
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPushing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePush}
            disabled={isPushing || !image || (destination?.pickTarget && !target)}
            className="bg-brand-brass text-black hover:bg-brand-brass/90"
          >
            {isPushing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {dryRun ? "Test destination" : destination?.pickTarget ? "Push as draft" : "Push to Sanity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
