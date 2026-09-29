# Implementation Plan: Tax Audit Review Dashboard

## Overview

This plan builds the Human-in-the-Loop Tax Audit Review Dashboard (React 19 + TypeScript + Vite) incrementally, following the design's module layout. The pure logic modules (`src/lib`) and the mocked API contract (`src/api/taxAuditApi.js`) are implemented first because they carry the universal correctness properties and are the primary targets of property-based testing. TypeScript types are defined up front so both logic and components share a single source of truth. Components are then built bottom-up (shared UI primitives → panels), and finally wired together under the `Dashboard` container with the async load/submit state machines.

Each property test is implemented as a single fast-check property running at least 100 iterations, tagged with a comment in the form `// Feature: tax-audit-dashboard, Property {number}: {property_text}`, and every task references the specific requirement sub-clauses it implements.

Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.

## Tasks

- [x] 1. Set up project scaffolding, tooling, and shared types
  - [x] 1.1 Initialize Vite + React 19 + TypeScript project and testing tooling
    - Scaffold the Vite React-TS project with the `src/` layout from the design (`api/`, `types/`, `lib/`, `components/`, `components/ui/`)
    - Add and configure Tailwind CSS, Vitest, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, and `fast-check`
    - Add a `test` script and ensure `vite build` runs; configure the Vitest environment for React component tests
    - _Requirements: 15.1, 15.5_

  - [x] 1.2 Define CasePacket and nested TypeScript types
    - Create `src/types/casePacket.ts` with `CaseStatus`, `CasePacket`, `SubjectMetadata`, `SanitizationStatus`, `ParsedDocument`, `EntityChip`, `AgentName`, `AgentLogEntry`, `RiskFlag`, `StatutoryMatch`, `DeterministicValue`, `TaxBracketAdjustment`, `DeterministicMathBlock`, `MonetaryValue`, `AdjustmentSummary`, `AdjustmentLineItem`, `CapPercentage`, `AdjustmentEditState`
    - Model absent-capable fields as optional so placeholder requirements are expressible in the type system
    - _Requirements: 15.1_

  - [x] 1.3 Define AuditorDecision and GenTaxReceipt types
    - Create `src/types/decision.ts` with `AdjustedCalculations`, `AuditorDecisionApproved`, `AuditorDecisionRejected`, the `AuditorDecision` discriminated union on `status`, and `GenTaxReceipt`
    - _Requirements: 11.4, 12.4, 13.3, 15.1_

