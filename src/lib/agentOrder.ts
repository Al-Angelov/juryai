// Canonical agent ordering for the Agent_Transparency_Tree timeline.
//
// The timeline (Requirement 5.1) renders one node per agent present in the
// CasePacket, ordered in the canonical execution sequence Ingestion_Agent →
// Reasoner_Agent → Critic_Agent → Court_Clerk, omitting any absent agent while
// preserving the relative order of the remaining agents.
//
// _Requirements: 5.1_

import type { AgentName, AgentLogEntry } from "../types/casePacket";

/**
 * The canonical execution sequence of the backend agents. This is the single
 * source of truth for timeline ordering.
 */
export const CANONICAL_AGENT_ORDER: readonly AgentName[] = [
  "Ingestion_Agent",
  "Reasoner_Agent",
  "Critic_Agent",
  "Court_Clerk",
];

/** Index of an agent in the canonical order, or -1 if it is not a known agent. */
function canonicalIndex(agent: AgentName): number {
  return CANONICAL_AGENT_ORDER.indexOf(agent);
}

/**
 * Given agent debate entries in any order and any subset, return the present
 * agents sorted by their index in {@link CANONICAL_AGENT_ORDER}, omitting agents
 * not present in the canonical order while preserving canonical relative order.
 *
 * This is a pure function: it does not mutate the input array.
 *
 * @param entries agent log entries in arbitrary order/subset
 * @returns a new array of the present entries ordered by canonical index
 */
export function orderAgentEntries(
  entries: readonly AgentLogEntry[]
): AgentLogEntry[] {
  return entries
    .filter((entry) => canonicalIndex(entry.agent) !== -1)
    .slice()
    .sort((a, b) => canonicalIndex(a.agent) - canonicalIndex(b.agent));
}
