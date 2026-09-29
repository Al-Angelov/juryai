// Adjudication_Console (right panel) for the Tax Audit Review Dashboard.
//
// This panel composes the three Adjudication_Console sections described in the
// design: the AdjustmentSummary cards (this task, 9.1), the editable
// AdjustmentTable (task 9.5), and the DecisionActions / ReceiptConfirmation
// controls (task 9.8). It is deliberately structured as a composition of child
// sections with explicit slots so those later tasks can drop their sections in
// without restructuring this file.
//
// AdjustmentSummary renders three cards:
//   - Original Claim              — shown exactly as provided (Req 9.1)
//   - AI Recommended Adjustment   — shown exactly as provided (Req 9.2)
//   - Final Auditor Balance       — initialized to the AI Recommended
//                                   Adjustment value before any edit (Req 9.3)
//
// Monetary values are rendered through `formatMonetaryValue`, which renders the
// value + unit exactly as provided and emits the shared UNAVAILABLE indicator
// when a value is absent (Req 9.5) — the console performs no client-side
// re-derivation of the Original Claim or AI Recommended Adjustment (Req 9.1,
// 9.2).
//
// _Requirements: 9.1, 9.2, 9.3, 9.5_

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  AdjustmentLineItem,
  AdjustmentSummary as AdjustmentSummaryData,
  CapPercentage,
  CasePacket,
  DeterministicMathBlock,
  MonetaryValue,
} from "../types/casePacket.ts";
import type {
  AdjustedCalculations,
  AuditorDecision,
  GenTaxReceipt,
} from "../types/decision.ts";
import { formatMonetaryValue } from "../lib/format.ts";
import {
  isValid,
  validateCap,
  validateLineItem,
  type ValidationResult,
} from "../lib/validation.ts";
import { recalculateNetTax } from "../lib/recalculation.ts";
import {
  RATIONALE_MAX_LENGTH,
  buildApprovedDecision,
  buildRejectedDecision,
  canApprove,
  canReject,
} from "../lib/decision.ts";
import { THEME_TOKENS } from "../lib/theme.ts";
import { Button, Card, NumericInput, cn } from "./ui/index.ts";

// --- AdjustmentSummary -------------------------------------------------------

export interface AdjustmentSummaryProps {
  /** The adjustment summary slice of the CasePacket (Original Claim + AI rec). */
  summary: AdjustmentSummaryData;
  /**
   * The current Final Auditor Balance. Defaults to the AI Recommended
   * Adjustment so that, before any edit in the AdjustmentTable, the Final
   * Auditor Balance card equals the AI recommendation (Req 9.3). Later tasks
   * (9.5) recompute and pass this value down as the auditor edits the table.
   */
  finalAuditorBalance?: MonetaryValue;
}

/**
 * Render a single labeled summary card. The value is rendered exactly as
 * provided via {@link formatMonetaryValue}; absent values fall back to the
 * shared UNAVAILABLE indicator (Req 9.5).
 */
function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: MonetaryValue;
}) {
  return (
    <Card title={label}>
      <div className={cn("text-lg font-semibold tabular-nums", THEME_TOKENS.text.body)}>
        {formatMonetaryValue(value)}
      </div>
    </Card>
  );
}

/**
 * AdjustmentSummary — the three summary cards at the top of the
 * Adjudication_Console.
 *
 * Original Claim and AI Recommended Adjustment are shown exactly as provided
 * (Req 9.1, 9.2). Final Auditor Balance is initialized to the AI Recommended
 * Adjustment value when no explicit `finalAuditorBalance` is supplied, so on
 * first render — before any table edit — it equals the AI recommendation
 * (Req 9.3).
 */
export function AdjustmentSummary({
  summary,
  finalAuditorBalance,
}: AdjustmentSummaryProps) {
  // Initialize the Final Auditor Balance to the AI Recommended Adjustment when
  // the caller has not supplied an updated balance (Req 9.3). Later table edits
  // (task 9.5) drive `finalAuditorBalance` explicitly.
  const finalBalance = finalAuditorBalance ?? summary.aiRecommendedAdjustment;

  return (
    <section aria-label="Adjustment Summary" className="grid gap-3">
      <SummaryCard label="Original Claim" value={summary.originalClaim} />
      <SummaryCard
        label="AI Recommended Adjustment"
        value={summary.aiRecommendedAdjustment}
      />
      <SummaryCard label="Final Auditor Balance" value={finalBalance} />
    </section>
  );
}

