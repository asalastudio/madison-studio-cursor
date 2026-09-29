import type { NodeProps, NodeTypes } from "@xyflow/react";
import { Aperture, Box, ImageIcon, Layers, Package, Sparkles } from "lucide-react";
import { canvasImageModelLabel } from "@/lib/canvas/models";
import { BONE_STUDIO_HEX } from "@/lib/canvas/types";
import { asNodeData, CanvasNodeFrame, textValue } from "./CanvasNodeFrame";

function PackNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="pack"
      icon={<Package />}
      title={textValue(data, "name", "Bone v1")}
      subtitle={textValue(data, "brand", "Platform default")}
      settings={[
        { label: "Pack", value: textValue(data, "name", "Bone v1") },
        { label: "Resolver", value: "server · later" },
      ]}
      media={
        <div className="madison-canvas-node__media-fallback">
          <Package />
          Prompt pack
        </div>
      }
    />
  );
}

function ProductNode(props: NodeProps) {
  const data = asNodeData(props);
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="product"
      icon={<Box />}
      title={textValue(data, "name", "Product")}
      subtitle={textValue(data, "sku", "No SKU")}
      settings={[
        { label: "SKU", value: textValue(data, "sku", "—") },
        { label: "Via", value: textValue(data, "resolvedVia", "unresolved") },
      ]}
      media={
        imageUrl ? (
          <img src={imageUrl} alt={textValue(data, "name", "Product")} />
        ) : (
          <div className="madison-canvas-node__media-fallback">
            <Box />
            Reference
          </div>
        )
      }
    />
  );
}

function SetNode(props: NodeProps) {
  const data = asNodeData(props);
  const hex = textValue(data, "hex", BONE_STUDIO_HEX);
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="set"
      icon={<Sparkles />}
      title={textValue(data, "name", "Bone Studio")}
      subtitle="Generated-image backdrop — not UI chrome"
      settings={[
        { label: "Set", value: textValue(data, "name", "Bone Studio") },
        { label: "Hex", value: hex },
      ]}
      media={
        <div
          className="h-full w-full"
          style={{ background: hex }}
          aria-label={`${textValue(data, "name", "Bone Studio")} backdrop`}
        />
      }
    />
  );
}

function ShotNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="shot"
      icon={<Aperture />}
      title={textValue(data, "name", "PDP main")}
      subtitle={textValue(data, "note", "Optional note ≤300 characters.")}
      settings={[
        { label: "Type", value: textValue(data, "shotTypeId", "pdp_main") },
        { label: "Size", value: textValue(data, "size", "2080 × 2288") },
      ]}
      media={
        <div className="madison-canvas-node__media-fallback">
          <Aperture />
          Shot spec
        </div>
      }
    />
  );
}

function BatchNode(props: NodeProps) {
  const data = asNodeData(props);
  const takes = typeof data.takes === "number" ? data.takes : 3;
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="batch"
      icon={<Layers />}
      title="Batch"
      subtitle={`${takes} takes per combo`}
      settings={[
        { label: "Takes", value: String(takes) },
        { label: "Model", value: canvasImageModelLabel(data.model) },
      ]}
      media={
        <div className="madison-canvas-node__media-fallback">
          <Layers />
          Fan-out
        </div>
      }
    />
  );
}

function ImageNode(props: NodeProps) {
  const data = asNodeData(props);
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
  return (
    <CanvasNodeFrame
      id={props.id}
      selected={props.selected}
      type="image"
      icon={<ImageIcon />}
      title={textValue(data, "name", "Image")}
      subtitle={textValue(data, "status", "idle")}
      settings={[
        { label: "Model", value: canvasImageModelLabel(data.model) },
        { label: "Status", value: textValue(data, "status", "idle") },
      ]}
      media={
        imageUrl ? (
          <img src={imageUrl} alt={textValue(data, "name", "Image")} />
        ) : (
          <div className="madison-canvas-node__media-fallback">
            <ImageIcon />
            Awaiting exposure
          </div>
        )
      }
    />
  );
}

export const canvasNodeTypes: NodeTypes = {
  pack: PackNode,
  product: ProductNode,
  set: SetNode,
  shot: ShotNode,
  batch: BatchNode,
  image: ImageNode,
};
