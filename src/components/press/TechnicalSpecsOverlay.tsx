import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface DimensionSpec {
  outer: {
    width: number;
    height: number;
    depth: number;
  };
  inner: {
    width: number;
    height: number;
    depth: number;
  };
  manufacture: {
    width: number;
    height: number;
    depth: number;
  };
}

interface TechnicalSpecsOverlayProps {
  dimensions: DimensionSpec;
  unit?: "mm" | "in";
  className?: string;
}

export function TechnicalSpecsOverlay({
  dimensions,
  unit = "mm",
  className = "",
}: TechnicalSpecsOverlayProps) {
  const formatDimension = (w: number, h: number, d: number) => {
    return `${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)} ${unit}`;
  };

  return (
    <Card
      className={`
        glass-panel backdrop-blur-lg
        bg-[#12121a]/80 border-[#00f0ff]/10
        shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        ${className}
      `}
    >
      <div className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-4 bg-gradient-to-b from-[#00f0ff] to-[#8b5cf6] rounded-full" />
          <h4 className="text-xs uppercase tracking-wider text-[#00f0ff] font-medium">
            Specifications
          </h4>
        </div>

        {/* Dimensions */}
        <div className="space-y-2 text-xs font-mono">
          <div>
            <div className="text-[#888899] text-[10px] uppercase tracking-wide mb-0.5">
              Manufacture dimensions
            </div>
            <div className="text-[#f0f0f0]">
              {formatDimension(
                dimensions.manufacture.width,
                dimensions.manufacture.height,
                dimensions.manufacture.depth
              )}
            </div>
          </div>

          <Separator className="bg-border/30" />

          <div>
            <div className="text-[#888899] text-[10px] uppercase tracking-wide mb-0.5">
              Inner dimensions
            </div>
            <div className="text-[#f0f0f0]">
              {formatDimension(
                dimensions.inner.width,
                dimensions.inner.height,
                dimensions.inner.depth
              )}
            </div>
          </div>

          <Separator className="bg-border/30" />

          <div>
            <div className="text-[#888899] text-[10px] uppercase tracking-wide mb-0.5">
              Outer dimensions
            </div>
            <div className="text-[#f0f0f0]">
              {formatDimension(
                dimensions.outer.width,
                dimensions.outer.height,
                dimensions.outer.depth
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface LineLegendProps {
  className?: string;
}

export function LineLegend({ className = "" }: LineLegendProps) {
  const lineTypes = [
    {
      name: "Bleed",
      color: "#8b5cf6", // Nebula Purple
      style: "solid",
      description: "Cut line with bleed area",
    },
    {
      name: "Trim",
      color: "#00f0ff", // Electric Cyan
      style: "solid",
      description: "Final cut line",
    },
    {
      name: "Crease",
      color: "#ff3366", // Mars Red
      style: "dashed",
      description: "Fold/score line",
    },
  ];

  return (
    <div className={className}>
      <h3 className="text-sm font-medium mb-3">Line Types</h3>

      {/* Legend Items */}
      <div className="space-y-2.5">
        {lineTypes.map((lineType) => (
          <div key={lineType.name} className="flex items-center gap-3">
            {/* Line Sample */}
            <div className="w-10 h-px border-t-2 flex-shrink-0" style={{
              borderColor: lineType.color,
              borderStyle: lineType.style,
            }} />

            {/* Label */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium" style={{ color: lineType.color }}>
                {lineType.name}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {lineType.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          All measurements include industry-standard bleed and safety margins
        </p>
      </div>
    </div>
  );
}
