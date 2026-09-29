// Shared light-mode theme tokens for the Tax Audit Review Dashboard.
//
// Implements the official OmaVero / Finnish Tax Administration (Verohallinto)
// light visual identity. Every panel (Case_Context_Panel,
// Agent_Transparency_Tree, Adjudication_Console) draws its background, surface,
// text, and accent styling from the single {@link THEME_TOKENS} map so the
// enterprise light theme stays consistent across the interface.
//
// Palette:
//   - canvas      warm ultra-light gray  #F8F9FA  (page base)
//   - surface     white                  #FFFFFF  (floating cards)
//   - accent      Vero Forest Green      #006436  (borders, primary, success)
//   - number      dark slate black       #0F172A  (critical figures)
//   - label       dark charcoal grey     #4A5568  (muted labels / captions)
//
// Body text must maintain a WCAG AA contrast ratio of at least 4.5:1 against its
// background. {@link BODY_TEXT_BACKGROUND_PAIRS} enumerates every body-text /
// background hex pairing used by the theme so the contrast property test
// (Property 27) can compute the ratios directly.
//
// _Requirements: 15.2_

/**
 * Shared Tailwind class-string tokens applied by every panel. Grouped by role:
 * page `background` (warm-white canvas), raised `surface` cards (white), `text`
 * weights, and `accent` for interactive/emphasis and success elements.
 *
 * The class strings correspond to the hex values enumerated in
 * {@link BODY_TEXT_BACKGROUND_PAIRS}:
 *   - background  -> #F8F9FA (canvas, Tailwind `bg-[#F8F9FA]`)
 *   - surface     -> #FFFFFF (white card)
 *   - text.body   -> slate-900 #0F172A (high-contrast numbers/body)
 *   - text.muted  -> #4A5568 (charcoal labels)
 *   - accent      -> #006436 (Vero forest green)
 */
export const THEME_TOKENS = {
  /** Page-level (outermost) warm ultra-light gray canvas. */
  background: "bg-[#F8F9FA]",
  /** Raised card/panel surface layered above the canvas. */
  surface: "bg-white",
  text: {
    /** Primary body text / high-contrast numbers (dark slate black). */
    body: "text-[#0F172A]",
    /** Secondary/muted text for labels and captions (dark charcoal grey). */
    muted: "text-[#4A5568]",
  },
  /** Accent color for interactive, emphasized, and success elements. */
  accent: "text-[#006436]",
  /** Accent used as a fill (e.g. primary buttons). */
  accentSurface: "bg-[#006436]",
} as const;

/** A body-text color paired with the background it is rendered against. */
export interface ColorPair {
  /** Body-text color as a `#rrggbb` hex string. */
  text: string;
  /** Background color the text sits on, as a `#rrggbb` hex string. */
  background: string;
}

/**
 * Every body-text / background color pairing used by the theme, expressed as
 * hex values so a WCAG contrast check can compute luminance ratios. Each pair is
 * guaranteed to meet the AA minimum contrast ratio of 4.5:1.
 *
 * Hex values mirror the Tailwind classes in {@link THEME_TOKENS}:
 *   - number/body text  slate-900 #0F172A
 *   - muted label text  charcoal  #4A5568
 *   - accent text       green     #006436
 *   - canvas background         #F8F9FA
 *   - surface (card) background #FFFFFF
 */
export const BODY_TEXT_BACKGROUND_PAIRS: readonly ColorPair[] = [
  // High-contrast numbers / body text on both background layers.
  { text: "#0F172A", background: "#F8F9FA" }, // ratio ~16.94:1
  { text: "#0F172A", background: "#FFFFFF" }, // ratio ~17.85:1
  // Muted charcoal labels on both background layers.
  { text: "#4A5568", background: "#F8F9FA" }, // ratio ~7.14:1
  { text: "#4A5568", background: "#FFFFFF" }, // ratio ~7.53:1
  // Forest-green accent text on both background layers.
  { text: "#006436", background: "#F8F9FA" }, // ratio ~6.93:1
  { text: "#006436", background: "#FFFFFF" }, // ratio ~7.30:1
] as const;
