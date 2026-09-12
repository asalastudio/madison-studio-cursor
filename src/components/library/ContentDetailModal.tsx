import { useState, useEffect, useRef, useMemo } from "react";
import { Edit2, Send, Copy, Check, FileDown, Calendar, MessageSquare, Download, Trash2, X, Mail, Linkedin, Globe, Image as ImageIcon, ImagePlus } from "lucide-react";
import { ImageLibraryPicker } from "@/components/email-composer/ImageLibraryPicker";
import { PublishToLinkedIn } from "./PublishToLinkedIn";
import { PublishToSanity } from "./PublishToSanity";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getContentSubtypeLabel } from "@/utils/contentSubtypeLabels";
import { exportAsPDF, exportAsDocx, exportAsText } from "@/utils/exportHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorialAssistantPanel } from "@/components/assistant/EditorialAssistantPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deserializeEmailState } from "@/utils/emailStateSerializer";

type ContentCategory = "prompt" | "output" | "master" | "derivative";

interface ContentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: any;
  category: ContentCategory;
  onUpdate?: () => void;
  onRepurpose?: (contentId: string) => void;
  onSchedule?: (content: any, category: ContentCategory) => void;
  onEditWithMadison?: (content: any, category: ContentCategory) => void;
}

export function ContentDetailModal({
  open,
  onOpenChange,
  content,
  category,
  onUpdate,
  onRepurpose,
  onSchedule,
  onEditWithMadison,
}: ContentDetailModalProps) {
  const { enabled: isBestBottlesOrg } = useGridPipelineFeatureFlag();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [madisonDialogOpen, setMadisonDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [klaviyoModalOpen, setKlaviyoModalOpen] = useState(false);
  const [dependencyCounts, setDependencyCounts] = useState<{
    derivatives: number;
    scheduled: number;
  }>({ derivatives: 0, scheduled: 0 });
  const [isPublished, setIsPublished] = useState(content?.status === 'published');
  const [isPublishing, setIsPublishing] = useState(false);
  const [featuredImageUrl, setFeaturedImageUrl] = useState(content?.featured_image_url || '');
  const [orgData, setOrgData] = useState<{
    name?: string;
    brandColor?: string;
    logoBase64?: string;
  }>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const contentType = content.content_type || content.asset_type;
  const subtypeLabel = contentType ? getContentSubtypeLabel(contentType) : null;

  // Detect if this is a visual asset (generated image)
  const isVisualAsset = content.sourceTable === "generated_images" ||
                        content.content_type === "visual-asset" ||
                        content.asset_type === "visual-asset";

  // Check if this is an Email Composer email
  const emailComposerData = useMemo(() => {
    if (category === "master" && contentType === "Email" && content.full_content) {
      try {
        const emailState = deserializeEmailState(content.full_content);
        if (emailState.generatedHtml) {
          return emailState;
        }
      } catch (e) {
        // Not a serialized email, treat as regular content
      }
    }
    return null;
  }, [content, category, contentType]);

  const isEmailComposer = !!emailComposerData;

  const getContentText = () => {
    if (category === "prompt") return content.prompt_text;
    if (category === "output") return content.generated_content;
    if (category === "master") return content.full_content;
    if (category === "derivative") return content.generated_content;
    return "";
  };

  const getImageUrl = () => {
    if (!content) return null;
    if (content.imageUrl) return content.imageUrl;
    if (content.image_url) return content.image_url;
    if (content.generated_content && typeof content.generated_content === 'string' &&
        (content.generated_content.startsWith('data:image/') || content.generated_content.startsWith('http'))) {
      return content.generated_content;
    }
    if (typeof content.content === 'string' &&
        (content.content.startsWith('data:image/') || content.content.startsWith('http'))) {
      return content.content;
    }
    return null;
  };

  const handleEdit = () => {
    setEditedContent(getContentText());
    setIsEditing(true);
  };

  const handleEditTitle = () => {
    setEditedTitle(content.title || "");
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim()) {
      toast({
        title: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const table =
        category === "prompt"
          ? "prompts"
          : category === "output"
          ? "outputs"
          : category === "derivative"
          ? "derivative_assets"
          : category === "master"
          ? "master_content"
          : "generated_images";

      const { error } = await supabase
        .from(table)
        .update({ title: editedTitle.trim() })
        .eq("id", content.id);

      if (error) throw error;

      toast({
        title: "Title updated",
        description: "Content title has been renamed successfully",
      });

      content.title = editedTitle.trim(); // Update local content object
      setIsEditingTitle(false);
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Failed to update title",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    try {
      const table =
        category === "prompt"
          ? "prompts"
          : category === "output"
          ? "outputs"
          : category === "derivative"
          ? "derivative_assets"
          : "master_content";

      const field =
        category === "prompt"
          ? "prompt_text"
          : category === "master"
          ? "full_content"
          : "generated_content";

      console.log('[ContentDetailModal] Saving content:', {
        table,
        field,
        contentId: content.id,
        contentLength: editedContent?.length,
      });

      const { data, error } = await supabase
        .from(table)
        .update({ [field]: editedContent })
        .eq("id", content.id)
        .select();

      console.log('[ContentDetailModal] Save response:', { data, error });

      if (error) throw error;

      // Update the content object locally so it reflects immediately
      if (content) {
        content[field] = editedContent;
        // Also update the aliased fields
        if (field === 'full_content') {
          content.generated_content = editedContent;
        }
        if (field === 'generated_content') {
          content.full_content = editedContent;
        }
      }

      toast({
        title: "Content updated",
        description: "Your changes have been saved successfully.",
      });

      setIsEditing(false);
      onUpdate?.();
    } catch (error: any) {
      console.error('[ContentDetailModal] Save error:', error);
      toast({
        title: "Error updating content",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    if (isVisualAsset) {
      await navigator.clipboard.writeText(getImageUrl());
      toast({
        title: "Image URL copied",
        description: "Image URL has been copied to your clipboard.",
      });
    } else {
      await navigator.clipboard.writeText(getContentText());
      toast({
        title: "Copied to clipboard",
        description: "Content has been copied to your clipboard.",
      });
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadImage = async () => {
    const imageUrl = getImageUrl();
    if (!imageUrl) {
      toast({ title: "Image URL not found", variant: "destructive" });
      return;
    }

    try {
      const { downloadImage } = await import("@/utils/imageDownload");
      await downloadImage(imageUrl, `${content?.title || 'image'}.png`);
      toast({ title: "Image downloaded" });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Failed to download",
        description: error instanceof Error ? error.message : "Try right-click 'Save Image As'",
        variant: "destructive"
      });
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const cursorPosition = e.target.selectionStart;
    setEditedContent(e.target.value);

    // Preserve cursor position after state update
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPosition;
        textareaRef.current.selectionEnd = cursorPosition;
      }
    });
  };

  // Fetch organization data and dependency counts when modal opens
  useEffect(() => {
    // Validate organization_id is a valid UUID before querying
    const isValidUUID = content?.organization_id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(content.organization_id);

    if (open && isValidUUID) {
      supabase
        .from("organizations")
        .select("name, brand_config")
        .eq("id", content.organization_id)
        .single()
        .then(async ({ data }) => {
          if (data) {
            // Safely parse brand_config
            let brandColor: string | undefined;
            if (data.brand_config && typeof data.brand_config === 'object') {
              const config = data.brand_config as Record<string, any>;
              brandColor = config.primaryColor as string | undefined;
            }

            // Try to load logo as base64
            let logoBase64: string | undefined;
            try {
              const logoPath = window.location.origin + "/logo-full.png";
              const response = await fetch(logoPath);
              const blob = await response.blob();
              logoBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            } catch (error) {
              console.error("Error loading logo:", error);
            }

            setOrgData({
              name: data.name,
              brandColor,
              logoBase64,
            });
          }
        });
    }

    // Fetch dependency counts if this is archived master content
    if (open && content?.is_archived && category === "master") {
      Promise.all([
        supabase
          .from("derivative_assets")
          .select("id", { count: 'exact', head: true })
          .eq("master_content_id", content.id),
        supabase
          .from("scheduled_content")
          .select("id", { count: 'exact', head: true })
          .eq("content_id", content.id),
      ]).then(([derivRes, schedRes]) => {
        setDependencyCounts({
          derivatives: derivRes.count || 0,
          scheduled: schedRes.count || 0,
        });
      });
    }
  }, [open, content?.organization_id, content?.is_archived, content?.id, category]);

  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    setIsExporting(true);
    try {
      const metadata = {
        title: content.title || 'Untitled',
        contentType: subtypeLabel || contentType || category,
        collection: content.collection,
        createdAt: content.created_at,
        wordCount: content.word_count,
        organizationName: orgData.name,
        brandColor: orgData.brandColor,
        logoBase64: orgData.logoBase64,
      };

      const contentText = getContentText();

      if (format === 'pdf') {
        exportAsPDF(contentText, metadata);
      } else if (format === 'docx') {
        await exportAsDocx(contentText, metadata);
      } else {
        exportAsText(contentText, metadata);
      }

      toast({
        title: "Export successful",
        description: `Content exported as ${format.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const table =
        category === "prompt"
          ? "prompts"
          : category === "output"
          ? "outputs"
          : category === "derivative"
          ? "derivative_assets"
          : category === "master"
          ? "master_content"
          : "generated_images";

      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", content.id);

      if (error) throw error;

      toast({
        title: "Content deleted",
        description: "The content has been permanently deleted.",
      });

      onOpenChange(false);
      onUpdate?.();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Handle publish/unpublish to website
  const handleTogglePublish = async () => {
    if (category !== 'master') return;

    setIsPublishing(true);
    const newStatus = isPublished ? 'draft' : 'published';

    try {
      const { error } = await supabase
        .from('master_content')
        .update({
          status: newStatus,
          published_at: newStatus === 'published' ? new Date().toISOString() : null
        })
        .eq('id', content.id);

      if (error) throw error;

      setIsPublished(!isPublished);
      toast({
        title: newStatus === 'published' ? "Published to Website!" : "Unpublished",
        description: newStatus === 'published'
          ? "This content is now available on your website's blog feed."
          : "Content removed from public website feed.",
      });
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Update isPublished and featuredImageUrl when content changes
  useEffect(() => {
    setIsPublished(content?.status === 'published');
    setFeaturedImageUrl(content?.featured_image_url || '');
  }, [content?.status, content?.featured_image_url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    className="text-2xl font-serif px-3 py-1 border rounded flex-1"
                    autoFocus
                  />
                  <Button onClick={handleSaveTitle} size="sm" variant="default">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button onClick={() => setIsEditingTitle(false)} size="sm" variant="ghost">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-3 group">
                  <DialogTitle className="text-2xl font-serif">
                    {content.title || "Content Details"}
                  </DialogTitle>
                  <Button
                    onClick={handleEditTitle}
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {contentType && (
                  <Badge variant="outline" className="bg-stone-100/80 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-600">
                    {subtypeLabel || contentType}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border/40 text-xs capitalize">
                  {category}
                </Badge>
                {content.collection && (
                  <Badge variant="secondary">
                    {content.collection}
                  </Badge>
                )}
                {/* Published status badge */}
                {category === 'master' && isPublished && (
                  <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                    <Globe className="w-3 h-3 mr-1" />
                    Published
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          {/* Featured Image Section - Only for master content */}
          {category === 'master' && (
            <div className="border border-border/40 rounded-lg p-4 bg-muted/20">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <ImageIcon className="w-4 h-4" />
                Featured Image
              </div>

              <ImageLibraryPicker
                value={featuredImageUrl}
                onChange={async (url) => {
                  // Only update if the value actually changed
                  if (url === content?.featured_image_url) return;

                  console.log('[FeaturedImage] Saving:', { contentId: content.id, url: url?.substring(0, 50) });

                  // Try to save to database first - use type assertion to bypass generated types
                  const { data, error } = await supabase
                    .from('master_content')
                    .update({ featured_image_url: url || null } as any)
                    .eq('id', content.id)
                    .select();

                  console.log('[FeaturedImage] Response:', { data, error });

                  if (error) {
                    console.error('[FeaturedImage] Save error:', error);
                    toast({
                      title: "Error saving image",
                      description: error.message.includes('column')
                        ? "Database needs migration. Run: ALTER TABLE master_content ADD COLUMN featured_image_url TEXT;"
                        : error.message,
                      variant: "destructive",
                    });
                    // Don't update local state if save failed
                    return;
                  }

                  // Only update local state after successful save
                  setFeaturedImageUrl(url);
                  toast({
                    title: "Featured image updated",
                    description: url ? "Image saved." : "Image removed.",
                  });
                  onUpdate?.();
                }}
              />
            </div>
          )}

          {/* Content Display/Edit */}
          {isVisualAsset && !isEditing ? (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-6 border border-border/40">
                <img
                  src={getImageUrl()}
                  alt={content.title || "Generated image"}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Image Metadata */}
              <div className="bg-muted/20 rounded-lg p-4 border border-border/30 space-y-2 text-sm">
                {content.final_prompt && (
                  <div>
                    <span className="font-medium text-muted-foreground">Prompt:</span>
                    <p className="text-foreground mt-1">{content.final_prompt}</p>
                  </div>
                )}
                {content.aspect_ratio && (
                  <div>
                    <span className="font-medium text-muted-foreground">Aspect Ratio:</span>
                    <span className="ml-2 text-foreground">{content.aspect_ratio}</span>
                  </div>
                )}
                {content.goal_type && (
                  <div>
                    <span className="font-medium text-muted-foreground">Goal:</span>
                    <span className="ml-2 text-foreground capitalize">{content.goal_type}</span>
                  </div>
                )}
              </div>
            </div>
          ) : isEditing ? (
            <div className="space-y-3">
              <Textarea
                ref={textareaRef}
                value={editedContent}
                onChange={handleContentChange}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Edit your content..."
              />
              <div className="flex gap-2">
                <Button onClick={handleSave} size="sm">
                  Save Changes
                </Button>
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-lg p-6 border border-border/40">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {getContentText()}
              </pre>
            </div>
          )}

          {/* Action Buttons */}
          {!isEditing && (
            <div className="flex items-center gap-2 pt-4 border-t border-border/40">
              {/* Special Edit button for Email Composer emails - Temporarily hidden for launch */}
              {/* {isEmailComposer ? (
                <Button
                  onClick={() => window.location.href = `/email-builder?contentId=${content.id}&sourceTable=master_content`}
                  variant="default"
                  size="sm"
                  className="bg-brass hover:bg-brass/90"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Edit in Email Composer
                </Button>
              ) : */ !isVisualAsset && (
                <Button onClick={handleEdit} variant="outline" size="sm">
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}

              {isVisualAsset ? (
                <Button onClick={handleDownloadImage} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download Image
                </Button>
              ) : null}

              <Button onClick={handleCopy} variant="outline" size="sm">
                {isCopied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {isCopied ? "Copied!" : isVisualAsset ? "Copy URL" : "Copy"}
              </Button>

              {onSchedule && (
                <Button
                  onClick={() => {
                    onSchedule(content, category);
                    onOpenChange(false);
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule
                </Button>
              )}

              {/* Publish to Klaviyo for Email Campaigns */}
              {contentType && (contentType.toLowerCase().includes('email') || contentType === 'email_campaign') && (
                <Button
                  onClick={() => {
                    setKlaviyoModalOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-[#E1B16A]/10 hover:bg-[#E1B16A]/20 border-[#E1B16A]/30"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Publish
                </Button>
              )}

              {/* Publish to Website - for master content only */}
              {category === 'master' && (
                <Button
                  onClick={handleTogglePublish}
                  variant={isPublished ? "default" : "outline"}
                  size="sm"
                  disabled={isPublishing}
                  className={isPublished ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                >
                  <Globe className="w-4 h-4 mr-2" />
                  {isPublishing ? "Updating..." : isPublished ? "Published ✓" : "Publish to Website"}
                </Button>
              )}

              {/* Publish to LinkedIn - available for master/derivative content and social posts */}
              {(
                category === 'master' ||
                category === 'derivative' ||
                (contentType && (
                  contentType.toLowerCase().includes('social') ||
                  contentType.toLowerCase().includes('linkedin') ||
                  contentType.toLowerCase().includes('post')
                ))
              ) && (
                <PublishToLinkedIn
                  content={getContentText()}
                  contentId={content.id}
                  contentTable={category === 'master' ? 'master_content' : category === 'derivative' ? 'derivative_assets' : 'outputs'}
                  variant="outline"
                  size="sm"
                />
              )}

              {/* Publish to Sanity - available for all content types */}
              <PublishToSanity
                content={content}
                contentType={category === 'master' ? 'master' : category === 'derivative' ? 'derivative' : 'output'}
                variant="outline"
                size="sm"
                buttonText={isBestBottlesOrg ? "Publish to journal" : "Publish to Sanity"}
                bestBottles={isBestBottlesOrg}
              />

              <Button
                onClick={() => {
                  onEditWithMadison?.(content, category);
                  onOpenChange(false);
                }}
                variant="outline"
                size="sm"
                disabled={!onEditWithMadison}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Edit with Madison
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isExporting}>
                    <FileDown className="w-4 h-4 mr-2" />
                    {isExporting ? "Exporting..." : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('docx')}>
                    Export as DOCX
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('txt')}>
                    Export as TXT
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {(category === "master" || category === "output") && onRepurpose && (
                <Button
                  onClick={() => {
                    onRepurpose(content.id);
                    onOpenChange(false);
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Multiply
                </Button>
              )}

              {content.is_archived && (
                <Button
                  onClick={() => setDeleteDialogOpen(true)}
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete Permanently"}
                </Button>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-border/40 text-xs text-muted-foreground space-y-1">
            <p>Created: {new Date(content.created_at).toLocaleDateString()}</p>
            {content.updated_at && (
              <p>Updated: {new Date(content.updated_at).toLocaleDateString()}</p>
            )}
            {category === "output" && content.prompts && (
              <p>From prompt: {content.prompts.title}</p>
            )}
            {category === "derivative" && content.master_content && (
              <p>From master: {content.master_content.title}</p>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this content permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "{content.title || 'this content'}"
              from the archives.
              {category === "master" && (dependencyCounts.derivatives > 0 || dependencyCounts.scheduled > 0) && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    This will also delete:
                  </p>
                  <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200 text-sm">
                    {dependencyCounts.derivatives > 0 && (
                      <li>• {dependencyCounts.derivatives} derivative{dependencyCounts.derivatives > 1 ? 's' : ''}</li>
                    )}
                    {dependencyCounts.scheduled > 0 && (
                      <li>• {dependencyCounts.scheduled} scheduled item{dependencyCounts.scheduled > 1 ? 's' : ''}</li>
                    )}
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Madison Dialog */}
      <Dialog open={madisonDialogOpen} onOpenChange={setMadisonDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="h-[85vh]">
            <EditorialAssistantPanel
              initialContent={getContentText()}
              onClose={() => setMadisonDialogOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Removed - Use /klaviyo-composer route instead */}
    </Dialog>
  );
}
