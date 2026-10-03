// Example (non-property) tests for the Dashboard decision-submission lifecycle
// and horizontal layout (task 10.4).
//
// These exercise the Dashboard-owned submit wrapper (`handleSubmitDecision`)
// and the panel layout end-to-end at the component level, with the
// Tax_Audit_API mocked so submission timing and outcomes are fully under test
// control:
//   - 15.4: the three panels render in DOM order left â†’ center â†’ right
//     (Case context, Agent Transparency Tree, Adjudication Console).
//   - 13.4: Article 14 gating â€” with a signature present but the compliance box
//     UNCHECKED, Approve is disabled and no submission is issued.
//   - 11.6: on an approve failure the entered signature + compliance are
//     retained and the Approve control is re-enabled.
//   - 12.6: on a reject failure the entered rationale is retained and the
//     Reject control is re-enabled.
//   - 11.8: a decision submit that never settles surfaces as a rejection after
//     the 30 s timeout, re-enabling the control and retaining values (driven
//     with fake timers).
//
// The API module is mocked with vi.mock so both fetchActiveCase and
// submitAuditorDecision are vi.fns. Real timers + userEvent defaults are used
// for the failure-retention tests (findBy*/waitFor await the async settle);
// fake timers are used only for the dedicated 30 s timeout test, where
// userEvent is configured with { advanceTimers: vi.advanceTimersByTime }.

