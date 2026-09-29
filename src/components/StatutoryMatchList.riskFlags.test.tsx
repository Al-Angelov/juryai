// Property test for risk-flag rendering in the StatutoryMatchList (task 7.8).
//
// Property 20: Risk-flag rendering matches the flag set.
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7.
//
// For any subset (possibly empty, possibly multiple) of the four RiskFlag
// values, StatutoryMatchList must render exactly one badge per present flag and
// no badge for any absent flag. Badges encode their variant via a
// `data-variant` attribute on the rendered span, so we query the DOM by that
// attribute. When the flag set is empty, no risk badge is rendered at all
// (Req 7.7). We also assert the four risk-flag variants are pairwise distinct
// in BADGE_VARIANTS (distinct labels AND distinct color classNames) so any one
// is distinguishable from each of the others (Req 7.5).

import { render, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { StatutoryMatchList } from "./AgentTransparencyTree.tsx";
import { BADGE_VARIANTS } from "./ui";
import type { RiskFlag, StatutoryMatch } from "../types/casePacket.ts";

// The four Critic risk-flag values, in a stable order for subarray generation.
const RISK_FLAGS: readonly RiskFlag[] = [
  "verified",
  "high-risk",
  "missing-receipt",
  "counterfactual-geography",
];

// Arbitrary subset of the four RiskFlag values: possibly empty, possibly
// several, always deduped (fc.subarray preserves uniqueness of the source).
const riskFlagSubsetArb: fc.Arbitrary<RiskFlag[]> = fc.subarray([...RISK_FLAGS]);

// Non-empty text for the cited paragraph and deduction claim so the match card
// renders both fields present (the flag-set assertions are independent of these).
const nonEmptyTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

describe("Property 20: Risk-flag rendering matches the flag set", () => {
  // Feature: tax-audit-dashboard, Property 20: Risk-flag rendering matches the flag set
  it("renders exactly one badge per present flag and none for absent flags", () => {
    // Distinctness of the four risk-flag variants (Req 7.5): pairwise-distinct
    // labels AND pairwise-distinct color className strings, so any one is
    // distinguishable from each of the others (never by color alone). This is
    // invariant across runs, so assert it once up front.
    const labels = RISK_FLAGS.map((v) => BADGE_VARIANTS[v].label);
    const classNames = RISK_FLAGS.map((v) => BADGE_VARIANTS[v].className);
    expect(new Set(labels).size).toBe(RISK_FLAGS.length);
    expect(new Set(classNames).size).toBe(RISK_FLAGS.length);

    fc.assert(
      fc.property(
        nonEmptyTextArb,
        nonEmptyTextArb,
        riskFlagSubsetArb,
        (citedParagraph, deductionClaim, riskFlags) => {
          const match: StatutoryMatch = {
            citedParagraph,
            deductionClaim,
            riskFlags,
          };

          try {
            const { container } = render(
              <StatutoryMatchList matches={[match]} />,
            );

            const present = new Set(riskFlags);

            // For each of the four variants: exactly one badge when the flag is
            // in the set (Req 7.1–7.4, 7.6), zero badges when it is absent.
            for (const flag of RISK_FLAGS) {
              const badges = container.querySelectorAll(
                `[data-variant="${flag}"]`,
              );
              expect(badges.length).toBe(present.has(flag) ? 1 : 0);
            }

            // Empty flag set => no risk badge of any variant at all (Req 7.7).
            const totalRiskBadges = RISK_FLAGS.reduce(
              (n, flag) =>
                n + container.querySelectorAll(`[data-variant="${flag}"]`).length,
              0,
            );
            expect(totalRiskBadges).toBe(riskFlags.length);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
