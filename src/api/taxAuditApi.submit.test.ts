import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { submitAuditorDecision } from "./taxAuditApi.js";
import { MOCK_CASES } from "./mockData.js";

// Property tests for submitAuditorDecision (Requirement 14.2, 14.4, 14.6).
//
// Latency approach:
//   submitAuditorDecision resolves *successfully* only after a simulated
//   network latency in the [300, 800] ms window (see MIN/MAX_LATENCY_MS in
//   taxAuditApi.js). Rejections, by contrast, are produced synchronously —
//   validation happens before any latency is scheduled — so Properties 31 and
//   32 never pay the latency cost.
//
//   Only Property 30 awaits a real resolution. Rather than install fake timers
//   (which are awkward to drive across `fc.asyncProperty`'s awaited promises),
//   we keep numRuns at the required 100 and run against the real timer with a
//   generous per-test timeout. Worst case is 100 runs * 800 ms = 80 s, so the
//   120 s timeout leaves comfortable headroom.

/** The known, valid fixture case identifiers. */
const KNOWN_CASE_IDS = Object.keys(MOCK_CASES);

/** Picks one of the known-valid case identifiers. */
const knownCaseIdArb: fc.Arbitrary<string> = fc.constantFrom(...KNOWN_CASE_IDS);

/** A valid decision status. */
const validStatusArb: fc.Arbitrary<"approved" | "rejected"> = fc.constantFrom(
  "approved",
  "rejected",
);

/** A non-empty adjustedCalculations object. */
const adjustedCalculationsArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  lineItems: fc.array(
    fc.record({
      id: fc.string(),
      amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
    }),
    { maxLength: 6 },
  ),
  netTaxOwed: fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }),
});

/** An ISO 8601 timestamp string. */
const timestampArb: fc.Arbitrary<string> = fc
  .date({ noInvalidDate: true })
  .map((d) => d.toISOString());

// Feature: tax-audit-dashboard, Property 30: submitAuditorDecision resolves valid submissions to a receipt
//
// Validates: Requirements 14.2
//
// For any known-valid caseId and a fully-populated valid payload (status in
// {approved, rejected}, an adjustedCalculations object, a caseworkerNotes
// string, and an ISO timestamp string), submitAuditorDecision resolves to a
// GenTaxReceipt carrying transactionId, caseId, status, ledgerTimestamp, and
// confirmationCode, with caseId/status echoing the request.
describe("submitAuditorDecision — Property 30: resolves valid submissions to a receipt", () => {
  it(
    "resolves any valid submission to a well-formed GenTaxReceipt",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          knownCaseIdArb,
          validStatusArb,
          adjustedCalculationsArb,
          fc.string(),
          timestampArb,
          async (caseId, status, adjustedCalculations, caseworkerNotes, timestamp) => {
            const receipt = await submitAuditorDecision(caseId, {
              status,
              adjustedCalculations,
              caseworkerNotes,
              timestamp,
            });

            expect(receipt).toBeDefined();
            expect(typeof receipt.transactionId).toBe("string");
            expect(receipt.transactionId.length).toBeGreaterThan(0);
            expect(receipt.caseId).toBe(caseId);
            expect(receipt.status).toBe(status);
            expect(typeof receipt.ledgerTimestamp).toBe("string");
            expect(Number.isNaN(new Date(receipt.ledgerTimestamp).getTime())).toBe(false);
            expect(typeof receipt.confirmationCode).toBe("string");
            expect(receipt.confirmationCode.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// Feature: tax-audit-dashboard, Property 31: submitAuditorDecision rejects invalid status
//
// Validates: Requirements 14.4
//
// For any known-valid caseId and an otherwise-complete payload whose status is
// any string other than "approved"/"rejected", submitAuditorDecision rejects
// with an Error whose message includes "status is invalid". These rejections
// are synchronous (no latency), so 100 runs complete quickly.
describe("submitAuditorDecision — Property 31: rejects invalid status", () => {
  it(
    "rejects any status not in {approved, rejected} with a status-invalid error",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          knownCaseIdArb,
          fc.string().filter((s) => s !== "approved" && s !== "rejected"),
          adjustedCalculationsArb,
          fc.string(),
          timestampArb,
          async (caseId, status, adjustedCalculations, caseworkerNotes, timestamp) => {
            await expect(
              submitAuditorDecision(caseId, {
                status,
                adjustedCalculations,
                caseworkerNotes,
                timestamp,
              }),
            ).rejects.toThrow(/status is invalid/);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// Feature: tax-audit-dashboard, Property 32: submitAuditorDecision rejects missing required fields and produces no receipt
//
// Validates: Requirements 14.6
//
// For any known-valid caseId, a valid status, and a payload that omits exactly
// one of adjustedCalculations / caseworkerNotes / timestamp, submitAuditorDecision
// rejects with an Error message "<field> is required" and produces NO receipt.
// These rejections are synchronous (no latency).
describe("submitAuditorDecision — Property 32: rejects missing required fields and produces no receipt", () => {
  const REQUIRED_FIELDS = ["adjustedCalculations", "caseworkerNotes", "timestamp"] as const;

  it(
    "rejects with '<field> is required' and returns no receipt when a required field is omitted",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          knownCaseIdArb,
          validStatusArb,
          adjustedCalculationsArb,
          fc.string(),
          timestampArb,
          fc.constantFrom(...REQUIRED_FIELDS),
          async (
            caseId,
            status,
            adjustedCalculations,
            caseworkerNotes,
            timestamp,
            omittedField,
          ) => {
            // Assemble a fully-valid payload, then delete exactly one field.
            const payload: Record<string, unknown> = {
              status,
              adjustedCalculations,
              caseworkerNotes,
              timestamp,
            };
            delete payload[omittedField];

            let receipt: unknown;
            let rejected = false;
            let message = "";
            try {
              receipt = await submitAuditorDecision(caseId, payload);
            } catch (err) {
              rejected = true;
              message = err instanceof Error ? err.message : String(err);
            }

            // It must reject, name the omitted field, and produce no receipt.
            expect(rejected).toBe(true);
            expect(message).toBe(`${omittedField} is required`);
            expect(receipt).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
