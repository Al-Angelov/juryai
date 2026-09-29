# Requirements Document

## Introduction

The Tax Audit Review Dashboard is a Human-in-the-Loop (HITL) web interface for the Finnish Tax Administration (Verohallinto). It serves as the mandatory human oversight checkpoint required under EU AI Act Article 14 for AI-assisted tax adjudication. The dashboard ingests case state produced by the JuryAI event-driven multi-agent backend, presenting an interactive three-panel interface that enables tax caseworkers (auditors) to review multi-agent reasoning, inspect deterministic calculations, modify deduction line items, and issue final binding decisions into the GenTax core ledger system.

The dashboard consumes cases that are in an `awaiting_human` status, displays pseudonymous subject data sanitized by an upstream Identity Firewall, and records the auditor's certified decision with a signature and timestamp. The interface is decoupled from any specific runtime through a standalone mocked API layer, and is styled for high-density administrative data with a professional enterprise dark-mode theme.

The feature scope is the front-end dashboard and its mocked API contract. The upstream agent backend, the Identity Firewall middleware, and the GenTax ledger are external systems represented through the mocked API.

## Glossary

- **Dashboard**: The Tax Audit Review Dashboard front-end application described by this document.
- **Auditor**: A tax caseworker at Verohallinto who reviews cases and issues final decisions. Also referred to as the caseworker.
- **CasePacket**: The complete data object for a single case, containing pseudonymous citizen metadata, extracted document blocks, agent debate logs, statutory matches, and deterministic math outputs.
- **Case_Context_Panel**: The left panel (Panel 1) presenting citizen context and ingested unstructured documents.
- **Agent_Transparency_Tree**: The center panel (Panel 2) presenting the multi-agent reasoning timeline, statutory matches, risk flags, and deterministic math.
- **Adjudication_Console**: The right panel (Panel 3) presenting adjustment summaries, the editable adjustment table, and HITL action controls.
- **Tax_Audit_API**: The standalone mocked API layer (`src/api/taxAuditApi.js`) exposing `fetchActiveCase` and `submitAuditorDecision`.
- **Identity_Firewall**: The upstream middleware that sanitizes personally identifiable information (PII) and issues a pseudonymous subject ID.
- **Subject_ID**: The pseudonymous identifier for the citizen under audit (e.g., `SUBJECT-4921`).
- **Ingestion_Agent**: The backend agent that parses uploaded documents into OCR text and entity chips.
- **Reasoner_Agent**: The backend agent that produces legal deductions with statutory citations.
- **Critic_Agent**: The backend agent that verifies claims and raises risk flags.
- **Court_Clerk**: The backend agent that finalizes the agent debate into a recommendation.
- **Entity_Chip**: A highlighted extracted entity from a parsed document (e.g., `#WorkLaptop`), carrying metadata such as a confidence score.
- **Deterministic_Math_Block**: The isolated UI region displaying hardcoded, non-probabilistic calculations from the backend middleware (total income, allowable deduction cap, tax bracket adjustments).
- **Statutory_Match**: A legal deduction claim linked to a specific paragraph of the Finnish Income Tax Act (Tuloverolaki).
- **Risk_Flag**: A verification indicator raised by the Critic_Agent, classified as verified, high-risk, missing-receipt, or counterfactual-geography.
- **Adjustment_Table**: The editable table in the Adjudication_Console where the auditor overrides deduction line items or cap percentages.
- **GenTax_Ledger**: The external tax core system that receives approved decisions.
- **Auditor_Decision**: The final binding decision (approved or rejected) submitted by the Auditor, including adjusted calculations, notes, signature, and timestamp.
- **Compliance_Confirmation**: The checkbox by which the Auditor certifies review and retention of final authority under EU AI Act Article 14.

## Requirements

### Requirement 1: Load Active Case

**User Story:** As an auditor, I want the dashboard to load the active case awaiting human review, so that I can begin adjudication with all relevant context available.

#### Acceptance Criteria

1. WHEN the Dashboard is opened with a non-empty case identifier, THE Dashboard SHALL request the corresponding CasePacket from the Tax_Audit_API via `fetchActiveCase`.
2. WHILE the CasePacket request is in progress, THE Dashboard SHALL display a loading indicator, and upon completion of the request THE Dashboard SHALL remove the loading indicator.
3. WHEN a CasePacket is successfully retrieved, THE Dashboard SHALL render the Case_Context_Panel, the Agent_Transparency_Tree, and the Adjudication_Console using the retrieved data.
4. IF the requested case has a status other than `awaiting_human`, THEN THE Dashboard SHALL display a message indicating the case is not available for human review.
5. IF the CasePacket retrieval fails or does not complete within 10 seconds, THEN THE Dashboard SHALL remove the loading indicator, display an error message indicating that the case could not be loaded, and provide a control to retry the request.
6. IF the Dashboard is opened without a case identifier or with an empty case identifier, THEN THE Dashboard SHALL display a message indicating that no case was specified and SHALL NOT issue a `fetchActiveCase` request.

