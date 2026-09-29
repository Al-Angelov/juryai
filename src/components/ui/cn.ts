// Tiny class-name joiner used by the shared UI primitives.
//
// Filters out falsy entries (undefined / null / false / "") and joins the
// remaining class strings with a single space. This keeps the primitive
// components readable when they compose several conditional Tailwind tokens
// (including the shared theme tokens from `src/lib/theme.ts`) without pulling in
// an external dependency.

export type ClassValue = string | number | false | null | undefined;

/**
 * Join truthy class values into a single space-separated class string.
 *
 * @example cn("px-2", isActive && "bg-sky-400", undefined) // "px-2 bg-sky-400"
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
