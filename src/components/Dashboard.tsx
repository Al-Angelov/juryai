// Dashboard container — owns the case load / retry lifecycle for the Tax Audit
// Review Dashboard and composes the three panels once a reviewable case is
// loaded.
//
// Task 10.1 implemented the load / retry state machine. Task 10.3 layers on the
// decision-submission lifecycle (shared approve/reject SubmitState machine with
// a 30 s timeout, the Article 14 defensive block, and failure/timeout surfacing
// that preserves DecisionActions' entered values) and the final horizontal
// left/center/right panel layout. The three panels (Case_Context_Panel,
// Agent_Transparency_Tree, Adjudication_Console) are imported here by their
// documented named exports and rendered left → center → right (Req 15.4).
//
// LoadState machine (Requirements 1.1–1.6):
//
//   idle -> (caseId empty/absent) -> no_case      // render message, NO fetch (Req 1.6)
//   idle -> (caseId present)      -> loading       // issue fetchActiveCase (Req 1.1)
//   loading                                        // show LoadingIndicator (Req 1.2)
//   loading -> (resolve, status === awaiting_human) -> ready       // render panels (Req 1.3)
//   loading -> (resolve, other status)             -> unavailable  // message (Req 1.4)
//   loading -> (reject | >10s timeout)             -> error        // message + Retry (Req 1.5)
//   error   -> (retry)                             -> loading      // re-issue fetch (Req 1.5)
//
// _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchActiveCase, submitAuditorDecision } from "../api/taxAuditApi.js";
import type { CasePacket } from "../types/casePacket.ts";
import type { AuditorDecision, GenTaxReceipt } from "../types/decision.ts";
import { THEME_TOKENS } from "../lib/theme.ts";
import { ErrorPanel, LoadingIndicator, cn } from "./ui";
import { CaseContextPanel } from "./CaseContextPanel.tsx";
import { AgentTransparencyTree } from "./AgentTransparencyTree.tsx";
import {
  AdjudicationConsole,
  adjudicationConsolePropsFromPacket,
} from "./AdjudicationConsole.tsx";

/**
 * The states of the Dashboard's case-load machine.
 *
 * - `no_case`     — no caseId supplied; a "no case specified" message is shown
 *                   and no fetch is issued (Req 1.6).
 * - `loading`     — a fetchActiveCase request is in flight; a loading indicator
 *                   is shown (Req 1.2).
 * - `ready`       — the case resolved with status `awaiting_human`; the three
 *                   panels are rendered (Req 1.3).
 * - `unavailable` — the case resolved with a non-`awaiting_human` status; a
 *                   "not available for human review" message is shown (Req 1.4).
 * - `error`       — the fetch rejected or exceeded the 10 s timeout; an error
 *                   message and a Retry control are shown (Req 1.5).
 */
export type LoadState =
  | "no_case"
  | "loading"
  | "ready"
  | "unavailable"
  | "error";

/** The status that makes a case reviewable in the dashboard (Req 1.3, 1.4). */
const REVIEWABLE_STATUS = "awaiting_human";

/** Load timeout: the fetch must complete within this window (Req 1.5). */
export const LOAD_TIMEOUT_MS = 10_000;

/** Message shown when no case identifier is supplied (Req 1.6). */
export const NO_CASE_MESSAGE = "No case specified";

/** Message shown when the case is not in a reviewable status (Req 1.4). */
export const UNAVAILABLE_MESSAGE =
  "This case is not available for human review";

/** Message shown when the case fails to load or times out (Req 1.5). */
export const LOAD_ERROR_MESSAGE = "The case could not be loaded.";

/** A sentinel used to detect the 10 s timeout winning the Promise.race. */
const TIMEOUT_SENTINEL = Symbol("load-timeout");

/**
 * The states of the Dashboard's decision-submission machine (approve + reject
 * share one machine — Req 11.x/12.x).
 *
 * - `idle`       — no submission in flight; controls are enabled.
 * - `submitting` — a decision is being pushed to the Tax_Audit_API; the
 *                  in-flight control is disabled (Req 11.7, 12.4).
 * - `success`    — the API returned a GenTaxReceipt (Req 11.5, 12.5).
 * - `error`      — the submission failed or exceeded the 30 s timeout; the
 *                  control is re-enabled and entered values are retained
 *                  (Req 11.6, 12.6).
 *
 * The concrete field values (signature, compliance, calcs, rationale) live in
 * DecisionActions' own local state; this machine tracks only the lifecycle
 * phase of the Dashboard-owned submit wrapper. DecisionActions retains its
 * field values across a rejected `onSubmit`, so surfacing failure/timeout as a
 * rejection is what preserves those values (Req 11.6, 12.6).
 */
