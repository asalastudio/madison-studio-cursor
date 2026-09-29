import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOnboarding } from "@/hooks/useOnboarding";
import { 
  Sparkles, 
  Check, 
  X, 
  Plus, 
  Image as ImageIcon,
  Loader2,
  RefreshCw
} from "lucide-react";
import { logger } from "@/lib/logger";
import { getIndustryById, getIndustryDefaults, getIndustryPlaceholders, getIndustryList, IndustryId } from "@/config/industries";

interface BrandData {
  brand_name: string;
  brand_essence: string;
  personality_traits: string[];
  industry: string;
  sub_industry: string;
  positioning_statement: string;
  target_audience: {
    name: string;
    age: string;
    description: string;
    values: string[];
    avoids: string[];
  };
  voice: {
    tone: string[];
    words_we_love: string[];
    words_we_avoid: string[];
  };
  visual: {
    logo_url: string | null;
    colors: string[];
    typography_primary: string;
    typography_secondary: string;
  };
}

const defaultBrandData: BrandData = {
  brand_name: "",
  brand_essence: "",
  personality_traits: [],
  industry: "",
  sub_industry: "",
  positioning_statement: "",
  target_audience: {
    name: "",
    age: "",
    description: "",
    values: [],
    avoids: [],
  },
  voice: {
    tone: [],
    words_we_love: [],
    words_we_avoid: [],
  },
  visual: {
    logo_url: null,
    colors: [],
    typography_primary: "",
    typography_secondary: "",
  },
};

// Fallback suggestions if no industry is selected
const DEFAULT_PERSONALITY_SUGGESTIONS = [
  "Luxurious", "Warm", "Artisanal", "Modern", "Minimal", "Bold", 
  "Playful", "Sophisticated", "Eco-conscious", "Scientific", "Heritage", "Innovative"
];

const DEFAULT_TONE_SUGGESTIONS = [
  "Confident", "Friendly", "Expert", "Conversational", "Inspiring", 
  "Direct", "Poetic", "Witty", "Calm", "Energetic"
];

