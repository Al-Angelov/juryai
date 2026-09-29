// @vitest-environment node
//
// API portability smoke test (Task 3.4 — Requirement 14.3).
//
// Requirement 14.3 states the Tax_Audit_API module must run in a plain
// Node/browser context with NO dependency on any IDE internal runtime or
// hosting utility. This file forces the Vitest `node` environment via the
// docblock above (rather than the project-default `jsdom`), so the module is
// exercised with no DOM and no IDE-injected globals present — importing and
// running it here proves it is portable to a bare Node runtime.
//
// The test does two things:
//   1. Dynamic behaviour: imports the public API, confirms the exports are
//      functions, and drives one successful fetch and one successful submit
//      using only standard JavaScript values.
//   2. Static portability: reads the module source with Node's `fs` and asserts
//      it declares no forbidden IDE/runtime couplings and imports nothing other
//      than the local `./mockData.js`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fetchActiveCase, submitAuditorDecision } from "./taxAuditApi.js";

// A known-good fixture id and a well-formed valid decision payload. These use
// only plain JS primitives / objects — no framework or IDE constructs.
const KNOWN_CASE_ID = "CASE-2024-0001";

const VALID_APPROVED_PAYLOAD = {
  status: "approved",
  adjustedCalculations: { netTaxOwed: { value: 12480, unit: "EUR" } },
  caseworkerNotes: "Verified work-equipment deduction; portability smoke test.",
  timestamp: new Date().toISOString(),
};

// Simulated latency is ~300–800 ms; give the async assertions generous headroom
// so a slow CI machine never trips the timeout.
const ASYNC_TIMEOUT_MS = 10000;

describe("Tax_Audit_API portability (Requirement 14.3)", () => {
  it("exposes the public API as callable functions", () => {
    expect(typeof fetchActiveCase).toBe("function");
    expect(typeof submitAuditorDecision).toBe("function");
  });

  it(
    "runs fetchActiveCase in a plain Node context and resolves a packet",
    { timeout: ASYNC_TIMEOUT_MS },
    async () => {
      const packet = await fetchActiveCase(KNOWN_CASE_ID);
      expect(packet).toBeTruthy();
      expect(packet.caseId).toBe(KNOWN_CASE_ID);
    }
  );

  it(
    "runs submitAuditorDecision in a plain Node context and resolves a receipt",
    { timeout: ASYNC_TIMEOUT_MS },
    async () => {
      const receipt = await submitAuditorDecision(
        KNOWN_CASE_ID,
        VALID_APPROVED_PAYLOAD
      );
      expect(receipt).toBeTruthy();
      expect(receipt.caseId).toBe(KNOWN_CASE_ID);
      expect(receipt.status).toBe("approved");
      expect(typeof receipt.transactionId).toBe("string");
    }
  );

  it("does not run under a DOM/IDE-hosted environment", () => {
    // Forced `node` environment: no `window`/`document` globals exist. This
    // demonstrates the module was imported and executed above without relying
    // on any browser or IDE-provided runtime.
    expect(typeof (globalThis as Record<string, unknown>).window).toBe(
      "undefined"
    );
    expect(typeof (globalThis as Record<string, unknown>).document).toBe(
      "undefined"
    );
  });

  it("source references no IDE/runtime globals and imports only ./mockData.js", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "taxAuditApi.js"), "utf8");

    // No coupling to any IDE-internal runtime or hosting utility.
    const forbiddenPatterns: RegExp[] = [
      /\bkiro\b/i,
      /__KIRO/,
      /globalThis\.__/,
      /\brequire\s*\(/, // no CommonJS require in this ESM module
      /\bprocess\.(?!env\b)/, // process usage (env excepted) would couple to Node host specifics
    ];
    for (const pattern of forbiddenPatterns) {
      expect(
        pattern.test(source),
        `source unexpectedly matched forbidden pattern ${pattern}`
      ).toBe(false);
    }

    // The only import in the module is the local mock dataset. Collect every
    // static import specifier and assert it is exactly "./mockData.js".
    const importSpecifiers = [
      ...source.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g),
    ].map((m) => m[1]);

    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).toBe("./mockData.js");
    }
  });
});
