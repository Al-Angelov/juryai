import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { fetchActiveCase } from "./taxAuditApi.js";
import { MOCK_CASES } from "./mockData.js";

// The known fixture identifiers. fetchActiveCase must resolve each of these to
// a complete CasePacket.
const KNOWN_IDS = Object.keys(MOCK_CASES);

// Every field a resolved CasePacket must carry (Requirement 14.1). These mirror
// the CasePacket shape produced by the mock dataset.
const REQUIRED_PACKET_FIELDS = [
  "caseId",
  "status",
  "subject",
  "documents",
  "agentDebate",
  "statutoryMatches",
  "deterministicMath",
  "adjustmentSummary",
  "adjustmentLineItems",
  "capPercentages",
] as const;

// Feature: tax-audit-dashboard, Property 28: fetchActiveCase resolves valid ids to a complete CasePacket
// Validates: Requirements 14.1
//
// The API resolves after a simulated network latency (setTimeout). To keep the
// property fast across 100 runs, we use fake timers and flush the pending
// latency timer with vi.runAllTimersAsync() while the fetch promise is in
// flight — this exercises the real code path without paying real wall-clock
// latency.
describe("fetchActiveCase — Property 28: valid ids resolve to a complete CasePacket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    "resolves every known id to a packet carrying all required fields",
    { timeout: 120000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...KNOWN_IDS), async (id) => {
          const pending = fetchActiveCase(id);
          // Flush the simulated-latency timer so the promise can settle.
          await vi.runAllTimersAsync();
          const packet = await pending;
          expect(packet).toBeTruthy();
          // The resolved packet is the one keyed by the requested id.
          expect(packet.caseId).toBe(id);
          // Completeness: every required field is present.
          for (const field of REQUIRED_PACKET_FIELDS) {
            expect(packet[field as keyof typeof packet]).not.toBeUndefined();
          }
          // The collection fields are arrays.
          expect(Array.isArray(packet.documents)).toBe(true);
          expect(Array.isArray(packet.agentDebate)).toBe(true);
          expect(Array.isArray(packet.statutoryMatches)).toBe(true);
          expect(Array.isArray(packet.adjustmentLineItems)).toBe(true);
          expect(Array.isArray(packet.capPercentages)).toBe(true);
        }),
        { numRuns: 100 }
      );
    }
  );
});

// Feature: tax-audit-dashboard, Property 29: fetchActiveCase rejects invalid identifiers
// Validates: Requirements 14.5
describe("fetchActiveCase — Property 29: invalid identifiers are rejected", () => {
  // Invalid identifier generator covering the three rejection cases:
  //   - empty string
  //   - strings longer than the 128-char maximum
  //   - well-formed strings (1..128) that are not known fixtures
  const invalidIdArb: fc.Arbitrary<string> = fc.oneof(
    // empty
    fc.constant(""),
    // too long: length >= 129
    fc.string({ minLength: 129, maxLength: 256 }),
    // unknown but well-formed: length 1..128 and not a known id
    fc
      .string({ minLength: 1, maxLength: 128 })
      .filter((s) => !Object.prototype.hasOwnProperty.call(MOCK_CASES, s))
  );

  it(
    "rejects with a missing-or-unknown Error for empty, oversized, and unknown ids",
    { timeout: 120000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(invalidIdArb, async (id) => {
          await expect(fetchActiveCase(id)).rejects.toThrow(
            /missing or unknown/i
          );
        }),
        { numRuns: 100 }
      );
    }
  );
});
