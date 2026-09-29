// Agent_Transparency_Tree (center panel) for the Tax Audit Review Dashboard.
//
// This module owns the center panel and composes its child sections:
//   - AgentTimeline           — the collapsible multi-agent debate timeline (task 7.1, this file)
//   - StatutoryMatchList      — statutory matches + Critic risk flags (task 7.6, this file)
//   - DeterministicMathBlock slot — read-only deterministic backend math (task 7.10, later)
//
// The panel is structured so later tasks can drop their sections into the
// clearly-marked slots without restructuring this file. Until those sections
// exist, the panel accepts optional `statutoryMatchList` and `deterministicMath`
// render slots (ReactNode) and renders whatever is passed. Task 7.6 / 7.10 will
// build the concrete section components and wire them in here.
//
// _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

import { useState, useCallback, type ReactNode } from "react";
import type {
  AgentLogEntry,
  AgentName,
  CasePacket,
  DeterministicMathBlock as DeterministicMathBlockData,
  DeterministicValue,
  RiskFlag,
  StatutoryMatch,
} from "../types/casePacket.ts";
import { orderAgentEntries } from "../lib/agentOrder.ts";
import { formatDeterministicValue } from "../lib/format.ts";
import { THEME_TOKENS } from "../lib/theme.ts";
import { Badge, Card, cn, type RiskFlagBadgeVariant } from "./ui/index.ts";

// ---------------------------------------------------------------------------
// Shared text used by the timeline.
// ---------------------------------------------------------------------------

/** Placeholder shown in place of a missing agent field (Req 5.5). */
export const MISSING_FIELD_PLACEHOLDER = "Not provided";

/** Message shown when there are no agent entries (Req 5.6). */
export const EMPTY_TIMELINE_MESSAGE = "No agent timeline available";

/** Human-readable display labels for each canonical agent. */
const AGENT_DISPLAY_LABEL: Record<AgentName, string> = {
  Ingestion_Agent: "Ingestion Agent",
  Reasoner_Agent: "Reasoner Agent",
  Critic_Agent: "Critic Agent",
  Court_Clerk: "Court Clerk",
};

/** The three inspectable fields of an agent node, in display order. */
const AGENT_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    AgentLogEntry,
    "systemPrompt" | "contextContract" | "reasoningOutput"
  >;
  label: string;
}> = [
  { key: "systemPrompt", label: "System Prompt" },
  { key: "contextContract", label: "Context Contract" },
  { key: "reasoningOutput", label: "Reasoning Output" },
];

// ---------------------------------------------------------------------------
// AgentTimeline
// ---------------------------------------------------------------------------

export interface AgentTimelineProps {
  /** Agent debate entries in any order/subset; ordered canonically for display. */
  entries: readonly AgentLogEntry[];
}

/**
 * Render the multi-agent debate timeline.
 *
 * One node is rendered per present agent, ordered by the canonical execution
 * sequence via {@link orderAgentEntries} (Req 5.1). Every node starts collapsed
 * (Req 5.2). Toggling a node's disclosure button toggles only that node, using
 * accessible `aria-expanded` / `aria-controls` semantics (Req 5.3, 5.4). An
 * expanded node shows the system prompt, context contract, and reasoning output,
 * substituting a distinguishable placeholder for each absent field (Req 5.5).
 * When there are no entries, an empty-state message is shown (Req 5.6).
 */
