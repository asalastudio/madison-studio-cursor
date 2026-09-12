import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";

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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildSanityPlacementMetadata,
  getDefaultSanityPlacementDestination,
  getSanityPlacementDestination,
  SANITY_PLACEMENT_DESTINATIONS,
  type SanityPlacementDestinationKey,
  validateSanityPlacementForm,
} from "@/lib/sanityPlacementUi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type SanityMediaPlacementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string | null;
  image: {
    image_url: string;
    session_name?: string | null;
    final_prompt?: string | null;
  } | null;
  isBestBottlesOrg: boolean;
  initialFamilySlug?: string | null;
  initialWebsiteSku?: string | null;
  initialGraceSku?: string | null;
};

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

type PlacementTarget = {
  label: string;
  metadata?: Record<string, unknown> | null;
  hasImage?: boolean;
};

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
  const [documentId, setDocumentId] = useState("");
  // Server-offered targets, so nobody has to know a Sanity document id.
  const [targets, setTargets] = useState<PlacementTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<string>("");
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
    const nextDestination = getDefaultSanityPlacementDestination({
      familySlug: initialFamilySlug,
    });
    setDestinationKey(nextDestination);
    setDocumentId("");
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

  // Ask the server which documents this destination can actually target. The
  // picker replaces the old free-text "Sanity document ID" field; the chosen
  // item's metadata is what the publisher's selector_query consumes.
  useEffect(() => {
    if (!open || !organizationId || !destinationKey) return;
    let cancelled = false;

    setTargetsLoading(true);
    setTargetsError(null);
    setTargets([]);
    setSelectedTargetIndex("");

    supabase.functions
      .invoke("push-sanity-placement", {
        body: { action: "targets", organizationId, destinationKey },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const rows: PlacementTarget[] = Array.isArray(data?.targets) ? data.targets : [];
        setTargets(rows);
        if (rows.length === 1) setSelectedTargetIndex("0");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTargetsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setTargetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, organizationId, destinationKey]);

  const destination = useMemo(
    () => getSanityPlacementDestination(destinationKey),
    [destinationKey],
  );

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
      documentId,
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
        documentId,
        altText,
        caption,
        familySlug,
        role,
        websiteSku,
        graceSku,
      });

      // The picked target carries whatever the destination's selector needs
      // (slug, groupSlug + kind, ...). Explicit form fields still win.
      const picked = selectedTargetIndex ? targets[Number(selectedTargetIndex)] : null;
      if (picked?.metadata) {
        for (const [key, value] of Object.entries(picked.metadata)) {
          // The metadata payload is string-valued; targets only ever carry
          // identifying strings (slug, groupSlug, kind).
          if (typeof value !== "string" || value.length === 0) continue;
          if (metadata[key] == null || metadata[key] === "") metadata[key] = value;
        }
      }
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

      toast({
        title: dryRun ? "Sanity dry run passed" : "Pushed to Sanity",
        description: dryRun
          ? "The destination resolved without writing media."
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--darkroom-surface)] border-[var(--darkroom-border)] text-[var(--darkroom-text)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Push to Sanity</DialogTitle>
          <DialogDescription className="text-[var(--darkroom-text)]/70">
            Send this media to a configured Sanity document field. Sanity remains the publishing
            surface for homepage, family, and editorial decisions.
          </DialogDescription>
        </DialogHeader>

        {image && (
          <div className="flex gap-3 items-center">
            <img
              src={image.image_url}
              alt=""
              className="w-20 h-20 rounded-md object-cover border border-[var(--darkroom-border)] shrink-0"
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
              onValueChange={(value) => setDestinationKey(value as SanityPlacementDestinationKey)}
              disabled={isPushing}
            >
              <SelectTrigger
                id="sanity-placement-destination"
                className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SANITY_PLACEMENT_DESTINATIONS.map((destinationOption) => (
                  <SelectItem key={destinationOption.key} value={destinationOption.key}>
                    {destinationOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sanity-target">Where it goes</Label>
              {targetsLoading ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-[var(--darkroom-border)] bg-[var(--darkroom-bg)] px-3 text-sm text-[var(--darkroom-text-dim)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading destinations…
                </div>
              ) : targets.length > 0 ? (
                <Select
                  value={selectedTargetIndex}
                  onValueChange={setSelectedTargetIndex}
                  disabled={isPushing}
                >
                  <SelectTrigger
                    id="sanity-target"
                    className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                  >
                    <SelectValue placeholder="Choose where this image goes" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target, index) => (
                      <SelectItem key={`${target.label}-${index}`} value={String(index)}>
                        {target.label}
                        {target.hasImage ? " · replaces current image" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Input
                    id="sanity-target"
                    value={documentId}
                    onChange={(event) => setDocumentId(event.target.value)}
                    placeholder="Sanity document ID"
                    className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                    disabled={isPushing}
                  />
                  <p className="text-xs text-[var(--darkroom-text-dim)]">
                    {targetsError
                      ? `Could not load destinations: ${targetsError}`
                      : "No documents exist for this destination yet — create one in Sanity Studio, or enter a document ID."}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sanity-alt-text">Alt text</Label>
              <Input
                id="sanity-alt-text"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Describe the image"
                className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
                disabled={isPushing}
              />
            </div>
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
                    className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
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
                    className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
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
                  className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
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
                  className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
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
              className="bg-[var(--darkroom-bg)] border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="border-[var(--darkroom-border)] text-[var(--darkroom-text)]"
            onClick={() => onOpenChange(false)}
            disabled={isPushing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[var(--darkroom-accent)] hover:bg-[var(--darkroom-accent-hover)] text-[var(--darkroom-bg)]"
            onClick={() => void handlePush()}
            disabled={isPushing}
          >
            {isPushing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Push to Sanity
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
