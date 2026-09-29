// Field-level validation helpers for the Adjustment_Table inputs.
//
// Each editable numeric input (a deduction line item or a cap percentage) is
// stored as a raw string so that empty and non-numeric states are
// representable (design: "Adjustment Edit State"). Before a value participates
// in the client-side net-tax recalculation it is classified here.
//
// The design validation table (Requirement 10.3–10.6) defines two distinct
// invalid behaviors:
//   - "retain last valid" — suspend recalculation and keep the previously
//     displayed net tax (non-numeric / empty inputs).
//   - "exclude"           — drop the value from the input set and continue the
//     recalculation with the remaining valid values (negative line item, cap
//     outside the inclusive range 0–100).
//
//  | Field     | Invalid condition        | Behavior                    | Req  |
//  |-----------|--------------------------|-----------------------------|------|
//  | Line item | non-numeric              | retain last valid net tax   | 10.3 |
//  | Line item | empty                    | retain last valid net tax   | 10.6 |
//  | Line item | value < 0                | exclude value from recalc   | 10.5 |
//  | Cap %     | non-numeric              | retain last valid net tax   | 10.3 |
//  | Cap %     | empty                    | retain last valid net tax   | 10.6 |
//  | Cap %     | outside 0–100 inclusive  | exclude value from recalc   | 10.4 |
//
// 0 and 100 are valid boundary values for a cap percentage; 0 is a valid line
// item value.
//
// _Requirements: 10.3, 10.4, 10.5, 10.6_

/**
 * How the recalculation engine should treat a field once it has been
 * classified. Every result kind maps to exactly one of these behaviors.
 *
 * - `include`      — the value is valid; use it in the recalculation.
 * - `retain-last`  — suspend recalculation and keep the last valid net tax
 *                    (non-numeric / empty inputs, Requirements 10.3, 10.6).
 * - `exclude`      — drop this value and recalculate with the remaining valid
 *                    values (negative line item / out-of-range cap,
 *                    Requirements 10.4, 10.5).
 */
export type ValidationBehavior = "include" | "retain-last" | "exclude";

/**
 * Discriminated classification of a single raw input.
 *
 * `kind` is the discriminant:
 *   - `"valid"`        — parsed to a finite number within the allowed range;
 *                        `value` is populated and `behavior` is `"include"`.
 *   - `"non-numeric"`  — the trimmed input is not a finite number.
 *   - `"empty"`        — the input is empty or whitespace-only.
 *   - `"negative"`     — a line item parsed to a number below 0.
 *   - `"out-of-range"` — a cap percentage parsed outside 0–100 inclusive.
 *
 * `message` is a human-readable validation message for every invalid kind and
 * is omitted when the result is valid. `value` is the parsed number and is
 * present only when `kind === "valid"`.
 */
export type ValidationResult =
  | { kind: "valid"; behavior: "include"; value: number }
  | { kind: "non-numeric"; behavior: "retain-last"; message: string }
  | { kind: "empty"; behavior: "retain-last"; message: string }
  | { kind: "negative"; behavior: "exclude"; message: string }
  | { kind: "out-of-range"; behavior: "exclude"; message: string };

/** Convenience: the discriminant kinds that represent a valid input. */
export function isValid(
  result: ValidationResult
): result is Extract<ValidationResult, { kind: "valid" }> {
  return result.kind === "valid";
}

const CAP_MIN = 0;
const CAP_MAX = 100;

/**
 * Attempt to parse a raw input as a finite number.
 *
 * Returns `null` for empty/whitespace-only input, `NaN` for a non-empty but
 * non-numeric input, and the parsed finite number otherwise. Using `Number`
 * (rather than `parseFloat`) rejects trailing garbage such as `"12abc"`, which
 * `parseFloat` would otherwise accept as `12`.
 */
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null; // empty
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN; // NaN signals non-numeric
}

/**
 * Classify a raw deduction line-item input.
 *
 * A line item is valid when it parses to a finite number that is not below 0
 * (0 is accepted). Non-numeric and empty inputs retain the last valid net tax;
 * negative values are excluded from the recalculation.
 *
 * _Requirements: 10.3, 10.5, 10.6_
 */
export function validateLineItem(raw: string): ValidationResult {
  const parsed = parseNumeric(raw);

  if (parsed === null) {
    return {
      kind: "empty",
      behavior: "retain-last",
      message: "Enter a value. The last valid net tax is retained.",
    };
  }
  if (Number.isNaN(parsed)) {
    return {
      kind: "non-numeric",
      behavior: "retain-last",
      message: "Enter a numeric value. The last valid net tax is retained.",
    };
  }
  if (parsed < 0) {
    return {
      kind: "negative",
      behavior: "exclude",
      message: "Line item cannot be negative. This value is excluded.",
    };
  }
  return { kind: "valid", behavior: "include", value: parsed };
}

/**
 * Classify a raw cap-percentage input.
 *
 * A cap is valid when it parses to a finite number within the inclusive range
 * 0–100 (both boundaries accepted). Non-numeric and empty inputs retain the
 * last valid net tax; values outside 0–100 are excluded from the
 * recalculation.
 *
 * _Requirements: 10.3, 10.4, 10.6_
 */
export function validateCap(raw: string): ValidationResult {
  const parsed = parseNumeric(raw);

  if (parsed === null) {
    return {
      kind: "empty",
      behavior: "retain-last",
      message: "Enter a value. The last valid net tax is retained.",
    };
  }
  if (Number.isNaN(parsed)) {
    return {
      kind: "non-numeric",
      behavior: "retain-last",
      message: "Enter a numeric value. The last valid net tax is retained.",
    };
  }
  if (parsed < CAP_MIN || parsed > CAP_MAX) {
    return {
      kind: "out-of-range",
      behavior: "exclude",
      message: `Cap must be between ${CAP_MIN} and ${CAP_MAX}. This value is excluded.`,
    };
  }
  return { kind: "valid", behavior: "include", value: parsed };
}