### Requirement 2: Display Pseudonymous Citizen Profile

**User Story:** As an auditor, I want to see the pseudonymous citizen profile with PII sanitization status, so that I can review the case under zero-trust privacy controls.

#### Acceptance Criteria

1. WHEN the Case_Context_Panel is rendered, THE Case_Context_Panel SHALL display the Subject_ID value provided by the Identity_Firewall exactly as received.
2. WHEN the Case_Context_Panel is rendered AND the CasePacket reports the Name Masked sanitization status as active, THE Case_Context_Panel SHALL display the corresponding badge in an active state; otherwise it SHALL display the badge in an inactive state.
3. WHEN the Case_Context_Panel is rendered AND the CasePacket reports the SSN Tokenized sanitization status as active, THE Case_Context_Panel SHALL display the corresponding badge in an active state; otherwise it SHALL display the badge in an inactive state.
4. WHERE a sanitization status is provided as inactive in the CasePacket, THE Case_Context_Panel SHALL render the corresponding badge with both a color treatment and a text label that differ from the active-status badge, such that the two states are distinguishable without relying on color alone.
5. IF the Subject_ID is missing or empty in the value provided by the Identity_Firewall, THEN THE Case_Context_Panel SHALL display a placeholder indicating the Subject_ID is unavailable in place of the Subject_ID value.
6. IF a sanitization status is absent from the CasePacket, THEN THE Case_Context_Panel SHALL display the corresponding badge in an unknown state visually distinct from both the active and inactive states.

### Requirement 3: View and Switch Parsed Documents

**User Story:** As an auditor, I want to browse the parsed documents ingested for the case, so that I can inspect the source evidence behind each claim.

#### Acceptance Criteria

1. THE Case_Context_Panel SHALL display a document switcher listing every document contained in the CasePacket in the order the documents appear in the CasePacket, presenting each document with its document label as provided in the CasePacket.
2. WHEN the Auditor selects a document from the document switcher, THE Case_Context_Panel SHALL display the selected document's OCR text as parsed by the Ingestion_Agent and SHALL visually distinguish the selected document from the other documents in the document switcher.
3. WHEN a CasePacket contains at least one document, THE Case_Context_Panel SHALL select and display the first document in the CasePacket document order by default.
4. IF a CasePacket contains no documents, THEN THE Case_Context_Panel SHALL display a message indicating that no documents are available.
5. IF the selected document contains no OCR text as parsed by the Ingestion_Agent, THEN THE Case_Context_Panel SHALL display a message indicating that no parsed text is available for the selected document while keeping the document selected in the document switcher.

### Requirement 4: Display Extracted Entity Chips

**User Story:** As an auditor, I want to see extracted entity chips with confidence scores, so that I can gauge the reliability of the Ingestion_Agent's extraction.

#### Acceptance Criteria

1. WHEN a document is displayed, THE Case_Context_Panel SHALL render one Entity_Chip for each entity extracted from that document, displaying the extracted entity label on each chip.
2. WHEN the Auditor hovers over an Entity_Chip, THE Case_Context_Panel SHALL display a tooltip showing the entity's metadata, including the extracted entity label and its confidence score, within 200 milliseconds of the hover starting.
3. THE Case_Context_Panel SHALL display the confidence score of each Entity_Chip as a percentage value in the range 0 to 100, rounded to the nearest whole percent, with a trailing percent sign.
4. IF the displayed document has no extracted entities, THEN THE Case_Context_Panel SHALL display a message indicating that no entities were extracted from that document.
5. IF an Entity_Chip has no confidence score provided in the CasePacket, THEN THE Case_Context_Panel SHALL render the Entity_Chip with an indication that the confidence score is unavailable, in place of a percentage value.

### Requirement 5: Display Multi-Agent Debate Timeline

**User Story:** As an auditor, I want to trace the multi-agent reasoning as a chronological timeline, so that I can understand how the recommendation was produced.

#### Acceptance Criteria

