import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  MoreHorizontal,
  Package,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Layers,
  DollarSign,
  Beaker,
  BarChart3,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Archive,
  ExternalLink,
  CheckCircle2,
  Lock,
  ListTodo,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useProduct,
  useProducts,
  PRODUCT_STATUS_OPTIONS,
  DEVELOPMENT_STAGE_OPTIONS,
  PRODUCT_CATEGORIES,
  PRODUCT_TYPES,
  type ProductStatus,
  type DevelopmentStage,
  type Product,
  type UpdateProductInput,
} from "@/hooks/useProducts";
import { FormulationSection } from "@/components/products/FormulationSection";
import { IngredientsSection } from "@/components/products/IngredientsSection";
import { SDSSection } from "@/components/products/SDSSection";
import { PackagingSection } from "@/components/products/PackagingSection";
import { BottleSpecsSection } from "@/components/products/BottleSpecsSection";
import { MediaSection } from "@/components/products/MediaSection";
import { useUserRole, type RoleCapabilities } from "@/hooks/useUserRole";
import { RoleBadge } from "@/components/role";
import { TaskList } from "@/components/tasks";
import { useOrganization } from "@/hooks/useOrganization";
import { useGridPipelineFeatureFlag } from "@/hooks/useGridPipelineFeatureFlag";
import { ContentPickerModal, type ContentTarget } from "@/components/products/ContentPickerModal";
import { PublishProductToSanity } from "@/components/products/PublishProductToSanity";
import { VariantsSection } from "@/components/products/VariantsSection";
import { useSuppliers, COMPANY_TYPES } from "@/hooks/useSuppliers";
import { Building2, Factory, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ProductInternalSidebar } from "@/components/products/ProductInternalSidebar";
import { ProductBottleReferenceSection } from "@/components/products/ProductBottleReferenceSection";

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT INFO TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface ProductInfoTabProps {
  product: ProductWithVariants;
  isEditing: boolean;
  onChange: (field: string, value: unknown) => void;
}

type ProductVariantSummary = {
  id?: string | null;
  title?: string | null;
  sku?: string | null;
};

type ProductWithVariants = Product & {
  variants?: ProductVariantSummary[];
};