- [x] 2. Implement pure logic modules in `src/lib` with property-based tests
  - [x] 2.1 Implement canonical agent ordering
    - Create `src/lib/agentOrder.ts` exporting `CANONICAL_AGENT_ORDER` and a pure function that, given agent entries in any order/subset, returns the present agents sorted by canonical index, omitting absent agents while preserving relative order
    - _Requirements: 5.1_

  - [x] 2.2 Write property test for canonical agent ordering
    - **Property 15: Timeline preserves the canonical agent sequence for present agents**
    - **Validates: Requirements 5.1**
    - Use a fast-check arbitrary generating permuted subsets of agent entries; assert the result equals present agents ordered by canonical index

  - [x] 2.3 Implement percent and currency formatting
    - Create `src/lib/format.ts` with a confidence formatter that clamps to `[0, 100]`, rounds to the nearest whole percent, and appends `%`, plus an "unavailable" indicator path for absent confidence, and value+unit rendering helpers for monetary/deterministic values
    - _Requirements: 4.3, 4.5, 8.3, 9.1, 9.2_

  - [x] 2.4 Write property test for confidence formatting
    - **Property 26: Confidence formatting is a clamped whole percent**
    - **Validates: Requirements 4.3, 4.5**
    - Generate arbitrary numeric confidences; assert output is an integer in `[0,100]` followed by `%`; assert absent confidence yields the unavailable indicator

  - [x] 2.5 Implement field-level validation helpers
    - Create `src/lib/validation.ts` classifying each line-item and cap input as valid / non-numeric / empty / negative (line item) / out-of-range (cap outside 0–100 inclusive), returning validation messages and a valid/invalid classification, treating 0 and 100 as valid boundary values
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

  - [x] 2.6 Write property test for out-of-range exclusion
    - **Property 9: Out-of-range values are excluded from recalculation**
    - **Validates: Requirements 10.4, 10.5**
    - Generate negative line items and caps outside 0–100 plus valid values; assert invalid values are marked invalid and excluded while boundaries 0 and 100 are accepted

  - [x] 2.7 Implement net-tax recalculation
    - Create `src/lib/recalculation.ts` as a pure function consuming read-only deterministic math (total income, allowable deduction cap, bracket adjustments) plus valid line items and caps, computing `allowedDeduction = min(grossDeductions, effectiveCap)`, `taxableIncome = max(0, totalIncome - allowedDeduction)`, applying brackets, and returning `round2(max(0, netTax))`; never re-derives deterministic values
    - _Requirements: 9.4, 10.2, 8.3_

  - [x] 2.8 Write property test for recalculation determinism
    - **Property 1: Net-tax recalculation is deterministic**
    - **Validates: Requirements 10.2, 9.4**
    - Generate deterministic math + valid inputs; assert two evaluations on identical inputs yield identical results

  - [x] 2.9 Write property test for cap and non-negativity bounds
    - **Property 2: Allowed deduction never exceeds the deterministic cap**
    - **Validates: Requirements 10.2, 8.3**
    - Generate deterministic math + valid inputs; assert allowed deduction ≤ effective cap and net tax owed ≥ 0

  - [x] 2.10 Write property test for suspend-and-retain on invalid input
    - **Property 8: Invalid non-numeric or empty inputs retain the last valid net tax**
    - **Validates: Requirements 10.3, 10.6**
    - Generate non-numeric/empty inputs with a prior last-valid net tax; assert the field is invalid, recalculation is suspended, and the displayed net tax equals the last valid value

  - [x] 2.11 Implement decision payload builders and gating predicates
    - Add pure helpers (in `src/lib`, e.g. `decision.ts`) for the Approve gating predicate (trimmed signature non-empty AND compliance checked AND not submitting), the Reject gating predicate (trimmed rationale non-empty AND not submitting), and builders for the approved and rejected payloads including all required fields and timestamp; enforce rationale length 1–2000
    - _Requirements: 11.3, 11.4, 11.7, 12.2, 12.3, 12.4, 13.2, 13.3_

  - [x] 2.12 Write property test for Approve gating predicate
    - **Property 11: Approve gating predicate**
    - **Validates: Requirements 11.3, 11.7, 13.2**
    - Generate signature/compliance/in-flight combinations; assert enabled iff trimmed signature non-empty AND compliance checked AND not submitting

  - [x] 2.13 Write property test for approved payload completeness
    - **Property 12: Approved payload completeness**
    - **Validates: Requirements 11.4, 13.3**
    - Generate valid approve states; assert payload has status `approved` with adjusted calculations, notes, signature, compliance boolean, and timestamp

  - [x] 2.14 Write property test for Reject gating predicate
    - **Property 13: Reject gating predicate**
    - **Validates: Requirements 12.3**
    - Generate rationale/submission combinations; assert enabled iff trimmed rationale non-empty AND not submitting

  - [x] 2.15 Write property test for rejected payload completeness and rationale bounds
    - **Property 14: Rejected payload completeness and rationale bounds**
    - **Validates: Requirements 12.2, 12.4**
    - Generate valid reject states; assert payload has status `rejected` with rationale, notes, adjusted calculations, timestamp; assert rationale accepted only for length 1–2000

  - [x] 2.16 Implement shared theme tokens
    - Create `src/lib/theme.ts` with the shared dark-mode Tailwind token map (background, surface, text, accent) used by every panel, plus body-text/background token pairs
    - _Requirements: 15.2_

  - [x] 2.17 Write property test for theme contrast
    - **Property 27: Theme body-text contrast meets WCAG AA**
    - **Validates: Requirements 15.2**
    - For each body-text/background token pair, compute the WCAG contrast ratio and assert it is at least 4.5:1