1. THE Agent_Transparency_Tree SHALL display an agent execution timeline containing one node for each agent present in the CasePacket, ordered in the canonical execution sequence Ingestion_Agent, then Reasoner_Agent, then Critic_Agent, then Court_Clerk, omitting any agent not present in the CasePacket while preserving the relative order of the remaining agents.
2. WHEN the Agent_Transparency_Tree first renders the timeline, THE Agent_Transparency_Tree SHALL display every agent node in a collapsed state.
3. WHEN the Auditor selects a collapsed agent node in the timeline, THE Agent_Transparency_Tree SHALL expand that node to display its system prompt, context contract, and reasoning output, without changing the expanded or collapsed state of any other node.
4. WHEN the Auditor selects an expanded agent node, THE Agent_Transparency_Tree SHALL collapse that node.
5. WHEN an expanded agent node is missing its system prompt, context contract, or reasoning output in the CasePacket, THE Agent_Transparency_Tree SHALL display, in place of each missing field, a visible placeholder indicator that is distinguishable from a populated field, while still displaying the fields that are present.
6. IF the CasePacket contains no agent execution entries, THEN THE Agent_Transparency_Tree SHALL display a message indicating that no agent timeline is available.

### Requirement 6: Display Statutory Match Highlighting

**User Story:** As an auditor, I want to see the legal deductions with direct citations to the Finnish Income Tax Act, so that I can verify each claim against statute.

#### Acceptance Criteria

1. THE Agent_Transparency_Tree SHALL display a card for each Statutory_Match produced by the Reasoner_Agent.
2. THE Agent_Transparency_Tree SHALL display, within each Statutory_Match card, the cited paragraph of the Finnish Income Tax Act (Tuloverolaki) associated with that match.
3. THE Agent_Transparency_Tree SHALL display, within each Statutory_Match card, the deduction claim associated with the cited paragraph of that match.
4. IF the CasePacket contains no Statutory_Match, THEN THE Agent_Transparency_Tree SHALL display a message indicating that no statutory matches are available.
5. WHERE a Statutory_Match is missing its cited paragraph or its deduction claim in the CasePacket, THE Agent_Transparency_Tree SHALL display a placeholder for the missing field within that match's card.

### Requirement 7: Display Critic Verification and Risk Flags

**User Story:** As an auditor, I want to see the Critic_Agent's verification results and risk flags, so that I can focus attention on high-risk or unsupported deductions.

#### Acceptance Criteria

1. WHEN a claim whose Critic_Agent Risk_Flag is classified as verified is displayed, THE Agent_Transparency_Tree SHALL display a verified indicator adjacent to that claim.
2. WHEN a claim whose Critic_Agent Risk_Flag is classified as high-risk is displayed, THE Agent_Transparency_Tree SHALL display a high-risk warning badge adjacent to that claim.
3. WHEN a claim whose Critic_Agent Risk_Flag is classified as missing-receipt is displayed, THE Agent_Transparency_Tree SHALL display a missing-receipt warning badge adjacent to that claim.
4. WHEN a claim whose Critic_Agent Risk_Flag is classified as counterfactual-geography is displayed, THE Agent_Transparency_Tree SHALL display a counterfactual-geography warning badge adjacent to that claim.
5. THE Agent_Transparency_Tree SHALL render the verified indicator and each of the high-risk, missing-receipt, and counterfactual-geography warning badges with a visually distinct appearance such that any one is distinguishable from each of the others.
6. WHEN a claim carries more than one Critic_Agent Risk_Flag classification, THE Agent_Transparency_Tree SHALL display the corresponding indicator or badge for each classification present on that claim.
7. IF a displayed claim has no associated Critic_Agent Risk_Flag classification in the CasePacket, THEN THE Agent_Transparency_Tree SHALL display the claim without any verified indicator or warning badge.

### Requirement 8: Isolate Deterministic Math Block

**User Story:** As an auditor, I want deterministic backend calculations visually separated from probabilistic agent text, so that I can trust the computed figures as non-generated values.

#### Acceptance Criteria

1. THE Agent_Transparency_Tree SHALL display a Deterministic_Math_Block containing the total income value, the allowable deduction cap value, and the tax bracket adjustment values as provided in the CasePacket.
2. THE Agent_Transparency_Tree SHALL render the Deterministic_Math_Block within a labeled, bordered container that is visually separated from the agent reasoning timeline nodes and is identified by a label indicating the values are deterministic backend calculations.
3. THE Deterministic_Math_Block SHALL display each calculation value using the same numeric value and unit provided in the CasePacket, and SHALL present each value as read-only with no editable input control.
4. WHERE the total income value, the allowable deduction cap value, or a tax bracket adjustment value is absent from the CasePacket, THE Deterministic_Math_Block SHALL display a placeholder indicating the value is unavailable in place of the missing value.

### Requirement 9: Display Tax Adjustment Summary

