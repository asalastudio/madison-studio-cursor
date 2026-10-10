import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Library, Upload, Star, Tag, FileText, Flame, Home, Droplets, Leaf, Mail, Instagram } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useState } from "react";

interface QuickStartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartWizard: (templateData?: any) => void;
  onShowTemplates: () => void;
  onShowImport: () => void;
}

interface TemplateData {
  title: string;
  purpose: string;
  contentType: string;
  tone: string;
  keyElements: string;
  constraints: string;
  category?: string;
  icon: any;
  description: string;
}

export function QuickStartModal({
  open,
  onOpenChange,
  onStartWizard,
  onShowTemplates,
  onShowImport,
}: QuickStartModalProps) {
  const { currentOrganizationId } = useOnboarding();
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Fetch organization's active product categories
  const { data: activeCategories } = useQuery({
    queryKey: ['active-categories', currentOrganizationId],
    queryFn: async () => {
      if (!currentOrganizationId) return [];
      
      const { data, error } = await supabase
        .from('brand_products')
        .select('specs')
        .eq('org_id', currentOrganizationId);

      if (error) throw error;

      // Live schema keeps category inside specs.
      const categories = [...new Set(
        (data ?? [])
          .map((p) => (p.specs as Record<string, unknown> | null)?.category)
          .filter((c): c is string => typeof c === "string" && c.length > 0),
      )];
      return categories;
    },
    enabled: !!currentOrganizationId && open,
  });

  // Fetch user's most-used prompts for "Favorites" section
  const { data: favoritePrompts = [] } = useQuery({
    queryKey: ["favorite-prompts", currentOrganizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("organization_id", currentOrganizationId!)
        .eq("is_archived", false)
        .order("times_used", { ascending: false })
        .limit(3);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganizationId && open,
  });

  // Filter Quick Templates by active categories
  const filteredTemplates = showAllTemplates 
    ? QUICK_TEMPLATES 
    : QUICK_TEMPLATES.filter(template => {
        if (template.category === 'universal') return true;
        if (!activeCategories || activeCategories.length === 0) return true;
        return activeCategories.includes(template.category || '');
      });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl font-serif">Create a Prompt</DialogTitle>
          <DialogDescription>
            Choose how you'd like to get started
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-1">
          <div className="grid gap-3 sm:gap-4 mt-4 sm:mt-6">
            {/* Guided Wizard - PRIMARY */}
            <Card
              className="p-4 sm:p-6 cursor-pointer transition-all hover:shadow-md bg-parchment-white border border-charcoal/10 hover:border-aged-brass"
              onClick={onStartWizard}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-full bg-[hsl(var(--deep-charcoal))]">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(var(--soft-ivory))]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-serif mb-1 sm:mb-2">Guided Wizard (Recommended)</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Answer 5 quick questions and Madison will build a custom prompt for you. Perfect for first-time users.
                  </p>
                </div>
              </div>
            </Card>

            {/* Start from Template - SECONDARY */}
            <Card
              className="p-4 sm:p-6 cursor-pointer transition-all hover:shadow-md bg-parchment-white border border-charcoal/10 hover:border-aged-brass"
              onClick={onShowTemplates}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-full bg-[hsl(var(--stone-beige))]">
                  <Library className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(var(--deep-charcoal))]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-serif mb-1 sm:mb-2">Start from Template</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Choose from pre-built templates and customize them to your needs.
                  </p>
                </div>
              </div>
            </Card>

            {/* Import from Spreadsheet - TERTIARY */}
            <Card
              className="p-4 sm:p-6 cursor-pointer transition-all hover:shadow-md bg-parchment-white border border-charcoal/10 hover:border-aged-brass"
              onClick={onShowImport}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-full bg-[hsl(var(--stone-beige))]">
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-[hsl(var(--deep-charcoal))]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-serif mb-1 sm:mb-2">Import from Spreadsheet</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Already have prompts in Excel or Google Sheets? Import them all at once.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Your Favorites Section */}
          {favoritePrompts.length > 0 && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Star className="w-4 h-4 text-[hsl(var(--saffron-gold))]" />
                <h3 className="text-base sm:text-lg font-serif">Your Most-Used Templates</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {favoritePrompts.map((prompt: any) => (
                  <Card
                    key={prompt.id}
                    className="p-3 cursor-pointer transition-all hover:shadow-md hover:border-[hsl(var(--saffron-gold))]"
                    onClick={() => {
                      const templateData = {
                        purpose: (prompt.meta_instructions?.wizard_defaults?.purpose || prompt.title),
                        contentType: (prompt.meta_instructions?.wizard_defaults?.content_type || prompt.content_type),
                        collection: (prompt.meta_instructions?.wizard_defaults?.collection || prompt.collection),
                        tone: (prompt.meta_instructions?.wizard_defaults?.tone || "sophisticated"),
                        keyElements: (prompt.meta_instructions?.wizard_defaults?.key_elements || ""),
                        constraints: (prompt.meta_instructions?.wizard_defaults?.constraints || ""),
                        category: (prompt.meta_instructions?.wizard_defaults?.category || ""),
                      };
                      onStartWizard(templateData);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm mb-1">{prompt.title}</h4>
                        <p className="text-xs text-muted-foreground">Used {prompt.times_used} times</p>
                      </div>
                      <div className="text-xs text-[hsl(var(--saffron-gold))] font-medium">
                        {prompt.content_type}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Quick Templates Section */}
          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-serif">Quick Templates</h3>
              {activeCategories && activeCategories.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllTemplates(!showAllTemplates)}
                  className="text-xs h-7"
                >
                  {showAllTemplates ? "Show Relevant" : "Show All"}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTemplates.map((template) => (
                <Card
                  key={template.title}
                  className="p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md hover:border-[hsl(var(--saffron-gold))]"
                  onClick={() => {
                    const templateData = {
                      purpose: template.purpose,
                      contentType: template.contentType,
                      collection: "",
                      tone: template.tone,
                      keyElements: template.keyElements,
                      constraints: template.constraints,
                      category: template.category,
                    };
                    onStartWizard(templateData);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <template.icon className="w-5 h-5 text-[hsl(var(--deep-charcoal))]" />
                        {template.category && template.category !== 'universal' && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            {template.category.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-medium text-xs sm:text-sm mb-1">{template.title}</h4>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{template.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const QUICK_TEMPLATES: TemplateData[] = [
  // Personal Fragrance Templates
  {
    icon: Tag,
    title: "Perfume Launch",
    description: "Introduce new attar with fragrance pyramid",
    category: "personal_fragrance",
    purpose: "Announce a new perfume or attar from your collection with emphasis on the fragrance notes and scent journey",
    contentType: "product",
    tone: "sophisticated",
    keyElements: "Top notes, Middle notes, Base notes, Scent family, Collection story, Craftsmanship details",
    constraints: "Must reference product category: personal_fragrance. Use sensory language. Highlight the olfactory experience.",
  },
  {
    icon: FileText,
    title: "Scent Story",
    description: "Editorial piece about perfume inspiration",
    category: "personal_fragrance",
    purpose: "Create editorial content that tells the story behind a fragrance, its inspiration, and emotional resonance",
    contentType: "blog",
    tone: "intimate",
    keyElements: "Inspiration source, Creative process, Scent notes, Emotional narrative, Brand philosophy",
    constraints: "Keep under 800 words. Focus on storytelling over sales. Use evocative, poetic language.",
  },
  
  // Home Fragrance Templates
  {
    icon: Flame,
    title: "Candle Description",
    description: "Product page for candles with burn time",
    category: "home_fragrance",
    purpose: "Create compelling product descriptions for candles that emphasize ambiance, burn time, and scent profile",
    contentType: "product",
    tone: "warm",
    keyElements: "Scent profile, Burn time, Format (candle/diffuser), Room ambiance, Usage tips, Key ingredients",
    constraints: "Must reference product category: home_fragrance. Include technical details (burn time, size). Focus on atmosphere creation.",
  },
  {
    icon: Home,
    title: "Home Ambiance Guide",
    description: "How to use diffusers and room sprays",
    category: "home_fragrance",
    purpose: "Educational content about creating ambiance with home fragrances, including usage tips and placement",
    contentType: "blog",
    tone: "educational",
    keyElements: "Product types, Placement tips, Scent layering, Room-specific recommendations, Seasonal suggestions",
    constraints: "Include product category references. Provide actionable tips. Suggest specific products.",
  },
  
  // Skincare Templates
  {
    icon: Droplets,
    title: "Serum Benefits",
    description: "Product page highlighting key ingredients",
    category: "skincare",
    purpose: "Showcase skincare products with focus on natural ingredients, benefits, and usage instructions",
    contentType: "product",
    tone: "professional",
    keyElements: "Key ingredients, Benefits, Formulation type, Usage instructions, Skin type suitability, Natural/organic claims",
    constraints: "Must reference product category: skincare. Include ingredient transparency. Focus on efficacy and natural formulation.",
  },
  {
    icon: Leaf,
    title: "Natural Beauty Routine",
    description: "Editorial about oil-based skincare",
    category: "skincare",
    purpose: "Create editorial content about natural, oil-based skincare routines and the philosophy behind clean beauty",
    contentType: "blog",
    tone: "educational",
    keyElements: "Natural ingredients, Skincare philosophy, Product recommendations, Routine steps, Benefits of oils",
    constraints: "Emphasize natural/organic approach. Include product category context. Educational but not technical.",
  },
  
  // Universal Templates
  {
    icon: Mail,
    title: "Collection Newsletter",
    description: "Monthly newsletter across all categories",
    category: "universal",
    purpose: "Create a monthly newsletter that highlights new releases, behind-the-scenes content, and collection updates",
    contentType: "email",
    tone: "warm",
    keyElements: "New releases, Collection highlights, Brand story element, Call-to-action, Exclusive offer",
    constraints: "Keep under 400 words. Include clear CTA. Balance promotional with editorial content.",
  },
  {
    icon: Instagram,
    title: "Instagram Caption",
    description: "Social media storytelling for any product",
    category: "universal",
    purpose: "Create engaging Instagram captions that tell product stories with authenticity and visual appeal",
    contentType: "social",
    tone: "playful",
    keyElements: "Product highlight, Brand voice, Emojis, Hashtags, Call-to-action, Visual description",
    constraints: "Keep under 150 words. Include 3-5 relevant hashtags. Use line breaks for readability. Match image aesthetic.",
  },
];