- [x] 3. Implement the mocked API layer with property-based tests
  - [x] 3.1 Create mock dataset and Tax_Audit_API module
    - Create `src/api/mockData.js` with fixture CasePackets keyed by caseId, and `src/api/taxAuditApi.js` as plain JS (Promise/fetch semantics, no IDE runtime coupling) exposing `fetchActiveCase(caseId)` and `submitAuditorDecision(caseId, payload)` with simulated latency under 2000 ms
    - Implement `fetchActiveCase` validation (reject empty / >128 chars / unknown id with a missing-or-unknown error) and success resolution to a complete CasePacket
    - Implement `submitAuditorDecision` validation in the specified order: invalid caseId → invalid status (not `approved`/`rejected`) → missing `adjustedCalculations`/`caseworkerNotes`/`timestamp` (naming the absent field, no receipt); success resolves to a `GenTaxReceipt`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 3.2 Write property tests for fetchActiveCase
    - **Property 28: fetchActiveCase resolves valid ids to a complete CasePacket** — **Validates: Requirements 14.1**
    - **Property 29: fetchActiveCase rejects invalid identifiers** — **Validates: Requirements 14.5**
    - Generate valid known ids and invalid (empty / >128 / unknown) ids; assert resolved packet completeness and rejection error messages

  - [x] 3.3 Write property tests for submitAuditorDecision
    - **Property 30: submitAuditorDecision resolves valid submissions to a receipt** — **Validates: Requirements 14.2**
    - **Property 31: submitAuditorDecision rejects invalid status** — **Validates: Requirements 14.4**
    - **Property 32: submitAuditorDecision rejects missing required fields and produces no receipt** — **Validates: Requirements 14.6**
    - Generate valid payloads, invalid statuses, and payloads missing each required field; assert resolve/reject shape, error messages, and that no receipt is produced on rejection

  - [x] 3.4 Write API portability smoke test
    - Import and run `taxAuditApi.js` in a plain Node/browser context with no IDE runtime globals to confirm portability
    - _Requirements: 14.3_

- [x] 4. Checkpoint - logic and API layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement shared UI primitives
  - [x] 5.1 Build shared UI primitive components
    - Create `src/components/ui/` primitives (Badge, Tooltip, Card, NumericInput, Button, LoadingIndicator, ErrorPanel+Retry) on Radix/Shadcn + Lucide, applying the shared theme tokens from `src/lib/theme.ts`
    - Ensure disabled controls expose disabled state and validation messages can associate via `aria-describedby`
    - _Requirements: 15.1, 15.2_

- [x] 6. Implement Case_Context_Panel (left)
  - [x] 6.1 Implement SubjectProfile with sanitization badges
    - Create `src/components/CaseContextPanel.tsx` and a SubjectProfile section rendering Subject_ID exactly or an unavailable placeholder; render Name Masked and SSN Tokenized badges resolving to active/inactive/unknown, distinguishable by both label and color (never color alone)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 6.2 Write property test for Subject_ID rendering
    - **Property 21: Subject_ID renders exactly or falls back to a placeholder**
    - **Validates: Requirements 2.1, 2.5**

  - [x] 6.3 Write property test for sanitization badge mapping and distinctness
    - **Property 22: Sanitization badge state mapping and distinctness**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.6**

  - [x] 6.4 Implement DocumentSwitcher and DocumentViewer
    - Render a switcher listing every document in packet order by its label with the selected entry distinguished; default-select the first document; show the selected document's OCR text or a "no parsed text" message while keeping selection; show a "no documents" message when empty
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.5 Write property test for document switcher ordering
    - **Property 23: Document switcher lists all documents in packet order**
    - **Validates: Requirements 3.1**

  - [x] 6.6 Write property test for default and explicit document selection
    - **Property 24: Default and explicit document selection**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 6.7 Write example tests for document empty states
    - Test the "no documents" message (3.4) and the "no parsed text" message with retained selection (3.5)
    - _Requirements: 3.4, 3.5_

  - [x] 6.8 Implement EntityChipList with confidence tooltips
    - Render one chip per extracted entity with its label; a hover/focus tooltip shows label + confidence within 200 ms; confidence shown as whole percent 0–100 with `%` or an unavailable indicator; show a "no entities" message when empty
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.9 Write property test for entity chip count
    - **Property 25: Entity chips match the entity list**
    - **Validates: Requirements 4.1**

  - [x] 6.10 Write example tests for entity tooltip timing and empty state
    - Use fake timers/user-event to assert the tooltip appears within 200 ms (4.2) and the "no entities" message renders when empty (4.4)
    - _Requirements: 4.2, 4.4_