export function BrandStudio() {
  const { toast } = useToast();
  const { currentOrganizationId } = useOnboarding();
  const [brandData, setBrandData] = useState<BrandData>(defaultBrandData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [previewText, setPreviewText] = useState("");
  
  // New input states for tags
  const [newTrait, setNewTrait] = useState("");
  const [newLoveWord, setNewLoveWord] = useState("");
  const [newAvoidWord, setNewAvoidWord] = useState("");
  const [newColor, setNewColor] = useState("#B8956A");
  
  // Get industry-specific suggestions based on selected industry
  const industryConfig = brandData.industry ? getIndustryById(brandData.industry) : null;
  const industryDefaults = brandData.industry ? getIndustryDefaults(brandData.industry) : null;
  const industryPlaceholders = brandData.industry ? getIndustryPlaceholders(brandData.industry) : null;
  
  // Use industry-specific suggestions, or fall back to defaults
  const personalitySuggestions = industryDefaults?.personalityTraits || DEFAULT_PERSONALITY_SUGGESTIONS;
  const toneSuggestions = industryDefaults?.tones || DEFAULT_TONE_SUGGESTIONS;
  const wordsWeLoveSuggestions = industryDefaults?.wordsWeLove || [];
  const wordsWeAvoidSuggestions = industryDefaults?.wordsWeAvoid || [];
  
  // Industry list for selector
  const industries = getIndustryList();

  // Load brand data
  useEffect(() => {
    loadBrandData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganizationId]);

  // Generate preview when voice changes
  useEffect(() => {
    if (brandData.brand_name && brandData.voice.tone.length > 0) {
      generatePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandData.voice, brandData.brand_name, brandData.personality_traits]);

  const loadBrandData = async () => {
    if (!currentOrganizationId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("settings, brand_config, name")
        .eq("id", currentOrganizationId)
        .maybeSingle();

      if (error) {
        logger.warn("Could not load organization:", error.message);
        setIsLoading(false);
        return;
      }

      if (!data) {
        logger.warn("No organization found for ID:", currentOrganizationId);
        setIsLoading(false);
        return;
      }

      const settings = (data.settings as any) || {};
      const brandConfig = (data.brand_config as any) || {};
      const saved = settings.brand_studio || {};

      setBrandData({
        brand_name: data.name || saved.brand_name || "",
        brand_essence: saved.brand_essence || brandConfig.brand_essence || "",
        personality_traits: saved.personality_traits || brandConfig.personality_traits || [],
        industry: saved.industry || brandConfig.industry_config?.id || brandConfig.industry || "",
        sub_industry: saved.sub_industry || brandConfig.industry_config?.subIndustry || "",
        positioning_statement: saved.positioning_statement || brandConfig.positioning_statement || "",
        target_audience: saved.target_audience || {
          name: brandConfig.target_audience?.name || "",
          age: brandConfig.target_audience?.age || "",
          description: brandConfig.target_audience?.description || "",
          values: brandConfig.target_audience?.values || [],
          avoids: brandConfig.target_audience?.avoids || [],
        },
        voice: saved.voice || {
          tone: brandConfig.voice_tone || [],
          words_we_love: brandConfig.words_we_love || [],
          words_we_avoid: brandConfig.words_we_avoid || [],
        },
        visual: saved.visual || {
          logo_url: null,
          colors: brandConfig.colors || [],
          typography_primary: brandConfig.typography?.primary || "",
          typography_secondary: brandConfig.typography?.secondary || "",
        },
      });
    } catch (error) {
      logger.error("Error loading brand data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveBrandData = async () => {
    if (!currentOrganizationId) return;
    setIsSaving(true);

    try {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", currentOrganizationId)
        .maybeSingle();

      const currentSettings = (orgData?.settings as any) || {};

      // Also get brand_config to merge with industry
      const { data: brandConfigData } = await supabase
        .from("organizations")
        .select("brand_config")
        .eq("id", currentOrganizationId)
        .maybeSingle();

      const currentBrandConfig = (brandConfigData?.brand_config as any) || {};

      const { error } = await supabase
        .from("organizations")
        .update({
          settings: {
            ...currentSettings,
            brand_studio: brandData,
          } as any,
          name: brandData.brand_name,
          brand_config: {
            ...currentBrandConfig,
            industry: brandData.industry,
            industry_config: {
              id: brandData.industry,
              subIndustry: brandData.sub_industry || undefined,
            },
          } as any,
        })
        .eq("id", currentOrganizationId);

      if (error) throw error;

      toast({
        title: "Brand saved",
        description: "Your brand settings have been updated.",
      });
    } catch (error) {
      logger.error("Error saving brand data:", error);
      toast({
        title: "Save failed",
        description: "Could not save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleWebsiteScan = async () => {
    if (!websiteUrl.trim() || !currentOrganizationId) return;
    setIsScanning(true);

    try {
      // Delete old scans first
      await supabase
        .from("brand_knowledge")
        .delete()
        .eq("organization_id", currentOrganizationId)
        .eq("knowledge_type", "website_scrape");

      const response = await supabase.functions.invoke("scrape-brand-website", {
        body: { url: websiteUrl, organizationId: currentOrganizationId },
      });

      // Handle FunctionsHttpError - the response body contains the error details
      if (response.error) {
        logger.error("Function invoke error:", response.error);
        
        // Try to get the actual error message from the response
        let errorMessage = response.error.message || "Function call failed";
        
        // If it's a FunctionsHttpError, try to parse the context
        if (response.error.name === 'FunctionsHttpError') {
          try {
            // The error context might contain the JSON body
            const context = (response.error as any).context;
            if (context?.body) {
              const body = JSON.parse(context.body);
              errorMessage = body.error || errorMessage;
            }
          } catch {
            // Ignore parse errors
          }
        }
        
        throw new Error(errorMessage);
      }

      const { data } = response;

      if (data?.error) {
        logger.error("Edge function returned error:", data.error);
        throw new Error(data.error);
      }

      if (data?.success) {
        toast({
          title: "Website analyzed",
          description: "Brand insights extracted. Refreshing data...",
        });
        await loadBrandData();
        setWebsiteUrl("");
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (error: any) {
      logger.error("Error scanning website:", error);
      
      toast({
        title: "Scan failed",
        description: error?.message || "Could not analyze website.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const generatePreview = () => {
    const tones = brandData.voice.tone.join(", ").toLowerCase();
    const name = brandData.brand_name || "your brand";
    const traits = brandData.personality_traits.slice(0, 2).join(" and ").toLowerCase();
    
    const previews = [
      `Discover the ${traits || "refined"} essence of ${name}. Crafted for those who appreciate the finer things.`,
      `At ${name}, we believe in ${traits || "quality"} above all else. Experience the difference.`,
      `${name}: Where ${traits || "elegance"} meets intention. Made for the discerning.`,
    ];
    
    setPreviewText(previews[Math.floor(Math.random() * previews.length)]);
  };

  const addTag = (type: 'trait' | 'tone' | 'love' | 'avoid' | 'color', value: string) => {
    if (!value.trim()) return;
    
    setBrandData(prev => {
      const updated = { ...prev };
      switch (type) {
        case 'trait':
          if (!updated.personality_traits.includes(value)) {
            updated.personality_traits = [...updated.personality_traits, value];
          }
          break;
        case 'tone':
          if (!updated.voice.tone.includes(value)) {
            updated.voice = { ...updated.voice, tone: [...updated.voice.tone, value] };
          }
          break;
        case 'love':
          if (!updated.voice.words_we_love.includes(value)) {
            updated.voice = { ...updated.voice, words_we_love: [...updated.voice.words_we_love, value] };
          }
          break;
        case 'avoid':
          if (!updated.voice.words_we_avoid.includes(value)) {
            updated.voice = { ...updated.voice, words_we_avoid: [...updated.voice.words_we_avoid, value] };
          }
          break;
        case 'color':
          if (!updated.visual.colors.includes(value)) {
            updated.visual = { ...updated.visual, colors: [...updated.visual.colors, value] };
          }
          break;
      }
      return updated;
    });
  };

  const removeTag = (type: 'trait' | 'tone' | 'love' | 'avoid' | 'color', value: string) => {
    setBrandData(prev => {
      const updated = { ...prev };
      switch (type) {
        case 'trait':
          updated.personality_traits = updated.personality_traits.filter(t => t !== value);
          break;
        case 'tone':
          updated.voice = { ...updated.voice, tone: updated.voice.tone.filter(t => t !== value) };
          break;
        case 'love':
          updated.voice = { ...updated.voice, words_we_love: updated.voice.words_we_love.filter(t => t !== value) };
          break;
        case 'avoid':
          updated.voice = { ...updated.voice, words_we_avoid: updated.voice.words_we_avoid.filter(t => t !== value) };
          break;
        case 'color':
          updated.visual = { ...updated.visual, colors: updated.visual.colors.filter(c => c !== value) };
          break;
      }
      return updated;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brass" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-serif text-2xl md:text-3xl text-ink mb-1">Brand Studio</h1>
        <p className="text-sm text-charcoal/60">
          Everything Madison needs to write in your voice
        </p>
      </div>

      {/* Quick Start - Website Scan */}
      <div className="mb-12 p-5 bg-gradient-to-br from-brass/5 to-transparent rounded-lg border border-brass/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-brass/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 text-brass" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-ink text-sm mb-1">Quick Start</h3>
            <p className="text-xs text-charcoal/60 mb-3">
              Paste your website URL and we'll extract your brand voice automatically
            </p>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourbrand.com"
                className="min-w-0 flex-1 bg-white/80 border-stone/30 text-sm h-11 sm:h-9"
              />
              <Button 
                onClick={handleWebsiteScan} 
                disabled={isScanning || !websiteUrl.trim()}
                size="sm"
                className="w-full shrink-0 bg-brass px-4 text-white hover:bg-brass/90 sm:h-9 sm:w-auto"
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Analyze"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Identity Section */}
      <section className="mb-12">
        <h2 className="font-serif text-lg text-ink mb-6 pb-2 border-b border-stone/20">
          Brand Identity
        </h2>

        <div className="space-y-8">
          {/* Brand Name & Essence */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Brand Name
              </label>
              <Input
                value={brandData.brand_name}
                onChange={(e) => setBrandData(prev => ({ ...prev, brand_name: e.target.value }))}
                placeholder="Your brand name"
                className="bg-white border-stone/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Brand Essence
                <span className="text-charcoal/50 font-normal ml-2">What you stand for in 2-3 words</span>
              </label>
              <Input
                value={brandData.brand_essence}
                onChange={(e) => setBrandData(prev => ({ ...prev, brand_essence: e.target.value }))}
                placeholder={industryPlaceholders?.brandEssence || "e.g., Artisanal Sophistication"}
                className="bg-white border-stone/40"
              />
            </div>
          </div>

          {/* Industry */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Industry
            </label>
            <div className="grid grid-cols-2 gap-2">
              {industries.map((ind) => {
                const IconComponent = ind.icon;
                return (
                  <button
                    key={ind.id}
                    onClick={() => setBrandData(prev => ({ ...prev, industry: ind.id }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                      brandData.industry === ind.id
                        ? "bg-brass/10 border-2 border-brass text-charcoal"
                        : "bg-white border border-stone/40 text-charcoal hover:border-brass/50"
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 flex-shrink-0 ${
                      brandData.industry === ind.id ? "text-brass" : "text-charcoal/50"
                    }`} />
                    <span className="truncate">{ind.shortName}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Sub-industry selection */}
            {industryConfig && (
              <div className="mt-3">
                <label className="block text-xs text-charcoal/60 mb-2">
                  Specific focus (optional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {industryConfig.subIndustries.slice(0, 6).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setBrandData(prev => ({
                        ...prev,
                        sub_industry: prev.sub_industry === sub.id ? "" : sub.id,
                      }))}
                      className={`mobile-chip px-2.5 py-1 rounded-full text-xs transition-colors ${
                        brandData.sub_industry === sub.id
                          ? "bg-brass text-white"
                          : "bg-stone/10 text-charcoal/70 hover:bg-stone/20"
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Personality Traits */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Brand Personality
              <span className="text-charcoal/50 font-normal ml-2">Select 3-5 traits that define you</span>
            </label>
            
            {/* Selected traits */}
            <div className="flex flex-wrap gap-2 mb-3">
              {brandData.personality_traits.map((trait) => (
                <Badge 
                  key={trait} 
                  className="bg-brass/10 text-brass border-0 hover:bg-brass/20 cursor-pointer group"
                  onClick={() => removeTag('trait', trait)}
                >
                  {trait}
                  <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                </Badge>
              ))}
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap gap-2">
              {personalitySuggestions.filter(s => !brandData.personality_traits.includes(s)).map((trait) => (
                <button
                  key={trait}
                  onClick={() => addTag('trait', trait)}
                  className="px-3 py-1.5 rounded-full text-sm bg-white border border-stone/30 text-charcoal/70 hover:border-brass/50 hover:text-brass transition-all"
                >
                  + {trait}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex gap-2 mt-3">
              <Input
                value={newTrait}
                onChange={(e) => setNewTrait(e.target.value)}
                placeholder="Add custom trait..."
                className="flex-1 bg-white border-stone/40 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('trait', newTrait);
                    setNewTrait("");
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  addTag('trait', newTrait);
                  setNewTrait("");
                }}
                disabled={!newTrait.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Avatar Section */}
      <section className="mb-12">
        <h2 className="font-serif text-lg text-ink mb-6 pb-2 border-b border-stone/20">
          Customer Avatar
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Who is your ideal customer?
            </label>
            <Input
              value={brandData.target_audience.name}
              onChange={(e) => setBrandData(prev => ({
                ...prev,
                target_audience: { ...prev.target_audience, name: e.target.value }
              }))}
              placeholder={industryPlaceholders?.customerAvatar || "e.g., Sarah, 35-45"}
              className="bg-white border-stone/40 mb-3"
            />
            <Input
              value={brandData.target_audience.age}
              onChange={(e) => setBrandData(prev => ({
                ...prev,
                target_audience: { ...prev.target_audience, age: e.target.value }
              }))}
              placeholder="e.g., 35-45, Professional"
              className="bg-white border-stone/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              What do they care about?
            </label>
            <Textarea
              value={brandData.target_audience.description}
              onChange={(e) => setBrandData(prev => ({
                ...prev,
                target_audience: { ...prev.target_audience, description: e.target.value }
              }))}
              placeholder={industryPlaceholders?.customerDescription || "Values quality over price, seeks authentic experiences, appreciates craftsmanship..."}
              className="bg-white border-stone/40 min-h-[100px]"
            />
          </div>
        </div>
      </section>

      {/* Voice & Tone Section */}
      <section className="mb-12">
        <h2 className="font-serif text-lg text-ink mb-6 pb-2 border-b border-stone/20">
          Voice & Tone
        </h2>

        <div className="space-y-8">
          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              How should Madison sound?
            </label>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {brandData.voice.tone.map((tone) => (
                <Badge 
                  key={tone} 
                  className="bg-brass/10 text-brass border-0 hover:bg-brass/20 cursor-pointer group"
                  onClick={() => removeTag('tone', tone)}
                >
                  {tone}
                  <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {toneSuggestions.filter(s => !brandData.voice.tone.includes(s)).map((tone) => (
                <button
                  key={tone}
                  onClick={() => addTag('tone', tone)}
                  className="px-3 py-1.5 rounded-full text-sm bg-white border border-stone/30 text-charcoal/70 hover:border-brass/50 hover:text-brass transition-all"
                >
                  + {tone}
                </button>
              ))}
            </div>
          </div>

          {/* Words We Love / Avoid */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                <span className="text-emerald-600">✓</span> Words We Love
              </label>
              <div className="flex flex-wrap gap-2 mb-3 min-h-[40px]">
                {brandData.voice.words_we_love.map((word) => (
                  <Badge 
                    key={word} 
                    className="bg-emerald-50 text-emerald-700 border-0 hover:bg-emerald-100 cursor-pointer group"
                    onClick={() => removeTag('love', word)}
                  >
                    {word}
                    <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                  </Badge>
                ))}
              </div>
              {/* Industry suggestions for words to love */}
              {wordsWeLoveSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {wordsWeLoveSuggestions.filter(w => !brandData.voice.words_we_love.includes(w)).slice(0, 5).map((word) => (
                    <button
                      key={word}
                      onClick={() => addTag('love', word)}
                      className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                    >
                      + {word}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newLoveWord}
                  onChange={(e) => setNewLoveWord(e.target.value)}
                  placeholder={industryPlaceholders ? "Add a word..." : "artisan, craft, essence..."}
                  className="flex-1 bg-white border-stone/40 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addTag('love', newLoveWord);
                      setNewLoveWord("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addTag('love', newLoveWord);
                    setNewLoveWord("");
                  }}
                  disabled={!newLoveWord.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                <span className="text-red-500">✗</span> Words We Avoid
              </label>
              <div className="flex flex-wrap gap-2 mb-3 min-h-[40px]">
                {brandData.voice.words_we_avoid.map((word) => (
                  <Badge 
                    key={word} 
                    className="bg-red-50 text-red-700 border-0 hover:bg-red-100 cursor-pointer group"
                    onClick={() => removeTag('avoid', word)}
                  >
                    {word}
                    <X className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                  </Badge>
                ))}
              </div>
              {/* Industry suggestions for words to avoid */}
              {wordsWeAvoidSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {wordsWeAvoidSuggestions.filter(w => !brandData.voice.words_we_avoid.includes(w)).slice(0, 5).map((word) => (
                    <button
                      key={word}
                      onClick={() => addTag('avoid', word)}
                      className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      + {word}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newAvoidWord}
                  onChange={(e) => setNewAvoidWord(e.target.value)}
                  placeholder={industryPlaceholders ? "Add a word..." : "cheap, discount, deal..."}
                  className="flex-1 bg-white border-stone/40 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addTag('avoid', newAvoidWord);
                      setNewAvoidWord("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addTag('avoid', newAvoidWord);
                    setNewAvoidWord("");
                  }}
                  disabled={!newAvoidWord.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          {previewText && (
            <div className="p-6 bg-ink/[0.02] rounded-lg border border-stone/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-brass" />
                <span className="text-sm font-medium text-charcoal">Live Preview</span>
                <button 
                  onClick={generatePreview}
                  className="ml-auto text-xs text-charcoal/50 hover:text-brass transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <p className="font-accent text-lg text-ink/80 italic leading-relaxed">
                "{previewText}"
              </p>
              <p className="text-xs text-charcoal/50 mt-3">
                This is how Madison will write based on your brand voice
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Visual Identity Section */}
      <section className="mb-12">
        <h2 className="font-serif text-lg text-ink mb-6 pb-2 border-b border-stone/20">
          Visual Identity
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-3">
              Brand Logo
            </label>
            <div className="aspect-square max-w-[200px] rounded-lg border-2 border-dashed border-stone/40 bg-white flex items-center justify-center cursor-pointer hover:border-brass/50 transition-colors">
              {brandData.visual.logo_url ? (
                <img 
                  src={brandData.visual.logo_url} 
                  alt="Brand logo" 
                  className="max-w-full max-h-full p-4 object-contain"
                />
              ) : (
                <div className="text-center p-4">
                  <ImageIcon className="w-8 h-8 text-charcoal/30 mx-auto mb-2" />
                  <span className="text-sm text-charcoal/50">Drop logo here</span>
                </div>
              )}
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-3">
              Color Palette
            </label>
            <div className="flex flex-wrap gap-3 mb-4">
              {brandData.visual.colors.map((color) => (
                <button
                  key={color}
                  onClick={() => removeTag('color', color)}
                  className="group relative"
                >
                  <div 
                    className="w-12 h-12 rounded-lg shadow-sm border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                  <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </div>
                  <span className="block text-[10px] text-charcoal/50 mt-1 text-center uppercase">
                    {color}
                  </span>
                </button>
              ))}
              
              {/* Add Color */}
              <div className="flex flex-col items-center">
                <label className="w-12 h-12 rounded-lg border-2 border-dashed border-stone/40 flex items-center justify-center cursor-pointer hover:border-brass/50 transition-colors overflow-hidden">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-16 h-16 cursor-pointer -m-2"
                  />
                </label>
                <button
                  onClick={() => {
                    addTag('color', newColor);
                  }}
                  className="text-[10px] text-brass mt-1 hover:underline"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="sticky bottom-6 flex justify-end">
        <Button
          onClick={saveBrandData}
          disabled={isSaving}
          className="bg-brass hover:bg-brass/90 text-white px-8 shadow-level-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Save Brand
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
