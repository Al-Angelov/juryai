// Example (non-property) tests for the Case_Context_Panel document empty
// states (task 6.7).
//
// These cover two acceptance criteria of Requirement 3:
//   - 3.4: a CasePacket with no documents shows the "no documents" message.
//   - 3.5: a selected document with no OCR text shows the "no parsed text"
//     message while the document remains selected in the switcher.

import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect } from "vitest";

import {
  CaseContextPanel,
  DOCUMENT_EMPTY_MESSAGE,
  NO_PARSED_TEXT_MESSAGE,
} from "./CaseContextPanel.tsx";
import type { ParsedDocument } from "../types/casePacket.ts";

afterEach(cleanup);

describe("CaseContextPanel document empty states", () => {
  it("shows the 'no documents' message when the CasePacket has no documents (Req 3.4)", () => {
    render(<CaseContextPanel subject={{ subjectId: "S-1" }} documents={[]} />);

    const message = screen.getByTestId("document-empty-message");
    expect(message).toHaveTextContent(DOCUMENT_EMPTY_MESSAGE);

    // With no documents there is nothing to switch between.
    expect(screen.queryAllByTestId("document-switcher-item")).toHaveLength(0);
  });

  it("shows the 'no parsed text' message and keeps the document selected when the selected document has no OCR text (Req 3.5)", async () => {
    const user = userEvent.setup();

    const documents: ParsedDocument[] = [
      // First document is selected by default (Req 3.3) and has no OCR text.
      { label: "Empty Doc", ocrText: undefined, entities: [] },
      // Second document has OCR text so we can confirm switching there and back.
      { label: "Text Doc", ocrText: "Parsed OCR content", entities: [] },
    ];

    render(
      <CaseContextPanel subject={{ subjectId: "S-1" }} documents={documents} />,
    );

    // The default-selected first document has no parsed text.
    expect(screen.getByTestId("document-no-parsed-text")).toHaveTextContent(
      NO_PARSED_TEXT_MESSAGE,
    );

    // ...and it remains selected in the switcher despite having no text.
    const itemsBefore = screen.getAllByTestId("document-switcher-item");
    expect(itemsBefore).toHaveLength(2);
    expect(itemsBefore[0]).toHaveAttribute("data-selected", "true");
    expect(itemsBefore[0]).toHaveAttribute("aria-current", "true");
    expect(itemsBefore[1]).toHaveAttribute("data-selected", "false");

    // Optional: switching to the second document shows its OCR text...
    await user.click(itemsBefore[1]);
    expect(screen.getByTestId("document-ocr-text")).toHaveTextContent(
      "Parsed OCR content",
    );
    expect(screen.queryByTestId("document-no-parsed-text")).toBeNull();

    const itemsAfterSwitch = screen.getAllByTestId("document-switcher-item");
    expect(itemsAfterSwitch[1]).toHaveAttribute("data-selected", "true");
    expect(itemsAfterSwitch[0]).toHaveAttribute("data-selected", "false");

    // ...and switching back keeps a valid selection with the empty-text message.
    await user.click(itemsAfterSwitch[0]);
    expect(screen.getByTestId("document-no-parsed-text")).toHaveTextContent(
      NO_PARSED_TEXT_MESSAGE,
    );
    const itemsAfterBack = screen.getAllByTestId("document-switcher-item");
    expect(itemsAfterBack[0]).toHaveAttribute("data-selected", "true");
    expect(itemsAfterBack[0]).toHaveAttribute("aria-current", "true");
  });
});
