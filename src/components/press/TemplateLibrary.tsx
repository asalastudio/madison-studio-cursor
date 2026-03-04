import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Package, FileText, Box, Tag } from "lucide-react";

interface Template {
  id: string;
  name: string;
  category: string; // "perfume_box" | "roller_box" | "label" | "candle_box" | "jar_box"
  thumbnail?: string; // Path to thumbnail/SVG preview
  dimensions: string;
  description?: string;
  isPremium?: boolean;
}

interface TemplateLibraryProps {
  templates: Template[]; // Accept templates from parent
  onSelectTemplate: (templateId: string) => void;
  selectedTemplateId?: string | null;
}

export function TemplateLibrary({ templates, onSelectTemplate, selectedTemplateId }: TemplateLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase());

    // Map category filter to match template categories
    const categoryMatch = () => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "box") {
        return template.category.includes("box");
      }
      if (categoryFilter === "label") {
        return template.category === "label";
      }
      return template.category === categoryFilter;
    };

    return matchesSearch && categoryMatch();
  });

  const getCategoryIcon = (category: string) => {
    if (category.includes("box")) {
      return <Box className="w-3 h-3" />;
    }
    if (category === "label") {
      return <Tag className="w-3 h-3" />;
    }
    if (category.includes("bag")) {
      return <Package className="w-3 h-3" />;
    }
    return <Package className="w-3 h-3" />;
  };

  const formatCategoryName = (category: string) => {
    return category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-background/50 border-border/50 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff]/20 transition-all"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
        <TabsList className="w-full grid grid-cols-4 bg-background/50">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-[#00f0ff]/10 data-[state=active]:text-[#00f0ff] data-[state=active]:border-[#00f0ff]/50 transition-all"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="box"
            className="data-[state=active]:bg-[#00f0ff]/10 data-[state=active]:text-[#00f0ff] data-[state=active]:border-[#00f0ff]/50 transition-all"
          >
            Boxes
          </TabsTrigger>
          <TabsTrigger
            value="label"
            className="data-[state=active]:bg-[#00f0ff]/10 data-[state=active]:text-[#00f0ff] data-[state=active]:border-[#00f0ff]/50 transition-all"
          >
            Labels
          </TabsTrigger>
          <TabsTrigger
            value="bag"
            className="data-[state=active]:bg-[#00f0ff]/10 data-[state=active]:text-[#00f0ff] data-[state=active]:border-[#00f0ff]/50 transition-all"
          >
            Bags
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Template Grid */}
      <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 custom-scrollbar">
        {filteredTemplates.map((template) => {
          const isSelected = selectedTemplateId === template.id;

          return (
            <Card
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={`
                group relative p-3 cursor-pointer transition-all duration-300
                hover:border-[#00f0ff]/50 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)]
                ${
                  isSelected
                    ? "border-[#00f0ff] bg-[#00f0ff]/5 shadow-[0_0_25px_rgba(0,240,255,0.2)]"
                    : "border-border/50 bg-background/50"
                }
              `}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-[#00f0ff] to-[#8b5cf6] rounded-r-full animate-pulse" />
              )}

              <div className="flex gap-3">
                {/* SVG Preview Thumbnail */}
                <div
                  className={`
                    w-20 h-20 rounded-lg border flex items-center justify-center overflow-hidden
                    transition-all duration-300
                    ${
                      isSelected
                        ? "border-[#00f0ff]/50 bg-[#00f0ff]/5"
                        : "border-border/50 bg-muted/20 group-hover:border-[#00f0ff]/30"
                    }
                  `}
                >
                  {template.thumbnail ? (
                    <img
                      src={template.thumbnail}
                      alt={template.name}
                      className="w-full h-full object-contain p-2 opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <Package className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>

                {/* Template Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={`
                        text-sm font-medium truncate transition-colors
                        ${isSelected ? "text-[#00f0ff]" : "text-foreground group-hover:text-[#00f0ff]"}
                      `}
                    >
                      {template.name}
                    </h4>
                    {template.isPremium && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-[#8b5cf6]/20 text-[#8b5cf6] border-[#8b5cf6]/30"
                      >
                        Pro
                      </Badge>
                    )}
                  </div>

                  {template.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className="text-xs flex items-center gap-1 border-border/50"
                    >
                      {getCategoryIcon(template.category)}
                      {formatCategoryName(template.category)}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {template.dimensions}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hover Glow Effect */}
              <div
                className={`
                  absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
                  bg-gradient-to-r from-transparent via-[#00f0ff]/5 to-transparent
                `}
              />
            </Card>
          );
        })}

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No templates found</p>
            <p className="text-xs mt-1">Try adjusting your search or filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
