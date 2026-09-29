import type { AdjustmentLineItem, CapPercentage } from "./casePacket";

export interface AdjustedCalculations {
  lineItems: AdjustmentLineItem[];
  capPercentages: CapPercentage[];
  netTaxOwed: number; // client-recalculated
  finalAuditorBalance: number;
}

export interface AuditorDecisionApproved {
  status: "approved";
  adjustedCalculations: AdjustedCalculations;
  caseworkerNotes: string;
  auditorSignature: string; // required for approve (Req 11.2, 11.4)
  complianceConfirmation: boolean; // Article 14 certification (Req 13.3)
  timestamp: string; // ISO 8601
}

export interface AuditorDecisionRejected {
  status: "rejected";
  rationale: string; // 1..2000 chars, non-whitespace (Req 12.2, 12.4)
  adjustedCalculations: AdjustedCalculations;
  caseworkerNotes: string;
  timestamp: string;
}

export type AuditorDecision = AuditorDecisionApproved | AuditorDecisionRejected;

export interface GenTaxReceipt {
  transactionId: string; // GenTax ledger reference
  caseId: string;
  status: "approved" | "rejected";
  ledgerTimestamp: string; // ISO 8601, assigned by GenTax
  confirmationCode: string; // shown in the receipt confirmation (Req 11.5, 12.5)
}
