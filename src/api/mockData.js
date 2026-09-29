// Mock dataset for the Tax Audit Review Dashboard.
//
// This module provides fixture CasePackets keyed by caseId. It is plain
// JavaScript with NO dependency on any IDE runtime or hosting utility
// (Requirement 14.3). The object shapes mirror the TypeScript interfaces in
// `src/types/casePacket.ts` and `src/types/decision.ts` (reference only) but
// this file imports nothing from them.
//
// The fixtures deliberately exercise the full CasePacket shape:
//   - subject metadata with sanitization statuses (active / inactive / absent)
//   - multiple documents with OCR text + entity chips carrying confidence
//   - agentDebate entries for all four canonical agents
//   - statutoryMatches with cited paragraphs, deduction claims, and risk flags
//   - deterministicMath with totalIncome / allowableDeductionCap /
//     taxBracketAdjustments
//   - adjustmentSummary, adjustmentLineItems, and capPercentages
//
// At least one fixture is NOT in "awaiting_human" status (CASE-2024-0099 is
// "closed") so the unavailable-status UI path can be exercised, and at least
// one fixture (CASE-2024-0002) omits many optional fields so the placeholder
// paths can be exercised.

/**
 * A rich, fully-populated case in `awaiting_human` status. Every optional field
 * is present, all four agents appear, there are multiple documents and multiple
 * statutory matches covering every risk-flag classification (including a claim
 * carrying multiple flags and a claim carrying none).
 */
const RICH_AWAITING_CASE = {
  caseId: "CASE-2024-0001",
  status: "awaiting_human",
  subject: {
    subjectId: "SUBJECT-4921",
    nameMasked: "active",
    ssnTokenized: "active",
  },
  documents: [
    {
      label: "Työsopimus 2024 (Employment Contract)",
      ocrText:
        "TYÖSOPIMUS\nTyönantaja: Nordic Software Oy\nTyöntekijä: [MASKED]\n" +
        "Alkamispäivä: 1.1.2024\nBruttopalkka: 68 400,00 EUR / vuosi\n" +
        "Toimipaikka: Helsinki, Suomi",
      entities: [
        { label: "#Employer:NordicSoftwareOy", confidence: 0.98 },
        { label: "#AnnualGrossSalary:68400EUR", confidence: 0.94 },
        { label: "#Workplace:Helsinki", confidence: 0.87 },
      ],
    },
    {
      label: "Kuitit - Työvälineet (Equipment Receipts)",
      ocrText:
        "OSTOKUITTI\nTuote: Kannettava tietokone (Work Laptop)\n" +
        "Hinta: 1 850,00 EUR\nPäiväys: 14.3.2024\nMyyjä: Verkkokauppa.com",
      entities: [
        { label: "#WorkLaptop", confidence: 0.91 },
        { label: "#Amount:1850EUR", confidence: 0.76 },
        { label: "#Vendor:Verkkokauppa", confidence: 0.63 },
      ],
    },
    {
      label: "Matkakululaskelma (Travel Expense Report)",
      ocrText:
        "MATKAKULUT 2024\nKohde: Tukholma, Ruotsi\nKuljetus: Lentokone\n" +
        "Kokonaiskulut: 2 400,00 EUR\nTarkoitus: Asiakastapaaminen",
      entities: [
        { label: "#TravelDestination:Stockholm", confidence: 0.82 },
        { label: "#TravelCost:2400EUR", confidence: 0.7 },
      ],
    },
  ],
  agentDebate: [
    {
      agent: "Ingestion_Agent",
      systemPrompt:
        "Parse uploaded documents into OCR text and extract candidate entities.",
      contextContract:
        "Input: raw document scans. Output: OCR text + entity chips with confidence.",
      reasoningOutput:
        "Parsed 3 documents. Extracted 8 entities. Flagged 2 low-confidence amounts for reviewer attention.",
    },
    {
      agent: "Reasoner_Agent",
      systemPrompt:
        "Map extracted entities to allowable deductions under Tuloverolaki with citations.",
      contextContract:
        "Input: entity chips + income context. Output: statutory matches with cited paragraphs.",
      reasoningOutput:
        "Identified work-equipment deduction (TVL 31 §) and commuting/travel deduction (TVL 93 §). Travel destination outside Finland requires additional scrutiny.",
    },
    {
      agent: "Critic_Agent",
      systemPrompt:
        "Verify each deduction claim, cross-check receipts, and raise risk flags.",
      contextContract:
        "Input: statutory matches + source documents. Output: verification + risk flags.",
      reasoningOutput:
        "Work-laptop claim verified against receipt. Travel deduction flagged: destination is Stockholm (counterfactual geography for a Helsinki commuting deduction) and no boarding-pass receipt attached.",
    },
    {
      agent: "Court_Clerk",
      systemPrompt:
        "Finalize the agent debate into a single recommendation for human review.",
      contextContract:
        "Input: reasoner claims + critic flags. Output: consolidated recommendation.",
      reasoningOutput:
        "Recommend approving the verified work-equipment deduction and rejecting the unverified travel deduction pending auditor confirmation.",
    },
  ],
  statutoryMatches: [
    {
      citedParagraph: "Tuloverolaki 31 § (Tulon hankkimisesta johtuvat menot)",
      deductionClaim:
        "Work laptop (1 850 EUR) as an expense incurred in acquiring income.",
      riskFlags: ["verified"],
    },
    {
      citedParagraph: "Tuloverolaki 93 § (Asunnon ja työpaikan väliset matkat)",
      deductionClaim:
        "Travel expenses to Stockholm (2 400 EUR) claimed as commuting deduction.",
      riskFlags: ["high-risk", "missing-receipt", "counterfactual-geography"],
    },
    {
      citedParagraph: "Tuloverolaki 95 § (Tulonhankkimisvähennys)",
      deductionClaim:
        "Standard income-acquisition deduction applied automatically.",
      riskFlags: [],
    },
  ],
  deterministicMath: {
    totalIncome: { value: 68400, unit: "EUR" },
    allowableDeductionCap: { value: 4200, unit: "EUR" },
    taxBracketAdjustments: [
      { label: "State income tax (progressive)", amount: { value: 12480, unit: "EUR" } },
      { label: "Municipal tax (Helsinki 18.0%)", amount: { value: 11540, unit: "EUR" } },
      { label: "Public broadcasting tax (Yle-vero)", amount: { value: 163, unit: "EUR" } },
    ],
  },
  adjustmentSummary: {
    originalClaim: { value: 4250, unit: "EUR" },
    aiRecommendedAdjustment: { value: 1850, unit: "EUR" },
  },
  adjustmentLineItems: [
    { id: "li-laptop", label: "Work laptop (TVL 31 §)", amount: 1850, unit: "EUR" },
    { id: "li-travel", label: "Travel to Stockholm (TVL 93 §)", amount: 2400, unit: "EUR" },
  ],
  capPercentages: [
    { id: "cap-equipment", label: "Equipment deduction cap", percentage: 100 },
    { id: "cap-travel", label: "Travel deduction cap", percentage: 75 },
  ],
};