// --- AdjustmentTable ---------------------------------------------------------

/** Trailing debounce interval (ms) for the client-side net-tax recalculation.
 *  Kept well inside the 500 ms recalculation bound (Req 10.2) and the 1 s Final
 *  Auditor Balance bound (Req 9.4). */
export const RECALCULATION_DEBOUNCE_MS = 200;

export interface AdjustmentTableProps {
  /** Editable deduction line items from the CasePacket (Req 10.1). */
  lineItems: AdjustmentLineItem[];
  /** Editable cap percentages from the CasePacket (Req 10.1). */
  capPercentages: CapPercentage[];
  /** Read-only deterministic math inputs for recalculation (never re-derived). */
  deterministicMath: DeterministicMathBlock;
  /**
   * Net tax owed to display and retain before any edit. This seeds
   * `lastValidNetTax` so the first render (and any suspended recalculation)
   * shows a stable value (Req 10.3, 10.6).
   */
  initialNetTaxOwed: number;
  /** Unit applied to the computed Final Auditor Balance MonetaryValue (Req 9.4). */
  balanceUnit?: string;
  /**
   * Fired (after each trailing debounce tick, and once on mount) with the
   * current adjusted calculations so the console can drive the Final Auditor
   * Balance card (Req 9.4) and task 9.8 can build the decision payload.
   */
  onAdjustedCalculationsChange?: (calculations: AdjustedCalculations) => void;
}

