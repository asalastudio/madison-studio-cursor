/**
 * Publish Product to Sanity Component
 *
 * Push Madison product data to Sanity.io for headless site display
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductHub } from "@/hooks/useProducts";

interface PublishProductToSanityProps {
  product: ProductHub;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function PublishProductToSanity({
  product,
  variant = "outline",
  size = "sm",
  className,
}: PublishProductToSanityProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    success: boolean;
    sanityDocumentId?: string;
    error?: string;
  } | null>(null);

  const handlePush = async () => {
    setIsPushing(true);
    setSyncStatus(null);

    try {
      const { data, error } = await supabase.functions.invoke("push-product-to-sanity", {
        body: {
          productId: product.id,
          publish: true,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setSyncStatus({
        success: true,
        sanityDocumentId: data?.sanityDocumentId,
      });

      toast({
        title: "✅ Product synced to Sanity",
        description: `"${product.name}" is now available on your headless site`,
      });

      // Auto-close after success
      setTimeout(() => {
        setOpen(false);
        setSyncStatus(null);
      }, 2500);
    } catch (error: any) {
      console.error("Error pushing product to Sanity:", error);
      setSyncStatus({
        success: false,
        error: error.message || "Failed to sync product",
      });

      toast({
        title: "❌ Sync failed",
        description: error.message || "Unable to sync product to Sanity",
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  const getSanityStudioUrl = () => {
    return "https://www.sanity.io/manage";
  };

  // Check if product was previously synced
  const lastSyncedAt = product.metadata?.sanity_synced_at;
  const sanityDocId = product.metadata?.sanity_document_id;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant={variant}
        size={size}
        className={className}
      >
        <Upload className="w-4 h-4 mr-2" />
        {sanityDocId ? "Update on Sanity" : "Push to Sanity"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Push Product to Sanity</DialogTitle>
            <DialogDescription>
              Sync this product to your connected Sanity project
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Product Info */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{product.name}</h3>
                  {/* Show parent SKU (no size suffix) instead of variant SKU */}
                  {((product.metadata?.parent_sku as string) || product.sku) && (
                    <p className="text-xs text-muted-foreground">
                      SKU: {(product.metadata?.parent_sku as string) || product.sku}
                    </p>
                  )}
                </div>
                <Badge variant={product.status === "active" ? "default" : "secondary"}>
                  {product.status}
                </Badge>
              </div>

              {product.short_description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {product.short_description}
                </p>
              )}

              {/* Sync status */}
              {lastSyncedAt && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(lastSyncedAt).toLocaleDateString()} at{" "}
                    {new Date(lastSyncedAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>

            {/* What gets synced */}
            <div className="rounded-lg bg-muted/50 p-3">
              <h4 className="text-sm font-medium mb-2">What gets synced:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Product name, SKU, and descriptions</li>
                <li>• Pricing and variant information</li>
                <li>• Scent notes (top, heart, base)</li>
                <li>• Collection and scent family</li>
                <li>• SEO metadata</li>
                <li>• Key benefits and features</li>
              </ul>
            </div>

            {/* Sync Status Result */}
            {syncStatus && (
              <div
                className={`rounded-lg border p-3 ${
                  syncStatus.success
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
                        Document: {syncStatus.sanityDocumentId}
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
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
              disabled={isPushing}
              className="gap-2"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {sanityDocId ? "Update Product" : "Push to Sanity"}
                </>
              )}
            </Button>
          </DialogFooter>

          {syncStatus?.success && syncStatus.sanityDocumentId && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2"
                onClick={() => window.open(getSanityStudioUrl(), "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                View in Sanity Studio
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
