// ErrorPanel — an accessible error surface with an optional Retry action.
//
// Shown when a case fetch or decision submission fails or times out (Req 1.5,
// 11.8, 12.6). The panel uses `role="alert"` so the error is announced, renders
// the error message, and — when an `onRetry` handler is supplied — a Retry
// button that re-invokes the failed operation.

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "./cn.ts";
import { Button } from "./Button.tsx";

export interface ErrorPanelProps {
  /** The error message to display. */
  message: ReactNode;
  /**
   * Optional retry handler. When provided, a Retry button is rendered that
   * calls this handler.
   */
  onRetry?: () => void;
  /** Label for the retry button (default: "Retry"). */
  retryLabel?: string;
  /** Whether the retry action is disabled (e.g. while a retry is in flight). */
  retryDisabled?: boolean;
  /** Extra classes merged onto the container. */
  className?: string;
  /** Optional test id passthrough. */
  "data-testid"?: string;
}

/**
 * An error panel with `role="alert"`. Renders the message and, when `onRetry`
 * is provided, a Retry button.
 */
export function ErrorPanel({
  message,
  onRetry,
  retryLabel = "Retry",
  retryDisabled = false,
  className,
  "data-testid": testId,
}: ErrorPanelProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4",
        "text-sm text-red-700",
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="leading-snug">{message}</p>
        {onRetry && (
          <div>
            <Button
              variant="secondary"
              onClick={onRetry}
              disabled={retryDisabled}
            >
              {retryLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
