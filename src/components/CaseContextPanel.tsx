// Case_Context_Panel (left panel) — pseudonymous citizen profile, PII
// sanitization badges, and (added by later tasks) the document switcher,
// document viewer, and entity chip list.
//
// This file owns the panel composition. Task 6.1 implements the SubjectProfile
// section; tasks 6.4 (DocumentSwitcher/DocumentViewer) and 6.8 (EntityChipList)
// slot their sections into the placeholders exposed here. The panel takes the
// relevant CasePacket slices as props so those later sections can be wired in
// without changing this component's public shape.
//
// _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

import { useState } from "react";
import type { ReactNode } from "react";
import type {
  EntityChip,
  ParsedDocument,
  SanitizationStatus,
  SubjectMetadata,
} from "../types/casePacket.ts";
import { Badge, Card, Tooltip, TooltipProvider, cn } from "./ui";
import type { SanitizationBadgeVariant } from "./ui";
import { formatConfidence } from "../lib/format.ts";
import { THEME_TOKENS } from "../lib/theme.ts";

/** Placeholder shown when the Identity_Firewall provides no Subject_ID (Req 2.5). */
export const SUBJECT_ID_UNAVAILABLE = "Subject ID unavailable";

/** Message shown when the CasePacket contains no documents (Req 3.4). */
export const DOCUMENT_EMPTY_MESSAGE = "No documents available";

/**
 * Message shown when the selected document has no OCR text parsed by the
 * Ingestion_Agent. The document stays selected in the switcher (Req 3.5).
 */
export const NO_PARSED_TEXT_MESSAGE =
  "No parsed text available for this document";

/** Message shown when the displayed document has no extracted entities (Req 4.4). */
export const NO_ENTITIES_MESSAGE = "No entities extracted from this document";

/**
 * Map a {@link SanitizationStatus} (or its absence) to the Badge variant that
 * renders it. An absent field resolves to the visually distinct `unknown`
 * state (Req 2.6):
 *   - "active"   -> "active"
 *   - "inactive" -> "inactive"
 *   - undefined  -> "unknown"
 *
 * Exported so the badge-mapping property test (Property 22) can assert the
 * mapping directly.
 */
export function sanitizationBadgeVariant(
  status: SanitizationStatus | undefined,
): SanitizationBadgeVariant {
  if (status === "active") return "active";
  if (status === "inactive") return "inactive";
  return "unknown";
}

/**
 * A single labeled sanitization badge (e.g. "Name Masked"). The badge encodes
 * its state in both a text label and a color treatment via the Badge primitive,
 * so the three states (active / inactive / unknown) are never distinguishable
 * by color alone (Req 2.4, 2.6).
 */
function SanitizationBadge({
  fieldLabel,
  status,
  testId,
}: {
  fieldLabel: string;
  status: SanitizationStatus | undefined;
  testId?: string;
}) {
  const variant = sanitizationBadgeVariant(status);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-xs", THEME_TOKENS.text.muted)}>{fieldLabel}</span>
      <Badge variant={variant} data-testid={testId} />
    </div>
  );
}

export interface SubjectProfileProps {
  /** Pseudonymous subject metadata from the Identity_Firewall. */
  subject: SubjectMetadata;
}

/**
 * SubjectProfile — renders the pseudonymous Subject_ID and the two PII
 * sanitization badges (Name Masked, SSN Tokenized).
 *
 * The Subject_ID is displayed exactly as received; when it is missing or empty
 * an "unavailable" placeholder is shown in its place (Req 2.1, 2.5). Each badge
 * resolves to active / inactive / unknown and is distinguishable by both label
 * and color (Req 2.2, 2.3, 2.4, 2.6).
 */