/** Format a raw line-item amount for its initial editable string value. */
function formatInitialNumber(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

/**
 * AdjustmentTable — the editable numeric grid at the center of the
 * Adjudication_Console.
 *
 * Renders exactly one {@link NumericInput} per deduction line item and one per
 * cap percentage (Req 10.1). Raw string values are held per field id so empty
 * and non-numeric states are representable; each keystroke is classified by
 * `validation.ts` and its message associated with the input via
 * `aria-describedby` (Req 10.3–10.6).
 *
 * A trailing debounce (~{@link RECALCULATION_DEBOUNCE_MS} ms) drives
 * `recalculateNetTax`. On each tick the current field classifications decide the
 * behavior:
 *   - if ANY field is non-numeric/empty ("retain-last"), recalculation is
 *     SUSPENDED and the last valid net tax is kept (Req 10.3, 10.6);
 *   - otherwise "include" values contribute and "exclude" values (negative line
 *     item / out-of-range cap) are dropped, and net tax is recomputed from the
 *     remaining valid values (Req 10.4, 10.5, 10.2).
 * The resulting net tax and Final Auditor Balance are reported upward via
 * `onAdjustedCalculationsChange` (Req 9.4).
 */
export function AdjustmentTable({
  lineItems,
  capPercentages,
  deterministicMath,
  initialNetTaxOwed,
  balanceUnit,
  onAdjustedCalculationsChange,
}: AdjustmentTableProps) {
  // Raw editable string values keyed by field id (design "Adjustment Edit State").
  const [lineItemRaw, setLineItemRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lineItems.map((item) => [item.id, formatInitialNumber(item.amount)]),
    ),
  );
  const [capRaw, setCapRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      capPercentages.map((cap) => [cap.id, formatInitialNumber(cap.percentage)]),
    ),
  );

  // Last valid net tax, retained across suspended (retain-last) recalculations.
  const [lastValidNetTax, setLastValidNetTax] = useState(initialNetTaxOwed);

  // Keep the latest change callback in a ref so the debounce effect does not
  // re-run (and reset its timer) merely because the parent passed a new closure.
  const onChangeRef = useRef(onAdjustedCalculationsChange);
  useEffect(() => {
    onChangeRef.current = onAdjustedCalculationsChange;
  }, [onAdjustedCalculationsChange]);

  // Classify every field on each render so the inputs can show messages
  // synchronously; the recalculation itself is debounced below.
  const lineItemResults = useMemo<Record<string, ValidationResult>>(
    () =>
      Object.fromEntries(
        lineItems.map((item) => [
          item.id,
          validateLineItem(lineItemRaw[item.id] ?? ""),
        ]),
      ),
    [lineItems, lineItemRaw],
  );
  const capResults = useMemo<Record<string, ValidationResult>>(
    () =>
      Object.fromEntries(
        capPercentages.map((cap) => [cap.id, validateCap(capRaw[cap.id] ?? "")]),
      ),
    [capPercentages, capRaw],
  );

  // Trailing debounce: on each edit, wait RECALCULATION_DEBOUNCE_MS of quiet
  // before recomputing. Re-runs whenever a classification changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Suspend-and-retain: any non-numeric/empty field halts the recalculation
      // and keeps the last valid net tax (Req 10.3, 10.6).
      const suspend =
        Object.values(lineItemResults).some((r) => r.behavior === "retain-last") ||
        Object.values(capResults).some((r) => r.behavior === "retain-last");

      // Exclude-and-continue: drop invalid (negative / out-of-range) values and
      // recompute from the remaining valid ones (Req 10.4, 10.5).
      const validLineItems: AdjustmentLineItem[] = lineItems
        .filter((item) => isValid(lineItemResults[item.id]))
        .map((item) => ({
          ...item,
          amount: (lineItemResults[item.id] as { value: number }).value,
        }));
      const validCaps: CapPercentage[] = capPercentages
        .filter((cap) => isValid(capResults[cap.id]))
        .map((cap) => ({
          ...cap,
          percentage: (capResults[cap.id] as { value: number }).value,
        }));

      const netTaxOwed = suspend
        ? lastValidNetTax
        : recalculateNetTax(deterministicMath, validLineItems, validCaps);

      if (!suspend && netTaxOwed !== lastValidNetTax) {
        setLastValidNetTax(netTaxOwed);
      }

      onChangeRef.current?.({
        lineItems: validLineItems,
        capPercentages: validCaps,
        netTaxOwed,
        finalAuditorBalance: netTaxOwed,
      });
    }, RECALCULATION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    lineItemResults,
    capResults,
    lineItems,
    capPercentages,
    deterministicMath,
    lastValidNetTax,
  ]);

  const netTaxUnit = balanceUnit?.trim();

  return (
    <Card title="Adjustment Table">
      <div className="grid gap-4">
        <fieldset className="grid gap-3 border-0 p-0">
          <legend className={cn("mb-1 text-xs font-semibold", THEME_TOKENS.text.muted)}>
            Deduction Line Items
          </legend>
          {lineItems.map((item) => {
            const result = lineItemResults[item.id];
            const invalid = !isValid(result);
            const messageId = invalid ? `line-item-error-${item.id}` : undefined;
            const label = item.unit ? `${item.label} (${item.unit})` : item.label;
            return (
              <div key={item.id} className="grid gap-1">
                <NumericInput
                  label={label}
                  value={lineItemRaw[item.id] ?? ""}
                  onValueChange={(next) =>
                    setLineItemRaw((prev) => ({ ...prev, [item.id]: next }))
                  }
                  invalid={invalid}
                  describedById={messageId}
                />
                {invalid && "message" in result && (
                  <p
                    id={messageId}
                    role="alert"
                    className="text-xs text-red-600"
                  >
                    {result.message}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="grid gap-3 border-0 p-0">
          <legend className={cn("mb-1 text-xs font-semibold", THEME_TOKENS.text.muted)}>
            Cap Percentages
          </legend>
          {capPercentages.map((cap) => {
            const result = capResults[cap.id];
            const invalid = !isValid(result);
            const messageId = invalid ? `cap-error-${cap.id}` : undefined;
            return (
              <div key={cap.id} className="grid gap-1">
                <NumericInput
                  label={`${cap.label} (%)`}
                  value={capRaw[cap.id] ?? ""}
                  onValueChange={(next) =>
                    setCapRaw((prev) => ({ ...prev, [cap.id]: next }))
                  }
                  invalid={invalid}
                  describedById={messageId}
                />
                {invalid && "message" in result && (
                  <p id={messageId} role="alert" className="text-xs text-red-600">
                    {result.message}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>

        <div
          className={cn(
            "flex items-center justify-between border-t border-slate-200 pt-3",
          )}
        >
          <span className={cn("text-sm font-medium", THEME_TOKENS.text.muted)}>
            Net Tax Owed
          </span>
          <span
            aria-label="Net Tax Owed"
            className={cn("text-base font-semibold tabular-nums", THEME_TOKENS.text.body)}
          >
            {formatMonetaryValue({ value: lastValidNetTax, unit: netTaxUnit })}
          </span>
        </div>
      </div>
    </Card>
  );
}

// --- DecisionActions / ReceiptConfirmation -----------------------------------

/**
 * The EU AI Act Article 14 Compliance_Confirmation certification text. By
 * checking this box the auditor certifies that they have reviewed the agent
 * evidence presented in the Agent_Transparency_Tree and retain final authority
 * under EU AI Act Article 14 (Req 13.1).
 */
export const ARTICLE_14_CERTIFICATION_TEXT =
  "I certify that I have reviewed the agent evidence presented in the " +
  "Agent Transparency Tree and retain final authority over this decision " +
  "under EU AI Act Article 14.";

export interface ReceiptConfirmationProps {
  /** The GenTax transaction receipt returned by the Tax_Audit_API on success. */
  receipt: GenTaxReceipt;
}

/**
 * ReceiptConfirmation — renders the confirmed GenTax transaction receipt shown
 * after a successful approve or reject submission (Req 11.5, 12.5).
 *
 * Displays the ledger transaction id, the confirmation code, the recorded
 * status, and the ledger timestamp assigned by GenTax.
 */
export function ReceiptConfirmation({ receipt }: ReceiptConfirmationProps) {
  return (
    <Card title="GenTax Receipt">
      <dl
        aria-label="GenTax Receipt"
        role="status"
        className={cn("grid gap-1 text-sm", THEME_TOKENS.text.body)}
      >
        <div className="flex items-center justify-between gap-4">
          <dt className={THEME_TOKENS.text.muted}>Status</dt>
          <dd className="font-semibold capitalize">{receipt.status}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className={THEME_TOKENS.text.muted}>Confirmation Code</dt>
          <dd className="font-mono">{receipt.confirmationCode}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className={THEME_TOKENS.text.muted}>Transaction ID</dt>
          <dd className="font-mono">{receipt.transactionId}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className={THEME_TOKENS.text.muted}>Case ID</dt>
          <dd className="font-mono">{receipt.caseId}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className={THEME_TOKENS.text.muted}>Ledger Timestamp</dt>
          <dd className="tabular-nums">{receipt.ledgerTimestamp}</dd>
        </div>
      </dl>
    </Card>
  );
}

export interface DecisionActionsProps {
  /**
   * The current adjusted calculations (net tax owed, Final Auditor Balance,
   * valid line items and caps) driven by the AdjustmentTable. Folded into the
   * approve/reject payloads (Req 11.4, 12.4).
   */
  adjustedCalculations: AdjustedCalculations;
  /** Current caseworker notes value; when omitted the field is self-managed. */
  caseworkerNotes?: string;
  /** Called when the caseworker notes field changes (controlled usage). */
  onCaseworkerNotesChange?: (notes: string) => void;
  /**
   * Async submit function. Receives the assembled Auditor_Decision payload and
   * resolves to the GenTax receipt to display. When omitted, submission is a
   * no-op (the caller has not yet wired the Tax_Audit_API — task 10.3).
   */
  onSubmit?: (decision: AuditorDecision) => Promise<GenTaxReceipt>;
}

/**
 * DecisionActions — the binding HITL controls at the bottom of the
 * Adjudication_Console.
 *
 * Renders the caseworker notes field, the auditor signature input, the Article
 * 14 Compliance_Confirmation checkbox (Req 13.1), the Approve control (labeled
 * to indicate pushing to the GenTax ledger — Req 11.1) and the Reject control
 * (labeled to indicate escalation to a full audit — Req 12.1) with its
 * mandatory 1–2000 char rationale field (Req 12.2).
 *
 * Both binding actions are gated in state, not just visually: Approve is
 * enabled only when a signature is present AND the compliance box is checked
 * AND no submission is in flight (`canApprove` — Req 11.2, 11.3); Reject is
 * enabled only when the rationale is non-empty/non-whitespace AND no submission
 * is in flight (`canReject` — Req 12.3).
 *
 * On a successful submit the returned {@link GenTaxReceipt} is rendered via
 * {@link ReceiptConfirmation} (Req 11.5, 12.5). The full submission lifecycle
 * (30s timeout, failure retention, Article 14 defensive block) is layered on in
 * task 10.3; here submission builds the payload and awaits `onSubmit`.
 */
export function DecisionActions({
  adjustedCalculations,
  caseworkerNotes,
  onCaseworkerNotesChange,
  onSubmit,
}: DecisionActionsProps) {
  const [signature, setSignature] = useState("");
  const [complianceConfirmation, setComplianceConfirmation] = useState(false);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<GenTaxReceipt | null>(null);

  // Support both controlled (via `caseworkerNotes`/`onCaseworkerNotesChange`)
  // and self-managed notes so the console can drop the section in without
  // hoisting state (task 10.3 may hoist it).
  const [internalNotes, setInternalNotes] = useState("");
  const notes = caseworkerNotes ?? internalNotes;
  const setNotes = (next: string) => {
    if (onCaseworkerNotesChange) onCaseworkerNotesChange(next);
    else setInternalNotes(next);
  };

  const approveEnabled = canApprove({
    signature,
    complianceConfirmed: complianceConfirmation,
    submitting,
  });
  const rejectEnabled = canReject({ rationale, submitting });

  const submit = async (decision: AuditorDecision) => {
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      const result = await onSubmit(decision);
      setReceipt(result);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = () => {
    if (!approveEnabled) return;
    void submit(
      buildApprovedDecision({
        adjustedCalculations,
        caseworkerNotes: notes,
        auditorSignature: signature,
        complianceConfirmation,
      }),
    );
  };

  const handleReject = () => {
    if (!rejectEnabled) return;
    void submit(
      buildRejectedDecision({
        rationale,
        adjustedCalculations,
        caseworkerNotes: notes,
      }),
    );
  };

  const signatureId = "auditor-signature";
  const complianceId = "compliance-confirmation";
  const notesId = "caseworker-notes";
  const rationaleId = "reject-rationale";

  return (
    <Card title="Decision">
      <div className="grid gap-4">
        {/* Caseworker notes */}
        <div className="grid gap-1">
          <label
            htmlFor={notesId}
            className={cn("text-xs font-medium", THEME_TOKENS.text.muted)}
          >
            Caseworker Notes
          </label>
          <textarea
            id={notesId}
            value={notes}
            disabled={submitting}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className={cn(
              "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm",
              THEME_TOKENS.text.body,
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
              "focus-visible:ring-offset-1 focus-visible:ring-offset-white",
              submitting && "cursor-not-allowed opacity-50",
            )}
          />
        </div>

        {/* Auditor signature (required for approve) */}
        <div className="grid gap-1">
          <label
            htmlFor={signatureId}
            className={cn("text-xs font-medium", THEME_TOKENS.text.muted)}
          >
            Auditor Signature
          </label>
          <input
            id={signatureId}
            type="text"
            value={signature}
            disabled={submitting}
            onChange={(event) => setSignature(event.target.value)}
            className={cn(
              "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm",
              THEME_TOKENS.text.body,
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
              "focus-visible:ring-offset-1 focus-visible:ring-offset-white",
              submitting && "cursor-not-allowed opacity-50",
            )}
          />
        </div>

        {/* Article 14 Compliance_Confirmation (Req 13.1) */}
        <div className="flex items-start gap-2">
          <input
            id={complianceId}
            type="checkbox"
            checked={complianceConfirmation}
            disabled={submitting}
            onChange={(event) => setComplianceConfirmation(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#006436]"
          />
          <label
            htmlFor={complianceId}
            className={cn("text-xs leading-snug", THEME_TOKENS.text.body)}
          >
            {ARTICLE_14_CERTIFICATION_TEXT}
          </label>
        </div>

        {/* Approve — pushes the decision to the GenTax ledger (Req 11.1) */}
        <Button
          variant="primary"
          disabled={!approveEnabled}
          aria-disabled={!approveEnabled}
          onClick={handleApprove}
        >
          Approve &amp; Push to GenTax Ledger
        </Button>

        {/* Reject rationale + control (Req 12.1, 12.2) */}
        <div className="grid gap-2 border-t border-slate-200 pt-4">
          <div className="grid gap-1">
            <label
              htmlFor={rationaleId}
              className={cn("text-xs font-medium", THEME_TOKENS.text.muted)}
            >
              Rejection Rationale
            </label>
            <textarea
              id={rationaleId}
              value={rationale}
              disabled={submitting}
              maxLength={RATIONALE_MAX_LENGTH}
              onChange={(event) => setRationale(event.target.value)}
              rows={3}
              className={cn(
                "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm",
                THEME_TOKENS.text.body,
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
                "focus-visible:ring-offset-1 focus-visible:ring-offset-white",
                submitting && "cursor-not-allowed opacity-50",
              )}
            />
          </div>
          <Button
            variant="danger"
            disabled={!rejectEnabled}
            aria-disabled={!rejectEnabled}
            onClick={handleReject}
          >
            Reject &amp; Escalate to Full Audit
          </Button>
        </div>

        {/* Receipt confirmation on success (Req 11.5, 12.5) */}
        {receipt && <ReceiptConfirmation receipt={receipt} />}
      </div>
    </Card>
  );
}

// --- AdjudicationConsole (panel) ---------------------------------------------

export interface AdjudicationConsoleProps {
  /** The adjustment summary slice used by {@link AdjustmentSummary}. */
  adjustmentSummary: AdjustmentSummaryData;
  /** Editable deduction line items — consumed by the AdjustmentTable (task 9.5). */
  adjustmentLineItems: AdjustmentLineItem[];
  /** Editable cap percentages — consumed by the AdjustmentTable (task 9.5). */
  capPercentages: CapPercentage[];
  /** Read-only deterministic math inputs for recalculation (task 9.5). */
  deterministicMath: DeterministicMathBlock;
  /**
   * The current Final Auditor Balance. Before any edit this equals the AI
   * Recommended Adjustment (Req 9.3); the AdjustmentTable (task 9.5) updates it
   * as the auditor edits line items and caps.
   */
  finalAuditorBalance?: MonetaryValue;
  /**
   * Net tax owed to seed the AdjustmentTable's retained value before any edit
   * (Req 10.3, 10.6). Defaults to the AI Recommended Adjustment value so the
   * table's Net Tax Owed and the Final Auditor Balance card start aligned with
   * the AI recommendation (Req 9.3).
   */
  initialNetTaxOwed?: number;
  /**
   * Fired after each debounced recalculation with the current adjusted
   * calculations (valid line items, valid caps, net tax owed, Final Auditor
   * Balance). The DecisionActions section (task 9.8) reads this to build the
   * decision payload; the container may also observe it (Req 9.4).
   */
  onAdjustedCalculationsChange?: (calculations: AdjustedCalculations) => void;
  /**
   * Optional callback fired when the auditor submits a decision (approve or
   * reject). Wired by the DecisionActions section (task 9.8) and the Dashboard
   * container (task 10.x). Present here as a forward-compatible slot.
   */
  onSubmitDecision?: (decision: unknown) => void;
  /**
   * Async submit function passed to the built-in {@link DecisionActions}
   * section. Receives the assembled {@link AuditorDecision} and resolves to the
   * {@link GenTaxReceipt} rendered by {@link ReceiptConfirmation} (Req 11.5,
   * 12.5). When omitted, the default DecisionActions renders but submission is a
   * no-op until the container wires the Tax_Audit_API (task 10.3).
   */
  onSubmitDecisionAsync?: (
    decision: AuditorDecision,
  ) => Promise<GenTaxReceipt>;
  /**
   * Optional slot for a custom AdjustmentTable section. When omitted, the
   * built-in {@link AdjustmentTable} (task 9.5) is rendered. When provided, it
   * is rendered in place of the built-in table.
   */
  tableSlot?: ReactNode;
  /**
   * Optional slot for the DecisionActions / ReceiptConfirmation section
   * (task 9.8). Rendered below the adjustment table.
   */
  actionsSlot?: ReactNode;
}

/**
 * Build the AdjudicationConsole props directly from a {@link CasePacket}.
 * Convenience for the Dashboard container so it can pass a packet without
 * hand-picking each slice.
 */
export function adjudicationConsolePropsFromPacket(
  packet: CasePacket,
): Pick<
  AdjudicationConsoleProps,
  "adjustmentSummary" | "adjustmentLineItems" | "capPercentages" | "deterministicMath"
> {
  return {
    adjustmentSummary: packet.adjustmentSummary,
    adjustmentLineItems: packet.adjustmentLineItems,
    capPercentages: packet.capPercentages,
    deterministicMath: packet.deterministicMath,
  };
}

/**
 * Adjudication_Console — the right-hand panel. Composes the AdjustmentSummary
 * (this task) with slots for the AdjustmentTable (task 9.5) and the
 * DecisionActions / ReceiptConfirmation (task 9.8).
 */
export function AdjudicationConsole({
  adjustmentSummary,
  adjustmentLineItems,
  capPercentages,
  deterministicMath,
  finalAuditorBalance,
  initialNetTaxOwed,
  onAdjustedCalculationsChange,
  onSubmitDecisionAsync,
  tableSlot,
  actionsSlot,
}: AdjudicationConsoleProps) {
  // The Final Auditor Balance card is initialized to the AI Recommended
  // Adjustment (Req 9.3) and then driven by the AdjustmentTable as the auditor
  // edits line items and caps (Req 9.4). An explicit `finalAuditorBalance` prop
  // still takes precedence when supplied by the container.
  const [editedBalance, setEditedBalance] = useState<MonetaryValue | undefined>(
    undefined,
  );

  // Seed the table's retained net tax from the AI recommendation when the
  // container does not specify one, so the table and the summary card agree
  // before any edit (Req 9.3).
  const seedNetTax =
    initialNetTaxOwed ??
    adjustmentSummary.aiRecommendedAdjustment.value ??
    0;
  const balanceUnit = adjustmentSummary.aiRecommendedAdjustment.unit;

  // Retain the latest adjusted calculations so the built-in DecisionActions can
  // fold them into the approve/reject payloads (Req 11.4, 12.4). Seeded from the
  // summary/table so a decision can be built before any edit.
  const [latestCalculations, setLatestCalculations] =
    useState<AdjustedCalculations>(() => ({
      lineItems: adjustmentLineItems,
      capPercentages,
      netTaxOwed: seedNetTax,
      finalAuditorBalance: seedNetTax,
    }));

  const handleAdjustedCalculationsChange = (calc: AdjustedCalculations) => {
    // Reflect the recomputed Final Auditor Balance in the summary card,
    // preserving the summary's unit (Req 9.4).
    setEditedBalance({ value: calc.finalAuditorBalance, unit: balanceUnit });
    setLatestCalculations(calc);
    onAdjustedCalculationsChange?.(calc);
  };

  return (
    <section
      aria-label="Adjudication Console"
      className={cn(
        "flex h-full flex-col gap-6 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
        THEME_TOKENS.text.body,
      )}
    >
      <h2 className={cn("text-base font-semibold", THEME_TOKENS.text.body)}>
        Adjudication Console
      </h2>

      <AdjustmentSummary
        summary={adjustmentSummary}
        finalAuditorBalance={finalAuditorBalance ?? editedBalance}
      />

      {/* The editable AdjustmentTable (task 9.5). A custom `tableSlot` overrides
          the built-in table when provided. */}
      {tableSlot ?? (
        <AdjustmentTable
          lineItems={adjustmentLineItems}
          capPercentages={capPercentages}
          deterministicMath={deterministicMath}
          initialNetTaxOwed={seedNetTax}
          balanceUnit={balanceUnit}
          onAdjustedCalculationsChange={handleAdjustedCalculationsChange}
        />
      )}

      {/* DecisionActions / ReceiptConfirmation (task 9.8). A custom
          `actionsSlot` overrides the built-in section when provided. */}
      {actionsSlot ?? (
        <DecisionActions
          adjustedCalculations={latestCalculations}
          onSubmit={onSubmitDecisionAsync}
        />
      )}
    </section>
  );
}
