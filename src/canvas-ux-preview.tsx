import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CanvasUxFixture } from "@/components/canvas/CanvasUxFixture";
import "@/index.css";
import "@/styles/darkroom.css";
import "@/styles/madison-canvas.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <CanvasUxFixture />
  </StrictMode>,
);
