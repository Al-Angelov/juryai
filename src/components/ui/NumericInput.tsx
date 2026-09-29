// NumericInput — a controlled text input for numeric entry.
//
// The value is intentionally kept as a STRING (not a number) so the adjustment
// table can distinguish empty, non-numeric, and out-of-range entries and run
// them through `src/lib/validation.ts` before recalculation (Req 10.3–10.6).
// The component itself does no validation; it renders whatever value it is
// given and reports raw string changes.
//
// Accessibility:
//   - An optional visible `label` is associated with the input via `htmlFor`/id.
//   - `aria-invalid` marks the field invalid when validation fails.
//   - `aria-describedby` associates an external validation message so screen
//     readers announce it (the message text is rendered by the caller/table).
//   - `disabled` forwards the native disabled attribute so disabled controls
//     expose their state.

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { THEME_TOKENS } from "../../lib/theme.ts";
import { cn } from "./cn.ts";

export interface NumericInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** The current string value (kept as text, never coerced to a number). */
  value: string;
  /** Called with the raw string on every change. */
  onValueChange: (value: string) => void;
  /** Optional visible label associated with the input. */
  label?: ReactNode;
  /** Whether the current value is invalid; sets `aria-invalid`. */
  invalid?: boolean;
  /**
   * Id of an external element (e.g. a validation message) describing the input.
   * Associated via `aria-describedby` so assistive tech reads it.
   */
  describedById?: string;
  /** Whether the control is disabled (forwards the native attribute). */
  disabled?: boolean;
  /** Explicit id override; auto-generated when omitted. */
  id?: string;
}

/**
 * A controlled numeric text input with label association and validation
 * affordances. Uses `inputMode="decimal"` to surface a numeric keypad on touch
 * devices while remaining a plain text input so string values are preserved.
 */
export function NumericInput({
  value,
  onValueChange,
  label,
  invalid = false,
  describedById,
  disabled = false,
  id,
  className,
  ...rest
}: NumericInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && label !== null && (
        <label
          htmlFor={inputId}
          className={cn("text-xs font-medium", THEME_TOKENS.text.muted)}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedById}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "rounded-md border bg-white px-3 py-2 text-sm",
          THEME_TOKENS.text.body,
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          "focus-visible:ring-offset-white",
          invalid
            ? "border-red-500 focus-visible:ring-red-400"
            : "border-slate-300 focus-visible:ring-[#006436]",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        {...rest}
      />
    </div>
  );
}
