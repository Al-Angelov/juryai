// Property-based test for SubjectProfile's Subject_ID rendering.
//
// Feature: tax-audit-dashboard, Property 21: Subject_ID renders exactly or
// falls back to a placeholder.
//
// Validates: Requirements 2.1, 2.5

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { SubjectProfile, SUBJECT_ID_UNAVAILABLE } from "./CaseContextPanel.tsx";

describe("SubjectProfile Subject_ID rendering (Property 21)", () => {
  // Feature: tax-audit-dashboard, Property 21: Subject_ID renders exactly or falls back to a placeholder
  it("renders a non-empty Subject_ID exactly, else shows the unavailable placeholder", () => {
    // subjectId is either absent (undefined), an empty string, or an arbitrary
    // non-empty string. These are exactly the cases the Identity_Firewall may
    // hand off: a present pseudonymous id, or a missing/blank one (Req 2.1, 2.5).
    const subjectIdArb = fc.oneof(
      fc.constant<string | undefined>(undefined),
      fc.constant<string | undefined>(""),
      fc.string({ minLength: 1 }),
    );

    fc.assert(
      fc.property(subjectIdArb, (subjectId) => {
        render(<SubjectProfile subject={{ subjectId }} />);

        try {
          const isNonEmpty =
            typeof subjectId === "string" && subjectId.length > 0;

          if (isNonEmpty) {
            // Req 2.1: the Subject_ID is displayed exactly as received. Compare
            // against textContent directly rather than toHaveTextContent, which
            // collapses/normalizes whitespace and would mangle ids like " ".
            const idNode = screen.getByTestId("subject-id");
            expect(idNode.textContent).toBe(subjectId);
            expect(screen.queryByTestId("subject-id-placeholder")).toBeNull();
          } else {
            // Req 2.5: a missing/empty Subject_ID falls back to the placeholder.
            const placeholder = screen.getByTestId("subject-id-placeholder");
            expect(placeholder.textContent).toBe(SUBJECT_ID_UNAVAILABLE);
            expect(screen.queryByTestId("subject-id")).toBeNull();
          }
        } finally {
          // RTL's auto-cleanup only fires between tests, not between the many
          // iterations of a single property. Unmount after each iteration so
          // the DOM never accumulates multiple SubjectProfile renders.
          cleanup();
        }
      }),
      { numRuns: 200 },
    );
  });
});
