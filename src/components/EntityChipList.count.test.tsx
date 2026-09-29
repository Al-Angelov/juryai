// Property test for the Entity_Chip list (task 6.9).
//
// Property 25: Entity chips match the entity list.
// Validates: Requirements 4.1.
//
// For any non-empty list of extracted entities, EntityChipList renders exactly
// one chip per entity (count matches entities.length) and each chip, matched by
// index, renders its entity label (Req 4.1). As a companion, an empty entity
// list renders zero chips and shows the "no entities" empty message (Req 4.4).

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { EntityChipList } from "./CaseContextPanel.tsx";
import type { EntityChip } from "../types/casePacket.ts";

// Arbitrary confidence: absent, a 0..1 fraction, or a 0..100 percent value.
const confidenceArb: fc.Arbitrary<number | undefined> = fc.option(
  fc.oneof(
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 100, noNaN: true }),
  ),
  { nil: undefined },
);

// A single entity: non-empty label plus optional confidence.
const entityArb: fc.Arbitrary<EntityChip> = fc.record({
  label: fc.string({ minLength: 1 }),
  confidence: confidenceArb,
});

// A NON-empty array of entities.
const nonEmptyEntitiesArb: fc.Arbitrary<EntityChip[]> = fc.array(entityArb, {
  minLength: 1,
  maxLength: 20,
});

describe("Property 25: Entity chips match the entity list", () => {
  // Feature: tax-audit-dashboard, Property 25: Entity chips match the entity list
  it("renders one chip per entity and each chip shows its label, matched by index", () => {
    fc.assert(
      fc.property(nonEmptyEntitiesArb, (entities) => {
        try {
          render(<EntityChipList entities={entities} />);

          const chips = screen.getAllByTestId("entity-chip");

          // Count matches the entity list length (Req 4.1).
          expect(chips).toHaveLength(entities.length);

          // Each chip renders its entity's label, matched by index (Req 4.1).
          entities.forEach((entity, index) => {
            expect(chips[index].textContent ?? "").toContain(entity.label);
          });
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("renders no chips and shows the empty message for an empty entity list (Req 4.4)", () => {
    try {
      render(<EntityChipList entities={[]} />);

      expect(screen.queryAllByTestId("entity-chip")).toHaveLength(0);
      expect(screen.getByTestId("entity-chip-empty-message")).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
