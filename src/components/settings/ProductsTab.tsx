import { useState, useRef, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, AlertCircle, Upload, Eye } from "lucide-react";
import { useProducts, Product, ProductCategory } from "@/hooks/useProducts";
import { useOnboarding } from "@/hooks/useOnboarding";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductDetailModal } from "./ProductDetailModal";
import {
  formToBrandProductRow,
  manualProductId,
  mergeWithExisting,
  upsertBrandProducts,
} from "../../../supabase/functions/_shared/brandProducts.ts";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  personal_fragrance: "Personal Fragrance",
  home_fragrance: "Home Fragrance",
};

export function ProductsTab() {
  const { toast } = useToast();
  const { products, loading, refetch } = useProducts();
  const { currentOrganizationId } = useOnboarding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false);
  
  // Bulk selection state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  
  // ADHD-friendly filters
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | "all">("all");
  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"alphabetical" | "recent" | "category">("alphabetical");

  // Form state - category-aware
  const [formData, setFormData] = useState({
    category: "personal_fragrance" as ProductCategory,
    name: "",
    product_type: "",
    collection: "",
    // Universal
    description: "",
    usp: "",
    tone: "",
    // Bottle Type (for image generation accuracy)
    bottle_type: "auto" as "oil" | "spray" | "auto",
    // Personal Fragrance
    scent_family: "",
    top_notes: "",
    middle_notes: "",
    base_notes: "",
    // Home Fragrance
    scent_profile: "",
    format: "",
    burn_time: "",
    // Skincare
    key_ingredients: "",
    benefits: "",
    usage: "",
    formulation_type: "",
  });

  // Bulk edit form state (only fields that should be updated)
  const [bulkEditData, setBulkEditData] = useState({
    updateCollection: false,
    collection: "",
    updateTone: false,
    tone: "",
    updateScentFamily: false,
    scent_family: "",
    updateCategory: false,
    category: "personal_fragrance" as ProductCategory,
  });

  const resetForm = () => {
    setFormData({
      category: "personal_fragrance",
      name: "",
      product_type: "",
      collection: "",
      description: "",
      usp: "",
      tone: "",
      bottle_type: "auto",
      scent_family: "",
      top_notes: "",
      middle_notes: "",
      base_notes: "",
      scent_profile: "",
      format: "",
      burn_time: "",
      key_ingredients: "",
      benefits: "",
      usage: "",
      formulation_type: "",
    });
  };

  const handleAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleEdit = (product: Product) => {
    setFormData({
      category: product.category,
      name: product.name,
      product_type: product.product_type || "",
      collection: product.collection || "",
      description: product.description || "",
      usp: product.usp || "",
      tone: product.tone || "",
      bottle_type: (product.bottle_type || "auto") as "oil" | "spray" | "auto",
      scent_family: product.scentFamily || "",
      top_notes: product.topNotes || "",
      middle_notes: product.middleNotes || "",
      base_notes: product.baseNotes || "",
      scent_profile: product.scentProfile || "",
      format: product.format || "",
      burn_time: product.burnTime || "",
      key_ingredients: product.keyIngredients || "",
      benefits: product.benefits || "",
      usage: product.usage || "",
      formulation_type: product.formulationType || "",
    });
    setEditingProduct(product);
  };

  const handleSave = async () => {
    if (!currentOrganizationId || !formData.name.trim()) return;

    try {
      const productData: any = {
        organization_id: currentOrganizationId,
        category: formData.category,
        name: formData.name.trim(),
        product_type: formData.product_type.trim() || null,
        collection: formData.collection.trim() || null,
        description: formData.description.trim() || null,
        usp: formData.usp.trim() || null,
        tone: formData.tone.trim() || null,
        bottle_type: formData.bottle_type || "auto",
      };

      // Add category-specific fields
      if (formData.category === 'personal_fragrance') {
        productData.scent_family = formData.scent_family.trim() || null;
        productData.top_notes = formData.top_notes.trim() || null;
        productData.middle_notes = formData.middle_notes.trim() || null;
        productData.base_notes = formData.base_notes.trim() || null;
      } else if (formData.category === 'home_fragrance') {
        productData.scent_profile = formData.scent_profile.trim() || null;
        productData.format = formData.format.trim() || null;
        productData.burn_time = formData.burn_time.trim() || null;
      }

      // Live brand_products shape: org_id/product_id/specs/metadata.
      const { organization_id: _org, ...form } = productData;
      if (editingProduct) {
        const { data: current, error: loadError } = await supabase
          .from("brand_products")
          .select("product_id, name, specs, metadata")
          .eq("id", editingProduct.id)
          .eq("org_id", currentOrganizationId)
          .maybeSingle();
        if (loadError) throw loadError;
        if (!current) throw new Error("Product not found in this organization");
        const merged = mergeWithExisting(
          formToBrandProductRow(currentOrganizationId, current.product_id, form),
          current as never,
          false,
        );
        const { error } = await supabase
          .from("brand_products")
          .update({ name: merged.name, specs: merged.specs as never, metadata: merged.metadata as never })
          .eq("id", editingProduct.id)
          .eq("org_id", currentOrganizationId);

        if (error) throw error;

        toast({
          title: "Product updated",
          description: `"${formData.name}" has been updated.`,
        });
      } else {
        await upsertBrandProducts(
          supabase,
          currentOrganizationId,
          [formToBrandProductRow(currentOrganizationId, manualProductId(formData.name), form)],
          { preserveManual: false },
        );

        toast({
          title: "Product added",
          description: `"${formData.name}" has been added to your products.`,
        });
      }

      setShowAddDialog(false);
      setEditingProduct(null);
      resetForm();
      refetch();
    } catch (error) {
      console.error("Error saving product:", error);
      toast({
        title: "Error",
        description: "Failed to save product. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteProductId) return;

    try {
      const { error } = await supabase
        .from("brand_products")
        .delete()
        .eq("id", deleteProductId)
        .eq("org_id", currentOrganizationId!);

      if (error) throw error;

      toast({
        title: "Product deleted",
        description: "The product has been removed.",
      });

      setDeleteProductId(null);
      refetch();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast({
        title: "Error",
        description: "Failed to delete product. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentOrganizationId) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: "Invalid CSV",
          description: "CSV file must contain at least a header row and one data row.",
          variant: "destructive",
        });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      
      const products = lines.slice(1).map(line => {
        // Handle CSV values that may contain commas within quotes
        const values: string[] = [];
        let currentValue = '';
        let insideQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === ',' && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim()); // Push last value
        
        const productData: any = { 
          organization_id: currentOrganizationId,
        };
        
        // Map CSV fields to database columns
        headers.forEach((header, index) => {
          const value = values[index]?.replace(/^"|"$/g, '').trim(); // Remove surrounding quotes
          if (!value || value === '') return;
          
          // Map field names
          switch (header) {
            case 'title':
              productData.name = value;
              break;
            case 'handle':
              productData.handle = value;
              break;
            case 'collection_tier':
              productData.collection_tier = value;
              break;
            case 'scent_family_detailed':
              productData.scent_family_detailed = value;
              break;
            case 'platform_type':
              productData.platform_type = value;
              break;
            case 'platform_material':
              productData.platform_material = value;
              break;
            case 'visual_world':
              productData.visual_world = value;
              break;
            case 'visual_world_week':
              productData.visual_world_week = parseInt(value) || null;
              break;
            case 'dip_layer_moral':
              productData.dip_layer_moral = value;
              break;
            case 'color_palette_hex_codes':
              productData.color_palette_hex_codes = value;
              break;
            case 'lighting_spec':
              productData.lighting_spec = value;
              break;
            case 'lighting_direction':
              productData.lighting_direction = value;
              break;
            case 'depth_of_field':
              productData.depth_of_field = value;
              break;
            case 'composition_style':
              productData.composition_style = value;
              break;
            case 'aspect_ratio_primary':
              productData.aspect_ratio_primary = value;
              break;
            case 'shadow_treatment':
              productData.shadow_treatment = value;
              break;
            case 'image_type_primary':
              productData.image_type_primary = value;
              break;
            case 'archetype_hero_enabled':
              productData.archetype_hero_enabled = value.toLowerCase() === 'yes';
              break;
            case 'archetype_flatlay_enabled':
              productData.archetype_flatlay_enabled = value.toLowerCase() === 'yes';
              break;
            case 'archetype_lived_enabled':
              productData.archetype_lived_enabled = value.toLowerCase() === 'yes';
              break;
            case 'archetype_travel_enabled':
              productData.archetype_travel_enabled = value.toLowerCase() === 'yes';
              break;
            case 'archetype_environmental_enabled':
              productData.archetype_environmental_enabled = value.toLowerCase() === 'yes';
              break;
            case 'archetype_ritual_enabled':
              productData.archetype_ritual_enabled = value.toLowerCase() === 'yes';
              break;
            case 'hero_primary_artifacts':
              productData.hero_primary_artifacts = value;
              break;
            case 'hero_artifact_placement':
              productData.hero_artifact_placement = value;
              break;
            case 'flatlay_ingredients':
              productData.flatlay_ingredients = value;
              break;
            case 'lived_life_context':
              productData.lived_life_context = value;
              break;
            case 'travel_context':
              productData.travel_context = value;
              break;
            case 'environmental_location':
              productData.environmental_location = value;
              break;
            case 'ritual_skin_tone':
              productData.ritual_skin_tone = value;
              break;
            case 'textile_backdrop':
              productData.textile_backdrop = value;
              break;
            case 'moral_philosophy':
              productData.moral_philosophy = value;
              break;
            case 'philosophy_keywords':
              productData.philosophy_keywords = value;
              break;
            case 'semantic_categories':
              productData.semantic_categories = value;
              break;
            case 'approved_descriptors':
              productData.approved_descriptors = value;
              break;
            case 'primary_avatar':
              productData.primary_avatar = value;
              break;
            case 'avatar_motivation':
              productData.avatar_motivation = value;
              break;
            case 'use_case_primary':
              productData.use_case_primary = value;
              break;
            case 'occasion_tags':
              productData.occasion_tags = value;
              break;
            case 'transparency_statement':
              productData.transparency_statement = value;
              break;
            case 'craftsmanship_term':
              productData.craftsmanship_term = value;
              break;
            case 'ingredient_disclosure':
              productData.ingredient_disclosure = value;
              break;
            case 'notes_top':
              productData.top_notes = value;
              break;
            case 'notes_middle':
              productData.middle_notes = value;
              break;
            case 'notes_base':
              productData.base_notes = value;
              break;
            case 'longevity_hours':
              productData.longevity_hours = value;
              break;
            case 'sillage_description':
              productData.sillage_description = value;
              break;
            case 'prompt_template_id':
              productData.prompt_template_id = value;
              break;
            case 'use_case_templates':
              productData.use_case_templates = value;
              break;
          }
        });
        
        // Auto-set category based on collection_tier if not explicitly provided
        if (!productData.category) {
          productData.category = 'personal_fragrance'; // Default
        }
        
        return productData;
      }).filter(p => p.name);

      if (products.length === 0) {
        toast({
          title: "No products found",
          description: "The CSV file appears to be empty or has no valid product names.",
          variant: "destructive",
        });
        return;
      }

      // Live brand_products shape; rows match existing products by handle/name.
      const rows = products.map((p: Record<string, unknown>) => {
        const { organization_id: _org, ...form } = p;
        return formToBrandProductRow(
          currentOrganizationId,
          manualProductId(String(p.name), typeof p.handle === "string" ? p.handle : null),
          form,
          "csv",
        );
      });
      let updatedCount = 0;
      let insertedCount = 0;
      let failedCount = 0;
      try {
        const res = await upsertBrandProducts(supabase, currentOrganizationId, rows, { preserveManual: false });
        updatedCount = res.updated;
        insertedCount = res.inserted;
      } catch (err) {
        console.error("CSV product import failed:", err);
        failedCount = rows.length;
      }

      if (updatedCount === 0 && insertedCount === 0 && failedCount === 0) {
        toast({
          title: "No changes made",
          description: "No products were processed.",
        });
      } else {
        const parts: string[] = [];
        if (updatedCount > 0) parts.push(`${updatedCount} updated`);
        if (insertedCount > 0) parts.push(`${insertedCount} added`);
        if (failedCount > 0) parts.push(`${failedCount} failed`);
        
        toast({
          title: "CSV import complete",
          description: parts.join(', '),
          variant: failedCount > 0 ? "destructive" : "default",
        });
      }

      refetch();
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import products. Please check your CSV format.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Get unique collections for filter
  const collections = useMemo(() => {
    const unique = new Set(products.map(p => p.collection).filter(Boolean));
    return Array.from(unique).sort();
  }, [products]);

  // Filter and sort products
  const filteredAndSortedProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (p.collection?.toLowerCase() || "").includes(searchFilter.toLowerCase()) ||
        (p.product_type?.toLowerCase() || "").includes(searchFilter.toLowerCase());
      
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      const matchesCollection = collectionFilter === "all" || p.collection === collectionFilter;
      
      return matchesSearch && matchesCategory && matchesCollection;
    });

    // Sort
    return filtered.sort((a, b) => {
      if (sortBy === "alphabetical") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "recent") {
        return new Date(b.id).getTime() - new Date(a.id).getTime();
      } else if (sortBy === "category") {
        return a.category.localeCompare(b.category);
      }
      return 0;
    });
  }, [products, searchFilter, categoryFilter, collectionFilter, sortBy]);

  const hasActiveFilters = categoryFilter !== "all" || collectionFilter !== "all";

  const clearFilters = () => {
    setCategoryFilter("all");
    setCollectionFilter("all");
  };

  // Bulk selection helpers
  const isAllSelected = filteredAndSortedProducts.length > 0 && 
    filteredAndSortedProducts.every(p => selectedProductIds.has(p.id));
  
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredAndSortedProducts.map(p => p.id)));
    }
  };

  const toggleSelectProduct = (productId: string) => {
    const newSelection = new Set(selectedProductIds);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProductIds(newSelection);
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedProductIds.size === 0) return;
    
    if (!confirm(`Delete ${selectedProductIds.size} product${selectedProductIds.size === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("brand_products")
        .delete()
        .eq("org_id", currentOrganizationId!)
        .in("id", Array.from(selectedProductIds));

      if (error) throw error;

      toast({
        title: "Products deleted",
        description: `${selectedProductIds.size} product${selectedProductIds.size === 1 ? '' : 's'} deleted successfully.`,
      });

      clearSelection();
      refetch();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast({
        title: "Error",
        description: "Failed to delete products. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Bulk edit
  const handleBulkEdit = () => {
    if (selectedProductIds.size === 0) return;
    setBulkEditData({
      updateCollection: false,
      collection: "",
      updateTone: false,
      tone: "",
      updateScentFamily: false,
      scent_family: "",
      updateCategory: false,
      category: "personal_fragrance",
    });
    setShowBulkEditDialog(true);
  };

  const handleBulkUpdate = async () => {
    if (selectedProductIds.size === 0) return;

    const updatePayload: any = {};
    
    if (bulkEditData.updateCollection) {
      updatePayload.collection = bulkEditData.collection.trim() || null;
    }
    if (bulkEditData.updateTone) {
      updatePayload.tone = bulkEditData.tone.trim() || null;
    }
    if (bulkEditData.updateScentFamily) {
      updatePayload.scent_family = bulkEditData.scent_family.trim() || null;
    }
    if (bulkEditData.updateCategory) {
      updatePayload.category = bulkEditData.category;
    }

    if (Object.keys(updatePayload).length === 0) {
      toast({
        title: "No fields selected",
        description: "Please select at least one field to update.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fields live inside specs/metadata now, so merge row by row.
      const { data: selected, error: loadError } = await supabase
        .from("brand_products")
        .select("id, product_id, name, specs, metadata")
        .eq("org_id", currentOrganizationId!)
        .in("id", Array.from(selectedProductIds));
      if (loadError) throw loadError;
      for (const current of selected ?? []) {
        const merged = mergeWithExisting(
          formToBrandProductRow(currentOrganizationId!, current.product_id, { name: current.name, ...updatePayload }),
          current as never,
          false,
        );
        const { error } = await supabase
          .from("brand_products")
          .update({ specs: merged.specs as never, metadata: merged.metadata as never })
          .eq("id", current.id)
          .eq("org_id", currentOrganizationId!);
        if (error) throw error;
      }

      toast({
        title: "Products updated",
        description: `${selectedProductIds.size} product${selectedProductIds.size === 1 ? '' : 's'} updated successfully.`,
      });

      setShowBulkEditDialog(false);
      clearSelection();
      refetch();
    } catch (error) {
      console.error("Error bulk updating:", error);
      toast({
        title: "Error",
        description: "Failed to update products. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResolveDuplicates = async () => {
    if (!currentOrganizationId) return;
    
    setIsResolvingDuplicates(true);
    try {
      // Call the database function to merge duplicates by name
      const { error } = await supabase.rpc('merge_duplicate_products_by_name_safe');
      
      if (error) throw error;
      
      toast({
        title: "Duplicates resolved",
        description: "All duplicate products have been merged by name successfully.",
      });
      
      refetch();
    } catch (error) {
      console.error("Error resolving duplicates:", error);
      toast({
        title: "Error",
        description: "Failed to resolve duplicates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResolvingDuplicates(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Products Library</CardTitle>
              <CardDescription>
                {products.length} product{products.length === 1 ? "" : "s"} across all categories
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
              <Button 
                onClick={handleResolveDuplicates}
                variant="outline"
                disabled={isResolvingDuplicates}
                className="gap-2"
                title="Merge duplicate products by handle"
              >
                <AlertCircle className="w-4 h-4" />
                {isResolvingDuplicates ? "Resolving..." : "Resolve Duplicates"}
              </Button>
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                variant="outline"
                disabled={isImporting}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                {isImporting ? "Importing..." : "Import CSV"}
              </Button>
              <Button onClick={handleAdd} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Product
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Sort Row */}
          <div className="flex gap-2">
            <Input
              placeholder="Search products..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1"
            />
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alphabetical">A-Z</SelectItem>
                <SelectItem value="recent">Recently Added</SelectItem>
                <SelectItem value="category">By Category</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quick Filter Chips */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Badge
              variant={categoryFilter === "all" ? "secondary" : "default"}
              className="cursor-pointer"
              onClick={() => setCategoryFilter("all")}
            >
              All Categories
            </Badge>
            <Badge
              variant={categoryFilter === "personal_fragrance" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setCategoryFilter("personal_fragrance")}
            >
              Personal Fragrance
            </Badge>
            <Badge
              variant={categoryFilter === "home_fragrance" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setCategoryFilter("home_fragrance")}
            >
              Home Fragrance
            </Badge>
            
            {collections.length > 0 && (
              <>
                <div className="h-4 w-px bg-border mx-1" />
                <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                  <SelectTrigger className="w-[160px] h-7">
                    <SelectValue placeholder="All Collections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {collections.map((collection) => (
                      <SelectItem key={collection} value={collection || ""}>
                        {collection}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 gap-1"
              >
                <X className="w-3 h-3" />
                Clear
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-muted-foreground">Loading products...</p>
          ) : filteredAndSortedProducts.length === 0 ? (
            <p className="text-muted-foreground italic">
              {searchFilter || hasActiveFilters ? "No products match your filters." : "No products yet. Add your first product above."}
            </p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all products"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedProducts.map((product) => (
                    <TableRow 
                      key={product.id} 
                      className={`hover:bg-muted/50 ${selectedProductIds.has(product.id) ? 'bg-muted/30' : ''}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedProductIds.has(product.id)}
                          onCheckedChange={() => toggleSelectProduct(product.id)}
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.collection || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[product.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date().toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingProduct(product)}
                            title="View all details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(product)}
                            title="Edit product"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteProductId(product.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedProductIds.size > 0 && (
        <div className="sticky bottom-6 left-1/2 -translate-x-1/2 z-50 mx-auto w-fit">
          <Card className="shadow-lg border-2">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="font-medium">
                {selectedProductIds.size} product{selectedProductIds.size === 1 ? '' : 's'} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkEdit}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={showBulkEditDialog} onOpenChange={setShowBulkEditDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Edit Products</DialogTitle>
            <DialogDescription>
              Update {selectedProductIds.size} product{selectedProductIds.size === 1 ? '' : 's'}. Only checked fields will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Collection Field */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="update-collection"
                checked={bulkEditData.updateCollection}
                onCheckedChange={(checked) => 
                  setBulkEditData({ ...bulkEditData, updateCollection: !!checked })
                }
              />
              <div className="flex-1 space-y-2">
                <Label 
                  htmlFor="bulk-collection"
                  className={!bulkEditData.updateCollection ? 'text-muted-foreground' : ''}
                >
                  Collection
                </Label>
                <Input
                  id="bulk-collection"
                  value={bulkEditData.collection}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, collection: e.target.value })}
                  placeholder="e.g., Humanities"
                  disabled={!bulkEditData.updateCollection}
                />
              </div>
            </div>

            {/* Tone Field */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="update-tone"
                checked={bulkEditData.updateTone}
                onCheckedChange={(checked) => 
                  setBulkEditData({ ...bulkEditData, updateTone: !!checked })
                }
              />
              <div className="flex-1 space-y-2">
                <Label 
                  htmlFor="bulk-tone"
                  className={!bulkEditData.updateTone ? 'text-muted-foreground' : ''}
                >
                  Brand Tone
                </Label>
                <Input
                  id="bulk-tone"
                  value={bulkEditData.tone}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, tone: e.target.value })}
                  placeholder="e.g., Elegant, Luxurious"
                  disabled={!bulkEditData.updateTone}
                />
              </div>
            </div>

            {/* Scent Family Field */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="update-scent-family"
                checked={bulkEditData.updateScentFamily}
                onCheckedChange={(checked) => 
                  setBulkEditData({ ...bulkEditData, updateScentFamily: !!checked })
                }
              />
              <div className="flex-1 space-y-2">
                <Label 
                  htmlFor="bulk-scent-family"
                  className={!bulkEditData.updateScentFamily ? 'text-muted-foreground' : ''}
                >
                  Scent Family (Personal Fragrance)
                </Label>
                <Input
                  id="bulk-scent-family"
                  value={bulkEditData.scent_family}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, scent_family: e.target.value })}
                  placeholder="e.g., Warm, Fresh, Woody, Floral"
                  disabled={!bulkEditData.updateScentFamily}
                />
              </div>
            </div>

            {/* Category Field with Warning */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="update-category"
                checked={bulkEditData.updateCategory}
                onCheckedChange={(checked) => 
                  setBulkEditData({ ...bulkEditData, updateCategory: !!checked })
                }
              />
              <div className="flex-1 space-y-2">
                <Label 
                  htmlFor="bulk-category"
                  className={!bulkEditData.updateCategory ? 'text-muted-foreground' : ''}
                >
                  Category
                </Label>
                <Select
                  value={bulkEditData.category}
                  onValueChange={(value: ProductCategory) => 
                    setBulkEditData({ ...bulkEditData, category: value })
                  }
                  disabled={!bulkEditData.updateCategory}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal_fragrance">Personal Fragrance</SelectItem>
                    <SelectItem value="home_fragrance">Home Fragrance</SelectItem>
                    <SelectItem value="skincare">Skincare / Beauty</SelectItem>
                  </SelectContent>
                </Select>
                {bulkEditData.updateCategory && (
                  <p className="text-sm text-amber-600 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Changing category will clear category-specific fields on affected products.</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkEditDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkUpdate}>
              Update {selectedProductIds.size} Product{selectedProductIds.size === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editingProduct} onOpenChange={(open) => {
        if (!open) {
          setShowAddDialog(false);
          setEditingProduct(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              Fill in the product details. Category determines which fields are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Category Selector */}
            <div className="space-y-2">
              <Label htmlFor="category">Product Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value: ProductCategory) => 
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal_fragrance">Personal Fragrance (Perfumes, Attars, Oils)</SelectItem>
                  <SelectItem value="home_fragrance">Home Fragrance (Candles, Diffusers, Sprays)</SelectItem>
                  <SelectItem value="skincare">Skincare / Beauty (Serums, Creams, Balms)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Universal Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Honey Oudh"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product_type">Product Type</Label>
                <Input
                  id="product_type"
                  value={formData.product_type}
                  onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                  placeholder={
                    formData.category === 'personal_fragrance' ? 'e.g., Attar, EDP' :
                    formData.category === 'home_fragrance' ? 'e.g., Candle, Diffuser' :
                    'e.g., Serum, Balm'
                  }
                />
              </div>
              {(formData.category === 'personal_fragrance' || formData.category === 'skincare') && (
                <div className="space-y-2">
                  <Label htmlFor="bottle_type">
                    Bottle Type
                    <span className="text-xs text-muted-foreground ml-1">(for image accuracy)</span>
                  </Label>
                  <Select
                    value={formData.bottle_type}
                    onValueChange={(value: "oil" | "spray" | "auto") => 
                      setFormData({ ...formData, bottle_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect (from product name/format)</SelectItem>
                      <SelectItem value="oil">Oil (Dropper/Roller - No Spray)</SelectItem>
                      <SelectItem value="spray">Spray (Atomizer - No Dropper)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Ensures images show correct bottle closure. "Auto" uses smart detection.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="collection">Collection</Label>
                <Input
                  id="collection"
                  value={formData.collection}
                  onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                  placeholder="e.g., Humanities"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tone">Brand Tone</Label>
                <Input
                  id="tone"
                  value={formData.tone}
                  onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                  placeholder="e.g., Elegant, Playful, Luxurious"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Product Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Full product description from Shopify or entered manually..."
                rows={4}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                The main product description (synced from Shopify or entered manually)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usp">USP (Unique Selling Points)</Label>
              <Textarea
                id="usp"
                value={formData.usp}
                onChange={(e) => setFormData({ ...formData, usp: e.target.value })}
                placeholder="e.g., Alcohol-free • Lasts 8 hours • Vegan OR Long-lasting, cruelty-free fragrance"
                rows={3}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Key selling points - format as bullet points (•), commas, or freeform text
              </p>
            </div>

            {/* Personal Fragrance Fields */}
            {formData.category === 'personal_fragrance' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="scent_family">Scent Family</Label>
                  <Input
                    id="scent_family"
                    value={formData.scent_family}
                    onChange={(e) => setFormData({ ...formData, scent_family: e.target.value })}
                    placeholder="e.g., Warm, Fresh, Woody, Floral"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="top_notes">Top Notes</Label>
                  <Textarea
                    id="top_notes"
                    value={formData.top_notes}
                    onChange={(e) => setFormData({ ...formData, top_notes: e.target.value })}
                    placeholder="First impression notes"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middle_notes">Middle Notes (Heart)</Label>
                  <Textarea
                    id="middle_notes"
                    value={formData.middle_notes}
                    onChange={(e) => setFormData({ ...formData, middle_notes: e.target.value })}
                    placeholder="Heart of the scent"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base_notes">Base Notes</Label>
                  <Textarea
                    id="base_notes"
                    value={formData.base_notes}
                    onChange={(e) => setFormData({ ...formData, base_notes: e.target.value })}
                    placeholder="Lasting foundation"
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Home Fragrance Fields */}
            {formData.category === 'home_fragrance' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="scent_profile">Scent Profile</Label>
                  <Textarea
                    id="scent_profile"
                    value={formData.scent_profile}
                    onChange={(e) => setFormData({ ...formData, scent_profile: e.target.value })}
                    placeholder="Overall scent description (avoid top/middle/base for home fragrance)"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="format">Format</Label>
                    <Input
                      id="format"
                      value={formData.format}
                      onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                      placeholder="e.g., Candle, Reed Diffuser, Room Spray"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="burn_time">Burn Time / Duration</Label>
                    <Input
                      id="burn_time"
                      value={formData.burn_time}
                      onChange={(e) => setFormData({ ...formData, burn_time: e.target.value })}
                      placeholder="e.g., 40 hours, 3 months"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingProduct(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name.trim()}>
              {editingProduct ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this product. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={viewingProduct}
        open={!!viewingProduct}
        onOpenChange={(open) => !open && setViewingProduct(null)}
      />
    </div>
  );
}
