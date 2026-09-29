// Property-based test for StatutoryMatchList card completeness and fidelity.
//
// Feature: tax-audit-dashboard, Property 19: Statutory match cards are complete
// and faithful.
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.5

import { render, screen, within, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  StatutoryMatchList,
  MISSING_PARAGRAPH_PLACEHOLDER,
  MISSING_CLAIM_PLACEHOLDER,
} from "./AgentTransparencyTree.tsx";
import type { StatutoryMatch } from "../types/casePacket.ts";

describe("StatutoryMatchList card fidelity (Property 19)", () => {
  // Feature: tax-audit-dashboard, Property 19: Statutory match cards are complete and faithful
  it("renders one card per match, showing each field verbatim or its placeholder when absent/blank", () => {
    // Each field is independently present (a non-empty string) or absent
    // (undefined) — the two states Req 6.5 distinguishes: a supplied value
    // renders verbatim (Req 6.2, 6.3), a missing one renders the placeholder.
    const fieldArb = fc.option(fc.string({ minLength: 1 }), { nil: undefined });

    const matchArb: fc.Arbitrary<StatutoryMatch> = fc.record({
      citedParagraph: fieldArb,
      deductionClaim: fieldArb,
      // Risk flags are out of scope for this property (covered by Property 20);
      // keep them empty so cards render no badge noise.
      riskFlags: fc.constant([]),
    });

    fc.assert(
      fc.property(
        // At least one match so the list (not the empty-state) renders.
        fc.array(matchArb, { minLength: 1, maxLength: 6 }),
        (matches) => {
          render(<StatutoryMatchList matches={matches} />);

          try {
            // One card per match, in list order (Req 6.1).
            const list = screen.getByRole("list", {
              name: "Statutory matches",
            });
            const cards = within(list).getAllByRole("listitem");
            expect(cards.length).toBe(matches.length);

            // A field renders a placeholder when absent OR blank/whitespace-only,
            // matching the component's `hasParagraph` / `hasClaim` checks.
            const isPresent = (v: string | undefined): v is string =>
              typeof v === "string" && v.trim().length > 0;

            matches.forEach((match, index) => {
              const card = cards[index];

              // Each card carries exactly two rendered field paragraphs. Compare
              // via textContent (not Testing Library's whitespace-normalizing
              // matcher) so values like " !" or multi-space text compare exactly.
              const paragraphs = Array.from(card.querySelectorAll("p"));
              const texts = paragraphs.map((p) => p.textContent);

              const expectedParagraph = isPresent(match.citedParagraph)
                ? match.citedParagraph
                : MISSING_PARAGRAPH_PLACEHOLDER;
              const expectedClaim = isPresent(match.deductionClaim)
                ? match.deductionClaim
                : MISSING_CLAIM_PLACEHOLDER;

              // Both the cited paragraph (Req 6.2) and deduction claim (Req 6.3)
              // appear in this card, each verbatim or as its placeholder (Req 6.5).
              expect(texts).toContain(expectedParagraph);
              expect(texts).toContain(expectedClaim);

              // Absent/blank fields must surface a distinguishable placeholder;
              // present fields must not be swapped for one.
              const placeholders = Array.from(
                card.querySelectorAll('[data-placeholder="true"]'),
              ).map((p) => p.textContent);

              if (isPresent(match.citedParagraph)) {
                expect(placeholders).not.toContain(MISSING_PARAGRAPH_PLACEHOLDER);
              } else {
                expect(placeholders).toContain(MISSING_PARAGRAPH_PLACEHOLDER);
              }

              if (isPresent(match.deductionClaim)) {
                expect(placeholders).not.toContain(MISSING_CLAIM_PLACEHOLDER);
              } else {
                expect(placeholders).toContain(MISSING_CLAIM_PLACEHOLDER);
              }
            });
          } finally {
            // RTL auto-cleanup runs between tests, not between property
            // iterations; unmount after each run so DOM state never accumulates.
            cleanup();
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