- [x] 7. Implement Agent_Transparency_Tree (center)
  - [x] 7.1 Implement AgentTimeline with collapsible nodes
    - Create `src/components/AgentTransparencyTree.tsx` and an AgentTimeline rendering one node per present agent in canonical order (via `agentOrder.ts`); all nodes start collapsed; toggling a node toggles only that node; expanded nodes show system prompt, context contract, reasoning output with distinguishable placeholders for missing fields; show a "no agent timeline" message when empty
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Write property test for initial collapsed state
    - **Property 16: All timeline nodes start collapsed**
    - **Validates: Requirements 5.2**

  - [x] 7.3 Write property test for toggle involution and isolation
    - **Property 17: Toggling a node changes only that node and is an involution**
    - **Validates: Requirements 5.3, 5.4**

  - [x] 7.4 Write property test for missing agent field placeholders
    - **Property 18: Missing agent fields render placeholders in the expanded node**
    - **Validates: Requirements 5.5**

  - [x] 7.5 Write example test for empty agent timeline
    - Assert the "no agent timeline" message renders when there are no entries
    - _Requirements: 5.6_

  - [x] 7.6 Implement StatutoryMatchList with risk flags
    - Render one card per Statutory_Match showing the cited Tuloverolaki paragraph and deduction claim (placeholders for absent fields); render Critic risk indicators adjacent to each claim — verified indicator plus high-risk, missing-receipt, counterfactual-geography badges, each visually distinct in label and variant; render all present flags, none when empty; show a "no statutory matches" message when empty
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 7.7 Write property test for statutory match card fidelity
    - **Property 19: Statutory match cards are complete and faithful**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

  - [x] 7.8 Write property test for risk-flag rendering
    - **Property 20: Risk-flag rendering matches the flag set**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**

  - [x] 7.9 Write example test for no statutory matches
    - Assert the "no statutory matches" message renders when empty
    - _Requirements: 6.4_

  - [x] 7.10 Implement DeterministicMathBlock
    - Render total income, allowable deduction cap, and tax-bracket adjustments exactly as provided (value + unit), read-only with no editable control, inside a labeled bordered container visually separated from the timeline; render an unavailable placeholder for absent values
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.11 Write property test for deterministic values rendered exactly
    - **Property 3: Deterministic math values are displayed exactly and never re-derived**
    - **Validates: Requirements 8.1, 8.3**

  - [x] 7.12 Write property test for missing deterministic value placeholders
    - **Property 4: Missing deterministic math values render a placeholder**
    - **Validates: Requirements 8.4**

  - [x] 7.13 Write example test for deterministic block container structure
    - Assert the block renders a labeled, bordered container identified as deterministic backend calculations
    - _Requirements: 8.2_

- [x] 8. Checkpoint - context and transparency panels
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Adjudication_Console (right)
  - [x] 9.1 Implement AdjustmentSummary cards
    - Create `src/components/AdjudicationConsole.tsx` and an AdjustmentSummary rendering Original Claim and AI Recommended Adjustment exactly as provided (no re-derivation, placeholders when absent) and a Final Auditor Balance card initialized to the AI Recommended Adjustment
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 9.2 Write property test for summary values rendered exactly
    - **Property 5: Adjustment summary values are shown exactly and never re-derived**
    - **Validates: Requirements 9.1, 9.2**

  - [x] 9.3 Write property test for Final Auditor Balance initialization
    - **Property 6: Final Auditor Balance initializes to the AI recommendation**
    - **Validates: Requirements 9.3**

  - [x] 9.4 Write property test for missing summary placeholders
    - **Property 7: Missing summary values render a placeholder**
    - **Validates: Requirements 9.5**

  - [x] 9.5 Implement AdjustmentTable with debounced recalculation
    - Render one editable numeric input per deduction line item and per cap percentage; wire each edit through `validation.ts` and a debounced (trailing ~200 ms) `recalculation.ts` call updating net tax owed and Final Auditor Balance; show inline validation messages; suspend-and-retain on non-numeric/empty, exclude-and-continue on negative/out-of-range
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 9.4_

  - [x] 9.6 Write property test for one editable input per line item and cap
    - **Property 10: Adjustment table renders one editable input per line item and cap**
    - **Validates: Requirements 10.1**

  - [x] 9.7 Write example tests for recalculation timing bounds
    - Use fake timers to assert net tax updates within 500 ms of a valid change (10.2) and Final Auditor Balance updates within 1 s (9.4)
    - _Requirements: 10.2, 9.4_

  - [x] 9.8 Implement DecisionActions and ReceiptConfirmation
    - Render the auditor signature input, the Article 14 Compliance_Confirmation checkbox with certifying text, the Approve control (gated via the predicate: disabled unless signature present AND checkbox checked AND not submitting), and the Reject control with its mandatory 1–2000 char rationale field (disabled while empty/whitespace or submitting); build and submit payloads via `submitAuditorDecision`; render the returned GenTax receipt on success
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 13.1, 11.5, 12.5_

  - [x] 9.9 Write example tests for controls, labels, and Article 14 text
    - Assert Approve/Reject labels (11.1, 12.1), signature input and compliance checkbox presence (11.2), and Article 14 certification text (13.1); assert receipt confirmation renders on success (11.5, 12.5)
    - _Requirements: 11.1, 11.2, 12.1, 13.1, 11.5, 12.5_

