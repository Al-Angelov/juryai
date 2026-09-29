// Badge — a small labeled status/risk pill used across every panel.
//
// The Badge deliberately encodes its meaning in BOTH a color treatment and a
// text label (plus an icon), so no two variants are distinguishable by color
// alone. This satisfies the accessibility requirement that color is never the
// sole signal for sanitization states (Req 2.4) or Critic risk flags (Req 7.5).
//
// Two families of variants are supported through the single `variant` prop:
//   - Sanitization states: "active" | "inactive" | "unknown" (Req 2.2–2.4, 2.6)
//   - Risk flags: "verified" | "high-risk" | "missing-receipt" |
//       "counterfactual-geography" (Req 7.1–7.5)
//
// Styling is built on the shared dark-mode theme so badges layer cleanly on the
// panel surfaces (Req 15.2).

import type { ReactNode } from "react";
import {
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  HelpCircle,
  AlertTriangle,
  ReceiptText,
  MapPinOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn.ts";

/** Sanitization badge states (Req 2.2–2.4, 2.6). */
export type SanitizationBadgeVariant = "active" | "inactive" | "unknown";

/** Critic risk-flag badge variants (Req 7.1–7.5). Mirrors `RiskFlag`. */
export type RiskFlagBadgeVariant =
  | "verified"
  | "high-risk"
  | "missing-receipt"
  | "counterfactual-geography";

/** Every variant the Badge understands. */
export type BadgeVariant = SanitizationBadgeVariant | RiskFlagBadgeVariant;

/**
 * Descriptor for a variant: the default text label, its icon, and the color
 * classes. Labels and icons are pairwise distinct so states never rely on color
 * alone (Req 2.4, 7.5).
 */
interface BadgeVariantDescriptor {
  /** Default human-readable label (overridable via `children`). */
  label: string;
  /** Lucide icon rendered before the label. */
  icon: LucideIcon;
  /** Tailwind classes controlling the color treatment (border/bg/text). */
  className: string;
}

/**
 * Static, exported map of every badge variant to its descriptor. Exported so
 * tests (Property 20, Property 22) can assert that labels and color treatments
 * are pairwise distinct across variants.
 */
export const BADGE_VARIANTS: Record<BadgeVariant, BadgeVariantDescriptor> = {
  // Sanitization states. Light-theme outline-style tags: tinted background,
  // solid border, dark text (>= 4.5:1 on white). Each variant stays pairwise
  // distinct in both label and color treatment (color is never the sole signal).
  active: {
    label: "Active",
    icon: ShieldCheck,
    className: "border-emerald-500 bg-emerald-50 text-emerald-700",
  },
  inactive: {
    label: "Inactive",
    icon: ShieldOff,
    className: "border-slate-400 bg-slate-100 text-slate-700",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    className: "border-amber-500 bg-amber-50 text-amber-700",
  },
  // Risk flags.
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    className: "border-teal-500 bg-teal-50 text-teal-700",
  },
  "high-risk": {
    label: "High Risk",
    icon: AlertTriangle,
    className: "border-red-500 bg-red-50 text-red-700",
  },
  "missing-receipt": {
    label: "Missing Receipt",
    icon: ReceiptText,
    className: "border-orange-500 bg-orange-50 text-orange-700",
  },
  "counterfactual-geography": {
    label: "Counterfactual Geography",
    icon: MapPinOff,
    className: "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700",
  },
};

export interface BadgeProps {
  /** Which status/risk variant to render. */
  variant: BadgeVariant;
  /**
   * Optional label override. When omitted the variant's default label is used.
   * Providing a label keeps the variant's icon and color treatment.
   */
  children?: ReactNode;
  /** Extra classes merged after the variant classes. */
  className?: string;
  /** Optional test id passthrough. */
  "data-testid"?: string;
}

/**
 * Render a status/risk Badge. The variant determines the icon, default label,
 * and color treatment; every variant is distinguishable by label + icon in
 * addition to color.
 */
export function Badge({
  variant,
  children,
  className,
  "data-testid": testId,
}: BadgeProps) {
  const descriptor = BADGE_VARIANTS[variant];
  const Icon = descriptor.icon;

  return (
    <span
      data-variant={variant}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        descriptor.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{children ?? descriptor.label}</span>
    </span>
  );
}