function ProductInfoTab({ product, isEditing, onChange }: ProductInfoTabProps) {
  const productTypes = product.category ? PRODUCT_TYPES[product.category] || [] : [];
  const { activeSuppliers, isLoading: suppliersLoading } = useSuppliers();

  // Content picker state
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [contentTarget, setContentTarget] = useState<ContentTarget>("short_description");

  const openContentPicker = (target: ContentTarget) => {
    setContentTarget(target);
    setShowContentPicker(true);
  };

  const handleContentSelect = (content: string) => {
    onChange(contentTarget, content);
  };

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
          <CardDescription>Core product details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Product Name */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Product Name</Label>
              {isEditing ? (
                <Input
                  id="name"
                  value={product.name || ""}
                  onChange={(e) => onChange("name", e.target.value)}
                  placeholder="Enter product name"
                />
              ) : (
                <p className="text-foreground">{product.name || "—"}</p>
              )}
            </div>

            {/* SKU - Show primary SKU and all variant SKUs */}
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              {isEditing ? (
                <Input
                  id="sku"
                  value={product.sku || ""}
                  onChange={(e) => onChange("sku", e.target.value)}
                  placeholder="e.g., VIT-C-001"
                />
              ) : (
                <div className="space-y-2">
                  {/* Primary SKU */}
                  <p className="text-foreground">{product.sku || "—"}</p>

                  {/* Show all variant SKUs if there are variants */}
                  {product.variants && Array.isArray(product.variants) && product.variants.length > 1 && (
                    <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Included Variants</p>
                      <div className="flex flex-wrap gap-2">
                        {product.variants.map((variant, index) => (
                          <div key={variant.id || index} className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border border-border">
                            <span className="text-xs text-muted-foreground">{variant.title}:</span>
                            <code className="text-xs font-mono font-medium">{variant.sku || "—"}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Parent SKU */}
            <div className="space-y-2">
              <Label htmlFor="parent_sku">Parent SKU</Label>
              {isEditing ? (
                <Input
                  id="parent_sku"
                  value={(product.metadata?.parent_sku as string) || ""}
                  onChange={(e) => {
                    const currentMetadata = product.metadata || {};
                    onChange("metadata", { ...currentMetadata, parent_sku: e.target.value });
                  }}
                  placeholder="Parent SKU Group"
                />
              ) : (
                <p className="text-foreground">{(product.metadata?.parent_sku as string) || "—"}</p>
              )}
            </div>


            {/* Barcode */}
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              {isEditing ? (
                <Input
                  id="barcode"
                  value={product.barcode || ""}
                  onChange={(e) => onChange("barcode", e.target.value)}
                  placeholder="UPC or EAN"
                />
              ) : (
                <p className="text-foreground">{product.barcode || "—"}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              {isEditing ? (
                <Select
                  value={product.category || ""}
                  onValueChange={(val) => {
                    onChange("category", val);
                    onChange("product_type", ""); // Reset product type when category changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-foreground">{product.category || "—"}</p>
              )}
            </div>

            {/* Product Type */}
            <div className="space-y-2">
              <Label>Product Type</Label>
              {isEditing ? (
                <Select
                  value={product.product_type || ""}
                  onValueChange={(val) => onChange("product_type", val)}
                  disabled={productTypes.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-foreground">{product.product_type || "—"}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sourcing & Supplier */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Product Sourcing
          </CardTitle>
          <CardDescription>
            Where does this product come from? This affects how SDS documents are handled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Self-Manufactured Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <Factory className="w-5 h-5 text-muted-foreground" />
              <div>
                <Label htmlFor="is_self_manufactured" className="font-medium">
                  I manufacture this product
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable if you formulate or make this product yourself
                </p>
              </div>
            </div>
            {isEditing ? (
              <Switch
                id="is_self_manufactured"
                checked={product.is_self_manufactured !== false}
                onCheckedChange={(checked) => {
                  onChange("is_self_manufactured", checked);
                  if (checked) {
                    onChange("supplier_id", null);
                  }
                }}
              />
            ) : (
              <Badge variant={product.is_self_manufactured !== false ? "default" : "secondary"}>
                {product.is_self_manufactured !== false ? "Yes" : "No"}
              </Badge>
            )}
          </div>

          {/* Supplier Selection (if not self-manufactured) */}
          {product.is_self_manufactured === false && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <Label className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Supplier / Vendor
              </Label>
              {isEditing ? (
                <Select
                  value={product.supplier_id || "none"}
                  onValueChange={(val) => onChange("supplier_id", val === "none" ? null : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier selected</SelectItem>
                    {activeSuppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        <div className="flex items-center gap-2">
                          <span>{supplier.name}</span>
                          {supplier.company_type && (
                            <span className="text-xs text-muted-foreground">
                              ({COMPANY_TYPES.find(t => t.value === supplier.company_type)?.label || supplier.company_type})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-foreground">
                  {activeSuppliers.find(s => s.id === product.supplier_id)?.name || "No supplier selected"}
                </p>
              )}

              {activeSuppliers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No suppliers added yet.{" "}
                  <a href="/suppliers" className="text-primary hover:underline">
                    Add a supplier
                  </a>
                </p>
              )}

              {/* Supplier Info Preview */}
              {product.supplier_id && (
                (() => {
                  const supplier = activeSuppliers.find(s => s.id === product.supplier_id);
                  if (!supplier) return null;
                  return (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                      {supplier.contact_email && (
                        <p className="text-muted-foreground">
                          Contact: {supplier.contact_email}
                        </p>
                      )}
                      {supplier.has_sds_portal && supplier.sds_portal_url && (
                        <p className="text-muted-foreground">
                          <a
                            href={supplier.sds_portal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            SDS Portal Available →
                          </a>
                        </p>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Description</CardTitle>
              <CardDescription>Product descriptions for different uses</CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openContentPicker("long_description")}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Import from Library
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Import content you've created in the Library
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tagline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tagline">Tagline</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => openContentPicker("tagline")}
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Import
              </Button>
            </div>
            {isEditing ? (
              <Input
                id="tagline"
                value={product.tagline || ""}
                onChange={(e) => onChange("tagline", e.target.value)}
                placeholder="A catchy one-liner"
              />
            ) : (
              <p className="text-foreground">{product.tagline || "—"}</p>
            )}
          </div>

          {/* Short Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="short_description">Short Description</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => openContentPicker("short_description")}
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Import
              </Button>
            </div>
            {isEditing ? (
              <Textarea
                id="short_description"
                value={product.short_description || ""}
                onChange={(e) => onChange("short_description", e.target.value)}
                placeholder="Brief description for listings and previews"
                rows={3}
              />
            ) : (
              <p className="text-foreground whitespace-pre-wrap">
                {product.short_description || "—"}
              </p>
            )}
          </div>

          {/* Long Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="long_description">Full Description</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => openContentPicker("long_description")}
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Import
              </Button>
            </div>
            {isEditing ? (
              <Textarea
                id="long_description"
                value={product.long_description || ""}
                onChange={(e) => onChange("long_description", e.target.value)}
                placeholder="Detailed product description"
                rows={6}
              />
            ) : (
              <p className="text-foreground whitespace-pre-wrap">
                {product.long_description || "—"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Picker Modal */}
      <ContentPickerModal
        open={showContentPicker}
        onOpenChange={setShowContentPicker}
        target={contentTarget}
        onSelect={handleContentSelect}
        productId={product.id}
        productName={product.name}
      />

      {/* Key Benefits */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Key Benefits</CardTitle>
          <CardDescription>What makes this product special</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Benefits</Label>
            {isEditing ? (
              <Textarea
                value={(product.key_benefits || []).join("\n")}
                onChange={(e) =>
                  onChange(
                    "key_benefits",
                    e.target.value.split("\n").filter((b) => b.trim())
                  )
                }
                placeholder="Enter each benefit on a new line"
                rows={4}
              />
            ) : (
              <ul className="list-disc list-inside space-y-1">
                {(product.key_benefits || []).map((benefit: string, i: number) => (
                  <li key={i} className="text-foreground">
                    {benefit}
                  </li>
                ))}
                {(!product.key_benefits || product.key_benefits.length === 0) && (
                  <p className="text-muted-foreground">No benefits listed</p>
                )}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label>Key Differentiators</Label>
            {isEditing ? (
              <Textarea
                value={(product.key_differentiators || []).join("\n")}
                onChange={(e) =>
                  onChange(
                    "key_differentiators",
                    e.target.value.split("\n").filter((d) => d.trim())
                  )
                }
                placeholder="What sets this apart from competitors"
                rows={3}
              />
            ) : (
              <ul className="list-disc list-inside space-y-1">
                {(product.key_differentiators || []).map((diff: string, i: number) => (
                  <li key={i} className="text-foreground">
                    {diff}
                  </li>
                ))}
                {(!product.key_differentiators || product.key_differentiators.length === 0) && (
                  <p className="text-muted-foreground">No differentiators listed</p>
                )}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER TABS
// ═══════════════════════════════════════════════════════════════════════════════

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-12 text-center">
        <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// View-only banner for sections user can't edit
function ViewOnlyBanner({ section }: { section: string }) {
  return (
    <div className="mt-4 p-3 bg-muted/50 border border-border rounded-lg flex items-center gap-2 text-sm text-muted-foreground">
      <Lock className="w-4 h-4" />
      <span>
        You have view-only access to {section}. Contact a team admin to request edit access.
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PRODUCT HUB PAGE
// ═══════════════════════════════════════════════════════════════════════════════

// Tab configuration with role mapping
type TabSection = keyof RoleCapabilities["sections"];
interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: TabSection;
}

/**
 * Default cosmetic-industry tab list (fragrance / skincare / body care).
 */
const TAB_CONFIG_COSMETIC: TabConfig[] = [
  { id: "core", label: "Core Details", icon: FileText, section: "info" },
  { id: "tasks", label: "Tasks", icon: ListTodo, section: "info" },
  { id: "media", label: "Media", icon: ImageIcon, section: "media" },
  { id: "variants", label: "Variants", icon: Layers, section: "info" },
  { id: "pricing", label: "Pricing", icon: DollarSign, section: "analytics" },
  { id: "formulation", label: "Scent Profile", icon: Beaker, section: "formulation" },
  { id: "ingredients", label: "Ingredients", icon: Beaker, section: "ingredients" },
  { id: "sds", label: "Compliance", icon: FileText, section: "compliance" },
  { id: "packaging", label: "Packaging", icon: Package, section: "packaging" },
  { id: "content", label: "Content", icon: Sparkles, section: "marketing" },
];

/**
 * Packaging-industry tab list (Best Bottles and other glass/bottle tenants).
 * Replaces fragrance-specific sections with Bottle Specs — a comprehensive
 * vessel-spec section covering schematic dimensions, neck thread standards,
 * material, manufacturing, decoration, sustainability, and certifications.
 */
const TAB_CONFIG_PACKAGING: TabConfig[] = [
  { id: "core", label: "Core Details", icon: FileText, section: "info" },
  { id: "tasks", label: "Tasks", icon: ListTodo, section: "info" },
  { id: "media", label: "Media", icon: ImageIcon, section: "media" },
  { id: "variants", label: "Variants", icon: Layers, section: "info" },
  { id: "pricing", label: "Pricing", icon: DollarSign, section: "analytics" },
  { id: "bottle-specs", label: "Bottle Specs", icon: Beaker, section: "info" },
  { id: "content", label: "Content", icon: Sparkles, section: "marketing" },
];

/** Resolve which tab list to render for a given organization. */
function resolveTabConfig(isPackagingOrg: boolean): TabConfig[] {
  if (isPackagingOrg) return TAB_CONFIG_PACKAGING;
  return TAB_CONFIG_COSMETIC;
}

/** Resolve which sidebar industry preset to use for a given organization. */
function resolveIndustry(isPackagingOrg: boolean): "cosmetic" | "packaging" {
  if (isPackagingOrg) return "packaging";
  return "cosmetic";
}

/** Backwards-compatible alias — kept so other call sites that still import TAB_CONFIG don't break. */
const TAB_CONFIG = TAB_CONFIG_COSMETIC;

export default function ProductHub() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = location.pathname.endsWith("/edit");

  const { data: product, isLoading, error } = useProduct(productId || null);
  const { updateProduct, deleteProduct, duplicateProduct } = useProducts();
  const { organizationId } = useOrganization();
  const { enabled: isPackagingOrg } = useGridPipelineFeatureFlag();

  // Role-based access
  const {
    teamRole,
    capabilities,
    canView,
    canEdit,
    getAccessLevel,
    hasFullAccess
  } = useUserRole();

  const [isEditing, setIsEditing] = useState(isEditMode);
  const [editedProduct, setEditedProduct] = useState<ProductWithVariants | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Industry-aware tab list — Best Bottles gets Bottle Specs in place of
  // Scent Profile / Ingredients / Compliance / Packaging.
  const tabConfig = resolveTabConfig(isPackagingOrg);
  const industry = resolveIndustry(isPackagingOrg);

  // Filter visible tabs based on role
  const visibleTabs = tabConfig.filter(tab => canView(tab.section));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || "info");

  // Initialize edited product when product loads
  useEffect(() => {
    if (product) {
      setEditedProduct({ ...(product as ProductWithVariants) });
    }
  }, [product]);

  // Track changes
  const handleChange = (field: string, value: unknown) => {
    setEditedProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
    setHasChanges(true);
  };

  // Save changes
  const handleSave = async () => {
    if (!editedProduct || !productId) return;

    // Only send updateable fields, not computed/readonly fields
    const updatePayload: UpdateProductInput = {
      id: productId,
      name: editedProduct.name,
      slug: editedProduct.slug,
      sku: editedProduct.sku,
      barcode: editedProduct.barcode,
      short_description: editedProduct.short_description,
      long_description: editedProduct.long_description,
      tagline: editedProduct.tagline,
      price: editedProduct.price,
      compare_at_price: editedProduct.compare_at_price,
      cost_per_unit: editedProduct.cost_per_unit,
      status: editedProduct.status,
      visibility: editedProduct.visibility,
      development_stage: editedProduct.development_stage,
      category: editedProduct.category,
      subcategory: editedProduct.subcategory,
      product_type: editedProduct.product_type,
      product_line: editedProduct.product_line,
      collections: editedProduct.collections,
      tags: editedProduct.tags,
      hero_image_id: editedProduct.hero_image_id,
      hero_image_external_url: editedProduct.hero_image_external_url,
      brand_voice_notes: editedProduct.brand_voice_notes,
      target_audience: editedProduct.target_audience,
      key_benefits: editedProduct.key_benefits,
      key_differentiators: editedProduct.key_differentiators,
      seo_title: editedProduct.seo_title,
      seo_description: editedProduct.seo_description,
      seo_keywords: editedProduct.seo_keywords,
      launch_date: editedProduct.launch_date,
      metadata: editedProduct.metadata,
    };


    // Only include supplier fields if they've been explicitly set
    if (editedProduct.supplier_id !== undefined) {
      updatePayload.supplier_id = editedProduct.supplier_id;
    }
    if (editedProduct.is_self_manufactured !== undefined) {
      updatePayload.is_self_manufactured = editedProduct.is_self_manufactured;
    }

    await updateProduct.mutateAsync(updatePayload);

    setHasChanges(false);
    setIsEditing(false);
    navigate(`/products/${productId}`);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditedProduct({ ...product });
    setHasChanges(false);
    setIsEditing(false);
    if (isEditMode) {
      navigate(`/products/${productId}`);
    }
  };

  // Get status badge
  const getStatusBadge = (status: ProductStatus) => {
    const option = PRODUCT_STATUS_OPTIONS.find((o) => o.value === status);
    if (!option) return null;
    return (
      <Badge variant="secondary" className={cn("text-xs", option.color)}>
        {option.label}
      </Badge>
    );
  };

  // Get development stage info
  const getStageInfo = (stage: DevelopmentStage) => {
    return DEVELOPMENT_STAGE_OPTIONS.find((o) => o.value === stage);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <Package className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium mb-2">Product not found</h2>
          <p className="text-muted-foreground mb-4">
            This product may have been deleted or you don't have access.
          </p>
          <Button onClick={() => navigate("/products")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  const displayProduct = editedProduct || product;
  const stageInfo = getStageInfo(displayProduct.development_stage);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/products")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Products
              </Button>

              <Separator orientation="vertical" className="h-6" />

              {/* Product Image */}
              <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {displayProduct.hero_image_url ? (
                  <img
                    src={displayProduct.hero_image_url}
                    alt={displayProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-serif font-semibold">
                    {displayProduct.name}
                  </h1>
                  {getStatusBadge(displayProduct.status)}
                  <RoleBadge size="sm" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>SKU: {(displayProduct.metadata?.parent_sku as string) || displayProduct.sku}</span>
                  {displayProduct.category && (
                    <>
                      <span>•</span>
                      <span>{displayProduct.category}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={handleCancel} className="min-h-[44px]">
                    <span className="hidden sm:inline">Cancel</span>
                    <span className="sm:hidden">Cancel</span>
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || updateProduct.isPending}
                    className="min-h-[44px]"
                  >
                    {updateProduct.isPending ? (
                      "Saving..."
                    ) : (
                      <>
                        <Save className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Save Changes</span>
                        <span className="sm:hidden">Save</span>
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(true)} className="min-h-[44px]">
                    <span className="hidden sm:inline">Edit</span>
                    <span className="sm:hidden">Edit</span>
                  </Button>

                  {/* Push to Sanity - for headless site */}
                  <PublishProductToSanity
                    product={displayProduct}
                    variant="outline"
                    size="default"
                    className="min-h-[44px]"
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="min-h-[44px] min-w-[44px]">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => duplicateProduct.mutate(product.id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          updateProduct.mutate({
                            id: product.id,
                            visibility: product.visibility === "public" ? "private" : "public",
                          })
                        }
                      >
                        {product.visibility === "public" ? (
                          <>
                            <EyeOff className="w-4 h-4 mr-2" />
                            Make Private
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            Make Public
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          updateProduct.mutate({ id: product.id, status: "archived" })
                        }
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={async () => {
                          await deleteProduct.mutateAsync(product.id);
                          navigate("/products");
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content - New Sidebar Layout */}
      <div className="flex flex-1">
        {/* Left Sidebar - Product Internal Navigation */}
        <div className="hidden lg:flex flex-shrink-0 border-r border-border">
          <ProductInternalSidebar
            productId={productId!}
            productName={displayProduct.name}
            activeSection={activeTab}
            onSectionChange={setActiveTab}
            industry={industry}
            accessLevels={Object.fromEntries(
              tabConfig.map(t => [t.section, getAccessLevel(t.section)])
            )}
          />
        </div>

        {/* Mobile Tab Navigation (fallback for small screens) */}
        <div className="lg:hidden w-full px-4 py-2 border-b border-border overflow-x-auto">
          <div className="flex gap-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-shrink-0 gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 p-4 md:p-6">
          <div className="max-w-4xl">


            {/* Section Content - Render based on activeTab */}
            {activeTab === "core" && (
              <>
                <ProductInfoTab
                  product={displayProduct}
                  isEditing={isEditing && canEdit("info")}
                  onChange={handleChange}
                />
                {!canEdit("info") && isEditing && (
                  <ViewOnlyBanner section="Core Details" />
                )}
              </>
            )}


            {activeTab === "tasks" && organizationId && (
              <TaskList
                productId={productId!}
                organizationId={organizationId}
              />
            )}

            {activeTab === "media" && (
              <>
                <MediaSection productId={productId!} />
                {!canEdit("media") && <ViewOnlyBanner section="Media" />}
              </>
            )}

            {activeTab === "variants" && (
              <VariantsSection
                product={displayProduct}
                isEditing={isEditing && canEdit("info")}
                onChange={(field, value) => setEditedProduct(prev => ({ ...prev, [field]: value }))}
              />
            )}

            {activeTab === "pricing" && (
              <VariantsSection
                product={displayProduct}
                isEditing={isEditing && canEdit("analytics")}
                onChange={(field, value) => setEditedProduct(prev => ({ ...prev, [field]: value }))}
              />
            )}

            {/* Bottle Specs — packaging-industry section. Only rendered when the
               sidebar surfaces it (Best Bottles / packaging tenants). Editable
               in-place when isEditing — every field write produces a new metadata
               object via handleChange("metadata", newMetadata). */}
            {activeTab === "bottle-specs" && (
              <>
                <BottleSpecsSection
                  product={displayProduct}
                  isEditing={isEditing && canEdit("info")}
                  onChange={handleChange}
                />
                {!canEdit("info") && isEditing && <ViewOnlyBanner section="Bottle Specs" />}
              </>
            )}

            {activeTab === "formulation" && (
              <>
                <FormulationSection
                  productId={productId!}
                  productCategory={displayProduct.category || displayProduct.product_type}
                  isEditing={isEditing && canEdit("formulation")}
                />
                {!canEdit("formulation") && isEditing && (
                  <ViewOnlyBanner section="Scent Profile" />
                )}
              </>
            )}

            {activeTab === "ingredients" && (
              <>
                <IngredientsSection
                  productId={productId!}
                  productName={displayProduct.name}
                  isEditing={isEditing && canEdit("ingredients")}
                />
                {!canEdit("ingredients") && isEditing && (
                  <ViewOnlyBanner section="Ingredients" />
                )}
              </>
            )}

            {activeTab === "sds" && (
              <>
                <SDSSection
                  productId={productId!}
                  productName={displayProduct.name}
                  productType={displayProduct.product_type}
                  brandName={displayProduct.brand}
                  sku={displayProduct.sku}
                  isEditing={isEditing && canEdit("compliance")}
                  supplierId={displayProduct.supplier_id}
                  isSelfManufactured={displayProduct.is_self_manufactured !== false}
                />
                {!canEdit("compliance") && isEditing && (
                  <ViewOnlyBanner section="Compliance" />
                )}
              </>
            )}

            {activeTab === "packaging" && (
              <>
                <div className="mb-8">
                  <ProductBottleReferenceSection
                    organizationId={organizationId}
                    productId={productId!}
                    sku={displayProduct.sku}
                    parentSku={(displayProduct.metadata?.parent_sku as string) || null}
                    canEdit={canEdit("packaging") || canEdit("media")}
                  />
                </div>
                <PackagingSection
                  productId={productId!}
                  productName={displayProduct.name}
                  isEditing={isEditing && canEdit("packaging")}
                />
                {!canEdit("packaging") && isEditing && (
                  <ViewOnlyBanner section="Packaging" />
                )}
              </>
            )}

            {activeTab === "content" && (
              <PlaceholderTab
                title="Content Hub"
                description="Coming in Week 10 - View all content created for this product"
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Status Card */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEditing ? (
                  <Select
                    value={displayProduct.status}
                    onValueChange={(val) => handleChange("status", val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  getStatusBadge(displayProduct.status)
                )}

                <Separator />

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Development Stage
                  </Label>
                  {isEditing ? (
                    <Select
                      value={displayProduct.development_stage}
                      onValueChange={(val) => handleChange("development_stage", val)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVELOPMENT_STAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium mt-1">
                      {stageInfo?.label || displayProduct.development_stage}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Visibility</Label>
                  <p className="text-sm font-medium capitalize mt-1">
                    {displayProduct.visibility}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>
                    {new Date(displayProduct.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>
                    {new Date(displayProduct.updated_at).toLocaleDateString()}
                  </span>
                </div>
                {displayProduct.launch_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Launch Date</span>
                    <span>
                      {new Date(displayProduct.launch_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
