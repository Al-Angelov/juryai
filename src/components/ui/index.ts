// Barrel export for the shared UI primitives (Req 15.1).
//
// Downstream panels import primitives from `../ui` rather than reaching into
// individual files, keeping the module boundary clean.

export { cn } from "./cn.ts";
export type { ClassValue } from "./cn.ts";

export {
  Badge,
  BADGE_VARIANTS,
} from "./Badge.tsx";
export type {
  BadgeProps,
  BadgeVariant,
  SanitizationBadgeVariant,
  RiskFlagBadgeVariant,
} from "./Badge.tsx";

export { Tooltip, TooltipProvider } from "./Tooltip.tsx";
export type { TooltipProps } from "./Tooltip.tsx";

export { Card } from "./Card.tsx";
export type { CardProps } from "./Card.tsx";

export { Button } from "./Button.tsx";
export type { ButtonProps, ButtonVariant } from "./Button.tsx";

export { NumericInput } from "./NumericInput.tsx";
export type { NumericInputProps } from "./NumericInput.tsx";

export { LoadingIndicator } from "./LoadingIndicator.tsx";
export type { LoadingIndicatorProps } from "./LoadingIndicator.tsx";

export { ErrorPanel } from "./ErrorPanel.tsx";
export type { ErrorPanelProps } from "./ErrorPanel.tsx";
