import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import { useProducts, type Product } from "@/hooks/useProducts";

interface ProductSelectorProps {
  value: string;
  onSelect: (product: Product) => void;
  onProductDataChange?: (productData: Product | null) => void;
  showLabel?: boolean;
  className?: string;
  buttonClassName?: string;
}

export function ProductSelector({
  value,
  onSelect,
  onProductDataChange,
  showLabel = true,
  className = "",
  buttonClassName = "w-full justify-between bg-background/50"
}: ProductSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { products, loading } = useProducts();

  const filteredProducts = useMemo(() => {
    if (!searchValue) return products;
    return products.filter(product => {
      const searchLower = searchValue.toLowerCase();
      const parentSku = (product.metadata?.parent_sku as string)?.toLowerCase();

      return (
        product.name.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower) ||
        (parentSku && parentSku.includes(searchLower))
      );
    });
  }, [searchValue, products]);

  return (
    <div className={showLabel ? "space-y-2" : ""}>
      {showLabel && <Label htmlFor="productName">Product Name *</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="productName"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={buttonClassName}
          >
            {value || "Select product..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={`p-0 bg-[#1A1816] border-[#2C2C2C] z-[9999] pointer-events-auto ${className || "w-[300px]"}`}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="bg-[#1A1816]">
            <CommandInput
              placeholder="Search products..."
              value={searchValue}
              onValueChange={setSearchValue}
              className="bg-[#1A1816] text-[#EAEAEA]"
            />
            <CommandList className="bg-[#1A1816]">
              <CommandEmpty className="text-studio-text-muted">
                {loading ? "Loading products..." : "No products found. Products can be added through your brand settings."}
              </CommandEmpty>
              <CommandGroup>
                {filteredProducts.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.name}
                    onSelect={() => {
                      onSelect(product);
                      onProductDataChange?.(product);
                      setOpen(false);
                      setSearchValue("");
                    }}
                    className="text-[#EAEAEA] hover:bg-white/10 cursor-pointer aria-selected:bg-white/10 aria-selected:text-[#EAEAEA]"
                  >
                    {product.name}
                    <span className="ml-auto text-xs text-[#888]">
                      {product.category || 'Uncategorized'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
