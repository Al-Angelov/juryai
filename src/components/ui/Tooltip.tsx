// Tooltip — a thin wrapper over @radix-ui/react-tooltip.
//
// The wrapper defaults to a very short `delayDuration` (0 ms) so the tooltip
// appears effectively immediately on hover, allowing downstream timing tests to
// assert the entity-chip tooltip surfaces within 200 ms (Req 4.2). Radix shows
// tooltip content on BOTH pointer hover and keyboard focus, satisfying the
// hover/focus requirement for accessibility.
//
// A single `TooltipProvider` should wrap the app (or the relevant subtree); the
// `Tooltip` component here bundles Root + Trigger + Content for convenience so
// callers only supply the trigger element and the tooltip `content`.

import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "./cn.ts";

/**
 * Provider for the tooltip subsystem. Wrap the app (or a subtree) once.
 * Defaults `delayDuration` to 0 ms so tooltips open promptly (Req 4.2); callers
 * may override per-provider if they need a different global delay.
 */
export function TooltipProvider({
  children,
  delayDuration = 0,
  skipDelayDuration = 0,
}: {
  children: ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}) {
  return (
    <RadixTooltip.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
    >
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  /** The element that triggers the tooltip on hover/focus. */
  children: ReactNode;
  /** The tooltip content shown on hover/focus. */
  content: ReactNode;
  /**
   * Per-tooltip open delay in ms. Defaults to 0 so it appears immediately,
   * keeping tooltip-timing tests (<=200 ms) comfortably within bounds (Req 4.2).
   */
  delayDuration?: number;
  /** Preferred side to render the tooltip content. */
  side?: RadixTooltip.TooltipContentProps["side"];
  /** Extra classes merged onto the content surface. */
  contentClassName?: string;
}

/**
 * Convenience Tooltip bundling Radix Root + Trigger + Content. The trigger uses
 * `asChild` so the caller's element becomes the trigger without an extra
 * wrapper node. Content is themed to sit above the dark surfaces (Req 15.2).
 *
 * Requires a `TooltipProvider` ancestor.
 */
export function Tooltip({
  children,
  content,
  delayDuration = 0,
  side = "top",
  contentClassName,
}: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-xs rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5",
            "text-xs text-slate-200 shadow-lg",
            contentClassName,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-slate-800" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