export type SubmitState = "idle" | "submitting" | "success" | "error";

/** Submission timeout: a decision submit must settle within this window (Req 11.8). */
export const SUBMIT_TIMEOUT_MS = 30_000;

/** Message shown when a decision submission exceeds the 30 s timeout (Req 11.8). */
export const SUBMIT_TIMEOUT_MESSAGE = "The decision submission timed out.";

/**
 * Message for the Article 14 defensive block (Req 13.4). Even though Approve is
 * gated in the UI, an approved decision that arrives with
 * `complianceConfirmation === false` is blocked here before the API is called.
 */
export const ARTICLE_14_REQUIRED_MESSAGE =
  "Article 14 compliance certification is required before approval.";

/** A sentinel used to detect the 30 s submit timeout winning the Promise.race. */
const SUBMIT_TIMEOUT_SENTINEL = Symbol("submit-timeout");

export interface DashboardProps {
  /**
   * The identifier of the case to load. When empty or absent, the dashboard
   * shows a "no case specified" message and issues no fetch (Req 1.6).
   */
  caseId?: string;
}

/** True when the caseId is a usable, non-empty identifier. */
function isPresentCaseId(caseId: string | undefined): caseId is string {
  return typeof caseId === "string" && caseId.length > 0;
}

/**
 * Dashboard — reads a `caseId` prop and drives the case-load / retry state
 * machine, rendering the three review panels once a reviewable case is loaded.
 */
