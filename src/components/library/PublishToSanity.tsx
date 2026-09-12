/**
 * Publish to Sanity Component
 *
 * Allows users to push Madison Studio content to Sanity.io
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProductSelector } from "@/components/forge/ProductSelector";
import type { Product } from "@/hooks/useProducts";
import { Loader2, CheckCircle2, XCircle, ExternalLink, ImagePlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ImageLibraryModal } from "@/components/image-editor/ImageLibraryModal";

/** The Best Bottles journal's six categories — the site's schema, verbatim. */
const JOURNAL_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "packaging-101", label: "Packaging 101" },
  { value: "fragrance-guides", label: "Fragrance Guides" },
  { value: "brand-stories", label: "Brand Stories" },
  { value: "ingredient-science", label: "Ingredient Science" },
  { value: "how-to", label: "How-To" },
  { value: "industry-news", label: "Industry News" },
];

type PickedImage = { url: string; name: string };

/**
 * The Library names untitled images by date ("Image 9/12/2026"). That is no
 * alt text; leave it empty so the post falls back to its own title.
 */
function altTextFor(image: PickedImage): string | undefined {
  const name = image.name.trim();
  if (!name || /^Image \d/.test(name) || name === "Library image") return undefined;
  return name;
}

/**
 * supabase-js wraps a non-2xx reply in a FunctionsHttpError and hides the
 * body; the edge function puts the real reason in `{ error }`. Surface it.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const fallback = error instanceof Error && error.message ? error.message : "Failed to push to Sanity";
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Not a JSON body; fall through to the generic message.
    }
  }
  return fallback;
}

interface PublishToSanityProps {
  content: any;
  contentType: "master" | "derivative" | "output";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  buttonText?: string;
  /**
   * Best Bottles: the push builds a `journal` document (the site's blog
   * schema) with a hero image and inline images, instead of the legacy
   * Tarife journal entry. The edge function routes by the org's Sanity
   * connection; this flag only shapes the form.
   */
  bestBottles?: boolean;
}

const SANITY_DOCUMENT_TYPES = {
  master: [
    { value: "post", label: "Blog Post" },
    { value: "blog_article", label: "Blog Article" },
    { value: "journal", label: "Journal Entry" },
    { value: "fieldJournal", label: "Field Journal" },
    { value: "article", label: "Article" },
    { value: "emailCampaign", label: "Email Campaign" },
  ],
  derivative: [
    { value: "socialPost", label: "Social Media Post" },
    { value: "emailCampaign", label: "Email Campaign" },
  ],
  output: [
    { value: "contentDraft", label: "Content Draft" },
    { value: "post", label: "Blog Post" },
  ],
};

