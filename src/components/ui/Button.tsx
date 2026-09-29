// Button — a themed action button used for the HITL controls (Approve, Reject,
// Retry) and other interactive actions.
//
// Supports three variants — primary (accent fill), secondary (surface), and
// danger (destructive red) — and forwards the native `disabled` attribute so
// disabled controls expose their disabled state to assistive technology
// (Req 11.7, 11.8 gating; general accessibility). Primary uses the shared
// accent-surface token (Req 15.2).

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { THEME_TOKENS } from "../../lib/theme.ts";
import { cn } from "./cn.ts";

/** Visual variants for the Button. */
export type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Solid Vero forest-green fill for the primary action. Uses the shared
  // accent-surface token with white text (contrast ~7.3:1, AA-compliant).
  primary: cn(
    THEME_TOKENS.accentSurface,
    "text-white hover:bg-[#00522c] focus-visible:ring-[#006436]",
  ),
  // Light surface-toned secondary action.
  secondary:
    "border border-slate-300 bg-white text-[#0F172A] hover:bg-slate-50 focus-visible:ring-slate-400",
  // Destructive/danger action rendered as an outline (red border + red text).
  danger:
    "border border-red-500 bg-white text-red-600 hover:bg-red-50 focus-visible:ring-red-400",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant (default: "primary"). */
  variant?: ButtonVariant;
  /** Button contents. */
  children?: ReactNode;
}

/**
 * A themed button. Disabled state is reflected via the native `disabled`
 * attribute plus dimmed styling and `cursor-not-allowed`.
 */
export function Button({
  variant = "primary",
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-white",
        VARIANT_CLASSES[variant],
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