export function SubjectProfile({ subject }: SubjectProfileProps) {
  const hasSubjectId =
    typeof subject.subjectId === "string" && subject.subjectId.length > 0;

  return (
    <Card title="Subject Profile" data-testid="subject-profile">
      <div className="space-y-3">
        <div>
          <div className={cn("text-xs", THEME_TOKENS.text.muted)}>Subject ID</div>
          {hasSubjectId ? (
            <div
              className={cn("font-mono text-sm", THEME_TOKENS.text.body)}
              data-testid="subject-id"
            >
              {subject.subjectId}
            </div>
          ) : (
            <div
              className={cn("text-sm italic", THEME_TOKENS.text.muted)}
              data-testid="subject-id-placeholder"
            >
              {SUBJECT_ID_UNAVAILABLE}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <SanitizationBadge
            fieldLabel="Name Masked"
            status={subject.nameMasked}
            testId="badge-name-masked"
          />
          <SanitizationBadge
            fieldLabel="SSN Tokenized"
            status={subject.ssnTokenized}
            testId="badge-ssn-tokenized"
          />
        </div>
      </div>
    </Card>
  );
}

export interface DocumentSwitcherProps {
  /** Documents to list, rendered in the order they appear in the array (Req 3.1). */
  documents: ParsedDocument[];
  /** Index of the currently selected document (Req 3.2). */
  selectedIndex: number;
  /** Called with the newly selected index when the Auditor picks a document. */
  onSelect: (index: number) => void;
  /** Extra classes merged onto the switcher container. */
  className?: string;
}

/**
 * DocumentSwitcher — lists every document in packet order by its label
 * (Req 3.1). Each entry is a button; the selected entry is visually
 * distinguished and marked with `aria-current="true"` so the active document is
 * conveyed to assistive technology, not by color alone (Req 3.2).
 *
 * Selection state itself lives in {@link CaseContextPanel}; this component is
 * controlled via `selectedIndex` / `onSelect`.
 */
export function DocumentSwitcher({
  documents,
  selectedIndex,
  onSelect,
  className,
}: DocumentSwitcherProps) {
  return (
    <nav
      aria-label="Documents"
      data-testid="document-switcher"
      className={cn("flex flex-col gap-1", className)}
    >
      {documents.map((doc, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={index}
            type="button"
            aria-current={isSelected ? "true" : undefined}
            data-testid="document-switcher-item"
            data-selected={isSelected}
            onClick={() => onSelect(index)}
            className={cn(
              "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
              isSelected
                ? cn("bg-[#006436]/10 font-semibold", THEME_TOKENS.accent)
                : cn(
                    "hover:bg-slate-100",
                    THEME_TOKENS.text.muted,
                  ),
            )}
          >
            {doc.label}
          </button>
        );
      })}
    </nav>
  );
}

export interface DocumentViewerProps {
  /**
   * The currently selected document, or `undefined` when the CasePacket
   * contains no documents (Req 3.4).
   */
  document?: ParsedDocument;
  /**
   * Slot for the entity chips of the SELECTED document. Task 6.8 renders its
   * EntityChipList here, driven by `document.entities`. Left as an optional
   * ReactNode so 6.8 can wire in the chips without changing this component.
   */
  entityChipSlot?: ReactNode;
  /** Extra classes merged onto the viewer container. */
  className?: string;
}

/**
 * DocumentViewer — shows the selected document's OCR text as parsed by the
 * Ingestion_Agent (Req 3.2). When the CasePacket has no documents, it shows the
 * "no documents available" message (Req 3.4). When a document is selected but
 * has no OCR text, it shows the "no parsed text" message while the selection is
 * preserved in the switcher (Req 3.5).
 *
 * The entity chips for the selected document render in {@link entityChipSlot}
 * (task 6.8).
 */
export function DocumentViewer({
  document,
  entityChipSlot,
  className,
}: DocumentViewerProps) {
  // No documents in the CasePacket at all (Req 3.4).
  if (!document) {
    return (
      <div
        data-testid="document-viewer"
        className={cn("space-y-3", className)}
      >
        <p
          data-testid="document-empty-message"
          className={cn("text-sm italic", THEME_TOKENS.text.muted)}
        >
          {DOCUMENT_EMPTY_MESSAGE}
        </p>
      </div>
    );
  }

  const hasOcrText =
    typeof document.ocrText === "string" && document.ocrText.length > 0;

  return (
    <div data-testid="document-viewer" className={cn("space-y-3", className)}>
      {hasOcrText ? (
        <pre
          data-testid="document-ocr-text"
          className={cn(
            "whitespace-pre-wrap break-words font-mono text-sm",
            THEME_TOKENS.text.body,
          )}
        >
          {document.ocrText}
        </pre>
      ) : (
        // Selected document has no OCR text; the selection is preserved in the
        // switcher by the parent (Req 3.5).
        <p
          data-testid="document-no-parsed-text"
          className={cn("text-sm italic", THEME_TOKENS.text.muted)}
        >
          {NO_PARSED_TEXT_MESSAGE}
        </p>
      )}

      {/*
        Entity chip slot for the SELECTED document (task 6.8).
        6.8 will render an EntityChipList driven by `document.entities` here.
      */}
      {entityChipSlot}
    </div>
  );
}

export interface EntityChipListProps {
  /**
   * Entities extracted from the selected document by the Ingestion_Agent. An
   * empty list renders the "no entities" message (Req 4.4).
   */
  entities: EntityChip[];
}

/**
 * A single Entity_Chip. It renders the extracted entity label (Req 4.1) and is
 * a focusable element (a `<button>`) so the tooltip surfaces on BOTH pointer
 * hover and keyboard focus (Req 4.2). The tooltip content shows the label plus
 * the confidence formatted as a whole percent with a trailing "%", or the
 * shared unavailable indicator when the confidence is absent (Req 4.3, 4.5).
 */
function EntityChipItem({ entity }: { entity: EntityChip }) {
  const confidence = formatConfidence(entity.confidence);

  return (
    <Tooltip
      content={
        <span data-testid="entity-chip-tooltip">
          <span className="font-medium">{entity.label}</span>
          <span className={cn("ml-2", THEME_TOKENS.text.muted)}>{confidence}</span>
        </span>
      }
    >
      <button
        type="button"
        data-testid="entity-chip"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5",
          "text-xs font-medium transition-colors hover:bg-slate-100",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006436]",
          THEME_TOKENS.text.body,
        )}
      >
        {entity.label}
      </button>
    </Tooltip>
  );
}

