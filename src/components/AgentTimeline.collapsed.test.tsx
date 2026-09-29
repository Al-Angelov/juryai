// Property-based test for the AgentTimeline initial collapsed-state invariant
// (task 7.2).
//
// Property 16 asserts that, for any list of agent entries, every timeline node
// renders collapsed on first render (Req 5.2): each node's disclosure button
// reports aria-expanded="false" and no node content region is present. The
// empty-entries case renders no nodes at all (the empty-state message shows),
// which trivially satisfies the "all collapsed" invariant.

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { AgentTimeline } from "./AgentTransparencyTree.tsx";
import type { AgentLogEntry, AgentName } from "../types/casePacket.ts";

// The four canonical agents the timeline knows how to render.
const AGENT_NAMES: readonly AgentName[] = [
  "Ingestion_Agent",
  "Reasoner_Agent",
  "Critic_Agent",
  "Court_Clerk",
];

// Build an agent entry for a given agent. The optional inspectable fields are
// irrelevant to collapsed state, so they are only sometimes present.
const agentEntryArb = (agent: AgentName): fc.Arbitrary<AgentLogEntry> =>
  fc.record({
    agent: fc.constant(agent),
    systemPrompt: fc.option(fc.string(), { nil: undefined }),
    contextContract: fc.option(fc.string(), { nil: undefined }),
    reasoningOutput: fc.option(fc.string(), { nil: undefined }),
  });

// An arbitrary array of agent entries over the canonical agent set: any subset
// of the four agents, in any order (a permuted subset). This covers the empty
// array and every non-empty subset while keeping one entry per present agent —
// the real input space the timeline renders one node per (Req 5.1, 5.2).
const entriesArb: fc.Arbitrary<AgentLogEntry[]> = fc
  .subarray(AGENT_NAMES as AgentName[])
  .chain((agents) =>
    fc
      .tuple(...agents.map((agent) => agentEntryArb(agent)))
      .chain((entries) => fc.shuffledSubarray(entries, { minLength: entries.length })),
  );

describe("AgentTimeline initial collapsed state", () => {
  it("renders every timeline node collapsed on first render", () => {
    // Feature: tax-audit-dashboard, Property 16: All timeline nodes start collapsed
    fc.assert(
      fc.property(entriesArb, (entries) => {
        render(<AgentTimeline entries={entries} />);

        try {
          const buttons = screen.queryAllByRole("button");

          if (entries.length === 0) {
            // No entries => no nodes, so no toggle buttons at all (empty message shows).
            expect(buttons).toHaveLength(0);
          } else {
            // Every present node's toggle button starts collapsed.
            expect(buttons.length).toBeGreaterThan(0);
            for (const button of buttons) {
              expect(button).toHaveAttribute("aria-expanded", "false");
            }
          }

          // No node content is expanded on first render: no region is rendered.
          expect(screen.queryAllByRole("region")).toHaveLength(0);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });
});