**User Story:** As an auditor, I want to compare the original claim, the AI recommendation, and my final balance, so that I can see the effect of my adjustments at a glance.

#### Acceptance Criteria

1. WHEN the Adjudication_Console is rendered, THE Adjudication_Console SHALL display a card showing the Original Claim value exactly as provided in the CasePacket without client-side re-derivation.
2. WHEN the Adjudication_Console is rendered, THE Adjudication_Console SHALL display a card showing the AI Recommended Adjustment value exactly as provided in the CasePacket without client-side re-derivation.
3. WHEN the Adjudication_Console is rendered and before the Auditor has modified any value in the Adjustment_Table, THE Adjudication_Console SHALL display a card showing the Final Auditor Balance value initialized to the AI Recommended Adjustment value from the CasePacket.
4. WHEN the Auditor modifies a value in the Adjustment_Table, THE Adjudication_Console SHALL update the Final Auditor Balance card to the recalculated balance within 1 second of the modification.
5. IF the Original Claim value or the AI Recommended Adjustment value is absent from the CasePacket, THEN THE Adjudication_Console SHALL display a placeholder in the corresponding card indicating the value is unavailable.

### Requirement 10: Edit Deduction Line Items with Real-Time Recalculation

**User Story:** As an auditor, I want to override individual deduction line items and cap percentages with immediate recalculation, so that I can determine the corrected net tax owed before submitting.

#### Acceptance Criteria

1. THE Adjudication_Console SHALL display an Adjustment_Table containing an editable input for each deduction line item and cap percentage in the CasePacket.
2. WHEN the Auditor changes a value in the Adjustment_Table to a valid value, THE Adjudication_Console SHALL recalculate the net tax owed on the client within 500 milliseconds of the change and display the updated net tax owed value.
3. IF the Auditor enters a non-numeric value into a numeric input in the Adjustment_Table, THEN THE Adjudication_Console SHALL display a validation message and retain the last valid net tax owed value.
4. IF the Auditor enters a cap percentage outside the inclusive range of 0 to 100, THEN THE Adjudication_Console SHALL display a validation message and exclude the invalid value from the recalculation.
5. IF the Auditor enters a deduction line item value below 0, THEN THE Adjudication_Console SHALL display a validation message and exclude the invalid value from the recalculation.
6. IF the Auditor clears a numeric input in the Adjustment_Table so that it is empty, THEN THE Adjudication_Console SHALL display a validation message and retain the last valid net tax owed value.

### Requirement 11: Approve and Push Decision to GenTax Ledger

**User Story:** As an auditor, I want to approve a case and push the decision to the GenTax ledger, so that the adjudicated result becomes binding.

#### Acceptance Criteria

1. THE Adjudication_Console SHALL display an Approve control labeled to indicate pushing the decision to the GenTax_Ledger.
2. THE Adjudication_Console SHALL display an auditor signature input field and a Compliance_Confirmation checkbox.
3. WHILE the auditor signature field is empty OR the Compliance_Confirmation checkbox is unchecked, THE Adjudication_Console SHALL keep the Approve control disabled.
4. WHEN the Auditor activates the Approve control, THE Adjudication_Console SHALL submit an Auditor_Decision to the Tax_Audit_API via `submitAuditorDecision` with a status of `approved`, the adjusted calculations, the caseworker notes, the entered auditor signature, the Compliance_Confirmation state, and a timestamp.
5. WHEN the Tax_Audit_API returns a confirmed GenTax transaction receipt, THE Adjudication_Console SHALL display the receipt confirmation to the Auditor.
6. IF the Auditor_Decision submission fails, THEN THE Adjudication_Console SHALL display an error message indicating the submission failed, re-enable the Approve control, and retain the entered auditor signature, the Compliance_Confirmation state, and the adjusted calculations.
7. WHILE an Auditor_Decision submission is in flight, THE Adjudication_Console SHALL keep the Approve control disabled.
8. IF the Tax_Audit_API does not return a response within 30 seconds of an Auditor_Decision submission, THEN THE Adjudication_Console SHALL treat the submission as failed, display an error message indicating the submission timed out, and re-enable the Approve control.

### Requirement 12: Reject and Escalate to Full Audit

**User Story:** As an auditor, I want to reject a case with a mandatory rationale, so that unresolved cases are escalated to a full audit with a documented reason.

#### Acceptance Criteria

