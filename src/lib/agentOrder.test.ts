import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  CANONICAL_AGENT_ORDER,
  orderAgentEntries,
} from "./agentOrder";
import type { AgentName, AgentLogEntry } from "../types/casePacket";

// Arbitrary for a single agent log entry drawn from the canonical agent names,
// with optional string fields populated arbitrarily.
const agentEntryArb: fc.Arbitrary<AgentLogEntry> = fc.record(
  {
    agent: fc.constantFrom<AgentName>(...CANONICAL_AGENT_ORDER),
    systemPrompt: fc.option(fc.string(), { nil: undefined }),
    contextContract: fc.option(fc.string(), { nil: undefined }),
    reasoningOutput: fc.option(fc.string(), { nil: undefined }),
  },
  { requiredKeys: ["agent"] }
);

// A permuted subset (with possible duplicates) of agent entries. Using an array
// of arbitrary length over the canonical agents lets fast-check explore empty
// sets, single agents, full sets, permutations, and repeated agents.
const agentEntriesArb: fc.Arbitrary<AgentLogEntry[]> = fc.array(agentEntryArb, {
  maxLength: 12,
});

const canonicalIndex = (agent: AgentName): number =>
  CANONICAL_AGENT_ORDER.indexOf(agent);

describe("orderAgentEntries", () => {
  // Feature: tax-audit-dashboard, Property 15: Timeline preserves the canonical agent sequence for present agents
  it("returns present agents ordered by canonical index", () => {
    fc.assert(
      fc.property(agentEntriesArb, (entries) => {
        const result = orderAgentEntries(entries);

        // Expected: keep only entries whose agent is in the canonical order,
        // then sort by canonical index (stable, preserving relative order of
        // equal-index entries).
        const expected = entries
          .filter((e) => canonicalIndex(e.agent) !== -1)
          .map((e, i) => ({ e, i }))
          .sort(
            (a, b) =>
              canonicalIndex(a.e.agent) - canonicalIndex(b.e.agent) ||
              a.i - b.i
          )
          .map(({ e }) => e);

        // Same length: no present agent dropped, none invented.
        expect(result).toHaveLength(expected.length);

        // The sequence of agent names is non-decreasing by canonical index.
        const indices = result.map((e) => canonicalIndex(e.agent));
        for (let k = 1; k < indices.length; k++) {
          expect(indices[k]).toBeGreaterThanOrEqual(indices[k - 1]);
        }

        // Result equals the present agents ordered by canonical index.
        expect(result).toEqual(expected);

        // Purity: the input array is not mutated.
        expect(entries).toEqual(entries.slice());
      }),
      { numRuns: 100 }
    );
  });
});
