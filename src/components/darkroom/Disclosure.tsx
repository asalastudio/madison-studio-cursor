import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { LEDIndicator } from "./LEDIndicator";

/**
 * A collapsible camera-panel section with a readout in its header.
 *
 * The Compose tab opened with nine sections uncollapsed in a 260px column,
 * with exactly one collapsible group in the whole surface (Pro Controls). The
 * fix is not to hide things — it is to close the menu and keep the *value*
 * visible, the way a camera's top plate shows the current setting while the
 * menu that changes it stays shut.
 *
 * So `summary` is the point. A closed Scene section still reads
 * "Natural Stone · Thirds Offset"; a closed Composite section still reads
 * "2 of 6 slots". Nothing applies invisibly, and nothing needs to be forced
 * open to prove it is set.
 *
 * Lifted from the Pro Controls pattern that already existed inline, so the
 * chevron, the height animation and the border treatment match exactly.
 */
export interface DisclosureProps {
  label: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** The current value, shown in the header whether open or closed. */
  summary?: string | null;
  /** Something is set inside — lights the LED amber. Steady, never pulsing. */
  active?: boolean;
  children: ReactNode;
}

export function Disclosure({
  label,
  icon,
  open,
  onToggle,
  summary,
  active = false,
  children,
}: DisclosureProps) {
  return (
    <div className="camera-panel">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-2.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <LEDIndicator state={active ? "active" : "ready"} size="sm" />
          <span className="shrink-0 text-[var(--darkroom-accent)] [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
          <span className="shrink-0 text-[11px] font-medium text-[var(--darkroom-text)]">{label}</span>
          {summary ? (
            <span
              className="ml-1 truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--darkroom-text-muted)]"
              title={summary}
            >
              {summary}
            </span>
          ) : null}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="shrink-0">
          <ChevronDown className="h-3.5 w-3.5 text-[var(--darkroom-text-dim)]" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-white/[0.04] px-2.5 pb-2.5 pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
