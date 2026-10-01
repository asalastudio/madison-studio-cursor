import { useState } from "react";
import { X, ArrowRight, Globe, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { getIndustryOptions } from "@/config/industryTemplates";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { VideoHelpTrigger } from "@/components/help/VideoHelpTrigger";
import madisonLogo from "@/assets/madison-horizontal-logo.png";
import { getOrCreateOrganizationId } from "@/lib/organization";
import { logger } from "@/lib/logger";

interface OnboardingWelcomeProps {
  onContinue: (data: any) => void;
  onSkip: () => void;
  initialData?: any;
}

const INDUSTRY_OPTIONS = getIndustryOptions();

export function OnboardingWelcome({ onContinue, onSkip, initialData }: OnboardingWelcomeProps) {
  const { user } = useAuth();
  const [userName, setUserName] = useState(initialData?.userName || "");
  const [brandName, setBrandName] = useState(initialData?.brandName || "");
  const [industry, setIndustry] = useState(initialData?.industry || "");
  const [primaryColor, setPrimaryColor] = useState(initialData?.primaryColor || "#B8956A");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const isValidUrl = (url: string) => {
    if (!url.trim()) return false;
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
      return true;
    } catch {
      return false;
    }
  };

  const handleWebsiteScan = async () => {
    if (!isValidUrl(websiteUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL",
        variant: "destructive"
      });
      return;
    }

    setIsScanning(true);
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const organizationId = await getOrCreateOrganizationId(user.id);
      const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

      // Call the scan-website function
      const { data: scanData, error: scanError } = await supabase.functions.invoke(
        'scan-website',
        {
          body: {
            url: normalizedUrl,
            organizationId: organizationId,
            forceRescan: false
          }
        }
      );

      if (scanError) throw scanError;

      toast({
        title: "Website scanned!",
        description: "We've extracted your brand's visual identity and colors.",
      });

      // Continue with scan data
      onContinue({
        userName: userName.trim(),
        brandName: brandName.trim(),
        industry: industry || null,
        primaryColor,
        websiteUrl: normalizedUrl,
        hasWebsiteScan: true,
        scanData: scanData?.report || scanData?.scan?.scan_data,
        organizationId
      });
    } catch (error) {
      logger.error('Error scanning website:', error);
      toast({
        title: "Scan failed",
        description: "Unable to scan your website. You can continue without it.",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleContinue = async () => {
    if (!userName.trim() || !brandName.trim()) return;
    
    setIsSaving(true);
    let organizationId: string | null = null;

    if (user) {
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: userName.trim()
          })
          .eq('id', user.id);

        if (profileError) {
          logger.error('[Onboarding] Error updating profile:', profileError);
        }

        organizationId = await getOrCreateOrganizationId(user.id);

        const { error: orgUpdateError } = await supabase
          .from('organizations')
          .update({
            name: brandName.trim(),
            brand_config: {
              brandName: brandName.trim(),
              industry: industry || null,
              primaryColor: primaryColor,
              industryTemplate: industry || 'other',
              industry_config: {
                id: industry || 'other',
                name: INDUSTRY_OPTIONS.find(opt => opt.value === industry)?.label || 'Other'
              }
            }
          })
          .eq('id', organizationId);

        if (orgUpdateError) throw orgUpdateError;
      } catch (error) {
        logger.error('Error saving brand config:', error);
        toast({
          title: "Error",
          description: "Failed to save brand information. Please try again.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }
    }

    onContinue({
      userName: userName.trim(),
      brandName: brandName.trim(),
      industry: industry || null,
      primaryColor,
      websiteUrl: websiteUrl.trim() || null,
      useBrandDNAScan: false,
      organizationId
    });
    setIsSaving(false);
  };

  const isValid = userName.trim() && brandName.trim();

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between px-4 py-4 md:px-8">
        <img src={madisonLogo} alt="Madison" className="h-6 opacity-90" />
        <div className="flex items-center gap-4">
          <VideoHelpTrigger videoId="setting-up-brand-identity" variant="link" />
          <button
            onClick={onSkip}
            className="text-charcoal/40 hover:text-charcoal transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-8 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-8">
          {/* Progress & Header */}
          <div className="text-center space-y-6">
            <OnboardingProgressBar currentStep={1} />
            
            <div className="space-y-2">
              <h1 className="font-serif text-3xl text-foreground md:text-4xl">Welcome to Madison</h1>
              <p className="text-lg text-charcoal/70 font-light max-w-md mx-auto">
                Let's set up your brand profile to create on-brand content at scale.
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="userName" className="text-xs uppercase tracking-wider text-charcoal/60 font-medium">
                First Name *
              </Label>
              <Input
                id="userName"
                placeholder="e.g. Jordan"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="h-11 bg-white border-charcoal/10 focus:border-brass/50 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brandName" className="text-xs uppercase tracking-wider text-charcoal/60 font-medium">
                Brand Name *
              </Label>
              <Input
                id="brandName"
                placeholder="e.g. Maison Lumière"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="h-11 bg-white border-charcoal/10 focus:border-brass/50 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="industry" className="text-xs uppercase tracking-wider text-charcoal/60 font-medium">
                Industry <span className="normal-case opacity-50 font-normal">(Optional)</span>
              </Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-11 bg-white border-charcoal/10 focus:border-brass/50 transition-colors">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="primaryColor" className="text-xs uppercase tracking-wider text-charcoal/60 font-medium">
                Brand Color <span className="normal-case opacity-50 font-normal">(Optional)</span>
              </Label>
              <div className="flex gap-2">
                <div className="relative">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-11 w-11 rounded-md border border-charcoal/10 p-1 bg-white cursor-pointer"
                  />
                </div>
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#000000"
                  className="h-11 bg-white border-charcoal/10 focus:border-brass/50 transition-colors font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Website Scan Section */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-charcoal/60 font-medium">
              Website Scan <span className="normal-case opacity-50 font-normal">(Optional)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://yourbrand.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="h-11 bg-white border-charcoal/10 focus:border-brass/50 transition-colors"
                disabled={isScanning}
              />
              {websiteUrl.trim() && isValidUrl(websiteUrl) && !initialData?.hasWebsiteScan && (
                <Button
                  onClick={handleWebsiteScan}
                  disabled={isScanning || !isValidUrl(websiteUrl)}
                  variant="outline"
                  className="h-11 px-6 border-brass/30 hover:bg-brass/5"
                >
                  {isScanning ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Globe className="mr-2 h-4 w-4" />
                      Scan
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-charcoal/50">
              We'll extract your logo, colors, fonts, and visual style automatically
            </p>
            {initialData?.hasWebsiteScan && (
              <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-md">
                <Sparkles className="w-3 h-3" />
                Website scanned successfully
              </div>
            )}
          </div>

          {/* Validation & Continue */}
          <div className="pt-8 flex flex-col items-center space-y-4">
            {!isValid && (
              <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-full border border-amber-100 animate-in fade-in slide-in-from-bottom-2">
                Please enter your first name and brand name to continue
              </p>
            )}
            
            <Button
              onClick={handleContinue}
              disabled={!isValid || isSaving}
              variant="brass"
              size="lg"
              className="w-full md:w-1/2 h-12 text-base shadow-lg shadow-brass/10 hover:shadow-brass/20 transition-all"
            >
              {isSaving ? "Saving..." : "Continue to Brand Guidelines"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <button
              onClick={onSkip}
              className="text-xs text-charcoal/40 hover:text-charcoal transition-colors border-b border-transparent hover:border-charcoal"
            >
              Skip onboarding for now
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
