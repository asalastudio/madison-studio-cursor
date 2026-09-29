/**
 * Shared dark-studio tokens.
 *
 * Dark Room already satisfies this contract via `src/styles/darkroom.css`.
 * Video (and later Canvas) consume these names — do not restyle Dark Room
 * to match a sibling tool.
 */

export const DARK_STUDIO_TOKENS = {
  bg: "var(--darkroom-bg)",
  bgGradient: "var(--darkroom-bg-gradient)",
  surface: "var(--darkroom-surface)",
  surfaceElevated: "var(--darkroom-surface-elevated)",
  border: "var(--darkroom-border)",
  borderSubtle: "var(--darkroom-border-subtle)",
  text: "var(--darkroom-text)",
  textMuted: "var(--darkroom-text-muted)",
  textDim: "var(--darkroom-text-dim)",
  accent: "var(--darkroom-accent)",
  accentHover: "var(--darkroom-accent-hover)",
  accentGlow: "var(--darkroom-accent-glow)",
  success: "var(--darkroom-success)",
  error: "var(--darkroom-error)",
  ledReady: "var(--led-ready)",
  ledActive: "var(--led-active)",
  ledError: "var(--led-error)",
  lcdFont: "var(--lcd-font)",
  displayFont: "var(--font-display)",
  bodyFont: "var(--font-body)",
} as const;

export const DARK_STUDIO_CLASSES = {
  container: "dark-room-container",
  header: "dark-room-header",
  headerTitle: "dark-room-header__title",
  leftRail: "left-rail",
  leftRailSection: "left-rail__section",
  leftRailTitle: "left-rail__section-title",
  centerCanvas: "center-canvas",
  viewport: "center-canvas__viewport",
  cameraPanel: "camera-panel",
  generateButton: "generate-button",
  generateButtonContainer: "generate-button-container",
} as const;
