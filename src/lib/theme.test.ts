import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { BODY_TEXT_BACKGROUND_PAIRS, type ColorPair } from "./theme.ts";

// WCAG contrast helpers.
//
// Parse a `#rrggbb` hex string into its 8-bit sRGB channels.
function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    throw new Error(`Expected a #rrggbb hex color, received: ${hex}`);
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

// Convert an 8-bit sRGB channel to its linear-light value per the WCAG formula.
function linearize(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Relative luminance per WCAG 2.x definition.
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// WCAG contrast ratio (L1 + 0.05) / (L2 + 0.05) with L1 the lighter luminance.
function contrastRatio(text: string, background: string): number {
  const l1 = relativeLuminance(text);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_MINIMUM = 4.5;

// Feature: tax-audit-dashboard, Property 27: Theme body-text contrast meets WCAG AA
//
// Validates: Requirements 15.2
//
// For any body-text / background token pair defined by the shared theme, the
// computed WCAG contrast ratio must be at least 4.5:1 (Requirement 15.2). The
// pairs form a fixed finite set, so the property samples uniformly from that set
// via fc.constantFrom across >= 100 runs; every possible pair is also asserted
// directly to guarantee full coverage.
describe("theme — Property 27: body-text contrast meets WCAG AA", () => {
  it("keeps every sampled body-text/background pair at >= 4.5:1", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BODY_TEXT_BACKGROUND_PAIRS),
        (pair: ColorPair) => {
          expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(
            WCAG_AA_MINIMUM,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("keeps every defined pair at >= 4.5:1", () => {
    for (const pair of BODY_TEXT_BACKGROUND_PAIRS) {
      expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(
        WCAG_AA_MINIMUM,
      );
    }
  });
});