/**
 * A sparse case in `awaiting_human` status that omits many optional fields, so
 * the "placeholder for missing value" UI paths can be exercised:
 *   - subject has no subjectId and no sanitization statuses (unknown badges)
 *   - one document has no OCR text, one entity has no confidence
 *   - the Court_Clerk agent is absent; another agent is missing fields
 *   - a statutory match is missing its cited paragraph and deduction claim
 *   - deterministic math values and a bracket amount are absent
 *   - summary values are absent
 */
const SPARSE_AWAITING_CASE = {
  caseId: "CASE-2024-0002",
  status: "awaiting_human",
  subject: {
    // subjectId absent => "unavailable" placeholder (Req 2.5)
    // nameMasked absent => unknown badge (Req 2.6)
    ssnTokenized: "inactive",
  },
  documents: [
    {
      label: "Skannattu asiakirja (Scanned Document)",
      // ocrText absent => "no parsed text" message (Req 3.5)
      entities: [
        { label: "#UnknownEntity" }, // confidence absent => "unavailable" (Req 4.5)
        { label: "#PartialAmount", confidence: 0.42 },
      ],
    },
    {
      label: "Tyhjä liite (Empty Attachment)",
      ocrText: "",
      entities: [], // empty => "no entities" message (Req 4.4)
    },
  ],
  agentDebate: [
    {
      agent: "Ingestion_Agent",
      systemPrompt: "Parse uploaded documents into OCR text and extract entities.",
      // contextContract absent => placeholder (Req 5.5)
      reasoningOutput: "Parsed 1 of 2 documents; second attachment was empty.",
    },
    {
      agent: "Critic_Agent",
      // systemPrompt, contextContract, reasoningOutput all absent => placeholders
    },
    // Reasoner_Agent and Court_Clerk absent => omitted from timeline (Req 5.1)
  ],
  statutoryMatches: [
    {
      // citedParagraph absent => placeholder (Req 6.5)
      // deductionClaim absent => placeholder (Req 6.5)
      riskFlags: ["missing-receipt"],
    },
  ],
  deterministicMath: {
    totalIncome: { value: 31200, unit: "EUR" },
    allowableDeductionCap: {}, // value absent => "unavailable" placeholder (Req 8.4)
    taxBracketAdjustments: [
      { label: "Municipal tax", amount: { value: 5616, unit: "EUR" } },
      { label: "Pending state adjustment", amount: {} }, // absent value => placeholder
    ],
  },
  adjustmentSummary: {
    originalClaim: {}, // value absent => placeholder (Req 9.5)
    aiRecommendedAdjustment: { value: 0, unit: "EUR" },
  },
  adjustmentLineItems: [
    { id: "li-misc", label: "Miscellaneous deduction", amount: 0, unit: "EUR" },
  ],
  capPercentages: [
    { id: "cap-standard", label: "Standard cap", percentage: 0 },
  ],
};