export function AgentTimeline({ entries }: AgentTimelineProps) {
  const orderedEntries = orderAgentEntries(entries);

  // Expansion state: the set of agent names whose node is currently expanded.
  // Starts empty so every node renders collapsed on first render (Req 5.2).
  const [expanded, setExpanded] = useState<ReadonlySet<AgentName>>(
    () => new Set<AgentName>(),
  );

  // Toggle a single node without touching any other node (Req 5.3, 5.4).
  const toggle = useCallback((agent: AgentName) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) {
        next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
  }, []);

  if (orderedEntries.length === 0) {
    return (
      <p className={cn("text-sm", THEME_TOKENS.text.muted)} role="status">
        {EMPTY_TIMELINE_MESSAGE}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Agent execution timeline">
      {orderedEntries.map((entry) => {
        const isExpanded = expanded.has(entry.agent);
        const buttonId = `agent-node-toggle-${entry.agent}`;
        const regionId = `agent-node-region-${entry.agent}`;
        const displayLabel = AGENT_DISPLAY_LABEL[entry.agent];

        return (
          <li key={entry.agent}>
            <div
              className={cn(
                "rounded-md border border-slate-200 bg-slate-50",
              )}
            >
              <h3 className="m-0">
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isExpanded}
                  aria-controls={regionId}
                  onClick={() => toggle(entry.agent)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2",
                    "text-left text-sm font-semibold",
                    THEME_TOKENS.text.body,
                    "transition-colors hover:bg-slate-50",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
                    "focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  )}
                >
                  <span>{displayLabel}</span>
                  <span
                    aria-hidden="true"
                    className={cn("text-xs", THEME_TOKENS.text.muted)}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>
              </h3>

              {isExpanded && (
                <div
                  id={regionId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3"
                >
                  {AGENT_FIELDS.map((field) => {
                    const rawValue = entry[field.key];
                    const hasValue =
                      typeof rawValue === "string" && rawValue.trim().length > 0;

                    return (
                      <div key={field.key} className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "text-xs font-medium uppercase tracking-wide",
                            THEME_TOKENS.text.muted,
                          )}
                        >
                          {field.label}
                        </span>
                        {hasValue ? (
                          <p
                            className={cn(
                              "m-0 whitespace-pre-wrap text-sm",
                              THEME_TOKENS.text.body,
                            )}
                          >
                            {rawValue}
                          </p>
                        ) : (
                          <p
                            data-placeholder="true"
                            className={cn(
                              "m-0 text-sm italic",
                              THEME_TOKENS.text.muted,
                            )}
                          >
                            {MISSING_FIELD_PLACEHOLDER}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// StatutoryMatchList
// ---------------------------------------------------------------------------

/** Message shown when there are no statutory matches (Req 6.4). */
export const STATUTORY_EMPTY_MESSAGE = "No statutory matches available";

/** Placeholder shown for a missing cited Tuloverolaki paragraph (Req 6.5). */
export const MISSING_PARAGRAPH_PLACEHOLDER = "No cited paragraph provided";

/** Placeholder shown for a missing deduction claim (Req 6.5). */
export const MISSING_CLAIM_PLACEHOLDER = "No deduction claim provided";

/**
 * Every `RiskFlag` maps 1:1 onto a Badge risk-flag variant. The mapping is
 * explicit (rather than a cast) so a new `RiskFlag` value forces a compile
 * error here until a corresponding badge variant is chosen (Req 7.1–7.5).
 */
const RISK_FLAG_BADGE_VARIANT: Record<RiskFlag, RiskFlagBadgeVariant> = {
  verified: "verified",
  "high-risk": "high-risk",
  "missing-receipt": "missing-receipt",
  "counterfactual-geography": "counterfactual-geography",
};

export interface StatutoryMatchListProps {
  /** Statutory matches produced by the Reasoner_Agent (Req 6.1). */
  matches: StatutoryMatch[];
}

/**
 * Render the list of Statutory_Match cards with their Critic risk flags.
 *
 * One {@link Card} is rendered per match (Req 6.1), showing the cited
 * Tuloverolaki paragraph (Req 6.2) and the deduction claim (Req 6.3), each
 * falling back to a distinguishable placeholder when absent (Req 6.5).
 * Adjacent to each claim, every present Critic risk flag is rendered as a
 * distinct {@link Badge} — verified plus the high-risk, missing-receipt, and
 * counterfactual-geography warning badges (Req 7.1–7.6); when the flag set is
 * empty no indicator is rendered (Req 7.7). An empty match list yields an
 * empty-state message (Req 6.4).
 */
export function StatutoryMatchList({ matches }: StatutoryMatchListProps) {
  if (matches.length === 0) {
    return (
      <Card title="Statutory Matches">
        <p className={cn("m-0 text-sm", THEME_TOKENS.text.muted)} role="status">
          {STATUTORY_EMPTY_MESSAGE}
        </p>
      </Card>
    );
  }

  return (
    <Card title="Statutory Matches">
      <ol className="flex flex-col gap-3" aria-label="Statutory matches">
        {matches.map((match, index) => {
          const hasParagraph =
            typeof match.citedParagraph === "string" &&
            match.citedParagraph.trim().length > 0;
          const hasClaim =
            typeof match.deductionClaim === "string" &&
            match.deductionClaim.trim().length > 0;
          const riskFlags = match.riskFlags ?? [];

          return (
            <li key={index}>
              <div
                className={cn(
                  "rounded-md border border-slate-200 bg-slate-50 p-3",
                )}
              >
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      "text-xs font-medium uppercase tracking-wide",
                      THEME_TOKENS.text.muted,
                    )}
                  >
                    Cited Paragraph (Tuloverolaki)
                  </span>
                  {hasParagraph ? (
                    <p
                      className={cn(
                        "m-0 whitespace-pre-wrap text-sm font-semibold",
                        THEME_TOKENS.text.body,
                      )}
                    >
                      {match.citedParagraph}
                    </p>
                  ) : (
                    <p
                      data-placeholder="true"
                      className={cn(
                        "m-0 text-sm italic",
                        THEME_TOKENS.text.muted,
                      )}
                    >
                      {MISSING_PARAGRAPH_PLACEHOLDER}
                    </p>
                  )}
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  <span
                    className={cn(
                      "text-xs font-medium uppercase tracking-wide",
                      THEME_TOKENS.text.muted,
                    )}
                  >
                    Deduction Claim
                  </span>
                  {hasClaim ? (
                    <p
                      className={cn(
                        "m-0 whitespace-pre-wrap text-sm",
                        THEME_TOKENS.text.body,
                      )}
                    >
                      {match.deductionClaim}
                    </p>
                  ) : (
                    <p
                      data-placeholder="true"
                      className={cn(
                        "m-0 text-sm italic",
                        THEME_TOKENS.text.muted,
                      )}
                    >
                      {MISSING_CLAIM_PLACEHOLDER}
                    </p>
                  )}
                </div>

                {/* Critic risk flags adjacent to the claim. Render every present
                    flag (Req 7.6); render nothing when the set is empty (Req 7.7). */}
                {riskFlags.length > 0 && (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    aria-label="Critic risk flags"
                  >
                    {riskFlags.map((flag, flagIndex) => (
                      <Badge
                        key={`${flag}-${flagIndex}`}
                        variant={RISK_FLAG_BADGE_VARIANT[flag]}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DeterministicMathBlock
// ---------------------------------------------------------------------------

/**
 * Label for the deterministic backend math container. Identifies the block as
 * read-only calculations produced by the deterministic backend (Req 8.2).
 */
export const DETERMINISTIC_BLOCK_LABEL = "Deterministic Backend Calculations";

export interface DeterministicMathBlockProps {
  /** The deterministic backend calculations from the CasePacket (Req 8.1). */
  math: DeterministicMathBlockData;
}

/**
 * A single labeled row rendering a DeterministicValue exactly as provided
 * (value + unit via {@link formatDeterministicValue}), or the shared
 * UNAVAILABLE indicator when the value is absent (Req 8.3, 8.4). Read-only: the
 * value is plain text with no editable control (Req 8.1).
 */
function DeterministicRow({
  label,
  value,
}: {
  label: string;
  value: DeterministicValue;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("text-sm", THEME_TOKENS.text.muted)}>{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          THEME_TOKENS.text.body,
        )}
      >
        {formatDeterministicValue(value)}
      </span>
    </div>
  );
}

/**
 * Render the read-only deterministic backend calculations.
 *
 * Total income, allowable deduction cap, and every tax-bracket adjustment are
 * rendered exactly as provided (value + unit via {@link formatDeterministicValue}),
 * with no editable control anywhere in the block (Req 8.1, 8.3). Absent values
 * fall back to the shared UNAVAILABLE indicator (Req 8.4). The whole block sits
 * inside a labeled, bordered {@link Card}, visually separated from the timeline
 * and identified as deterministic backend calculations (Req 8.2).
 */
export function DeterministicMathBlock({ math }: DeterministicMathBlockProps) {
  const adjustments = math.taxBracketAdjustments ?? [];

  return (
    <Card title={DETERMINISTIC_BLOCK_LABEL} bordered={true}>
      <dl className="m-0 flex flex-col gap-2" aria-label={DETERMINISTIC_BLOCK_LABEL}>
        <DeterministicRow label="Total Income" value={math.totalIncome} />
        <DeterministicRow
          label="Allowable Deduction Cap"
          value={math.allowableDeductionCap}
        />

        {adjustments.map((adjustment, index) => (
          <DeterministicRow
            key={`${adjustment.label}-${index}`}
            label={adjustment.label}
            value={adjustment.amount}
          />
        ))}
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AgentTransparencyTree (center panel container)
// ---------------------------------------------------------------------------

export interface AgentTransparencyTreeProps {
  /**
   * The full CasePacket, or the individual slices this panel needs. When
   * `casePacket` is provided its `agentDebate` slice drives the timeline; an
   * explicit `agentDebate` prop overrides it. This keeps the panel usable both
   * from the Dashboard (which holds the whole packet) and from focused tests.
   */
  casePacket?: CasePacket;
  /** Agent debate entries; defaults to `casePacket.agentDebate`. */
  agentDebate?: readonly AgentLogEntry[];
  /**
   * Slot for the StatutoryMatchList section (task 7.6). Rendered after the
   * timeline when provided.
   */
  statutoryMatchList?: ReactNode;
  /**
   * Slot for the DeterministicMathBlock section (task 7.10). Rendered after the
   * statutory matches when provided.
   */
  deterministicMath?: ReactNode;
}

/**
 * The Agent_Transparency_Tree center panel. Composes the AgentTimeline with
 * slots for the statutory-match list (7.6) and the deterministic math block
 * (7.10). Later tasks build those concrete sections and pass them into the
 * corresponding slots (or extend this file to render them directly from the
 * CasePacket slices).
 */
export function AgentTransparencyTree({
  casePacket,
  agentDebate,
  statutoryMatchList,
  deterministicMath,
}: AgentTransparencyTreeProps) {
  const entries = agentDebate ?? casePacket?.agentDebate ?? [];
  const matches = casePacket?.statutoryMatches ?? [];
  const math = casePacket?.deterministicMath;

  return (
    <section
      aria-label="Agent Transparency Tree"
      className={cn(
        "flex h-full flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
        THEME_TOKENS.text.body,
      )}
    >
      <Card title="Agent Debate Timeline">
        <AgentTimeline entries={entries} />
      </Card>

      {/* StatutoryMatchList (task 7.6) — rendered directly from the CasePacket.
          An explicit `statutoryMatchList` slot, when provided, overrides it. */}
      {statutoryMatchList ?? <StatutoryMatchList matches={matches} />}

      {/* DeterministicMathBlock (task 7.10) — rendered directly from the
          CasePacket. An explicit `deterministicMath` slot, when provided,
          overrides it. Only rendered when the packet carries the block. */}
      {deterministicMath ??
        (math ? <DeterministicMathBlock math={math} /> : null)}
    </section>
  );
}
