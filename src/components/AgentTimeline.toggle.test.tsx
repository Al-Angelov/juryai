// Property-based test for AgentTimeline node toggling (task 7.3).
//
// Property 17 asserts two behaviors of the disclosure toggle on each timeline
// node:
//   - Isolation (Req 5.3, 5.4): clicking a node's toggle flips only that node's
//     aria-expanded; every other node's aria-expanded is unchanged.
//   - Involution (Req 5.3, 5.4): clicking the same toggle twice restores its
//     aria-expanded to the original value, with all other nodes still unchanged.
//
// Nodes start collapsed, so a first click always expands (collapsed -> expanded)
// and a second click always collapses back (expanded -> collapsed).

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AgentTimeline } from "./AgentTransparencyTree.tsx";
import type { AgentLogEntry, AgentName } from "../types/casePacket.ts";

// The four canonical agents; a timeline shows at most one node per agent.
const CANONICAL_AGENTS: readonly AgentName[] = [
  "Ingestion_Agent",
  "Reasoner_Agent",
  "Critic_Agent",
  "Court_Clerk",
];

// A single agent entry with optional inspectable fields. The agent name is
// supplied by the subset generator to keep entries distinct.
function entryArb(agent: AgentName): fc.Arbitrary<AgentLogEntry> {
  return fc.record({
    agent: fc.constant(agent),
    systemPrompt: fc.option(fc.string(), { nil: undefined }),
    contextContract: fc.option(fc.string(), { nil: undefined }),
    reasoningOutput: fc.option(fc.string(), { nil: undefined }),
  });
}

// A non-empty distinct subset of the canonical agents, each turned into an
// entry. Distinctness comes from selecting a subset of the fixed agent set, so
// every rendered node has a unique toggle button.
const entriesArb: fc.Arbitrary<AgentLogEntry[]> = fc
  .subarray(CANONICAL_AGENTS as AgentName[], { minLength: 1 })
  .chain((agents) => fc.tuple(...agents.map((a) => entryArb(a))))
  .map((entries) => entries as AgentLogEntry[]);

describe("AgentTimeline node toggling", () => {
  it("toggling a node changes only that node and is an involution", () => {
    // Feature: tax-audit-dashboard, Property 17: Toggling a node changes only that node and is an involution
    fc.assert(
      fc.property(
        entriesArb,
        fc.integer({ min: 0, max: 100 }),
        (entries, targetSeed) => {
          render(<AgentTimeline entries={entries} />);

          try {
            const buttons = screen.getAllByRole("button");
            expect(buttons).toHaveLength(entries.length);

            // Pick an arbitrary target button from the rendered set.
            const targetIndex = targetSeed % buttons.length;

            const readAll = () =>
              buttons.map((b) => b.getAttribute("aria-expanded"));

            const before = readAll();

            // First click: expand the target. Only the target flips (Req 5.3, 5.4).
            fireEvent.click(buttons[targetIndex]);
            const afterFirst = readAll();

            expect(afterFirst[targetIndex]).not.toBe(before[targetIndex]);
            afterFirst.forEach((value, i) => {
              if (i !== targetIndex) {
                expect(value).toBe(before[i]);
              }
            });

            // Second click: collapse the target back. Involution restores the
            // original value; all others remain unchanged (Req 5.3, 5.4).
            fireEvent.click(buttons[targetIndex]);
            const afterSecond = readAll();

            expect(afterSecond[targetIndex]).toBe(before[targetIndex]);
            afterSecond.forEach((value, i) => {
              expect(value).toBe(before[i]);
            });
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
