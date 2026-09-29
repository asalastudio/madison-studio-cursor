import { useState } from "react";
import { X, ArrowRight, ArrowLeft, Check, Loader2, Palette, Type, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import madisonLogo from "@/assets/madison-horizontal-logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { getOrCreateOrganizationId } from "@/lib/organization";
import { logger } from "@/lib/logger";

interface BrandDNAScanProps {
  onContinue: (data: any) => void;
  onBack: () => void;
  onSkip: () => void;
  brandData: any;
}

type ScanStage = "input" | "scanning" | "preview";
type ScanProgress = "analyzing" | "colors" | "fonts" | "images" | "complete";

export function BrandDNAScan({ onContinue, onBack, onSkip, brandData }: BrandDNAScanProps) {
  const { user } = useAuth();
  const [stage, setStage] = useState<ScanStage>("input");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scanProgress, setScanProgress] = useState<ScanProgress>("analyzing");
  const [progressPercent, setProgressPercent] = useState(0);
  const [brandDNA, setBrandDNA] = useState<any>(null);

  const isValidUrl = (url: string) => {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
      return true;
    } catch {
      return false;
    }
  };

  const handleStartScan = async () => {
    if (!isValidUrl(websiteUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL",
        variant: "destructive"
      });
      return;
    }

    setStage("scanning");
    setScanProgress("analyzing");
    setProgressPercent(10);

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const organizationId = await getOrCreateOrganizationId(user.id);

      const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

      const { data: dnaData, error: dnaError } = await supabase.functions.invoke(
        'analyze-brand-dna',
        {
          body: {
            websiteUrl: normalizedUrl,
            organizationId
          }
        }
      );

      if (dnaError) throw dnaError;

      setScanProgress("complete");
      setProgressPercent(100);
      setBrandDNA(dnaData);
      setStage("preview");

    } catch (error) {
      logger.error('Error scanning brand DNA:', error);
      toast({
        title: "Scan failed",
        description: "Unable to analyze your website. Please try again or upload documents instead.",
        variant: "destructive"
      });
      setStage("input");
    }
  };

  const handleContinue = () => {
    onContinue({
      brandDNA: brandDNA,
      websiteUrl: websiteUrl,
      hasDNAScan: true
    });
  };

  const getProgressIcon = (stage: ScanProgress) => {
    const iconClass = "w-5 h-5";
    switch (stage) {
      case "analyzing":
        return <Sparkles className={iconClass} />;
      case "colors":
        return <Palette className={iconClass} />;
      case "fonts":
        return <Type className={iconClass} />;
      case "images":
        return <ImageIcon className={iconClass} />;
      default:
        return <Check className={iconClass} />;
    }
  };

  const getProgressLabel = (stage: ScanProgress) => {
    switch (stage) {
      case "analyzing":
        return "Analyzing your website";
      case "colors":
        return "Extracting color palette";
      case "fonts":
        return "Detecting typography";
      case "images":
        return "Analyzing visual style";
      case "complete":
        return "Brand DNA ready!";
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/20">
        <div className="flex items-center gap-3">
          <img src={madisonLogo} alt="MADISON" className="h-8" />
        </div>
        <button
          onClick={onSkip}
          className="p-2 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <OnboardingProgressBar currentStep={2} />

          <AnimatePresence mode="wait">
            {stage === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-12"
              >
                <div className="text-center mb-12">
                  <h1 className="font-serif text-4xl text-foreground mb-3">
                    Let's analyze your brand
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                    Enter your website URL and we'll extract your visual identity — logo, colors, fonts, and style.
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <Input
                      placeholder="https://yourbrand.com"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="h-14 text-base text-center font-serif text-lg"
                      autoFocus
                    />
                    <p className="text-sm text-muted-foreground mt-3 text-center">
                      We'll scan your website to understand your visual brand identity
                    </p>
                  </div>

                  <div className="bg-[hsl(var(--vellum-cream))]/30 border border-border/40 rounded-lg p-6">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Check className="w-4 h-4 text-brass" />
                      We'll extract:
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-brass">•</span>
                        <span>Logo and brand mark</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brass">•</span>
                        <span>Color palette (primary, secondary, accents)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brass">•</span>
                        <span>Typography (headline and body fonts)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brass">•</span>
                        <span>Visual mood and photography style</span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex items-center gap-4">
                    <Button
                      onClick={onBack}
                      variant="outline"
                      className="h-12 px-6"
                    >
                      <ArrowLeft className="mr-2 h-5 w-5" />
                      Back
                    </Button>

                    <Button
                      onClick={handleStartScan}
                      disabled={!isValidUrl(websiteUrl)}
                      variant="brass"
                      className="flex-1 h-12 text-base"
                    >
                      Analyze Brand DNA
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={onSkip}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip and upload documents instead
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {stage === "scanning" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-12"
              >
                <div className="text-center mb-12">
                  {/* PLACEHOLDER: Animated Madison pencil icon during scan */}
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[hsl(var(--aged-brass))] to-[hsl(var(--antique-gold))]/80 mb-6 animate-pulse">
                    {/* TODO: Replace with animated Madison pencil sketch SVG */}
                    {getProgressIcon(scanProgress)}
                    <span className="text-white font-serif text-sm ml-2">{progressPercent}%</span>
                  </div>

                  <h1 className="font-serif text-4xl text-foreground mb-3">
                    Analyzing {new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    {getProgressLabel(scanProgress)}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-12">
                  <div className="h-2 bg-border/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[hsl(var(--aged-brass))] to-[hsl(var(--antique-gold))]"
                      initial={{ width: "10%" }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>

                {/* Progress Steps with Custom Icon Placeholders */}
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  {/* PLACEHOLDER: Custom brass watercolor palette icon */}
                  <div className={`p-4 rounded-lg border ${scanProgress === "colors" || progressPercent > 50 ? 'border-brass bg-brass/5' : 'border-border/40'}`}>
                    <div className="flex items-center gap-3">
                      {progressPercent > 50 ? (
                        <Check className="w-5 h-5 text-brass" />
                      ) : (
                        <Palette className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">Colors</p>
                        <p className="text-xs text-muted-foreground">
                          {progressPercent > 50 ? "Detected" : "Analyzing..."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PLACEHOLDER: Custom calligraphic "Aa" icon */}
                  <div className={`p-4 rounded-lg border ${scanProgress === "fonts" || progressPercent > 75 ? 'border-brass bg-brass/5' : 'border-border/40'}`}>
                    <div className="flex items-center gap-3">
                      {progressPercent > 75 ? (
                        <Check className="w-5 h-5 text-brass" />
                      ) : (
                        <Type className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">Fonts</p>
                        <p className="text-xs text-muted-foreground">
                          {progressPercent > 75 ? "Detected" : "Analyzing..."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PLACEHOLDER: Custom brass picture frame icon */}
                  <div className={`p-4 rounded-lg border ${scanProgress === "images" || progressPercent > 90 ? 'border-brass bg-brass/5' : 'border-border/40'}`}>
                    <div className="flex items-center gap-3">
                      {progressPercent > 90 ? (
                        <Check className="w-5 h-5 text-brass" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">Imagery</p>
                        <p className="text-xs text-muted-foreground">
                          {progressPercent > 90 ? "Analyzed" : "Processing..."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PLACEHOLDER: Custom gold sparkle constellation icon */}
                  <div className={`p-4 rounded-lg border ${progressPercent === 100 ? 'border-brass bg-brass/5' : 'border-border/40'}`}>
                    <div className="flex items-center gap-3">
                      {progressPercent === 100 ? (
                        <Check className="w-5 h-5 text-brass" />
                      ) : (
                        <Sparkles className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">DNA</p>
                        <p className="text-xs text-muted-foreground">
                          {progressPercent === 100 ? "Complete" : "Building..."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Reading your site now — this can take a minute
                  </p>
                  <Button
                    onClick={() => {
                      setStage("input");
                      onSkip();
                    }}
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    I'll come back later
                  </Button>
                </div>
              </motion.div>
            )}

            {stage === "preview" && brandDNA && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-12"
              >
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[hsl(var(--aged-brass))] to-[hsl(var(--antique-gold))]/80 mb-6">
                    <Check className="w-10 h-10 text-white" />
                  </div>

                  <h1 className="font-serif text-4xl text-foreground mb-3">
                    Your Brand DNA is Ready!
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    We've captured your brand's visual identity
                  </p>
                </div>

                {/* Brand DNA Preview */}
                <div className="space-y-6 mb-12">
                  {/* Logo */}
                  {brandDNA.logo && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Brand Logo</h3>
                      <div className="flex items-center gap-4">
                        <img
                          src={brandDNA.logo.url}
                          alt="Brand logo"
                          className="h-12 object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Color Palette */}
                  {brandDNA.colorPalette && brandDNA.colorPalette.length > 0 && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Color Palette</h3>
                      <div className="flex gap-2 flex-wrap">
                        {brandDNA.colorPalette.slice(0, 5).map((color: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div
                              className="w-12 h-12 rounded border border-border/40"
                              style={{ backgroundColor: color.hex }}
                            />
                            <div className="text-xs">
                              <p className="font-mono text-foreground">{color.hex}</p>
                              <p className="text-muted-foreground">{color.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Typography */}
                  {brandDNA.fonts && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Typography</h3>
                      <div className="space-y-2">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Headline:</span>{" "}
                          <span className="font-semibold">{brandDNA.fonts.headline}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Body:</span>{" "}
                          <span>{brandDNA.fonts.body}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Visual Mood */}
                  {brandDNA.visualStyle && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Visual Mood</h3>
                      <p className="text-sm text-muted-foreground italic">
                        "{brandDNA.visualStyle.mood}"
                      </p>
                    </div>
                  )}

                  {/* Brand Mission */}
                  {brandDNA.brandMission && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Brand Mission</h3>
                      <p className="text-sm text-muted-foreground">
                        {brandDNA.brandMission}
                      </p>
                    </div>
                  )}

                  {/* Brand Essence */}
                  {brandDNA.brandEssence && (
                    <div className="p-6 rounded-lg border border-border/40 bg-card">
                      <h3 className="font-semibold text-foreground mb-3">Brand Essence</h3>
                      <p className="text-sm text-muted-foreground italic">
                        {brandDNA.brandEssence}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleContinue}
                    variant="brass"
                    className="flex-1 h-12 text-base"
                  >
                    Continue to Deep Dive
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>

                  <Button
                    onClick={() => onContinue({ brandDNA, websiteUrl, skipDeepDive: true })}
                    variant="outline"
                    className="h-12 px-6"
                  >
                    Start Creating
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
