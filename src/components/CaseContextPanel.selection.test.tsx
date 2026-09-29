// Property test for default and explicit document selection in the
// Case_Context_Panel.
//
// The CaseContextPanel owns the document selection state, defaulting to the
// first document (Req 3.3). Selecting a switcher entry moves the selection to
// that document and the viewer shows that document's OCR text (Req 3.2).

import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { CaseContextPanel } from "./CaseContextPanel.tsx";
import type { ParsedDocument } from "../types/casePacket.ts";

describe("CaseContextPanel document selection", () => {
  // Feature: tax-audit-dashboard, Property 24: Default and explicit document selection
  it("selects the first document by default and moves selection on click", () => {
    fc.assert(
      fc.property(
        // A non-empty array of documents, each with a DISTINCT ocrText. The
        // index is appended to guarantee distinctness even when fast-check
        // generates duplicate base strings, so the viewer assertions are
        // unambiguous.
        fc
          .array(
            fc.record({
              label: fc.string(),
              // A token used to derive a distinct OCR text. Constrained to
              // alphanumerics so the rendered text has no leading/trailing or
              // collapsible whitespace, which keeps `toHaveTextContent`
              // (which normalizes whitespace) unambiguous.
              ocrSeed: fc.stringMatching(/^[a-zA-Z0-9]*$/),
            }),
            { minLength: 1, maxLength: 8 },
          )
          .chain((raw) => {
            const docs: ParsedDocument[] = raw.map((d, index) => ({
              label: d.label,
              // Guarantee a non-empty, distinct, whitespace-free OCR text per
              // document so the viewer always renders document-ocr-text (never
              // the "no parsed text" branch) and each document's text is unique.
              ocrText: `ocr-${index}-${d.ocrSeed}-end`,
              entities: [],
            }));
            // Pick an arbitrary target index within the generated documents.
            return fc
              .integer({ min: 0, max: docs.length - 1 })
              .map((targetIndex) => ({ docs, targetIndex }));
          }),
        ({ docs, targetIndex }) => {
          // Reset the DOM before each iteration so state from a previous run
          // (including one that threw) never bleeds into this render.
          cleanup();
          try {
            render(
              <CaseContextPanel
                subject={{ subjectId: "S-1" }}
                documents={docs}
              />,
            );

            const items = screen.getAllByTestId("document-switcher-item");
            expect(items).toHaveLength(docs.length);

            // Default selection: the first document is selected (Req 3.3).
            expect(items[0]).toHaveAttribute("data-selected", "true");
            expect(items[0]).toHaveAttribute("aria-current", "true");
            // And the viewer shows the first document's OCR text.
            expect(screen.getByTestId("document-ocr-text")).toHaveTextContent(
              docs[0].ocrText as string,
            );

            // Explicit selection: click the target switcher item (Req 3.2).
            fireEvent.click(items[targetIndex]);

            const itemsAfter = screen.getAllByTestId("document-switcher-item");
            // Selection moved to the target: only that item is selected.
            expect(itemsAfter[targetIndex]).toHaveAttribute(
              "data-selected",
              "true",
            );
            itemsAfter.forEach((item, index) => {
              if (index !== targetIndex) {
                expect(item).toHaveAttribute("data-selected", "false");
              }
            });

            // Viewer now shows the target document's OCR text (Req 3.2). Scope
            // to the viewer so we assert on the displayed text specifically.
            const viewer = screen.getByTestId("document-viewer");
            expect(
              within(viewer).getByTestId("document-ocr-text"),
            ).toHaveTextContent(docs[targetIndex].ocrText as string);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
