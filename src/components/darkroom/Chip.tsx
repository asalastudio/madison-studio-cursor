import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Dark Room's one chip.
 *
 * Compose already renders two chip grids — background presets and composition
 * presets — as inline `<button>`s with inline styles and no shared behaviour.
 * Neither sets `aria-pressed`, so a screen reader cannot tell a selected chip
 * from an unselected one. Adding a third hand-rolled grid would have made that
 * three divergent implementations, so this exists before the third one lands.
 *
 * Two shapes, distinguished by whether `active` is passed:
 *   - a toggle (`active` given) reports its state via `aria-pressed`
 *   - an action (`active` omitted) is a plain button and reports nothing
 *
 * Colours come from the darkroom tokens via `color-mix()`. The obvious
 * `bg-[var(--token)]/10` shorthand silently emits no CSS in Tailwind 3.4 and
 * leaves a stray light border behind — see the 97-site sweep.
 */
export interface ChipProps {
  label: string;
  /** Selected state. Passing this makes the chip a toggle. */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Native tooltip. Use it for anything the label had to truncate. */
  title?: string;
  icon?: ReactNode;
  /** Trailing detail — a timestamp, a count. Dimmer than the label. */
  meta?: string;
  className?: string;
}

const BORDER_IDLE = "border-[color-mix(in_srgb,var(--darkroom-border)_100%,transparent)]";
const BORDER_ACTIVE = "border-[color-mix(in_srgb,var(--darkroom-accent)_52%,transparent)]";
const BG_ACTIVE = "bg-[color-mix(in_srgb,var(--darkroom-accent)_8%,transparent)]";

export function Chip({
  label,
  active,
  disabled = false,
  onClick,
  title,
  icon,
  meta,
  className,
}: ChipProps) {
  const isToggle = active !== undefined;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      aria-pressed={isToggle ? active : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[10px] leading-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--darkroom-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? `${BORDER_ACTIVE} ${BG_ACTIVE}` : `${BORDER_IDLE} bg-transparent`,
        active
          ? "text-[var(--darkroom-accent)]"
          : "text-[var(--darkroom-text-muted)] hover:text-[var(--darkroom-text)] hover:border-[color-mix(in_srgb,var(--darkroom-accent)_40%,transparent)]",
        className,
      )}
    >
      {icon ? <span className="shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span> : null}
      <span className="truncate">{label}</span>
      {meta ? (
        <span className="shrink-0 text-[9px] text-[var(--darkroom-text-dim)]">{meta}</span>
      ) : null}
    </button>
  );
}

/** Horizontal wrap for a set of chips. Keeps spacing consistent across grids. */
export function ChipRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>;
}
