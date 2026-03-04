/**
 * Box 3D Preview Component
 *
 * Future enhancement: 3D mockup preview inspired by Pacdora
 * This is a placeholder component showing the structure.
 * Full implementation requires React Three Fiber (@react-three/fiber)
 *
 * TODO: Install dependencies:
 * npm install three @react-three/fiber @react-three/drei
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Box, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Box3DPreviewProps {
  // Future: accept dieline geometry
  dielineData?: any;
  // Future: accept artwork textures
  artworkUrl?: string;
  className?: string;
}

export function Box3DPreview({ dielineData, artworkUrl, className = "" }: Box3DPreviewProps) {
  const [foldState, setFoldState] = useState(0.5); // 0 = flat, 1 = fully folded
  const [rotationSpeed, setRotationSpeed] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 3D Preview Container */}
      <Card className="preview-3d-container aspect-square relative overflow-hidden bg-[#0a0a0f]">
        {/* Placeholder for Three.js Canvas */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* TODO: Replace with actual Three.js Canvas */}
          <div className="text-center space-y-3">
            <Box className="w-16 h-16 mx-auto text-[#00f0ff]/30 animate-pulse" />
            <div>
              <p className="text-sm text-[#888899]">3D Preview</p>
              <p className="text-xs text-[#555566] mt-1">React Three Fiber integration</p>
            </div>
          </div>
        </div>

        {/* Star Field Background Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div
            className="absolute w-1 h-1 bg-[#00f0ff] rounded-full"
            style={{ top: "20%", left: "30%", boxShadow: "0 0 3px #00f0ff" }}
          />
          <div
            className="absolute w-1 h-1 bg-[#8b5cf6] rounded-full"
            style={{ top: "60%", left: "70%", boxShadow: "0 0 3px #8b5cf6" }}
          />
          <div
            className="absolute w-1 h-1 bg-[#00f0ff] rounded-full"
            style={{ top: "80%", left: "20%", boxShadow: "0 0 3px #00f0ff" }}
          />
        </div>
      </Card>

      {/* Controls */}
      <Card className="glass-panel p-4 space-y-4">
        {/* Fold Animation Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-[#888899] uppercase tracking-wide">
              Fold Animation
            </Label>
            <span className="text-xs text-[#00f0ff] font-mono">{Math.round(foldState * 100)}%</span>
          </div>
          <Slider
            value={[foldState]}
            onValueChange={([v]) => setFoldState(v)}
            min={0}
            max={1}
            step={0.01}
            className="cyber-slider"
          />
          <div className="flex justify-between text-[10px] text-[#555566] mt-1">
            <span>Open</span>
            <span>Close</span>
          </div>
        </div>

        {/* Rotation Speed */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-[#888899] uppercase tracking-wide">
              Rotation Speed
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRotate(!autoRotate)}
              className="h-6 px-2 text-[10px]"
            >
              <RotateCw className={`w-3 h-3 mr-1 ${autoRotate ? "animate-spin" : ""}`} />
              {autoRotate ? "ON" : "OFF"}
            </Button>
          </div>
          <Slider
            value={[rotationSpeed]}
            onValueChange={([v]) => setRotationSpeed(v)}
            min={0}
            max={2}
            step={0.1}
            disabled={!autoRotate}
            className="cyber-slider"
          />
        </div>

        {/* View Presets */}
        <div>
          <Label className="text-xs text-[#888899] uppercase tracking-wide mb-2 block">
            View Presets
          </Label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 border-[#00f0ff]/20 hover:border-[#00f0ff]/50 hover:bg-[#00f0ff]/5"
            >
              Front
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 border-[#00f0ff]/20 hover:border-[#00f0ff]/50 hover:bg-[#00f0ff]/5"
            >
              Side
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 border-[#00f0ff]/20 hover:border-[#00f0ff]/50 hover:bg-[#00f0ff]/5"
            >
              Top
            </Button>
          </div>
        </div>
      </Card>

      {/* Info */}
      <Card className="glass-panel p-3">
        <p className="text-[10px] text-[#888899] leading-relaxed">
          <span className="text-[#00f0ff]">Pro Tip:</span> The 3D preview updates in real-time as you
          modify dimensions and add artwork.
        </p>
      </Card>
    </div>
  );
}

/**
 * Future Implementation Notes:
 *
 * 1. Install Three.js dependencies:
 *    npm install three @react-three/fiber @react-three/drei
 *
 * 2. Replace placeholder with actual Canvas:
 *    <Canvas camera={{ position: [0, 2, 5], fov: 50 }}>
 *      <ambientLight intensity={0.5} />
 *      <spotLight position={[10, 10, 10]} intensity={1} />
 *      <Box3DMesh geometry={convertDielineToGeometry(dielineData)} foldState={foldState} />
 *      <OrbitControls enableZoom={true} autoRotate={autoRotate} autoRotateSpeed={rotationSpeed} />
 *      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
 *    </Canvas>
 *
 * 3. Create geometry converter function:
 *    function convertDielineToGeometry(dielineData) {
 *      // Parse SVG dieline paths
 *      // Convert to 3D box geometry with fold lines
 *      // Apply artwork as texture
 *    }
 *
 * 4. Animate fold state:
 *    - Interpolate between flat (dieline) and folded (box) states
 *    - Use lerp for smooth transitions
 *
 * 5. Add Anti-Gravity effects:
 *    - Particle system around the box
 *    - Cyan glow on edges
 *    - Orbital ring rotation animation
 */
