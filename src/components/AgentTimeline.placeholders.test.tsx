// Property-based test for AgentTimeline's missing-field placeholder rendering.
//
// Feature: tax-audit-dashboard, Property 18: Missing agent fields render
// placeholders in the expanded node.
//
// Validates: Requirements 5.5

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AgentTimeline, MISSING_FIELD_PLACEHOLDER } from "./AgentTransparencyTree.tsx";
import type { AgentName, AgentLogEntry } from "../types/casePacket.ts";

const AGENT_NAMES: readonly AgentName[] = [
  "Ingestion_Agent",
  "Reasoner_Agent",
  "Critic_Agent",
  "Court_Clerk",
];

describe("AgentTimeline missing-field placeholders (Property 18)", () => {
  // Feature: tax-audit-dashboard, Property 18: Missing agent fields render placeholders in the expanded node
  it("renders a placeholder for each absent/blank field and the text for each present field", () => {
    // Each inspectable field is independently present (a non-empty string) or
    // absent (undefined). These are exactly the two states Req 5.5 distinguishes:
    // a supplied value renders verbatim, a missing one renders the placeholder.
    const fieldArb = fc.option(fc.string({ minLength: 1 }), { nil: undefined });

    const entryArb: fc.Arbitrary<AgentLogEntry> = fc.record({
      agent: fc.constantFrom(...AGENT_NAMES),
      systemPrompt: fieldArb,
      contextContract: fieldArb,
      reasoningOutput: fieldArb,
    });

    fc.assert(
      fc.property(entryArb, (entry) => {
        render(<AgentTimeline entries={[entry]} />);

        try {
          // All nodes start collapsed (Req 5.2); expand this one so its fields
          // become inspectable.
          fireEvent.click(screen.getByRole("button"));

          const fieldValues = [
            entry.systemPrompt,
            entry.contextContract,
            entry.reasoningOutput,
          ];
          // A field renders a placeholder when absent OR blank/whitespace-only,
          // matching the component's `hasValue` check.
          const isPresent = (v: string | undefined): v is string =>
            typeof v === "string" && v.trim().length > 0;

          const expectedPlaceholders = fieldValues.filter(
            (v) => !isPresent(v),
          ).length;

          // Req 5.5: one distinguishable placeholder per absent/blank field.
          const placeholderNodes = document.querySelectorAll(
            '[data-placeholder="true"]',
          );
          expect(placeholderNodes.length).toBe(expectedPlaceholders);
          placeholderNodes.forEach((node) => {
            expect(node.textContent).toBe(MISSING_FIELD_PLACEHOLDER);
          });

          // Present fields render their exact text. Compare against DOM
          // textContent directly (rather than Testing Library's text matcher,
          // which normalizes whitespace and would mangle values like " !") as
          // an order-independent multiset, since two fields may share a value.
          const region = screen.getByRole("region");
          const renderedValues = Array.from(
            region.querySelectorAll("p:not([data-placeholder])"),
          )
            .map((node) => node.textContent)
            .sort();
          const expectedValues = fieldValues.filter(isPresent).sort();
          expect(renderedValues).toEqual(expectedValues);
        } finally {
          // RTL auto-cleanup runs between tests, not between property
          // iterations; unmount after each run so DOM state never accumulates.
          cleanup();
        }
      }),
      { numRuns: 150 },
    );
  });
});