export function Dashboard({ caseId }: DashboardProps) {
  const hasCaseId = isPresentCaseId(caseId);

  const [state, setState] = useState<LoadState>(
    hasCaseId ? "loading" : "no_case",
  );
  const [packet, setPacket] = useState<CasePacket | null>(null);

  // A monotonically increasing token identifying the current load attempt.
  // Incrementing it invalidates any in-flight load (unmount, caseId change, or
  // a retry), so a stale resolution — including the promise that lost the
  // Promise.race against the timeout — is ignored (guards setState-after-unmount
  // and stale results).
  const loadTokenRef = useRef(0);

  const runLoad = useCallback((id: string) => {
    const token = ++loadTokenRef.current;
    setState("loading");
    setPacket(null);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
      timeoutId = setTimeout(() => resolve(TIMEOUT_SENTINEL), LOAD_TIMEOUT_MS);
    });

    // Enforce the 10 s timeout via Promise.race against a timer (Req 1.5). On
    // timeout the in-flight fetch result is ignored (the token check below
    // discards a late resolution).
    Promise.race([fetchActiveCase(id), timeout])
      .then((result) => {
        if (token !== loadTokenRef.current) return; // stale / superseded
        if (result === TIMEOUT_SENTINEL) {
          setState("error");
          return;
        }
        const loaded = result as CasePacket;
        if (loaded.status === REVIEWABLE_STATUS) {
          setPacket(loaded);
          setState("ready");
        } else {
          setState("unavailable");
        }
      })
      .catch(() => {
        if (token !== loadTokenRef.current) return; // stale / superseded
        setState("error");
      })
      .finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      });
  }, []);

  // Trigger the load whenever the caseId changes. When there is no caseId we
  // transition to `no_case` and issue NO fetch (Req 1.6). Bumping the load
  // token on cleanup guards against setState after unmount and against stale
  // results from a superseded caseId.
  useEffect(() => {
    if (!hasCaseId) {
      loadTokenRef.current++;
      setState("no_case");
      setPacket(null);
      return;
    }
    runLoad(caseId);
    return () => {
      loadTokenRef.current++;
    };
  }, [caseId, hasCaseId, runLoad]);

  // Retry re-issues the fetch for the current caseId (Req 1.5).
  const handleRetry = useCallback(() => {
    if (isPresentCaseId(caseId)) {
      runLoad(caseId);
    }
  }, [caseId, runLoad]);

  // The shared approve/reject submission lifecycle phase (Req 11.x/12.x). The
  // in-flight field values are owned by DecisionActions; this only tracks the
  // Dashboard wrapper's phase (surfaced for observability / testing).
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  /**
   * Dashboard-owned submit wrapper passed to the AdjudicationConsole as
   * `onSubmitDecisionAsync` (which DecisionActions calls as `onSubmit`).
   *
   * It layers three concerns on top of `submitAuditorDecision`:
   *
   *   1. Article 14 defensive block (Req 13.4): an approved decision whose
   *      `complianceConfirmation` is false is rejected here WITHOUT calling the
   *      API and WITHOUT producing a receipt.
   *   2. 30 s timeout (Req 11.8): the API call races a 30 s timer; if the timer
   *      wins, the wrapper rejects with a timeout error.
   *   3. Success / failure surfacing (Req 11.5/12.5, 11.6/12.6): on success it
   *      resolves with the receipt so DecisionActions renders ReceiptConfirmation;
   *      on failure/timeout it REJECTS, so DecisionActions re-enables its control
   *      and retains its entered values (signature + compliance + calcs for
   *      approve; rationale for reject).
   */
  const handleSubmitDecision = useCallback(
    async (decision: AuditorDecision): Promise<GenTaxReceipt> => {
      const targetCaseId = isPresentCaseId(caseId) ? caseId : "";

      // (1) Article 14 defensive block (Req 13.4). Reject before any API call.
      if (
        decision.status === "approved" &&
        !decision.complianceConfirmation
      ) {
        setSubmitState("error");
        throw new Error(ARTICLE_14_REQUIRED_MESSAGE);
      }

      setSubmitState("submitting");

      // (2) 30 s timeout via Promise.race against a timer (Req 11.8).
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<typeof SUBMIT_TIMEOUT_SENTINEL>((resolve) => {
        timeoutId = setTimeout(
          () => resolve(SUBMIT_TIMEOUT_SENTINEL),
          SUBMIT_TIMEOUT_MS,
        );
      });

      try {
        const result = await Promise.race([
          submitAuditorDecision(targetCaseId, decision),
          timeout,
        ]);
        if (result === SUBMIT_TIMEOUT_SENTINEL) {
          // (3) timeout: reject so DecisionActions re-enables + retains values.
          setSubmitState("error");
          throw new Error(SUBMIT_TIMEOUT_MESSAGE);
        }
        // (3) success: resolve the receipt so DecisionActions shows it.
        setSubmitState("success");
        return result as GenTaxReceipt;
      } catch (err) {
        // (3) failure: reject so DecisionActions re-enables + retains values.
        setSubmitState("error");
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    },
    [caseId],
  );

  const shellClass = cn("min-h-full", THEME_TOKENS.text.body);

  if (state === "no_case") {
    return (
      <div className={shellClass} data-testid="dashboard">
        <div className="p-6" data-testid="dashboard-no-case">
          <p className={cn("text-sm", THEME_TOKENS.text.muted)}>
            {NO_CASE_MESSAGE}
          </p>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className={shellClass} data-testid="dashboard">
        <div className="p-6">
          <LoadingIndicator
            label="Loading case"
            data-testid="dashboard-loading"
          />
        </div>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className={shellClass} data-testid="dashboard">
        <div className="p-6" data-testid="dashboard-unavailable">
          <p className={cn("text-sm", THEME_TOKENS.text.muted)}>
            {UNAVAILABLE_MESSAGE}
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={shellClass} data-testid="dashboard">
        <div className="p-6">
          <ErrorPanel
            message={LOAD_ERROR_MESSAGE}
            onRetry={handleRetry}
            data-testid="dashboard-error"
          />
        </div>
      </div>
    );
  }

  // state === "ready": a reviewable CasePacket is loaded. Render the three
  // panels in a horizontal left → center → right layout (Req 1.3, 15.4):
  // CaseContextPanel (left), AgentTransparencyTree (center), AdjudicationConsole
  // (right). The container keeps data-testid="dashboard-panels".
  if (!packet) {
    // Defensive: `ready` always carries a packet, but guard the render path.
    return (
      <div className={shellClass} data-testid="dashboard">
        <div className="p-6">
          <LoadingIndicator label="Loading case" />
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} data-testid="dashboard">
      <div
        className="grid grid-cols-1 gap-8 p-8 lg:grid-cols-[25%_50%_25%]"
        data-testid="dashboard-panels"
        data-submit-state={submitState}
      >
        <CaseContextPanel
          subject={packet.subject}
          documents={packet.documents}
        />
        <AgentTransparencyTree casePacket={packet} />
        <AdjudicationConsole
          {...adjudicationConsolePropsFromPacket(packet)}
          onSubmitDecisionAsync={handleSubmitDecision}
        />
      </div>
    </div>
  );
}
