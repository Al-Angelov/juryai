/**
 * Application root for the Tax Audit Review Dashboard.
 *
 * Resolves the case identifier to load and renders the {@link Dashboard}
 * container beneath a presentational OmaVero / Finnish Tax Administration
 * (Verohallinto) top navigation header. The caseId is read from the `?caseId=`
 * URL query parameter when present, falling back to a known `awaiting_human`
 * fixture (`CASE-2024-0001`) so the dashboard renders a reviewable case out of
 * the box.
 */
import { Dashboard } from "./components/Dashboard.tsx";

/** Default case loaded when no `?caseId=` query parameter is supplied. */
const DEFAULT_CASE_ID = "CASE-2024-0001";

/** Read the caseId from the URL query string, falling back to the default. */
function resolveCaseId(): string {
  if (typeof window === "undefined") return DEFAULT_CASE_ID;
  const fromQuery = new URLSearchParams(window.location.search).get("caseId");
  return fromQuery && fromQuery.length > 0 ? fromQuery : DEFAULT_CASE_ID;
}

/**
 * Presentational top navigation header matching the Verohallinto portal.
 *
 * Full-width white bar with a forest-green bottom rule, the "my/tax" logomark,
 * language selectors, and a user status token. Purely presentational — the
 * language buttons and logout link are not wired to i18n or auth.
 */
function TopNavHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b-4 border-[#006436] bg-white px-8">
      {/* Logomark: "my" muted charcoal, "/tax" bold forest green. */}
      <div className="text-2xl font-semibold tracking-tight">
        <span className="text-[#4A5568]">my</span>
        <span className="font-bold text-[#006436]">/tax</span>
      </div>

      {/* Language selectors + user status (presentational only). */}
      <div className="flex items-center gap-6 text-sm">
        <nav aria-label="Language" className="flex items-center gap-2 text-[#4A5568]">
          <button type="button" className="font-semibold text-[#006436] hover:underline">
            Suomeksi
          </button>
          <span aria-hidden="true" className="text-slate-300">|</span>
          <button type="button" className="hover:text-[#006436] hover:underline">
            På svenska
          </button>
          <span aria-hidden="true" className="text-slate-300">|</span>
          <button type="button" className="hover:text-[#006436] hover:underline">
            In English
          </button>
        </nav>
        <div className="flex items-center gap-2 border-l border-slate-200 pl-6 text-[#0F172A]">
          <span aria-hidden="true">👤</span>
          <span className="font-medium">M. Virtanen</span>
          <span aria-hidden="true" className="text-slate-300">/</span>
          <button type="button" className="text-[#4A5568] hover:text-[#006436] hover:underline">
            Kirjaudu ulos
          </button>
        </div>
      </div>
    </header>
  );
}

function App() {
  const caseId = resolveCaseId();
  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-[#0F172A]">
      <TopNavHeader />
      <main className="flex-1">
        <Dashboard caseId={caseId} />
      </main>
    </div>
  );
}

export default App;
