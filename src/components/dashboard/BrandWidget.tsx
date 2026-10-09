/**
 * BrandWidget - Widget for displaying brand visual identity
 * 
 * Shows brand DNA (logo, colors, typography) in a compact widget format
 */

import { useState } from "react";
import { Palette, Type, ExternalLink, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { BrandQuickViewPanel } from "@/components/brand/BrandQuickViewPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function BrandWidget() {
  const { quickView, isLoading, hasBrandDNA } = useBrandDNA();
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (isLoading) {
    return (
      <Card className="bg-card border-border h-full flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center p-6">
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!hasBrandDNA) {
    return (
      <Card className="bg-card border-border h-full flex flex-col">
        <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0">
          <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <Palette className="w-4 h-4 text-primary" />
            Brand
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Palette className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-1">
              No brand DNA yet
            </p>
            <p className="text-xs text-muted-foreground">
              Scan your website to extract your visual identity
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const colors = quickView?.colors;
  const hasColors = colors && (colors.primary || colors.secondary || colors.accent);

  return (
    <>
      <Card className="bg-card border-border h-full flex flex-col hover-lift transition-all duration-200">
        <CardHeader className="pb-2 pt-3 px-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <Palette className="w-4 h-4 text-primary" />
              Brand
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsFullscreen(true)}
              title="View full brand details"
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-3 pt-0">
          <button
            onClick={() => setIsFullscreen(true)}
            className="relative flex-1 flex flex-col gap-3 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors group"
          >
            {/* Logo Preview */}
            {quickView?.logoUrl && (
              <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg border border-border">
                <img
                  src={quickView.logoUrl}
                  alt="Brand logo"
                  className="max-h-12 max-w-[120px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {quickView?.brandName && (
              <p className="text-sm font-medium text-foreground">{quickView.brandName}</p>
            )}
            {(quickView?.industryLabel || quickView?.tone) && (
              <p className="text-xs text-muted-foreground">
                {quickView.industryLabel || quickView.tone}
              </p>
            )}

            {/* Color Palette */}
            {hasColors && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Palette className="w-3 h-3" />
                  <span>Colors</span>
                </div>
                <div className="flex gap-2">
                  {colors.primary && (
                    <div
                      className="flex-1 h-8 rounded border border-border shadow-level-1"
                      style={{ backgroundColor: colors.primary }}
                      title={`Primary: ${colors.primary}`}
                    />
                  )}
                  {colors.secondary && (
                    <div
                      className="flex-1 h-8 rounded border border-border shadow-level-1"
                      style={{ backgroundColor: colors.secondary }}
                      title={`Secondary: ${colors.secondary}`}
                    />
                  )}
                  {colors.accent && (
                    <div
                      className="flex-1 h-8 rounded border border-border shadow-level-1"
                      style={{ backgroundColor: colors.accent }}
                      title={`Accent: ${colors.accent}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Typography */}
            {(quickView?.typography?.headline || quickView?.typography?.body) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Type className="w-3 h-3" />
                  <span>Typography</span>
                </div>
                <div className="space-y-1 text-xs">
                  {quickView.typography.headline && (
                    <p className="font-medium text-foreground">
                      Headlines: {quickView.typography.headline}
                    </p>
                  )}
                  {quickView.typography.body && (
                    <p className="text-muted-foreground">
                      Body: {quickView.typography.body}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center rounded-lg pointer-events-none">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-level-2">
                <Maximize2 className="w-3 h-3" />
                View full details
              </div>
            </div>
          </button>
        </CardContent>
      </Card>

      {/* Fullscreen Panel */}
      {isFullscreen && (
        <BrandQuickViewPanel open={isFullscreen} onOpenChange={setIsFullscreen} />
      )}
    </>
  );
}
