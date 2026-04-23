import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Bookmark, Sparkles, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCurrentOrganizationId } from "@/hooks/useIndustryConfig";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { contentTypeMapping, getContentTypeDisplayName } from "@/utils/contentTypeMapping";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SavePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptText: string;
  suggestedTitle?: string;
  onSaved?: () => void;
  // When provided, we tag the prompt for a specific deliverable collection
  deliverableFormat?: string;
}

export function SavePromptDialog({
  open,
  onOpenChange,
  promptText,
  suggestedTitle = "",
  onSaved,
  deliverableFormat,
}: SavePromptDialogProps) {
  const { currentOrganizationId } = useOnboarding();
  const { orgId: resolvedOrganizationId } = useCurrentOrganizationId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const organizationId = currentOrganizationId || resolvedOrganizationId || null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedContentType, setSelectedContentType] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isTemplate, setIsTemplate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState(promptText);
  const [showPlaceholderSuggestions, setShowPlaceholderSuggestions] = useState(false);
  
  // Field mapping state
  const [enableFieldMapping, setEnableFieldMapping] = useState(false);
  const [fieldMappings, setFieldMappings] = useState({
    product: "",
    format: "",
    audience: "",
    goal: "",
    additionalContext: ""
  });

  // Common placeholder suggestions
  const placeholderSuggestions = [
    { label: "Product Name", value: "{{PRODUCT_NAME}}" },
    { label: "Content Type", value: "{{CONTENT_TYPE}}" },
    { label: "Tone", value: "{{TONE}}" },
    { label: "Purpose", value: "{{PURPOSE}}" },
    { label: "Key Elements", value: "{{KEY_ELEMENTS}}" },
    { label: "Target Audience", value: "{{TARGET_AUDIENCE}}" },
    { label: "Word Count", value: "{{WORD_COUNT}}" },
    { label: "Custom Instructions", value: "{{CUSTOM_INSTRUCTIONS}}" },
  ];

  // Update edited prompt text when promptText prop changes
  useEffect(() => {
    setEditedPromptText(promptText);
  }, [promptText]);

// Set suggested title when dialog opens
useEffect(() => {
  if (open && suggestedTitle) {
    setTitle(suggestedTitle);
  }
}, [open, suggestedTitle]);