- [x] 10. Implement the Dashboard container and wire everything together
  - [x] 10.1 Implement the load / retry state machine
    - Create `src/components/Dashboard.tsx` reading `caseId`; render "no case specified" and issue no fetch when empty/absent; otherwise call `fetchActiveCase` showing a loading indicator; enforce a 10 s timeout via `Promise.race`; branch on returned status to render the three panels only for `awaiting_human`, else "not available for human review"; on reject/timeout show the error message and a Retry control
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 10.2 Write example tests for the load lifecycle
    - Assert fetch issued on non-empty id and no fetch on empty id (1.1, 1.6), loading indicator show/hide (1.2), three panels on success (1.3), unavailable-status message (1.4), and error + retry rendering including the 10 s timeout via fake timers (1.5)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 10.3 Implement the submission lifecycle and horizontal layout
    - Own the shared `SubmitState` machine (`idle | submitting | success | error`) for Approve and Reject with a 30 s timeout; disable controls while in flight; on failure/timeout show the error, re-enable the control, and retain values (signature + compliance + calcs for approve; rationale for reject); enforce the Article 14 defensive block; render the three panels in a horizontal left/center/right layout under `App.tsx`/`main.tsx`
    - _Requirements: 11.6, 11.7, 11.8, 12.4, 12.6, 13.4, 15.4_

  - [x] 10.4 Write example tests for submission failure and Article 14 block
    - Assert approve failure retention (11.6), 30 s submit timeout via fake timers (11.8), reject failure retention (12.6), the Article 14 defensive block message and value retention (13.4), and horizontal panel order (15.4)
    - _Requirements: 11.6, 11.8, 12.6, 13.4, 15.4_

- [x] 11. Final checkpoint - build and full test suite
  - Ensure the project builds with zero errors and zero unresolved-import warnings, all unit/property/component tests pass, and ask the user if questions arise.
  - _Requirements: 15.3, 15.5_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirement sub-clauses for traceability.
- Property tests (Properties 1–32) each use a single fast-check property with at least 100 iterations, tagged `// Feature: tax-audit-dashboard, Property {number}: {property_text}`, and are placed close to the code they validate to catch errors early.
- Pure-logic and API-contract properties target `src/lib` and `src/api` directly; rendering-invariant properties render the relevant component with generated props via React Testing Library.
- Timing bounds, empty-state messages, static content, failure-path retention, wiring, and layout are validated by example/component tests; build/import portability is validated by static build checks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.7", "2.11", "2.16", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.6", "2.8", "2.9", "2.10", "2.12", "2.13", "2.14", "2.15", "2.17", "3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["6.1", "6.4", "6.8", "7.1", "7.6", "7.10", "9.1", "9.5", "9.8", "10.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.5", "6.6", "6.7", "6.9", "6.10", "7.2", "7.3", "7.4", "7.5", "7.7", "7.8", "7.9", "7.11", "7.12", "7.13", "9.2", "9.3", "9.4", "9.6", "9.7", "9.9", "10.2"] },
    { "id": 7, "tasks": ["10.3"] },
    { "id": 8, "tasks": ["10.4"] }
  ]
}
```
