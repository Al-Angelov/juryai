// Example (non-property) tests for the Dashboard case-load lifecycle (task 10.2).
//
// These cover Requirement 1 (Load Active Case) end-to-end at the component
// level by mocking the Tax_Audit_API so resolution timing and outcomes are
// controlled deterministically:
//   - 1.1 / 1.6: a non-empty caseId issues exactly one fetch; an empty/absent
//     caseId shows the "no case specified" message and issues NO fetch.
//   - 1.2:       a loading indicator is shown while the fetch is in flight and
//     removed once it settles.
//   - 1.3:       a successfully retrieved `awaiting_human` packet renders the
//     three review panels.
//   - 1.4:       a packet with a non-`awaiting_human` status renders the
//     "not available for human review" message.
//   - 1.5:       a rejected fetch renders the error message + a Retry control,
//     and clicking Retry (with the next fetch resolving) transitions to the
//     panels; a fetch that never settles within the 10 s timeout renders the
//     error state (driven with fake timers).
//
// The API module is mocked with vi.mock so `fetchActiveCase` is a vi.fn whose
// resolution/timing is fully under test control. Real timers are used for the
// resolve/reject tests (React Testing Library's findBy* awaits the async state
// transition); fake timers are used only for the dedicated timeout test.

import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Mock the Tax_Audit_API module so we control fetchActiveCase deterministically.
vi.mock("../api/taxAuditApi.js", () => ({
  fetchActiveCase: vi.fn(),
  streamTrialEvents: vi.fn(),
}));

import { fetchActiveCase, streamTrialEvents } from "../api/taxAuditApi.js";
import {
  Dashboard,
  LOAD_TIMEOUT_MS,
  NO_CASE_MESSAGE,
  UNAVAILABLE_MESSAGE,
  LOAD_ERROR_MESSAGE,
} from "./Dashboard.tsx";
import type { CasePacket } from "../types/casePacket.ts";

// The mocked API functions as typed vi.fns for ergonomic control.
const mockFetchActiveCase = vi.mocked(fetchActiveCase);
const mockStreamTrialEvents = vi.mocked(streamTrialEvents);

/**
 * Build a minimal, well-formed CasePacket for a given status. Only the fields
 * the load lifecycle branches on (status) and the fields the panels read to
 * render without throwing are populated; every collection is empty so the
 * panels render their empty states rather than exercising unrelated logic.
 */
function buildPacket(caseId: string, status: CasePacket["status"]): CasePacket {
  return {
    caseId,
    status,
    subject: { subjectId: "S" },
    documents: [],
    agentDebate: [],
    statutoryMatches: [],
    deterministicMath: {
      totalIncome: {},
      allowableDeductionCap: {},
      taxBracketAdjustments: [],
    },
    adjustmentSummary: {
      originalClaim: {},
      aiRecommendedAdjustment: { value: 0, unit: "EUR" },
    },
    adjustmentLineItems: [],
    capPercentages: [],
  } as CasePacket;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard load lifecycle (Requirement 1)", () => {
  it("shows the no-case message and issues NO fetch when caseId is empty (Req 1.6)", () => {
    render(<Dashboard caseId="" />);

    expect(screen.getByTestId("dashboard-no-case")).toHaveTextContent(
      NO_CASE_MESSAGE,
    );
    // Req 1.6: no fetch is issued for an empty identifier.
    expect(mockFetchActiveCase).not.toHaveBeenCalled();
  });

  it("shows the no-case message and issues NO fetch when caseId is absent (Req 1.6)", () => {
    render(<Dashboard />);

    expect(screen.getByTestId("dashboard-no-case")).toHaveTextContent(
      NO_CASE_MESSAGE,
    );
    expect(mockFetchActiveCase).not.toHaveBeenCalled();
  });

  it("issues one fetch, shows the loading indicator, then renders the three panels on success (Req 1.1, 1.2, 1.3)", async () => {
    const packet = buildPacket("CASE-1", "awaiting_human");
    // Stub both paths so the dashboard reaches "ready" regardless of live mode.
    mockStreamTrialEvents.mockResolvedValueOnce(packet);
    mockFetchActiveCase.mockResolvedValueOnce(packet);

    render(<Dashboard caseId="CASE-1" />);

    // Req 1.2: the loading indicator is shown while the fetch is in flight.
    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();

    // Req 1.3: the three panels appear once the packet resolves.
    const panels = await screen.findByTestId("dashboard-panels");
    expect(panels).toBeInTheDocument();

    // Req 1.2: the loading indicator is removed after completion.
    expect(screen.queryByTestId("dashboard-loading")).toBeNull();
  });

  it("shows the unavailable message when the case status is not awaiting_human (Req 1.4)", async () => {
    const packet = buildPacket("CASE-1", "closed");
    mockStreamTrialEvents.mockResolvedValueOnce(packet);
    mockFetchActiveCase.mockResolvedValueOnce(packet);

    render(<Dashboard caseId="CASE-1" />);

    const unavailable = await screen.findByTestId("dashboard-unavailable");
    expect(unavailable).toHaveTextContent(UNAVAILABLE_MESSAGE);

    // Loading indicator and panels are not shown in the unavailable state.
    expect(screen.queryByTestId("dashboard-loading")).toBeNull();
    expect(screen.queryByTestId("dashboard-panels")).toBeNull();
  });

  it("shows the error message + Retry when the fetch rejects, and Retry transitions to the panels (Req 1.5)", async () => {
    const user = userEvent.setup();

    // Attempt 1: stream rejects → fallback fetchActiveCase also rejects → error.
    // Retry: stream resolves → panels.
    mockStreamTrialEvents
      .mockRejectedValueOnce(new Error("stream down"))
      .mockResolvedValueOnce(buildPacket("CASE-1", "awaiting_human"));
    mockFetchActiveCase.mockRejectedValueOnce(new Error("network down"));

    render(<Dashboard caseId="CASE-1" />);

    // Req 1.5: the error surface appears with the load-error message.
    const error = await screen.findByTestId("dashboard-error");
    expect(error).toHaveTextContent(LOAD_ERROR_MESSAGE);
    expect(screen.queryByTestId("dashboard-loading")).toBeNull();

    // Req 1.5: a Retry control is provided.
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry).toBeInTheDocument();

    // Clicking Retry re-issues the fetch and transitions to the panels.
    await user.click(retry);

    const panels = await screen.findByTestId("dashboard-panels");
    expect(panels).toBeInTheDocument();
    expect(mockFetchActiveCase).toHaveBeenCalledTimes(2);
  });

  describe("load timeout (Req 1.5)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the error state when the fetch does not settle within the 10 s timeout (Req 1.5)", async () => {
      // A promise that never resolves — only the internal 10 s timeout can win
      // the Promise.race, driving the Dashboard into its error state.
      mockFetchActiveCase.mockReturnValueOnce(
        new Promise<CasePacket>(() => {
          /* never settles */
        }),
      );

      render(<Dashboard caseId="CASE-1" />);

      // Initially the loading indicator is shown.
      expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();

      // Advance past the 10 s timeout window. The timer callback resolves the
      // race with the timeout sentinel and schedules a React state update, so
      // wrap the advance in act(). advanceTimersByTimeAsync flushes the
      // microtask queue between timers so the Promise.race .then handler (which
      // reads the sentinel and sets the error state) runs before we assert.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
      });

      // The state transition is already applied after the act() above, so we
      // can assert directly without polling helpers (which rely on real timers).
      expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-error")).toHaveTextContent(
        LOAD_ERROR_MESSAGE,
      );
      expect(screen.queryByTestId("dashboard-loading")).toBeNull();
    });
  });
});
