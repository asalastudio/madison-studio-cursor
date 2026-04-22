import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, X, Archive, Filter, Search, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LibraryFilters } from "@/components/library/LibraryFilters";
import { ContentCard } from "@/components/library/ContentCard";
import { ContentDetailModal } from "@/components/library/ContentDetailModal";
import { EmptyState } from "@/components/library/EmptyState";
import { SortOption } from "@/components/library/SortDropdown";
import { useLibraryContent, LibraryContentItem } from "@/hooks/useLibraryContent";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScheduleModal } from "@/components/calendar/ScheduleModal";
import { MadisonSplitEditor } from "@/components/library/MadisonSplitEditor";
import { EmailSequenceEditor } from "@/components/library/EmailSequenceEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/logger";
import { contentTypeMatchesFilter } from "@/config/libraryContentTypes";

// Image Editor Modal for generated images
import { ImageEditorModal, type ImageEditorImage } from "@/components/image-editor/ImageEditorModal";

// Helper to detect if content type is an email sequence
const isEmailSequenceType = (contentType: string | undefined): boolean => {
  if (!contentType) return false;
  const lowerType = contentType.toLowerCase();
  // Match patterns like: email_3part, email_5part, email_7part, 3-part email, etc.
  return (
    /email.*\d+.*part/i.test(lowerType) ||
    /\d+.*part.*email/i.test(lowerType) ||
    lowerType.includes('email_3part') ||
    lowerType.includes('email_5part') ||
    lowerType.includes('email_7part')
  );
};

