import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VideoUxFixture } from "@/components/video-studio/VideoUxFixture";
import "@/index.css";
import "@/styles/darkroom.css";
import "@/styles/video-studio.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <VideoUxFixture />
  </StrictMode>,
);