// Pre-fill for image prompts
useEffect(() => {
  if (open && deliverableFormat === 'image_prompt') {
    if (!selectedCategory) setSelectedCategory('visual');
    if (!selectedContentType) setSelectedContentType('visual');
  }
}, [open, deliverableFormat]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setSelectedCategory("");
      setSelectedContentType("");
      setTags([]);
      setTagInput("");
      setIsTemplate(true);
      setEnableFieldMapping(false);
      setFieldMappings({
        product: "",
        format: "",
        audience: "",
        goal: "",
        additionalContext: ""
      });
      setEditedPromptText(promptText);
      setShowPlaceholderSuggestions(false);
    }
  }, [open, promptText]);

  const handleInsertPlaceholder = (placeholder: string) => {
    setEditedPromptText(prev => prev + " " + placeholder);
    setShowPlaceholderSuggestions(false);
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title for your prompt",
        variant: "destructive",
      });
      return;
    }

    if (!editedPromptText.trim()) {
      toast({
        title: "Error",
        description: "Prompt text cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCategory) {
      toast({
        title: "Error",
        description: "Please select a category",
        variant: "destructive",
      });
      return;
    }

    if (!selectedContentType) {
      toast({
        title: "Error",
        description: "Please select a content type",
        variant: "destructive",
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: "Error",
        description: "No organization found. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

setIsSaving(true);

try {
  const normalizedContentType = (
    ["product", "email", "social", "visual", "blog"].includes(selectedCategory)
      ? selectedCategory
      : selectedContentType
  ) as "product" | "email" | "social" | "visual" | "blog";

  const trimmedDescription = description.trim();
  const user = (await supabase.auth.getUser()).data.user;

  const { error } = await supabase.from("prompts").insert({
    title: title.trim(),
    prompt_text: editedPromptText,
    content_type: normalizedContentType,
    collection: "General",
    category: selectedCategory,
    tags: tags.length > 0 ? tags : null,
    is_template: isTemplate,
    additional_context: trimmedDescription
      ? {
          description: trimmedDescription,
        }
      : null,
    meta_instructions: {
      category: selectedCategory,
      content_subtype: selectedContentType,
      description: trimmedDescription || undefined,
      field_mappings: enableFieldMapping ? fieldMappings : undefined,
    },
    organization_id: organizationId,
    created_by: user?.id,
    deliverable_format: deliverableFormat ?? null,
  });

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["saved-templates"] }),
        queryClient.invalidateQueries({ queryKey: ["templates"] }),
        queryClient.invalidateQueries({ queryKey: ["image-prompt-counts", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-counts", organizationId] }),
      ]);

      toast({
        title: "Success",
        description: "Prompt template saved successfully",
      });

      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving prompt:", error);
      const err = error as { message?: string; details?: string } | null;
      toast({
        title: "Error",
        description: err?.message || err?.details || "Failed to save prompt template",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink-black text-lg sm:text-xl">
            <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-brass" />
            Save as Prompt Template
          </DialogTitle>
          <DialogDescription className="text-warm-gray text-sm">
            Create a reusable template from this prompt for future use
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {/* Prompt Preview with Edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-ink-black">
                Prompt Text
              </Label>
              {isMobile ? (
                <Sheet open={showPlaceholderSuggestions} onOpenChange={setShowPlaceholderSuggestions}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs min-h-[44px] border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10"
                    >
                      <Plus className="w-3 h-3" />
                      Add Placeholder
                    </Button>
                  </SheetTrigger>
                    <SheetContent side="bottom" className="bg-brand-parchment h-[50vh]">
                    <SheetHeader>
                      <SheetTitle>Insert Placeholder</SheetTitle>
                      <SheetDescription>
                        Choose a placeholder token to insert into this prompt template.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-2 mt-4 overflow-y-auto max-h-[calc(50vh-80px)]">
                      {placeholderSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.value}
                          onClick={() => handleInsertPlaceholder(suggestion.value)}
                          className="w-full text-left px-4 py-3 min-h-[48px] rounded-lg hover:bg-brand-brass/10 transition-colors flex items-center justify-between active:bg-brand-brass/20"
                        >
                          <span className="text-brand-charcoal font-medium">{suggestion.label}</span>
                          <code className="text-sm text-brand-brass">
                            {suggestion.value}
                          </code>
                        </button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              ) : (
                <Popover open={showPlaceholderSuggestions} onOpenChange={setShowPlaceholderSuggestions}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs border-brand-brass text-brand-brass hover:bg-brand-brass/10"
                    >
                      <Plus className="w-3 h-3" />
                      Add Placeholder
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2 bg-brand-parchment" align="end">
                    <div className="space-y-1">
                      <p className="text-xs text-brand-charcoal px-2 py-1 font-medium">
                        Click to insert:
                      </p>
                      {placeholderSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.value}
                          onClick={() => handleInsertPlaceholder(suggestion.value)}
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-brand-brass/10 transition-colors flex items-center justify-between group"
                        >
                          <span className="text-brand-charcoal">{suggestion.label}</span>
                          <code className="text-xs text-brand-brass opacity-60 group-hover:opacity-100">
                            {suggestion.value}
                          </code>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <Textarea
              value={editedPromptText}
              onChange={(e) => setEditedPromptText(e.target.value)}
              className="bg-brand-parchment border-brand-stone/20 min-h-[150px] sm:min-h-[120px] font-mono text-sm touch-auto"
              placeholder="Enter your prompt text here. Use {{PLACEHOLDER}} syntax for dynamic values."
            />
            <p className="text-xs text-brand-charcoal mt-1">
              <Sparkles className="w-3 h-3 inline mr-1" />
              Tip: Add placeholders like <code className="bg-brand-brass/10 px-1 rounded">{"{{PRODUCT_NAME}}"}</code> to make this template reusable
            </p>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="prompt-title" className="text-sm font-medium text-ink-black mb-2 block">
              Title *
            </Label>
            <Input
              id="prompt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Product Description - Luxury Fragrance"
              className="bg-parchment-white border-warm-gray/20"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="prompt-description" className="text-sm font-medium text-ink-black mb-2 block">
              Description (Optional)
            </Label>
            <Textarea
              id="prompt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe when and how to use this prompt template..."
              className="bg-parchment-white border-warm-gray/20 min-h-[80px]"
            />
          </div>

          {/* Category Selection */}
          <div>
            <Label htmlFor="category" className="text-sm font-medium text-ink-black mb-2 block">
              Category *
            </Label>
            <Select 
              value={selectedCategory} 
              onValueChange={(value) => {
                setSelectedCategory(value);
                setSelectedContentType(""); // Reset content type when category changes
              }}
            >
              <SelectTrigger className="bg-parchment-white border-warm-gray/20 min-h-[48px] sm:min-h-[40px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {contentTypeMapping.map((type) => (
                  <SelectItem key={type.name} value={type.name.toLowerCase()}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content Type Selection (Sub-type) */}
          {selectedCategory && (
            <div>
              <Label htmlFor="contentType" className="text-sm font-medium text-ink-black mb-2 block">
                Content Type *
              </Label>
              <Select value={selectedContentType} onValueChange={setSelectedContentType}>
                <SelectTrigger className="bg-parchment-white border-warm-gray/20 min-h-[48px] sm:min-h-[40px]">
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  {contentTypeMapping
                    .find((type) => type.name.toLowerCase() === selectedCategory)
                    ?.keys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {getContentTypeDisplayName(key)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tags */}
          <div>
            <Label htmlFor="prompt-tags" className="text-sm font-medium text-ink-black mb-2 block">
              Tags
            </Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="prompt-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add tags (press Enter)"
                  className="bg-parchment-white border-warm-gray/20"
                />
                <Button
                  type="button"
                  onClick={handleAddTag}
                  variant="outline"
                  className="border-brass text-brass hover:bg-brass/10"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-brass/10 text-brass hover:bg-brass/20 pl-3 pr-1 py-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-2 hover:text-brass-glow"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Save as Template Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-template"
              checked={isTemplate}
              onCheckedChange={(checked) => setIsTemplate(checked as boolean)}
              className="border-brass data-[state=checked]:bg-brass data-[state=checked]:border-brass"
            />
            <Label
              htmlFor="is-template"
              className="text-sm font-medium text-ink-black cursor-pointer"
            >
              Save as reusable template
            </Label>
          </div>

          {/* Field Mapping Section */}
          <div className="space-y-4 border-t border-warm-gray/20 pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enable-field-mapping"
                checked={enableFieldMapping}
                onCheckedChange={(checked) => setEnableFieldMapping(checked as boolean)}
                className="border-brass data-[state=checked]:bg-brass data-[state=checked]:border-brass"
              />
              <Label
                htmlFor="enable-field-mapping"
                className="text-sm font-medium text-ink-black cursor-pointer"
              >
                Smart Field Mapping (Auto-fill Create form)
              </Label>
            </div>
            
            {enableFieldMapping && (
              <div className="pl-6 space-y-3 p-4 bg-muted/20 rounded-lg">
                <p className="text-xs text-muted-foreground mb-3">
                  Map parts of your prompt to specific form fields. Use placeholders like {`{{PRODUCT}}`} to make them dynamic.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Product</Label>
                  <Input
                    value={fieldMappings.product}
                    onChange={(e) => setFieldMappings(prev => ({ ...prev, product: e.target.value }))}
                    placeholder="e.g., {{PRODUCT_NAME}} or leave empty"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Format</Label>
                  <Input
                    value={fieldMappings.format}
                    onChange={(e) => setFieldMappings(prev => ({ ...prev, format: e.target.value }))}
                    placeholder="e.g., Social Media Post"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Audience</Label>
                  <Input
                    value={fieldMappings.audience}
                    onChange={(e) => setFieldMappings(prev => ({ ...prev, audience: e.target.value }))}
                    placeholder="e.g., {{TARGET_AUDIENCE}} or Luxury buyers"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Goal</Label>
                  <Input
                    value={fieldMappings.goal}
                    onChange={(e) => setFieldMappings(prev => ({ ...prev, goal: e.target.value }))}
                    placeholder="e.g., Drive product awareness"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Additional Context (Full prompt)</Label>
                  <Textarea
                    value={fieldMappings.additionalContext}
                    onChange={(e) => setFieldMappings(prev => ({ ...prev, additionalContext: e.target.value }))}
                    placeholder="The full prompt text will be used here by default"
                    className="text-sm min-h-[60px]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t border-warm-gray/20">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px] border-warm-gray/20 text-warm-gray hover:bg-warm-gray/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            variant="brass"
            className="w-full sm:w-auto min-h-[44px] gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                Saving...
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" />
                Save Template
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