export function PublishToSanity({
  content,
  contentType,
  variant = "outline",
  size = "sm",
  buttonText = "Publish to Sanity",
  bestBottles = false,
}: PublishToSanityProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sanityDocumentType, setSanityDocumentType] = useState<string>("");
  const [category, setCategory] = useState<string>(""); // New Category State
  const [publish, setPublish] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    success: boolean;
    sanityDocumentId?: string;
    slug?: string;
    mode?: string;
    published?: boolean;
    error?: string;
  } | null>(null);
  // Journal lane images: one hero, up to eight inline.
  const [heroImage, setHeroImage] = useState<PickedImage | null>(null);
  const [inlineImages, setInlineImages] = useState<PickedImage[]>([]);
  const [pickerTarget, setPickerTarget] = useState<"hero" | "inline" | null>(null);

  const availableTypes = SANITY_DOCUMENT_TYPES[contentType] || [];

  const handlePush = async () => {
    const documentType = bestBottles ? "journal" : sanityDocumentType;
    if (!documentType) {
      toast({
        title: "Select document type",
        description: "Please choose a Sanity document type",
        variant: "destructive",
      });
      return;
    }
    if (bestBottles && !category) {
      toast({
        title: "Choose a category",
        description: "The journal needs one of its six categories before it can list the post.",
        variant: "destructive",
      });
      return;
    }

    setIsPushing(true);
    setSyncStatus(null);

    try {
      const { data, error } = await supabase.functions.invoke("push-to-sanity", {
        body: {
          contentId: content.id,
          contentType,
          sanityDocumentType: documentType,
          // Pass category if selected
          category: category || undefined,
          organizationId: content.organization_id,
          linkedProductId: selectedProduct?.id,
          linkedProductName: selectedProduct?.name,
          publish,
          heroImageUrl: bestBottles ? heroImage?.url : undefined,
          inlineImages: bestBottles
            ? inlineImages.map((image) => ({ url: image.url, alt: altTextFor(image) }))
            : undefined,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setSyncStatus({
        success: true,
        sanityDocumentId: data?.sanityDocumentId,
        slug: data?.slug,
        mode: data?.mode,
        published: Boolean(data?.published),
      });

      toast({
        title: data?.mode === "journal"
          ? data?.published ? "Published to the journal" : "Saved as a journal draft"
          : "✅ Published to Sanity",
        description: data?.mode === "journal"
          ? data?.published
            ? `Live at /blog/${data?.slug}.`
            : `Draft "${data?.slug}" is waiting in Sanity Studio — publish it there to make it live.`
          : `Content successfully synced to Sanity${publish ? " and published" : " as draft"}`,
      });

      // Auto-close after 2 seconds on success
      setTimeout(() => {
        setOpen(false);
        setSyncStatus(null);
      }, 2000);
    } catch (error: unknown) {
      console.error("Error pushing to Sanity:", error);
      const message = await describeFunctionError(error);
      setSyncStatus({
        success: false,
        error: message,
      });

      toast({
        title: "❌ Failed to publish",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  const getSanityStudioUrl = () => {
    // TODO (Backlog): Make this configurable per organization via settings
    // Tarife Attar uses a self-hosted Sanity Studio at their website
    const studioBaseUrl = "https://www.tarifeattar.com/studio";
    if (syncStatus?.sanityDocumentId) {
      // Link directly to the document in Sanity Studio
      return `${studioBaseUrl}/structure/post;${syncStatus.sanityDocumentId}`;
    }
    return studioBaseUrl;
  };

  // Check if we need to show category selector
  const showCategorySelector = sanityDocumentType === "journal" || sanityDocumentType === "fieldJournal";

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant={variant}
        size={size}
        className="gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        {buttonText}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Publish to Sanity</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              {bestBottles
                ? "Creates a journal post on the Best Bottles site: category, excerpt and read time are derived here; images go in as a hero and inline pictures. Saved as a draft unless you publish."
                : "Push this content to your Sanity.io project. Choose the document type and publishing option."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Content Info */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-sm font-medium text-foreground mb-1">
                {content.title || "Untitled Content"}
              </div>
              <div className="text-xs text-muted-foreground">
                Type: {content.content_type || content.asset_type || contentType}
              </div>
            </div>

            {/* Product Linking */}
            {!bestBottles && (
            <div className="space-y-2">
              <Label>Link to Product (Optional)</Label>
              <ProductSelector
                value={selectedProduct?.name || ""}
                onSelect={setSelectedProduct}
                buttonClassName="w-full justify-between"
                className="w-full"
                showLabel={false}
              />
              <p className="text-[10px] text-muted-foreground">
                Linking to a product helps Sanity display this entry on that fragrance's page.
              </p>
            </div>
            )}

            {/* Document Type Selection */}
            {!bestBottles && (
            <div className="space-y-2">
              <Label htmlFor="sanity-type">Sanity Document Type</Label>
              <Select
                value={sanityDocumentType}
                onValueChange={setSanityDocumentType}
                disabled={isPushing}
              >
                <SelectTrigger id="sanity-type">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Category Selection (Conditional) */}
            {(bestBottles || showCategorySelector) && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={category}
                  onValueChange={setCategory}
                  disabled={isPushing}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select journal category" />
                  </SelectTrigger>
                  <SelectContent>
                    {bestBottles ? (
                      JOURNAL_CATEGORIES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="field-notes">Field Notes</SelectItem>
                        <SelectItem value="behind-the-blend">Behind the Blend</SelectItem>
                        <SelectItem value="territory-spotlight">Territory Spotlight</SelectItem>
                        <SelectItem value="collector-archives">Collector Archives</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Images (journal lane) */}
            {bestBottles && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Hero image</Label>
                  {heroImage ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                      <img src={heroImage.url} alt="" className="h-12 w-12 rounded object-cover" />
                      <span className="min-w-0 flex-1 truncate text-xs">{heroImage.name}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setHeroImage(null)} disabled={isPushing} aria-label="Remove hero image">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => setPickerTarget("hero")} disabled={isPushing}>
                      <ImagePlus className="h-4 w-4" />
                      Choose from Library
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">Shown at the top of the post and in the journal listing. Optional.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Inline images</Label>
                    <span className="text-[10px] text-muted-foreground">{inlineImages.length}/8</span>
                  </div>
                  {inlineImages.length > 0 && (
                    <ul className="space-y-1">
                      {inlineImages.map((image, index) => (
                        <li key={`${image.url}-${index}`} className="flex items-center gap-3 rounded-lg border border-border p-2">
                          <img src={image.url} alt="" className="h-10 w-10 rounded object-cover" />
                          <span className="min-w-0 flex-1 truncate text-xs">{index + 1}. {image.name}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setInlineImages((prev) => prev.filter((_, i) => i !== index))} disabled={isPushing} aria-label={`Remove image ${index + 1}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => setPickerTarget("inline")} disabled={isPushing || inlineImages.length >= 8}>
                    <ImagePlus className="h-4 w-4" />
                    Add an image
                  </Button>
                  <p className="text-[10px] text-muted-foreground">Placed one per section after its first paragraph, in this order. Any image already written into the text is kept too.</p>
                </div>
              </div>
            )}

            {/* Publish Option */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="publish"
                checked={publish}
                onCheckedChange={(checked) => setPublish(checked === true)}
                disabled={isPushing}
              />
              <Label
                htmlFor="publish"
                className="text-sm font-normal cursor-pointer"
              >
                {bestBottles
                  ? "Publish now (otherwise saved as a draft to review in Sanity Studio)"
                  : "Publish immediately (otherwise saved as draft)"}
              </Label>
            </div>

            {/* Sync Status */}
            {syncStatus && (
              <div
                className={`rounded-lg border p-3 ${syncStatus.success
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : "border-red-500 bg-red-50 dark:bg-red-950"
                  }`}
              >
                <div className="flex items-center gap-2">
                  {syncStatus.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {syncStatus.success
                        ? "Successfully synced to Sanity"
                        : "Sync failed"}
                    </div>
                    {syncStatus.success && syncStatus.sanityDocumentId && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {syncStatus.mode === "journal" && syncStatus.slug
                          ? `${syncStatus.published ? "Live at" : "Draft for"} /blog/${syncStatus.slug}`
                          : `Document ID: ${syncStatus.sanityDocumentId}`}
                      </div>
                    )}
                    {syncStatus.error && (
                      <div className="text-xs text-red-600 mt-1">
                        {syncStatus.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setSyncStatus(null);
              }}
              disabled={isPushing}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePush}
              disabled={isPushing || (bestBottles ? !category : !sanityDocumentType)}
              className="gap-2"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Publish to Sanity
                </>
              )}
            </Button>
          </DialogFooter>

          {!bestBottles && syncStatus?.success && syncStatus.sanityDocumentId && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2"
                onClick={() => window.open(getSanityStudioUrl(), "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                Open in Sanity Studio
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {bestBottles && (
        <ImageLibraryModal
          open={pickerTarget !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPickerTarget(null);
          }}
          title={pickerTarget === "hero" ? "Choose the hero image" : "Add an image to the post"}
          allowDesktopUpload={false}
          onSelectImage={(image) => {
            const picked: PickedImage = { url: image.url, name: image.name || "Library image" };
            if (pickerTarget === "hero") {
              setHeroImage(picked);
            } else {
              setInlineImages((prev) => [...prev, picked].slice(0, 8));
            }
            setPickerTarget(null);
          }}
        />
      )}
    </>
  );
}



