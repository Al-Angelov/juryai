// CasePacket and nested types for the Tax Audit Review Dashboard.
//
// Fields that may be absent in the CasePacket are modeled as optional (`?`) so
// that the "placeholder for missing value" requirements are expressible in the
// type system. Numeric monetary/deterministic values are represented as
// `number` with an accompanying `unit` string where the requirements call for a
// value-and-unit pairing (Requirement 8.3).
//
// _Requirements: 15.1_

export type CaseStatus =
  | "awaiting_human"
  | "processing"
  | "closed"
  | "escalated"
  | string; // tolerate unknown backend statuses; only awaiting_human is reviewable

export interface CasePacket {
  caseId: string;
  status: CaseStatus;
  subject: SubjectMetadata;
  documents: ParsedDocument[];
  agentDebate: AgentLogEntry[];
  statutoryMatches: StatutoryMatch[];
  deterministicMath: DeterministicMathBlock;
  adjustmentSummary: AdjustmentSummary;
  adjustmentLineItems: AdjustmentLineItem[];
  capPercentages: CapPercentage[];
}

// Pseudonymous Subject Metadata

export type SanitizationStatus = "active" | "inactive"; // absent field => unknown

export interface SubjectMetadata {
  subjectId?: string; // e.g. "SUBJECT-4921"; absent/empty => placeholder (Req 2.5)
  nameMasked?: SanitizationStatus; // absent => unknown badge state (Req 2.6)
  ssnTokenized?: SanitizationStatus; // absent => unknown badge state (Req 2.6)
}

// Parsed Document Blocks

export interface ParsedDocument {
  label: string; // document label shown in the switcher (Req 3.1)
  ocrText?: string; // absent/empty => "no parsed text" message (Req 3.5)
  entities: EntityChip[]; // empty => "no entities" message (Req 4.4)
}

export interface EntityChip {
  label: string; // shown on the chip (Req 4.1)
  confidence?: number; // 0..1 or 0..100 normalized to whole percent (Req 4.3);
  // absent => "unavailable" indication (Req 4.5)
}

// Agent Debate Log

export type AgentName =
  | "Ingestion_Agent"
  | "Reasoner_Agent"
  | "Critic_Agent"
  | "Court_Clerk";

export interface AgentLogEntry {
  agent: AgentName;
  systemPrompt?: string; // missing => placeholder in expanded node (Req 5.5)
  contextContract?: string; // missing => placeholder (Req 5.5)
  reasoningOutput?: string; // missing => placeholder (Req 5.5)
}

// Statutory Matches and Risk Flags

export type RiskFlag =
  | "verified"
  | "high-risk"
  | "missing-receipt"
  | "counterfactual-geography";

export interface StatutoryMatch {
  citedParagraph?: string; // Tuloverolaki paragraph; missing => placeholder (Req 6.5)
  deductionClaim?: string; // missing => placeholder (Req 6.5)
  riskFlags: RiskFlag[]; // empty => no indicator/badge (Req 7.7); may contain multiple (Req 7.6)
}

// Deterministic Math Block

export interface DeterministicValue {
  value?: number; // absent => "unavailable" placeholder (Req 8.4)
  unit?: string; // rendered alongside the value exactly as provided (Req 8.3)
}

export interface TaxBracketAdjustment {
  label: string;
  amount: DeterministicValue;
}

export interface DeterministicMathBlock {
  totalIncome: DeterministicValue;
  allowableDeductionCap: DeterministicValue;
  taxBracketAdjustments: TaxBracketAdjustment[];
}

// Adjustment Summary and Editable Line Items

export interface MonetaryValue {
  value?: number; // absent => placeholder (Req 9.5)
  unit?: string;
}

export interface AdjustmentSummary {
  originalClaim: MonetaryValue; // shown as-is, no re-derivation (Req 9.1)
  aiRecommendedAdjustment: MonetaryValue; // shown as-is, no re-derivation (Req 9.2)
  // Final Auditor Balance is derived client-side, not stored in the packet (Req 9.3, 9.4)
}

export interface AdjustmentLineItem {
  id: string;
  label: string;
  amount: number; // editable; valid values are >= 0 (Req 10.5)
  unit?: string;
}

export interface CapPercentage {
  id: string;
  label: string;
  percentage: number; // editable; valid range 0..100 inclusive (Req 10.4)
}

// Editable UI State (not part of the packet)

export interface AdjustmentEditState {
  lineItems: Record<string, string>; // raw input strings keyed by id
  caps: Record<string, string>; // raw input strings keyed by id
  fieldErrors: Record<string, string>; // validation messages by field id
  lastValidNetTax: number; // retained across invalid edits (Req 10.3, 10.6)
  finalAuditorBalance: number; // initialized to aiRecommendedAdjustment (Req 9.3)
}
