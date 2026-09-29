// LoadingIndicator — an accessible spinner shown while the case loads or a
// decision is submitting (Req 1.2, 11/12 in-flight states).
//
// Accessibility: the container carries `role="status"` and `aria-live="polite"`
// so assistive technology announces the loading state, plus an accessible label
// (either the visible `label` text or an `aria-label` fallback). The spinning
// icon itself is decorative (`aria-hidden`).

import { Loader2 } from "lucide-react";
import { THEME_TOKENS } from "../../lib/theme.ts";
import { cn } from "./cn.ts";

export interface LoadingIndicatorProps {
  /**
   * Visible label rendered next to the spinner. When omitted, the text is
   * visually hidden but still announced via `aria-label`.
   */
  label?: string;
  /** Whether to visually show the label text (default: true when provided). */
  showLabel?: boolean;
  /** Extra classes merged onto the container. */
  className?: string;
  /** Optional test id passthrough. */
  "data-testid"?: string;
}

/**
 * An accessible spinner with `role="status"`. Always exposes an accessible name
 * so it is announced even when the label is visually hidden.
 */
export function LoadingIndicator({
  label = "Loading",
  showLabel = true,
  className,
  "data-testid": testId,
}: LoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-2 text-sm",
        THEME_TOKENS.text.muted,
        className,
      )}
    >
      <Loader2
        aria-hidden="true"
        className={cn("h-4 w-4 animate-spin", THEME_TOKENS.accent)}
      />
      {showLabel ? (
        <span>{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
