import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useToast } from "@/hooks/use-toast";
import type { DAMFolder, DAMAsset, UploadProgress, DAMSortOption } from "./types";

interface UseDAMOptions {
  folderId?: string | null;
  searchQuery?: string;
  sort?: DAMSortOption;
}

export function useDAM(options: UseDAMOptions = {}) {
  const { organizationId: orgFromHook } = useOrganization();
  const { currentOrganizationId: orgFromOnboarding } = useOnboarding();
  const currentOrganizationId = orgFromHook ?? orgFromOnboarding;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [recentlyDeleted, setRecentlyDeleted] = useState<DAMAsset[]>([]);

  // Fetch folders
  const {
    data: folders = [],
    isLoading: foldersLoading,
    refetch: refetchFolders,
  } = useQuery({
    queryKey: ["dam-folders", currentOrganizationId],
    queryFn: async () => {
      if (!currentOrganizationId) return [];

      const { data, error } = await supabase
        .from("dam_folders")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Error fetching DAM folders:", error);
        throw error;
      }

      return data as DAMFolder[];
    },
    enabled: !!currentOrganizationId,
  });

  // Build folder tree
  const folderTree = useMemo(() => {
    const rootFolders = folders.filter(f => !f.parent_id);
    const buildTree = (parentId: string | null): DAMFolder[] => {
      return folders
        .filter(f => f.parent_id === parentId)
        .map(folder => ({
          ...folder,
          children: buildTree(folder.id),
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
    };
    return buildTree(null);
  }, [folders]);

  // Fetch assets
  const {
    data: assets = [],
    isLoading: assetsLoading,
    isFetching: assetsFetching,
    refetch: refetchAssets,
  } = useQuery({
    queryKey: ["dam-assets", currentOrganizationId, options.folderId, options.searchQuery, options.sort],
    queryFn: async () => {
      if (!currentOrganizationId) return [];

      let query = supabase
        .from("dam_assets")
        .select("*")
        .eq("organization_id", currentOrganizationId)
        .neq("status", "deleted");

      // Filter by folder
      if (options.folderId === null) {
        // Root level - no filter (show all)
      } else if (options.folderId) {
        query = query.eq("folder_id", options.folderId);
      }

      // Search
      if (options.searchQuery) {
        query = query.or(`name.ilike.%${options.searchQuery}%,tags.cs.{${options.searchQuery}}`);
      }

      // Sort
      const sortField = options.sort?.field || "created_at";
      const sortAsc = options.sort?.direction === "asc";
      query = query.order(sortField, { ascending: sortAsc });

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching DAM assets:", error);
        throw error;
      }

      return data as DAMAsset[];
    },
    enabled: !!currentOrganizationId,
  });

  // Create folder mutation
  const createFolder = useMutation({
    mutationFn: async ({ name, parentId, icon }: { name: string; parentId?: string; icon?: string }) => {
      const { data, error } = await supabase
        .from("dam_folders")
        .insert({
          organization_id: currentOrganizationId,
          name,
          parent_id: parentId || null,
          icon: icon || "folder",
          folder_type: "user",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-folders"] });
      toast({ title: "Folder created", description: "Your new folder is ready" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to create folder", variant: "destructive" });
      console.error(error);
    },
  });

  // Rename folder mutation
  const renameFolder = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      const { error } = await supabase
        .from("dam_folders")
        .update({ name })
        .eq("id", folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-folders"] });
      toast({ title: "Renamed", description: "Folder renamed successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to rename folder", variant: "destructive" });
      console.error(error);
    },
  });

  // Delete folder mutation
  const deleteFolder = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from("dam_folders")
        .delete()
        .eq("id", folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-folders"] });
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({ title: "Deleted", description: "Folder has been deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
      console.error(error);
    },
  });

  // Create smart folder mutation
  const createSmartFolder = useMutation({
    mutationFn: async ({
      name,
      icon,
      smartFilter,
    }: {
      name: string;
      icon?: string;
      smartFilter: {
        conditions: Array<{ field: string; operator: string; value: unknown }>;
        match: 'all' | 'any';
      };
    }) => {
      const { data, error } = await supabase
        .from("dam_folders")
        .insert({
          organization_id: currentOrganizationId,
          name,
          icon: icon || "sparkles",
          folder_type: "smart",
          smart_filter: smartFilter,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-folders"] });
      toast({ title: "Smart folder created", description: "Your saved search is ready" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to create smart folder", variant: "destructive" });
      console.error(error);
    },
  });

  // Rename asset mutation
  const renameAsset = useMutation({
    mutationFn: async ({ assetId, name }: { assetId: string; name: string }) => {
      const { error } = await supabase
        .from("dam_assets")
        .update({ name })
        .eq("id", assetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({ title: "Renamed", description: "Asset renamed successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to rename asset", variant: "destructive" });
      console.error(error);
    },
  });

  // Move asset mutation
  const moveAsset = useMutation({
    mutationFn: async ({ assetId, folderId }: { assetId: string; folderId: string | null }) => {
      const { error } = await supabase
        .from("dam_assets")
        .update({ folder_id: folderId })
        .eq("id", assetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({ title: "Moved", description: "Asset moved successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to move asset", variant: "destructive" });
      console.error(error);
    },
  });

  // Delete asset mutation (soft delete with undo)
  const deleteAsset = useMutation({
    mutationFn: async (assetId: string) => {
      // First, get the asset for undo
      const { data: asset } = await supabase
        .from("dam_assets")
        .select("*")
        .eq("id", assetId)
        .single();

      // Soft delete
      const { error } = await supabase
        .from("dam_assets")
        .update({ status: "deleted" })
        .eq("id", assetId);

      if (error) throw error;
      return asset as DAMAsset;
    },
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      setRecentlyDeleted(prev => [...prev, asset]);

      // Show undo toast
      toast({
        title: "Deleted",
        description: `${asset.name} moved to trash. Click to undo.`,
        duration: 10000, // 10 seconds to undo
      });

      // Auto-clear undo after 30 seconds
      setTimeout(() => {
        setRecentlyDeleted(prev => prev.filter(a => a.id !== asset.id));
      }, 30000);
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to delete asset", variant: "destructive" });
      console.error(error);
    },
  });

  // Undo delete
  const undoDelete = useCallback(async (assetId: string) => {
    const { error } = await supabase
      .from("dam_assets")
      .update({ status: "active" })
      .eq("id", assetId);

    if (error) {
      toast({ title: "Error", description: "Failed to restore asset", variant: "destructive" });
      return;
    }

    setRecentlyDeleted(prev => prev.filter(a => a.id !== assetId));
    queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
    toast({ title: "Restored", description: "Asset has been restored" });
  }, [queryClient, toast]);

  // Toggle favorite
  const toggleFavorite = useMutation({
    mutationFn: async (assetId: string) => {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");

      const { error } = await supabase
        .from("dam_assets")
        .update({ is_favorite: !asset.is_favorite })
        .eq("id", assetId);

      if (error) throw error;
      return !asset.is_favorite;
    },
    onSuccess: (isFavorite) => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({
        title: isFavorite ? "Added to favorites" : "Removed from favorites",
        duration: 2000,
      });
    },
  });

  // Update tags mutation
  const updateTags = useMutation({
    mutationFn: async ({ assetId, tags }: { assetId: string; tags: string[] }) => {
      const { error } = await supabase
        .from("dam_assets")
        .update({ tags })
        .eq("id", assetId);

      if (error) throw error;
      return tags;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to update tags", variant: "destructive" });
      console.error(error);
    },
  });

  // Bulk update tags
  const bulkUpdateTags = useMutation({
    mutationFn: async ({ assetIds, tags, mode }: { assetIds: string[]; tags: string[]; mode: 'add' | 'remove' | 'replace' }) => {
      for (const assetId of assetIds) {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) continue;

        let newTags: string[];
        if (mode === 'add') {
          newTags = [...new Set([...asset.tags, ...tags])];
        } else if (mode === 'remove') {
          newTags = asset.tags.filter(t => !tags.includes(t));
        } else {
          newTags = tags;
        }

        const { error } = await supabase
          .from("dam_assets")
          .update({ tags: newTags })
          .eq("id", assetId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({ title: "Tags updated", description: "Tags have been updated on selected assets" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to update tags", variant: "destructive" });
      console.error(error);
    },
  });

  // Bulk move
  const bulkMove = useMutation({
    mutationFn: async ({ assetIds, folderId }: { assetIds: string[]; folderId: string | null }) => {
      const { error } = await supabase
        .from("dam_assets")
        .update({ folder_id: folderId })
        .in("id", assetIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dam-assets"] });
      toast({ title: "Moved", description: "Assets moved successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to move assets", variant: "destructive" });
      console.error(error);
    },
  });

  // Selection helpers
  const toggleSelection = useCallback((assetId: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedAssets(new Set(assets.map(a => a.id)));
  }, [assets]);

  const clearSelection = useCallback(() => {
    setSelectedAssets(new Set());
  }, []);

  // Get inbox folder
  const inboxFolder = useMemo(() => {
    return folders.find(f => f.folder_type === "inbox");
  }, [folders]);

  // Track asset usage
  const trackAssetUsage = useCallback(async (
    assetId: string,
    usedIn: { type: string; id: string; title?: string }
  ) => {
    try {
      // Increment usage count and update last_used
      const { error } = await supabase.rpc('increment_dam_asset_usage', {
        asset_id: assetId,
        used_in_data: usedIn,
      });

      // If RPC doesn't exist, fall back to direct update. There is no
      // `increment` function in the database either, so read the count and
      // write it back rather than passing a query builder as a column value.
      if (error && error.code === '42883') {
        const { data: current } = await supabase
          .from('dam_assets')
          .select('usage_count')
          .eq('id', assetId)
          .maybeSingle();
        await supabase
          .from('dam_assets')
          .update({
            usage_count: (current?.usage_count ?? 0) + 1,
            last_used_at: new Date().toISOString(),
            last_used_in: usedIn,
          })
          .eq('id', assetId);
      }

      // Log activity
      await supabase
        .from('dam_activity_log')
        .insert({
          organization_id: currentOrganizationId,
          asset_id: assetId,
          action: 'use',
          actor_type: 'user',
          context: { used_in: usedIn },
        });

      queryClient.invalidateQueries({ queryKey: ['dam-assets'] });
    } catch (err) {
      console.error('Failed to track asset usage:', err);
    }
  }, [currentOrganizationId, queryClient]);

  return {
    // Data
    folders,
    folderTree,
    assets,
    inboxFolder,

    // Loading states
    isLoading: foldersLoading || assetsLoading,
    foldersLoading,
    assetsLoading,

    // Selection
    selectedAssets,
    toggleSelection,
    selectAll,
    clearSelection,

    // Mutations
    createFolder,
    renameFolder,
    deleteFolder,
    createSmartFolder,
    renameAsset,
    moveAsset,
    deleteAsset,
    toggleFavorite,
    updateTags,
    bulkUpdateTags,
    bulkMove,
    undoDelete,

    // Refetch
    refetch: async () => {
      await Promise.all([refetchFolders(), refetchAssets()]);
      toast({ title: "Refreshed", description: "Library updated", duration: 2000 });
    },
    isRefetching: assetsFetching,

    // Usage tracking
    trackAssetUsage,

    // Recently deleted for undo
    recentlyDeleted,
  };
}

// Hook for upload functionality
export function useDAMUpload() {
  const { organizationId: orgFromHook } = useOrganization();
  const { currentOrganizationId: orgFromOnboarding } = useOnboarding();
  const currentOrganizationId = orgFromHook ?? orgFromOnboarding;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(async (
    file: File,
    folderId?: string,
    tags?: string[]
  ): Promise<DAMAsset | null> => {
    if (!currentOrganizationId) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
      return null;
    }

    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Add to uploads list
    setUploads(prev => [...prev, {
      id: uploadId,
      fileName: file.name,
      progress: 0,
      status: 'pending',
    }]);
    setIsUploading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);

      // Update progress
      setUploads(prev => prev.map(u =>
        u.id === uploadId ? { ...u, progress: 30, status: 'uploading' } : u
      ));

      const base64Data = await base64Promise;

      // Update progress
      setUploads(prev => prev.map(u =>
        u.id === uploadId ? { ...u, progress: 60, status: 'uploading' } : u
      ));

      // Call edge function with timeout
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured. Check your environment variables.');
      }

      let response: Response;
      try {
        response = await fetch(
          `${supabaseUrl}/functions/v1/upload-dam-asset`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              ...(anonKey && { apikey: anonKey }),
            },
            body: JSON.stringify({
              organizationId: currentOrganizationId,
              folderId,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileData: base64Data,
              tags: tags || [],
            }),
            signal: controller.signal,
          }
        );
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timed out. Please try again with a smaller file.');
        }
        throw fetchError;
      }

      clearTimeout(timeoutId);

      // Check HTTP status first
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Upload failed (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          if (errorText.length < 200) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Complete immediately - asset is ready (images get thumbnail/status from upload-dam-asset)
      setUploads(prev => prev.map(u =>
        u.id === uploadId ? { ...u, progress: 100, status: 'complete', asset: result.asset } : u
      ));

      // Invalidate cache so the new asset appears in the grid right away
      await queryClient.invalidateQueries({ queryKey: ["dam-assets"] });

      // Remove from uploads list after brief success display
      setTimeout(() => {
        setUploads(prev => {
          const remaining = prev.filter(u => u.id !== uploadId);
          setIsUploading(remaining.some(u => u.status !== 'complete' && u.status !== 'error'));
          return remaining;
        });
      }, 1500);

      return result.asset;
    } catch (error) {
      console.error('[DAM Upload] Error:', error);
      if (error instanceof Error) {
        console.error('[DAM Upload] Message:', error.message);
        console.error('[DAM Upload] Stack:', error.stack);
      }

      setUploads(prev => prev.map(u =>
        u.id === uploadId ? {
          ...u,
          progress: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        } : u
      ));

      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });

      // FIXED: Reset isUploading state on error
      setIsUploading(false);

      return null;
    }
  }, [currentOrganizationId, queryClient, toast]);

  const uploadFiles = useCallback(async (
    files: File[],
    folderId?: string,
    tags?: string[]
  ) => {
    const results = await Promise.all(
      files.map(file => uploadFile(file, folderId, tags))
    );

    const successful = results.filter(Boolean).length;
    if (successful > 0) {
      toast({
        title: "Upload complete! 🎉",
        description: `${successful} file${successful > 1 ? 's' : ''} uploaded successfully`,
      });
    }

    return results;
  }, [uploadFile, toast]);

  const clearUpload = useCallback((uploadId: string) => {
    setUploads(prev => prev.filter(u => u.id !== uploadId));
  }, []);

  return {
    uploads,
    isUploading,
    uploadFile,
    uploadFiles,
    clearUpload,
  };
}