/**
 * A closed case. Its status is NOT "awaiting_human", so the Dashboard should
 * render the "not available for human review" path (Requirement 1.4). It is
 * still a complete, well-formed CasePacket so it can be fetched successfully.
 */
const CLOSED_CASE = {
  caseId: "CASE-2024-0099",
  status: "closed",
  subject: {
    subjectId: "SUBJECT-1007",
    nameMasked: "active",
    ssnTokenized: "inactive",
  },
  documents: [
    {
      label: "Lopullinen päätös (Final Decision)",
      ocrText: "Case closed. Decision recorded in GenTax ledger on 2024-02-01.",
      entities: [{ label: "#DecisionRecorded", confidence: 1 }],
    },
  ],
  agentDebate: [
    {
      agent: "Court_Clerk",
      systemPrompt: "Finalize the debate into a recommendation.",
      contextContract: "Input: prior claims. Output: recommendation.",
      reasoningOutput: "Case already adjudicated and closed.",
    },
  ],
  statutoryMatches: [
    {
      citedParagraph: "Tuloverolaki 31 §",
      deductionClaim: "Previously approved work-equipment deduction.",
      riskFlags: ["verified"],
    },
  ],
  deterministicMath: {
    totalIncome: { value: 54000, unit: "EUR" },
    allowableDeductionCap: { value: 3000, unit: "EUR" },
    taxBracketAdjustments: [
      { label: "State income tax", amount: { value: 9200, unit: "EUR" } },
    ],
  },
  adjustmentSummary: {
    originalClaim: { value: 3000, unit: "EUR" },
    aiRecommendedAdjustment: { value: 3000, unit: "EUR" },
  },
  adjustmentLineItems: [
    { id: "li-closed", label: "Approved deduction", amount: 3000, unit: "EUR" },
  ],
  capPercentages: [
    { id: "cap-closed", label: "Deduction cap", percentage: 100 },
  ],
};

/**
 * Fixture CasePackets keyed by caseId. The Tax_Audit_API resolves fetches
 * against this map and validates submissions against its keys.
 *
 * @type {Record<string, object>}
 */
export const MOCK_CASES = {
  [RICH_AWAITING_CASE.caseId]: RICH_AWAITING_CASE,
  [SPARSE_AWAITING_CASE.caseId]: SPARSE_AWAITING_CASE,
  [CLOSED_CASE.caseId]: CLOSED_CASE,
};

/**
 * Returns true when the given caseId corresponds to a known fixture.
 *
 * @param {string} caseId
 * @returns {boolean}
 */
export function hasCase(caseId) {
  return Object.prototype.hasOwnProperty.call(MOCK_CASES, caseId);
}

/**
 * Returns the fixture CasePacket for the given caseId, or undefined if unknown.
 *
 * @param {string} caseId
 * @returns {object | undefined}
 */
export function getCase(caseId) {
  return hasCase(caseId) ? MOCK_CASES[caseId] : undefined;
}