/**
 * EntityChipList — renders one {@link EntityChipItem} per extracted entity for the
 * selected document (Req 4.1). Each chip carries a hover/focus tooltip showing
 * the label and its confidence percentage (Req 4.2, 4.3, 4.5). When the entity
 * list is empty, a "no entities" message is shown instead (Req 4.4).
 *
 * The chips are wrapped in a {@link TooltipProvider} here so the list works
 * whether or not an ancestor already provides one (Req 4.2).
 */
export function EntityChipList({ entities }: EntityChipListProps) {
  if (entities.length === 0) {
    return (
      <p
        data-testid="entity-chip-empty-message"
        className={cn("text-sm italic", THEME_TOKENS.text.muted)}
      >
        {NO_ENTITIES_MESSAGE}
      </p>
    );
  }

  return (
    <TooltipProvider>
      <div
        data-testid="entity-chip-list"
        className="flex flex-wrap gap-2"
      >
        {entities.map((entity, index) => (
          <EntityChipItem key={index} entity={entity} />
        ))}
      </div>
    </TooltipProvider>
  );
}

export interface CaseContextPanelProps {
  /** Pseudonymous subject metadata for the SubjectProfile section. */
  subject: SubjectMetadata;
  /**
   * Parsed documents for the DocumentSwitcher/DocumentViewer/EntityChipList
   * sections. Consumed by tasks 6.4 and 6.8; accepted here so wiring those
   * sections in does not change the panel's props shape. Defaults to an empty
   * list so the panel renders standalone before those tasks land.
   */
  documents?: ParsedDocument[];
  /** Extra classes merged onto the panel container. */
  className?: string;
  /**
   * Escape hatch used by later tasks to slot the document switcher, document
   * viewer, and entity chip list beneath the SubjectProfile without editing
   * this file's structure. Optional.
   */
  children?: ReactNode;
}

/**
 * Case_Context_Panel (left) — composes the pseudonymous citizen context.
 *
 * Currently renders the {@link SubjectProfile}. The DocumentSwitcher,
 * DocumentViewer (task 6.4) and EntityChipList (task 6.8) sections slot into the
 * marked placeholder region below, driven by the `documents` prop.
 */
export function CaseContextPanel({
  subject,
  documents = [],
  className,
  children,
}: CaseContextPanelProps) {
  // Selection state for the DocumentSwitcher/DocumentViewer. Defaults to the
  // first document, which is what gets shown when at least one document exists
  // (Req 3.3). When there are no documents, the index still reads 0 but
  // `selectedDocument` resolves to undefined and the viewer shows the empty
  // message (Req 3.4).
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);

  // Guard against a selection that falls outside the current document list
  // (e.g. the documents prop shrank). This keeps a valid document selected
  // rather than dropping the selection (Req 3.5 keeps selection alive).
  const safeIndex =
    documents.length > 0
      ? Math.min(selectedDocIndex, documents.length - 1)
      : 0;
  const selectedDocument =
    documents.length > 0 ? documents[safeIndex] : undefined;

  return (
    <section
      aria-label="Case context"
      data-testid="case-context-panel"
      data-document-count={documents.length}
      className={cn(
        "flex h-full flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
        THEME_TOKENS.text.body,
        className,
      )}
    >
      <SubjectProfile subject={subject} />

      {/*
        Documents section (task 6.4): the switcher lists documents in packet
        order and the viewer shows the selected document's OCR text. Task 6.8
        will render an EntityChipList for `selectedDocument` via the
        DocumentViewer `entityChipSlot` prop (pass `selectedDocument.entities`).
      */}
      <Card title="Documents" data-testid="documents-card">
        {documents.length > 0 ? (
          <div className="space-y-4">
            <DocumentSwitcher
              documents={documents}
              selectedIndex={safeIndex}
              onSelect={setSelectedDocIndex}
            />
            <DocumentViewer
              document={selectedDocument}
              entityChipSlot={
                selectedDocument ? (
                  <EntityChipList entities={selectedDocument.entities} />
                ) : undefined
              }
            />
          </div>
        ) : (
          <DocumentViewer document={undefined} />
        )}
      </Card>

      {/*
        Additional composition slot. `children` is an escape hatch for slotting
        sections without altering this file.
      */}
      {children}
    </section>
  );
}
