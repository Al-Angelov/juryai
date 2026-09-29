// Property test for the sanitization badge state mapping and distinctness
// (task 6.3).
//
// Property 22: Sanitization badge state mapping and distinctness.
// Validates: Requirements 2.2, 2.3, 2.4, 2.6.
//
// The property covers two guarantees:
//   1. Mapping — `sanitizationBadgeVariant` maps "active" -> "active",
//      "inactive" -> "inactive", and an absent status (undefined) -> "unknown"
//      (Req 2.2, 2.3, 2.6).
//   2. Distinctness — the three sanitization variants (active / inactive /
//      unknown) have pairwise-distinct labels AND pairwise-distinct color
//      className strings in BADGE_VARIANTS, so the states are never
//      distinguishable by color alone: both label and color differ (Req 2.4,
//      2.6).
//
// It also renders SubjectProfile with an arbitrary sanitization status for both
// PII fields and asserts the expected badge label text appears, cleaning up
// between iterations.

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { sanitizationBadgeVariant, SubjectProfile } from "./CaseContextPanel.tsx";
import { BADGE_VARIANTS } from "./ui";
import type { SanitizationStatus } from "../types/casePacket.ts";

// The three sanitization variants that Property 22 constrains.
const SANITIZATION_VARIANTS = ["active", "inactive", "unknown"] as const;

// Arbitrary sanitization status: "active", "inactive", or undefined (absent).
const sanitizationStatusArb: fc.Arbitrary<SanitizationStatus | undefined> =
  fc.constantFrom<SanitizationStatus | undefined>(
    "active",
    "inactive",
    undefined,
  );

describe("Property 22: Sanitization badge state mapping and distinctness", () => {
  // Feature: tax-audit-dashboard, Property 22: Sanitization badge state mapping and distinctness
  it("maps each status to its variant and keeps the three variants distinct by both label and color", () => {
    fc.assert(
      fc.property(
        sanitizationStatusArb,
        sanitizationStatusArb,
        (nameMasked, ssnTokenized) => {
          // 1. Mapping: status (including undefined) -> variant (Req 2.2, 2.3, 2.6).
          const expected = (status: SanitizationStatus | undefined) =>
            status === "active"
              ? "active"
              : status === "inactive"
                ? "inactive"
                : "unknown";
          expect(sanitizationBadgeVariant("active")).toBe("active");
          expect(sanitizationBadgeVariant("inactive")).toBe("inactive");
          expect(sanitizationBadgeVariant(undefined)).toBe("unknown");
          expect(sanitizationBadgeVariant(nameMasked)).toBe(expected(nameMasked));
          expect(sanitizationBadgeVariant(ssnTokenized)).toBe(
            expected(ssnTokenized),
          );

          // 2. Distinctness across the three sanitization variants: pairwise
          //    distinct labels AND pairwise distinct color className strings, so
          //    states are never distinguishable by color alone (Req 2.4, 2.6).
          const labels = SANITIZATION_VARIANTS.map(
            (v) => BADGE_VARIANTS[v].label,
          );
          const classNames = SANITIZATION_VARIANTS.map(
            (v) => BADGE_VARIANTS[v].className,
          );
          expect(new Set(labels).size).toBe(SANITIZATION_VARIANTS.length);
          expect(new Set(classNames).size).toBe(SANITIZATION_VARIANTS.length);

          // 3. Rendering: the SubjectProfile shows the expected badge label text
          //    for both PII fields, driven by the mapped variant.
          try {
            render(
              <SubjectProfile
                subject={{ subjectId: "SUBJECT-0001", nameMasked, ssnTokenized }}
              />,
            );

            const nameBadge = screen.getByTestId("badge-name-masked");
            const ssnBadge = screen.getByTestId("badge-ssn-tokenized");
            expect(nameBadge).toHaveTextContent(
              BADGE_VARIANTS[expected(nameMasked)].label,
            );
            expect(ssnBadge).toHaveTextContent(
              BADGE_VARIANTS[expected(ssnTokenized)].label,
            );
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
