import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["fabric"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // UI framework
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-label",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-toggle",
            "@radix-ui/react-collapsible",
          ],
          // Rich text editor
          "vendor-tiptap": [
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/extension-link",
            "@tiptap/extension-placeholder",
            "@tiptap/extension-bubble-menu",
          ],
          // Animation & motion
          "vendor-motion": ["framer-motion"],
          // Data & state
          "vendor-data": ["@tanstack/react-query", "@supabase/supabase-js"],
          // Date utilities
          "vendor-date": ["date-fns"],
          // Charts & visualization (if recharts is used)
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
}));
