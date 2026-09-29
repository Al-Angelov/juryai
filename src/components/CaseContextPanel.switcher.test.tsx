// Property-based test for the DocumentSwitcher ordering invariant (task 6.5).
//
// Property 23 asserts that, for any list of documents, the switcher renders one
// entry per document with its provided label, in the exact order the documents
// appear in the CasePacket (Req 3.1). Labels may be empty strings or duplicates,
// so ordering is asserted positionally by index, never by uniqueness.

import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { DocumentSwitcher } from "./CaseContextPanel.tsx";
import type { ParsedDocument } from "../types/casePacket.ts";

// Documents whose labels may be empty or duplicated across the list; entities
// are irrelevant to this ordering property, so they are always empty.
const documentArb: fc.Arbitrary<ParsedDocument> = fc.record({
  label: fc.string(),
  ocrText: fc.option(fc.string(), { nil: undefined }),
  entities: fc.constant([]),
});

describe("DocumentSwitcher ordering", () => {
  it("lists all documents in packet order by their label", () => {
    // Feature: tax-audit-dashboard, Property 23: Document switcher lists all documents in packet order
    fc.assert(
      fc.property(fc.array(documentArb), (docs) => {
        render(
          <DocumentSwitcher
            documents={docs}
            selectedIndex={0}
            onSelect={() => {}}
          />,
        );

        const items = screen.queryAllByTestId("document-switcher-item");
        try {
          // One entry per document.
          expect(items).toHaveLength(docs.length);
          // Entries appear in the exact packet order, matched positionally.
          expect(items.map((el) => el.textContent)).toEqual(
            docs.map((d) => d.label),
          );
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 },
    );
  });
});
