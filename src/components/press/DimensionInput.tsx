import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import {
  generateTuckEndBox,
  generateRollerBottleBox,
  generateCandleBox,
  generateBottleLabel,
  generateJarBox,
  type DielineOutput,
} from "@/lib/press/generators";

interface DimensionInputProps {
  templateType: string;
  onGenerate: (dieline: DielineOutput) => void;
}

export function DimensionInput({ templateType, onGenerate }: DimensionInputProps) {
  const [width, setWidth] = useState<number>(50);
  const [height, setHeight] = useState<number>(150);
  const [depth, setDepth] = useState<number>(50);
  const [circumference, setCircumference] = useState<number>(200);

  const handleGenerate = () => {
    let result: DielineOutput;

    switch (templateType) {
      case "perfume_box":
        result = generateTuckEndBox({ width, height, depth });
        break;
      case "roller_box":
        result = generateRollerBottleBox({ width: 30, height: 100, depth: 30 });
        break;
      case "candle_box":
        result = generateCandleBox({ width, height, depth });
        break;
      case "label":
        result = generateBottleLabel({ circumference, height });
        break;
      case "jar_box":
        result = generateJarBox({ width, height, depth });
        break;
      default:
        result = generateTuckEndBox({ width, height, depth });
    }

    onGenerate(result);
  };

  const isLabel = templateType === "label";

  return (
    <Card className="p-4">
      <h3 className="font-medium mb-4">Enter Dimensions</h3>

      <div className="space-y-3">
        {!isLabel ? (
          <>
            <div>
              <Label>Width (mm)</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                min="10"
                max="500"
              />
            </div>
            <div>
              <Label>Height (mm)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                min="10"
                max="500"
              />
            </div>
            <div>
              <Label>Depth (mm)</Label>
              <Input
                type="number"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                min="10"
                max="500"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>Circumference (mm)</Label>
              <Input
                type="number"
                value={circumference}
                onChange={(e) => setCircumference(Number(e.target.value))}
                min="50"
                max="500"
              />
            </div>
            <div>
              <Label>Height (mm)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                min="10"
                max="200"
              />
            </div>
          </>
        )}

        <Button onClick={handleGenerate} className="w-full">
          <Sparkles className="w-4 h-4 mr-2" />
          Generate Dieline
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Professional dieline generated from your dimensions
        </p>
      </div>
    </Card>
  );
}