import {
  render,
  screen,
  cleanup,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";

// Mock the Tax_Audit_API module so we control both API functions deterministically.
vi.mock("../api/taxAuditApi.js", () => ({
  fetchActiveCase: vi.fn(),
  submitAuditorDecision: vi.fn(),
  streamTrialEvents: vi.fn(),
}));

import { fetchActiveCase, submitAuditorDecision, streamTrialEvents } from "../api/taxAuditApi.js";
import { Dashboard, SUBMIT_TIMEOUT_MS } from "./Dashboard.tsx";
import type { CasePacket } from "../types/casePacket.ts";
import type { GenTaxReceipt } from "../types/decision.ts";

const mockFetchActiveCase = vi.mocked(fetchActiveCase);
const mockSubmitAuditorDecision = vi.mocked(submitAuditorDecision);
const mockStreamTrialEvents = vi.mocked(streamTrialEvents);

/**
 * Build a minimal, well-formed `awaiting_human` CasePacket. It carries at least
 * one adjustment line item and a non-empty adjustmentSummary so the
 * Adjudication_Console renders its AdjustmentTable and DecisionActions section
 * (the signature input, Article 14 checkbox, Approve/Reject controls). Other
 * collections are empty so unrelated panel logic is not exercised.
 */
function buildPacket(caseId = "CASE-1"): CasePacket {
  return {
    caseId,
    status: "awaiting_human",
    subject: { subjectId: "S" },
    documents: [],
    agentDebate: [],
    statutoryMatches: [],
    deterministicMath: {
      totalIncome: { value: 68_400, unit: "EUR" },
      allowableDeductionCap: { value: 5_000, unit: "EUR" },
      taxBracketAdjustments: [],
    },
    adjustmentSummary: {
      originalClaim: { value: 1_850, unit: "EUR" },
      aiRecommendedAdjustment: { value: 1_200, unit: "EUR" },
    },
    adjustmentLineItems: [
      { id: "li-1", label: "Work laptop", amount: 1_850, unit: "EUR" },
    ],
    capPercentages: [{ id: "cap-1", label: "Deduction cap", percentage: 50 }],
  } as CasePacket;
}

/** Render the Dashboard for a reviewable case and await the three panels. */
async function renderAndAwaitPanels(): Promise<HTMLElement> {
  const packet = buildPacket();
  // Stub both the streaming path (live mode) and the one-shot path (mock mode)
  // so the dashboard reaches "ready" regardless of VITE_USE_LIVE_BACKEND.
  mockStreamTrialEvents.mockResolvedValueOnce(packet);
  mockFetchActiveCase.mockResolvedValueOnce(packet);
  render(<Dashboard caseId="CASE-1" />);
  return screen.findByTestId("dashboard-panels");
}

// DecisionActions submits via `void submit(...)`, deliberately floating the
// promise; on a failed/timed-out submission that surfaces as an unhandled
// rejection at the process level even though the component correctly re-enables
// its control and retains values. These rejections are an expected consequence
// of the failure paths under test, so swallow them here to avoid polluting the
// run (and to prevent false positives from cross-test bleed).
function swallowExpectedRejection(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return (
    message === "boom" || message === "The decision submission timed out."
  );
}
const domRejectionHandler = (event: PromiseRejectionEvent) => {
  if (swallowExpectedRejection(event.reason)) event.preventDefault();
};
// Vitest surfaces floated rejections at the Node process level, so intercept
// there as well and re-throw only the unexpected ones.
const processRejectionHandler = (reason: unknown) => {
  if (!swallowExpectedRejection(reason)) throw reason;
};
beforeAll(() => {
  window.addEventListener("unhandledrejection", domRejectionHandler);
  process.on("unhandledRejection", processRejectionHandler);
});
afterAll(() => {
  window.removeEventListener("unhandledrejection", domRejectionHandler);
  process.off("unhandledRejection", processRejectionHandler);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard submission lifecycle & layout (Requirements 11.6, 11.8, 12.6, 13.4, 15.4)", () => {
  it("renders the three panels in DOM order left â†’ center â†’ right (Req 15.4)", async () => {
    const panels = await renderAndAwaitPanels();

    // Query the labeled panel sections in document order. Each panel exposes a
    // stable aria-label; querySelectorAll returns them in DOM (leftâ†’right) order.
    const labeled = Array.from(
      panels.querySelectorAll<HTMLElement>("[aria-label]"),
    );
    const order = labeled.map((el) => el.getAttribute("aria-label"));

    // The three review panels appear in the expected left â†’ center â†’ right order.
    const caseIdx = order.indexOf("Case context");
    const treeIdx = order.indexOf("Agent Transparency Tree");
    const consoleIdx = order.indexOf("Adjudication Console");

    expect(caseIdx).toBeGreaterThanOrEqual(0);
    expect(treeIdx).toBeGreaterThan(caseIdx);
    expect(consoleIdx).toBeGreaterThan(treeIdx);

    // Corroborate with document position: Case context precedes the tree, which
    // precedes the console.
    const caseEl = screen.getByLabelText("Case context");
    const treeEl = screen.getByLabelText("Agent Transparency Tree");
    const consoleEl = screen.getByLabelText("Adjudication Console");
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: the argument follows the node.
    expect(
      caseEl.compareDocumentPosition(treeEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      treeEl.compareDocumentPosition(consoleEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("disables Approve and issues no submission while the Article 14 box is unchecked (Req 13.4)", async () => {
    const user = userEvent.setup();
    await renderAndAwaitPanels();

    const approve = screen.getByRole("button", {
      name: /approve & push to gentax ledger/i,
    });

    // Type a signature but DO NOT check the compliance box. Approve is gated on
    // (signature present AND compliance checked), so it stays disabled.
    const signature = screen.getByLabelText("Auditor Signature");
    await user.type(signature, "Jane");

    expect(approve).toBeDisabled();

    // Attempting to click the gated control must not reach the API â€” the
    // Article 14 certification is enforced before any submission (Req 13.4).
    await user.click(approve);
    expect(mockSubmitAuditorDecision).not.toHaveBeenCalled();
  });

  it("retains signature + compliance and re-enables Approve on an approve failure (Req 11.6)", async () => {
    const user = userEvent.setup();
    await renderAndAwaitPanels();

    // The submit wrapper rejects once, simulating a failed push to GenTax.
    mockSubmitAuditorDecision.mockRejectedValueOnce(new Error("boom"));

    const signature = screen.getByLabelText("Auditor Signature");
    const compliance = screen.getByRole("checkbox");
    await user.type(signature, "Jane");
    await user.click(compliance);

    const approve = screen.getByRole("button", {
      name: /approve & push to gentax ledger/i,
    });
    expect(approve).toBeEnabled();
    await user.click(approve);

    // After the rejection settles, DecisionActions re-enables Approve.
    await waitFor(() => expect(approve).toBeEnabled());

    // Req 11.6: the submission was attempted and the entered values are retained.
    expect(mockSubmitAuditorDecision).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Auditor Signature")).toHaveValue("Jane");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("retains the rationale and re-enables Reject on a reject failure (Req 12.6)", async () => {
    const user = userEvent.setup();
    await renderAndAwaitPanels();

    mockSubmitAuditorDecision.mockRejectedValueOnce(new Error("boom"));

    const rationale = screen.getByLabelText("Rejection Rationale");
    await user.type(rationale, "Missing boarding-pass receipt.");

    const reject = screen.getByRole("button", {
      name: /reject & escalate to full audit/i,
    });
    expect(reject).toBeEnabled();
    await user.click(reject);

    // After the rejection settles, DecisionActions re-enables Reject.
    await waitFor(() => expect(reject).toBeEnabled());

    // Req 12.6: the entered rationale is retained across the failed submission.
    expect(mockSubmitAuditorDecision).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Rejection Rationale")).toHaveValue(
      "Missing boarding-pass receipt.",
    );
  });

  describe("submit timeout (Req 11.8)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("surfaces a never-settling submit as a rejection after the 30 s timeout, re-enabling Approve and retaining values (Req 11.8)", async () => {
      // Fake timers drive the 30 s submit timeout. userEvent is avoided under
      // fake timers (its internal awaits do not compose cleanly with a purely
      // synchronous timer advance); fireEvent applies the inputs synchronously.
      vi.useFakeTimers();

      // The mocked fetch resolves after a microtask; advanceTimersByTimeAsync
      // flushes the microtask queue so the panels can settle under fake timers.
      const packet = buildPacket();
      mockStreamTrialEvents.mockResolvedValueOnce(packet);
      mockFetchActiveCase.mockResolvedValueOnce(packet);
      render(<Dashboard caseId="CASE-1" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      screen.getByTestId("dashboard-panels");

      // The submit never settles â€” only the internal 30 s timeout can resolve
      // the race, surfacing as a rejection to DecisionActions.
      mockSubmitAuditorDecision.mockReturnValueOnce(
        new Promise<GenTaxReceipt>(() => {
          /* never settles */
        }),
      );

      const signature = screen.getByLabelText<HTMLInputElement>(
        "Auditor Signature",
      );
      const compliance = screen.getByRole<HTMLInputElement>("checkbox");
      fireEvent.change(signature, { target: { value: "Jane" } });
      fireEvent.click(compliance);

      const approve = screen.getByRole("button", {
        name: /approve & push to gentax ledger/i,
      });
      fireEvent.click(approve);

      // Let the click's submit wrapper enter its in-flight phase.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // While in flight the control is disabled.
      expect(approve).toBeDisabled();

      // Advance past the 30 s timeout window. The timer resolves the race with
      // the timeout sentinel; advanceTimersByTimeAsync flushes microtasks so the
      // wrapper's rejection propagates and DecisionActions re-enables.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS);
      });

      // Req 11.8: the control is re-enabled and the entered values are retained.
      expect(approve).toBeEnabled();
      expect(screen.getByLabelText("Auditor Signature")).toHaveValue("Jane");
      expect(screen.getByRole("checkbox")).toBeChecked();
    });
  });
});
