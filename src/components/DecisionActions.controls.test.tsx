// Example tests for the DecisionActions controls, labels, Article 14
// certification text, and the receipt confirmation shown on a successful submit.
//
// Feature: tax-audit-dashboard, task 9.9.
//
// Validates: Requirements 11.1, 11.2, 11.5, 12.1, 12.5, 13.1

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";

import {
  DecisionActions,
  ARTICLE_14_CERTIFICATION_TEXT,
} from "./AdjudicationConsole.tsx";
import type {
  AdjustedCalculations,
  GenTaxReceipt,
} from "../types/decision.ts";

afterEach(cleanup);

// Minimal adjusted calculations: no line items or caps, zeroed balances. This
// is enough to build an approve/reject payload without exercising the table.
const ac: AdjustedCalculations = {
  lineItems: [],
  capPercentages: [],
  netTaxOwed: 0,
  finalAuditorBalance: 0,
};

describe("DecisionActions controls, labels, and Article 14 text", () => {
  it("renders the Approve/Reject labels, the signature input, compliance checkbox, and Article 14 text", () => {
    render(<DecisionActions adjustedCalculations={ac} />);

    // Approve control indicates pushing to the GenTax ledger (Req 11.1).
    expect(
      screen.getByRole("button", { name: "Approve & Push to GenTax Ledger" }),
    ).toBeInTheDocument();

    // Reject control indicates escalation to a full audit (Req 12.1).
    expect(
      screen.getByRole("button", { name: "Reject & Escalate to Full Audit" }),
    ).toBeInTheDocument();

    // Auditor signature input + Article 14 compliance checkbox present (Req 11.2).
    expect(screen.getByLabelText("Auditor Signature")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();

    // The Article 14 Compliance_Confirmation certification text is rendered
    // (Req 13.1).
    expect(screen.getByText(ARTICLE_14_CERTIFICATION_TEXT)).toBeInTheDocument();
  });

  it("renders the GenTax receipt confirmation after a successful approve submission", async () => {
    const user = userEvent.setup();

    const receipt: GenTaxReceipt = {
      transactionId: "TX1",
      caseId: "C1",
      status: "approved",
      ledgerTimestamp: new Date().toISOString(),
      confirmationCode: "CONF1",
    };
    const onSubmit = () => Promise.resolve(receipt);

    render(<DecisionActions adjustedCalculations={ac} onSubmit={onSubmit} />);

    // Approve is gated on a signature AND the compliance checkbox (canApprove).
    await user.type(screen.getByLabelText("Auditor Signature"), "Jane Auditor");
    await user.click(screen.getByRole("checkbox"));

    await user.click(
      screen.getByRole("button", { name: "Approve & Push to GenTax Ledger" }),
    );

    // On success the returned receipt is rendered via ReceiptConfirmation
    // (Req 11.5, 12.5) — assert the confirmation code and transaction id show.
    expect(await screen.findByText("CONF1")).toBeInTheDocument();
    expect(screen.getByText("TX1")).toBeInTheDocument();
  });
});