export default function Library() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: libraryContent = [], isLoading, refetch } = useLibraryContent(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContentType, setSelectedContentType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedContent, setSelectedContent] = useState<LibraryContentItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Schedule modal states
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [derivativeAssetForSchedule, setDerivativeAssetForSchedule] = useState<any>(null);
  const [masterForSchedule, setMasterForSchedule] = useState<any>(null);

  // Madison split editor state
  const [madisonOpen, setMadisonOpen] = useState(false);
  const [madisonContext, setMadisonContext] = useState<{
    id: string;
    category: "master" | "output" | "derivative";
    initialText: string;
    title?: string;
  } | null>(null);

  // Email sequence editor state
  const [emailSequenceOpen, setEmailSequenceOpen] = useState(false);
  const [emailSequenceContext, setEmailSequenceContext] = useState<{
    id: string;
    category: "master" | "output" | "derivative";
    initialText: string;
    title?: string;
    contentType?: string;
    platformSpecs?: Record<string, unknown> | null;
  } | null>(null);

  // Image editor modal state (for generated images)
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [imageEditorImage, setImageEditorImage] = useState<ImageEditorImage | null>(null);

  // Read status filter from URL params on mount
  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'scheduled') {
      navigate('/calendar');
      return;
    }
    if (status && ['draft', 'published'].includes(status)) {
      setSelectedStatus(status);
    }
  }, [searchParams, navigate]);

  // Filtering and sorting logic
  const filteredContent = useMemo(() => {
    let filtered = [...libraryContent];

    // Filter by archived status
    filtered = filtered.filter(c => showArchived ? c.archived : !c.archived);

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(query) ||
        (c.content && c.content.toLowerCase().includes(query))
      );
    }

    // Filter by content type (supports grouped filters like "all_emails")
    if (selectedContentType !== "all") {
      filtered = filtered.filter(c => contentTypeMatchesFilter(c.contentType, selectedContentType));
    }

    // Filter by status (draft, scheduled, published)
    if (selectedStatus !== "all") {
      filtered = filtered.filter(c => c.status === selectedStatus);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return b.createdAt.getTime() - a.createdAt.getTime();
        case "alphabetical":
          return a.title.localeCompare(b.title);
        case "mostUsed":
          return (b.rating || 0) - (a.rating || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [libraryContent, searchQuery, selectedContentType, sortBy, showArchived]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedContentType("all");
    setSelectedStatus("all");
    setShowArchived(false);
  };

  const handleToggleSelection = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredContent.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredContent.map(c => c.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedItems.size === 0) return;

    setIsDeleting(true);
    try {
      const itemsByTable = {
        master_content: [] as string[],
        outputs: [] as string[],
        derivative_assets: [] as string[],
        generated_images: [] as string[]
      };

      selectedItems.forEach(id => {
        const item = libraryContent.find(c => c.id === id);
        if (item) {
          itemsByTable[item.sourceTable as keyof typeof itemsByTable].push(id);
        }
      });

      const updatePromises = [];

      if (itemsByTable.master_content.length > 0) {
        updatePromises.push(
          supabase
            .from('master_content')
            .update({ is_archived: !showArchived, archived_at: !showArchived ? new Date().toISOString() : null })
            .in('id', itemsByTable.master_content)
        );
      }

      if (itemsByTable.outputs.length > 0) {
        updatePromises.push(
          supabase
            .from('outputs')
            .update({ is_archived: !showArchived, archived_at: !showArchived ? new Date().toISOString() : null })
            .in('id', itemsByTable.outputs)
        );
      }

      if (itemsByTable.derivative_assets.length > 0) {
        updatePromises.push(
          supabase
            .from('derivative_assets')
            .update({ is_archived: !showArchived, archived_at: !showArchived ? new Date().toISOString() : null })
            .in('id', itemsByTable.derivative_assets)
        );
      }

      if (itemsByTable.generated_images.length > 0) {
        updatePromises.push(
          supabase
            .from('generated_images')
            .update({ is_archived: !showArchived, archived_at: !showArchived ? new Date().toISOString() : null })
            .in('id', itemsByTable.generated_images)
        );
      }

      await Promise.all(updatePromises);

      toast({
        title: showArchived ? "Items unarchived" : "Items archived",
        description: `Successfully ${showArchived ? 'unarchived' : 'archived'} ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}`,
      });

      setSelectedItems(new Set());
      refetch();
    } catch (error) {
      logger.error('Error archiving items:', error);
      toast({
        title: "Archive failed",
        description: "Failed to archive selected items. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;

    // Check if all selected items are archived
    const selectedContentItems = Array.from(selectedItems).map(id =>
      libraryContent.find(c => c.id === id)
    ).filter(Boolean);

    const hasNonArchivedItems = selectedContentItems.some(item => !item?.archived);

    if (hasNonArchivedItems) {
      toast({
        title: "Cannot delete",
        description: "Only archived items can be deleted. Please archive items first before deleting.",
        variant: "destructive"
      });
      return;
    }

    setIsDeleting(true);

    const deletionResults = {
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // Group items by source table
      const itemsByTable = {
        master_content: [] as string[],
        outputs: [] as string[],
        derivative_assets: [] as string[],
        generated_images: [] as string[]
      };

      selectedItems.forEach(id => {
        const item = libraryContent.find(c => c.id === id);
        if (item) {
          itemsByTable[item.sourceTable as keyof typeof itemsByTable].push(id);
        }
      });

      // Delete from each table with CASCADE handling dependencies automatically
      // Order: derivative_assets, master_content, outputs, generated_images

      // Delete derivative assets first (they may reference master_content)
      if (itemsByTable.derivative_assets.length > 0) {
        logger.debug('[Library] Deleting derivative_assets:', itemsByTable.derivative_assets);
        const { error, data } = await supabase
          .from('derivative_assets')
          .delete()
          .in('id', itemsByTable.derivative_assets)
          .select();

        if (error) {
          logger.error('[Library] Error deleting derivatives:', error);
          deletionResults.failed += itemsByTable.derivative_assets.length;
          deletionResults.errors.push(`Derivatives: ${error.message} (Code: ${error.code})`);
        } else {
          logger.debug('[Library] Deleted derivatives:', data);
          deletionResults.successful += itemsByTable.derivative_assets.length;
        }
      }

      // Delete master content (CASCADE will handle related derivatives and scheduled content)
      if (itemsByTable.master_content.length > 0) {
        logger.debug('[Library] Deleting master_content:', itemsByTable.master_content);
        const { error, data } = await supabase
          .from('master_content')
          .delete()
          .in('id', itemsByTable.master_content)
          .select();

        if (error) {
          logger.error('[Library] Error deleting master content:', error);
          deletionResults.failed += itemsByTable.master_content.length;
          deletionResults.errors.push(`Master content: ${error.message} (Code: ${error.code})`);
        } else {
          logger.debug('[Library] Deleted master content:', data);
          deletionResults.successful += itemsByTable.master_content.length;
        }
      }

      // Delete outputs
      if (itemsByTable.outputs.length > 0) {
        logger.debug('[Library] Deleting outputs:', itemsByTable.outputs);
        const { error, data } = await supabase
          .from('outputs')
          .delete()
          .in('id', itemsByTable.outputs)
          .select();

        if (error) {
          logger.error('[Library] Error deleting outputs:', error);
          deletionResults.failed += itemsByTable.outputs.length;
          deletionResults.errors.push(`Outputs: ${error.message} (Code: ${error.code})`);
        } else {
          logger.debug('[Library] Deleted outputs:', data);
          deletionResults.successful += itemsByTable.outputs.length;
        }
      }

      // Delete generated images
      if (itemsByTable.generated_images.length > 0) {
        logger.debug('[Library] Deleting generated_images:', itemsByTable.generated_images);
        const { error, data } = await supabase
          .from('generated_images')
          .delete()
          .in('id', itemsByTable.generated_images)
          .select();

        if (error) {
          logger.error('[Library] Error deleting images:', error);
          deletionResults.failed += itemsByTable.generated_images.length;
          deletionResults.errors.push(`Images: ${error.message} (Code: ${error.code})`);
        } else {
          logger.debug('[Library] Deleted images:', data);
          deletionResults.successful += itemsByTable.generated_images.length;
        }
      }

      // Show results to user
      if (deletionResults.failed === 0) {
        toast({
          title: "Deletion successful",
          description: `Successfully deleted ${deletionResults.successful} item${deletionResults.successful > 1 ? 's' : ''}`,
        });
      } else if (deletionResults.successful > 0) {
        toast({
          title: "Partial deletion",
          description: `Deleted ${deletionResults.successful} items. ${deletionResults.failed} failed: ${deletionResults.errors.join('; ')}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Deletion failed",
          description: `All deletions failed: ${deletionResults.errors.join('; ')}`,
          variant: "destructive"
        });
      }

      setSelectedItems(new Set());
      refetch();
    } catch (error) {
      logger.error('Critical error during deletion:', error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const hasFilters = !!searchQuery || selectedContentType !== "all" || selectedStatus !== "all" || showArchived;
  const activeFilterCount = [
    selectedContentType !== "all",
    selectedStatus !== "all",
    showArchived
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile ? (
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/20">
          <div className="px-4 py-3 space-y-3">
            {/* Title */}
            <div>
              <h1 className="font-serif text-2xl text-foreground">The Archives</h1>
              <p className="text-xs text-muted-foreground">Your editorial repository</p>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {/* Filter Button Row */}
            <div className="flex items-center gap-2">
              <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 flex-1">
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="default" className="ml-1 h-5 min-w-5 px-1">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh]">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <LibraryFilters
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      selectedContentType={selectedContentType}
                      onContentTypeChange={setSelectedContentType}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      showArchived={showArchived}
                      onShowArchivedChange={setShowArchived}
                    />
                    {hasFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearFilters}
                        className="w-full"
                      >
                        Clear All Filters
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>

            </div>

            {/* Active filters display */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedContentType !== "all" && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedContentType}
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => setSelectedContentType("all")}
                    />
                  </Badge>
                )}
                {selectedStatus !== "all" && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {selectedStatus}
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => setSelectedStatus("all")}
                    />
                  </Badge>
                )}
                {showArchived && (
                  <Badge variant="secondary" className="text-xs">
                    Archived
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => setShowArchived(false)}
                    />
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Desktop Header */
        <div
          className="border-b border-border/20 bg-card/30 backdrop-blur-sm sticky top-0 z-10"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.02) 2px, rgba(0,0,0,.02) 4px),
              repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,.02) 2px, rgba(0,0,0,.02) 4px)
            `
          }}
        >
          <div className="container mx-auto px-6 py-8 space-y-6">
            {/* Title Row */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-serif text-4xl text-foreground mb-2">The Archives</h1>
                <p className="text-muted-foreground">Your editorial repository</p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => navigate("/create")}
                  variant="brass"
                  size="lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Content
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between gap-4">
              <LibraryFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedContentType={selectedContentType}
                onContentTypeChange={setSelectedContentType}
                sortBy={sortBy}
                onSortChange={setSortBy}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showArchived={showArchived}
                onShowArchivedChange={setShowArchived}
              />

            </div>
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className={cn(
        "container mx-auto py-4 md:py-6 lg:py-8",
        isMobile ? "px-4" : "px-6"
      )}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading your content...</div>
          </div>
        ) : (
          <>
            {/* Bulk Actions Toolbar - Always available when there's content */}
            {filteredContent.length > 0 && (
              <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 p-3 md:p-4 bg-card/80 backdrop-blur-sm border border-border/40 rounded-lg">
                <div className="flex items-center gap-3 md:gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredContent.length && filteredContent.length > 0}
                      onChange={handleSelectAll}
                      className="w-5 h-5 rounded border-2 border-border/60 bg-transparent text-brand-brass focus:ring-brand-brass focus:ring-offset-0 cursor-pointer appearance-none checked:bg-brand-brass checked:border-brand-brass"
                      style={{
                        backgroundImage: selectedItems.size === filteredContent.length && filteredContent.length > 0
                          ? `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")`
                          : 'none'
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedItems.size > 0
                        ? `${selectedItems.size} selected`
                        : 'Select all'}
                    </span>
                  </label>
                </div>

                {selectedItems.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedItems(new Set())}
                      className="gap-2 min-h-[44px]"
                    >
                      <X className="w-4 h-4" />
                      <span className="hidden sm:inline">Clear</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkArchive}
                      disabled={isDeleting}
                      className="gap-2 min-h-[44px] flex-1 sm:flex-initial"
                    >
                      <Archive className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {isDeleting ? 'Processing...' : `${showArchived ? 'Unarchive' : 'Archive'} ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}`}
                      </span>
                      <span className="sm:hidden">
                        {isDeleting ? 'Processing...' : showArchived ? 'Unarchive' : 'Archive'}
                      </span>
                    </Button>
                    {showArchived && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={isDeleting}
                        className="gap-2 min-h-[44px] flex-1 sm:flex-initial"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">
                          {isDeleting ? 'Deleting...' : `Delete ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}`}
                        </span>
                        <span className="sm:hidden">
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Result Count */}
            {filteredContent.length > 0 && (
              <p className="text-sm text-muted-foreground mb-6">
                {filteredContent.length} {filteredContent.length === 1 ? "piece" : "pieces"} of content
              </p>
            )}

            {/* Content Display */}
            {filteredContent.length === 0 ? (
          <EmptyState
            hasSearch={!!searchQuery}
            hasFilters={hasFilters}
            onClearFilters={handleClearFilters}
            contentType="content"
          />
        ) : (
          <div
            className={cn(
              "grid gap-4 md:gap-6 transition-all duration-300",
              viewMode === "grid" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              viewMode === "list" && "grid-cols-1"
            )}
          >
            {filteredContent.map((content) => {
              return (
                <ContentCard
                  key={content.id}
                  content={content}
                  onClick={() => {
                    // If it's a generated image, open the image editor modal
                    if (content.sourceTable === "generated_images" && content.imageUrl) {
                      setImageEditorImage({
                        id: content.id,
                        imageUrl: content.imageUrl,
                        prompt: content.finalPrompt || content.title || "",
                        isSaved: true,
                      });
                      setImageEditorOpen(true);
                    } else {
                      // For text content, use the existing modal
                      setSelectedContent(content);
                    }
                  }}
                  viewMode={viewMode}
                  selectable={true}
                  selected={selectedItems.has(content.id)}
                  onToggleSelect={() => handleToggleSelection(content.id)}
                  onArchive={async () => {
                    try {
                      const table = content.sourceTable;
                      const { error } = await supabase
                        .from(table)
                        .update({
                          is_archived: !content.archived,
                          archived_at: !content.archived ? new Date().toISOString() : null
                        })
                        .eq('id', content.id);

                      if (error) throw error;

                      toast({
                        title: content.archived ? "Item unarchived" : "Item archived",
                        description: `Successfully ${content.archived ? 'unarchived' : 'archived'} "${content.title}"`,
                      });

                      refetch();
                    } catch (error) {
                      logger.error('Error archiving item:', error);
                      toast({
                        title: "Archive failed",
                        description: "Failed to archive item. Please try again.",
                        variant: "destructive"
                      });
                    }
                  }}
                />
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedContent && (
        <ContentDetailModal
          open={!!selectedContent}
          onOpenChange={(open) => !open && setSelectedContent(null)}
          content={{
            id: selectedContent.id,
            title: selectedContent.title,
            content_type: selectedContent.contentType,
            asset_type: selectedContent.contentType,
            full_content: selectedContent.content,
            generated_content: selectedContent.content,
            platform_specs: selectedContent.platformSpecs,
            created_at: selectedContent.createdAt.toISOString(),
            word_count: selectedContent.wordCount,
            quality_rating: selectedContent.rating,
            collection: selectedContent.collection,
            is_archived: selectedContent.archived,
            status: selectedContent.status,
            featured_image_url: selectedContent.featuredImageUrl,
          }}
          category={selectedContent.sourceTable === "master_content" ? "master" : selectedContent.sourceTable === "outputs" ? "output" : "derivative"}
          onUpdate={async () => {
            // Refetch and wait for it to complete
            const result = await refetch();

            // Update selectedContent with fresh data from refetch
            if (result.data && selectedContent) {
              const updatedContent = result.data.find(item => item.id === selectedContent.id);
              if (updatedContent) {
                setSelectedContent(updatedContent);
              }
            }
          }}
          onRepurpose={(id) => {
            navigate(`/multiply?id=${id}`);
          }}
          onSchedule={async (content, category) => {
            setSelectedContent(null);

            if (category === "derivative") {
              // Fetch derivative asset with master content
              const { data: derivative } = await supabase
                .from('derivative_assets')
                .select('*, master_content(id, title, full_content)')
                .eq('id', content.id)
                .single();

              if (derivative) {
                setDerivativeAssetForSchedule(derivative);
                setMasterForSchedule(derivative.master_content);
                setScheduleOpen(true);
              }
            } else if (category === "master") {
              // Fetch master content
              const { data: master } = await supabase
                .from('master_content')
                .select('*')
                .eq('id', content.id)
                .single();

              if (master) {
                setMasterForSchedule(master);
                setDerivativeAssetForSchedule(null);
                setScheduleOpen(true);
              }
            } else {
              // For outputs, treat as generic content
              setMasterForSchedule({
                id: content.id,
                title: content.title,
                full_content: content.generated_content,
              });
              setDerivativeAssetForSchedule(null);
              setScheduleOpen(true);
            }
          }}
          onEditWithMadison={(content, category) => {
            console.log('[Library] onEditWithMadison called:', {
              contentId: content.id,
              category,
              sourceTable: content.sourceTable,
              hasFullContent: !!content.full_content,
              hasGeneratedContent: !!content.generated_content,
              contentPreview: (content.generated_content || content.full_content)?.substring(0, 150)
            });

            setSelectedContent(null);

            // Determine text content based on category
            let initialText = '';
            if (category === 'master') {
              initialText = content.full_content;
            } else if (category === 'derivative' || category === 'output') {
              initialText = content.generated_content;
            }

            console.log('[Library] Navigating to editor with:', {
              contentId: content.id,
              category,
              initialTextLength: initialText?.length,
              initialTextPreview: initialText?.substring(0, 150)
            });

            // Get content type from the content object
            const contentType = content.content_type || content.asset_type || 'Content';

            // Check if this is an email sequence - open specialized editor
            if (isEmailSequenceType(contentType)) {
              setEmailSequenceContext({
                id: content.id,
                category: category,
                initialText: initialText,
                title: content.title,
                contentType: contentType,
                platformSpecs: content.platform_specs || null,
              });
              setEmailSequenceOpen(true);
              return;
            }

            // Navigate to ContentEditor with full context for regular content
            navigate('/editor', {
              state: {
                contentId: content.id,
                content: initialText,
                contentName: content.title,
                contentType: contentType,
                category: category
              }
            });
          }}
        />
      )}

      {/* Schedule Modal */}
      <ScheduleModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        derivativeAsset={derivativeAssetForSchedule}
        masterContent={masterForSchedule}
        onSuccess={() => {
          setScheduleOpen(false);
          setDerivativeAssetForSchedule(null);
          setMasterForSchedule(null);
          refetch();
        }}
      />

      {/* Madison Split Editor */}
      {madisonContext && (
        <MadisonSplitEditor
          open={madisonOpen}
          title={madisonContext.title}
          initialContent={madisonContext.initialText}
          contentId={madisonContext.id}
          category={madisonContext.category}
          onSave={async (newContent) => {
            try {
              const table = madisonContext.category === 'master'
                ? 'master_content'
                : madisonContext.category === 'derivative'
                ? 'derivative_assets'
                : 'outputs';

              const field = madisonContext.category === 'master'
                ? 'full_content'
                : 'generated_content';

              const { error } = await supabase
                .from(table)
                .update({ [field]: newContent })
                .eq('id', madisonContext.id);

              if (error) throw error;

              toast({
                title: "Content saved",
                description: "Your changes have been saved successfully.",
              });

              setMadisonOpen(false);
              setMadisonContext(null);
              refetch();
            } catch (error: any) {
              toast({
                title: "Save failed",
                description: error.message,
                variant: "destructive",
              });
            }
          }}
          onClose={() => {
            setMadisonOpen(false);
            setMadisonContext(null);
          }}
        />
      )}

      {/* Email Sequence Editor */}
      {emailSequenceContext && (
        <EmailSequenceEditor
          open={emailSequenceOpen}
          title={emailSequenceContext.title || "Email Sequence"}
          initialContent={emailSequenceContext.initialText}
          initialPlatformSpecs={emailSequenceContext.platformSpecs}
          contentId={emailSequenceContext.id}
          contentType={emailSequenceContext.contentType}
          category={emailSequenceContext.category}
          onSave={async (newContent) => {
            try {
              const table = emailSequenceContext.category === 'master'
                ? 'master_content'
                : emailSequenceContext.category === 'derivative'
                ? 'derivative_assets'
                : 'outputs';

              const field = emailSequenceContext.category === 'master'
                ? 'full_content'
                : 'generated_content';

              const { error } = await supabase
                .from(table)
                .update({ [field]: newContent })
                .eq('id', emailSequenceContext.id);

              if (error) throw error;

              toast({
                title: "Email sequence saved",
                description: "Your email sequence has been saved successfully.",
              });

              setEmailSequenceOpen(false);
              setEmailSequenceContext(null);
              refetch();
            } catch (error: any) {
              toast({
                title: "Save failed",
                description: error.message,
                variant: "destructive",
              });
            }
          }}
          onClose={() => {
            setEmailSequenceOpen(false);
            setEmailSequenceContext(null);
          }}
        />
      )}

      {/* Image Editor Modal (for generated images) */}
      <ImageEditorModal
        isOpen={imageEditorOpen}
        onClose={() => {
          setImageEditorOpen(false);
          setImageEditorImage(null);
        }}
        image={imageEditorImage}
        onSave={() => {
          // Images in library are already saved, just refresh
          refetch();
        }}
        onImageGenerated={async (newImage) => {
          // Verify the image was saved to database
          console.log("🖼️ New refined image generated:", newImage);

          // Refresh library to show new refinement
          await refetch();

          // Update modal to show new image
          setImageEditorImage(newImage);

          toast({
            title: "Refinement saved",
            description: "Your refined image has been saved to the library.",
          });
        }}
        source="library"
      />

    </div>
  );
}
