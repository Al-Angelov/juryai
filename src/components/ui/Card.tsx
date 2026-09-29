// Card — an inset content container used to group related content within a
// panel.
//
// Rendered as a subtly-tinted (#F8F9FA canvas) inset over the white panel cards,
// with body text from the shared token, so every inner card matches the OmaVero
// light theme (Req 15.2). An optional `title` renders a labeled header, and
// callers may pass a bordered variant (used by the Deterministic Math Block,
// which must sit in a labeled, bordered container — Req 8.2).

import type { HTMLAttributes, ReactNode } from "react";
import { THEME_TOKENS } from "../../lib/theme.ts";
import { cn } from "./cn.ts";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Optional header title rendered above the card body. */
  title?: ReactNode;
  /** Card body content. */
  children?: ReactNode;
  /** Whether to render a visible border around the card (default: true). */
  bordered?: boolean;
}

/**
 * A themed surface container. Applies the shared surface + body-text tokens and
 * an optional labeled header.
 */
export function Card({
  title,
  children,
  bordered = true,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-[#F8F9FA] p-5",
        THEME_TOKENS.text.body,
        bordered && "border border-slate-200",
        className,
      )}
      {...rest}
    >
      {title !== undefined && title !== null && (
        <div className={cn("mb-2 text-sm font-semibold", THEME_TOKENS.text.body)}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
