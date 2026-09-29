import type { NodeProps, NodeTypes } from "@xyflow/react";
import { asNodeData, CanvasNodeFrame, textValue } from "./CanvasNodeFrame";

function PackNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="pack"
      title={textValue(data, "name", "Bone v1")}
      subtitle={textValue(data, "brand", "Platform default")}
    >
      <p>Sets and shot types are pinned here. Generation still uses the server-side pack resolver later.</p>
    </CanvasNodeFrame>
  );
}

function ProductNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="product"
      title={textValue(data, "name", "Product")}
      subtitle={textValue(data, "sku", "No SKU")}
    >
      {typeof data.imageUrl === "string" && data.imageUrl ? (
        <img src={data.imageUrl} alt={textValue(data, "name", "Product")} className="h-20 w-full object-contain rounded bg-background" />
      ) : (
        <p>No reference image yet. Week 2 generation will use this node as Image 1.</p>
      )}
    </CanvasNodeFrame>
  );
}

function SetNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="set"
      title={textValue(data, "name", "Bone Studio")}
      subtitle={textValue(data, "hex", "#F5F3EF")}
    >
      <p>Default backdrop is Bone. Prompt assembly stays server-side and is not run this week.</p>
    </CanvasNodeFrame>
  );
}

function ShotNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="shot"
      title={textValue(data, "name", "PDP main")}
      subtitle={textValue(data, "shotTypeId", "pdp_main")}
    >
      <p>{textValue(data, "note", "Optional note ≤300 characters.")}</p>
    </CanvasNodeFrame>
  );
}

function BatchNode(props: NodeProps) {
  const data = asNodeData(props);
  const takes = typeof data.takes === "number" ? data.takes : 3;
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="batch"
      title="Batch"
      subtitle={`${takes} takes per combo`}
    >
      <p>Week 2 will fan this out to jobs with a credit hold. This node is config only.</p>
    </CanvasNodeFrame>
  );
}

function ImageNode(props: NodeProps) {
  const data = asNodeData(props);
  return (
    <CanvasNodeFrame
      selected={props.selected}
      type="image"
      title={textValue(data, "name", "Image")}
      subtitle={textValue(data, "status", "idle")}
    >
      <p>Placeholder. Approve / reject and cost land with the worker queue.</p>
    </CanvasNodeFrame>
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