1. THE Adjudication_Console SHALL display a Reject control labeled to indicate escalation to a full audit.
2. THE Adjudication_Console SHALL display a rationale text field associated with the Reject control that accepts between 1 and 2,000 characters.
3. WHILE the rationale text field is empty or contains only whitespace characters, THE Adjudication_Console SHALL keep the Reject control disabled.
4. WHEN the Auditor activates the Reject control, THE Adjudication_Console SHALL disable the Reject control and submit an Auditor_Decision to the Tax_Audit_API via `submitAuditorDecision` with a status of `rejected`, the rationale, the caseworker notes, and a timestamp.
5. WHEN the Tax_Audit_API confirms the rejection, THE Adjudication_Console SHALL display the confirmation to the Auditor.
6. IF the Auditor_Decision submission fails, THEN THE Adjudication_Console SHALL display an error message, retain the entered rationale, and re-enable the Reject control.

### Requirement 13: Enforce EU AI Act Article 14 Compliance Certification

**User Story:** As a compliance officer, I want the auditor to certify human oversight before any binding approval, so that the decision satisfies EU AI Act Article 14.

#### Acceptance Criteria

1. THE Adjudication_Console SHALL display a Compliance_Confirmation checkbox with text certifying that the Auditor has reviewed the agent evidence presented in the Agent_Transparency_Tree and retains final authority under EU AI Act Article 14.
2. WHILE the Compliance_Confirmation checkbox is unchecked, THE Adjudication_Console SHALL prevent submission of an Auditor_Decision with a status of `approved`.
3. WHEN an Auditor_Decision with a status of `approved` is submitted, THE Adjudication_Console SHALL include in the submitted payload the auditor signature and the Compliance_Confirmation state represented as a checked or unchecked boolean value.
4. IF a submission of an Auditor_Decision with a status of `approved` is attempted while the Compliance_Confirmation checkbox is unchecked, THEN THE Adjudication_Console SHALL block the submission, retain the entered decision values, and display a message indicating that Article 14 compliance certification is required before approval.

### Requirement 14: Provide Decoupled Mocked API Layer

**User Story:** As a developer, I want a standalone mocked API layer independent of any IDE runtime, so that the dashboard components remain portable and testable.

#### Acceptance Criteria

1. WHEN `fetchActiveCase` is called with a non-empty case identifier of 1 to 128 characters, THE Tax_Audit_API SHALL return a Promise that resolves within 2000 milliseconds to a CasePacket containing pseudonymous citizen metadata, extracted document blocks, agent debate logs, statutory matches, and deterministic math outputs.
2. WHEN `submitAuditorDecision` is called with a valid case identifier of 1 to 128 characters and a payload containing a status of `approved` or `rejected`, adjusted calculations, caseworker notes, and a timestamp, THE Tax_Audit_API SHALL return a Promise that resolves within 2000 milliseconds to a confirmed GenTax transaction receipt.
3. THE Tax_Audit_API SHALL be implemented as a standalone module using plain JavaScript promises and fetch semantics without dependencies on any Kiro IDE internal runtime or hosting utilities.
4. IF `submitAuditorDecision` receives a payload with a status other than `approved` or `rejected`, THEN THE Tax_Audit_API SHALL return a rejected Promise with an error indicating the status is invalid.
5. IF `fetchActiveCase` is called with a case identifier that is empty, exceeds 128 characters, or does not correspond to an existing case, THEN THE Tax_Audit_API SHALL return a rejected Promise with an error indicating the case identifier is missing or unknown.
6. IF `submitAuditorDecision` receives a payload that is missing the adjusted calculations, the caseworker notes, or the timestamp, THEN THE Tax_Audit_API SHALL return a rejected Promise with an error indicating which required field is absent and SHALL not produce a GenTax transaction receipt.

### Requirement 15: Modular Component Structure and Theming

**User Story:** As a developer, I want the dashboard delivered as modular, fully styled components, so that the codebase builds cleanly and presents a consistent enterprise theme.

#### Acceptance Criteria

1. THE Dashboard SHALL be composed of separate component modules, one each for the Case_Context_Panel, the Agent_Transparency_Tree, the Adjudication_Console, and the Tax_Audit_API, where each module is defined in its own source file.
2. THE Dashboard SHALL apply Tailwind CSS styling that presents a dark-mode theme in which every panel uses the same background, surface, text, and accent styling tokens, and in which body text maintains a contrast ratio of at least 4.5:1 against its background.
3. THE Dashboard SHALL be delivered with component modules in which every import resolves to an existing module or export and every function, component, and code block is syntactically complete with no truncated or placeholder statements.
4. THE Dashboard SHALL render the three panels in a horizontal layout with the Case_Context_Panel on the left, the Agent_Transparency_Tree in the center, and the Adjudication_Console on the right.
5. WHEN the codebase is built with the project's configured build command, THE Dashboard SHALL compile to completion with zero build errors and zero unresolved-import warnings.
