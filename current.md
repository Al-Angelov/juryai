# JuryAI — Current System Archetype
**Assessment date:** October 2026  
**Author:** Kiro — Expert Full-Stack Architect & AI Governance Lead  
**Purpose:** Complete technical state-of-play, what works, what doesn't, and what is required for a production-quality IBM demo.

---

## 1. Repository Structure

```
juryai/
├── src/                        ← Vite + React 19 + TypeScript (OmaVero UI)
│   ├── api/
│   │   ├── taxAuditApi.js      ← API gateway (mock-first, live-mode optional)
│   │   ├── taxAuditApi.d.ts    ← Ambient types for the JS module
│   │   └── mockData.js         ← Finnish tax-audit fixture CasePackets
│   ├── components/
│   │   ├── Dashboard.tsx       ← Load/retry/submit lifecycle orchestrator
│   │   ├── CaseContextPanel.tsx
│   │   ├── AgentTransparencyTree.tsx
│   │   ├── AdjudicationConsole.tsx
│   │   └── ui/                 ← Shared primitives (Badge, Card, Button, etc.)
│   ├── lib/
│   │   ├── theme.ts            ← OmaVero light-palette design tokens
│   │   ├── agentOrder.ts       ← Canonical agent ordering
│   │   ├── validation.ts       ← Field-level numeric validation
│   │   ├── recalculation.ts    ← Client-side net-tax engine
│   │   ├── decision.ts         ← Decision payload builders + gating predicates
│   │   └── format.ts           ← Confidence / monetary formatters
│   ├── types/
│   │   ├── casePacket.ts       ← Tax-audit CasePacket TypeScript interfaces
│   │   └── decision.ts         ← AuditorDecision + GenTaxReceipt interfaces
│   ├── hooks/                  ← (none in current Vite app)
│   └── App.tsx                 ← Root: OmaVero header + Dashboard
│
├── juryai/                     ← Sovereign Python decision-assurance engine
│   ├── main.py                 ← FastAPI router (/api/v1/*), NDJSON streaming
│   ├── middleware.py           ← Zero-trust identity firewall + counterfactual engine
│   ├── agents.py               ← Compartmentalized LLM witness agents
│   ├── clerk.py                ← Deterministic CasePacket assembler (CourtClerk)
│   ├── store.py                ← Dual-mode persistence (MongoDB or in-memory)
│   ├── .env                    ← LLM routing + optional Mongo config
│   ├── requirements.txt        ← Minimal Python deps (fastapi, openai, motor…)
│   ├── tests/test_trial.py     ← Full offline test suite (TestClient, no LLM needed)
│   └── examples/
│       ├── sample_case.json    ← Canonical loan-audit test payload
│       └── run_trial.sh        ← cURL helper script
│
├── backend/                    ← FastAPI host process (mounts juryai router)
│   ├── server.py               ← MongoDB status stub + mounts juryai_router
│   ├── .env                    ← MONGO_URL + DB_NAME + CORS_ORIGINS
│   ├── requirements.txt        ← Extended production deps (litellm, google-genai…)
│   ├── seed.py                 ← Broken seed script (syntax error, wrong URL)
│   └── tests/backend_test.py  ← Integration test suite (requires running server)
│
├── tests/                      ← Root-level placeholder (empty __init__.py)
├── package.json                ← Vite app scripts + npm deps
├── vite.config.ts              ← Vite + Vitest configuration
├── tailwind.config.js          ← Tailwind v3 configuration
├── tsconfig.json               ← TypeScript strict project references
├── index.html                  ← Vite entry point
└── current.md                  ← This document
```

---

## 2. Full System Archetype

The system has **two independent, currently unconnected applications** built on different domains:

### 2.1 The Vite Frontend — `src/` (Tax-Audit Domain)

A fully self-contained React 19 + TypeScript + Vite single-page application implementing a **Finnish Verohallinto (OmaVero) Tax Audit Review Dashboard**. It is a citizen tax-deduction auditing UI, not a loan-assessment UI. Its data domain is entirely fictional Finnish tax cases (Finnish statute citations, EUR amounts, employment contracts, Tuloverolaki paragraphs).

The frontend runs **entirely off local mock data** by default. It has never been connected to the Python backend in a live, functioning state.

**Runtime model:**
1. `App.tsx` renders the OmaVero header and a `<Dashboard caseId>`.
2. `Dashboard.tsx` calls `fetchActiveCase(caseId)` from `taxAuditApi.js`.
3. `taxAuditApi.js` returns a Finnish tax fixture from `mockData.js` (simulated 300–800ms latency).
4. On success the three panels render. The user can edit adjustment figures; `recalculation.ts` recomputes net tax locally. The user can approve or reject; `Dashboard.tsx` calls `submitAuditorDecision()` which returns a mock GenTaxReceipt.
5. **No HTTP ever leaves the browser** unless `VITE_USE_LIVE_BACKEND=true` is explicitly set.

### 2.2 The Python Backend — `juryai/` + `backend/` (Loan-Audit Domain)

A completely separate, standalone FastAPI service implementing **AI-governed loan application auditing**. Its data domain is financial creditworthiness assessment (DTI ratios, credit scores, postal counterfactual sensitivity). This is the actual AI Governance platform.

**Runtime model:**
1. `backend/server.py` starts as the host process. It connects to MongoDB, registers `/api/status`, and then **mounts the full `juryai` router** at `/api/v1`.
2. `juryai/main.py` serves 8 routes (see §4). The critical one: `POST /api/v1/trials/run` accepts a `TrialRunRequest` and streams back 11 typed NDJSON events.
3. The pipeline: identity firewall (`middleware.py`) strips PII → 2 isolated LLM witness agents + 1 bias challenger (`agents.py`) → deterministic counterfactual test (`middleware.py`) → CourtClerk assembles `CasePacket` (`clerk.py`) → mandatory human handoff (`status = "awaiting_human"`).
4. `store.py` persists everything to MongoDB if configured, otherwise in-memory.
5. The final step is always human: `POST /api/v1/trials/{id}/decision` records approve/decline/refer_back.

---

## 3. UI: Color Palette & Visual Structure

### 3.1 OmaVero Light Theme (implemented)

| Token | Hex | Tailwind Class | Role |
|---|---|---|---|
| Canvas | `#F8F9FA` | `bg-[#F8F9FA]` | Full-screen page background |
| White surface | `#FFFFFF` | `bg-white` | Floating panel cards |
| Inset card | `#F8F9FA` | `bg-[#F8F9FA]` | Content cards inside panels |
| Forest green | `#006436` | `bg-[#006436]` | Border-b on header, primary button fill, accent text |
| Slate black | `#0F172A` | `text-[#0F172A]` | Critical numbers, body text |
| Charcoal | `#4A5568` | `text-[#4A5568]` | Muted labels, captions |
| Deep green hover | `#00522c` | `hover:bg-[#00522c]` | Primary button hover |
| Red (danger) | `border-red-500` | — | Reject/escalate button (outline) |

All text/background pairs are **WCAG AA compliant** (minimum 4.5:1 measured and verified by Property 27 in `theme.test.ts`). Full ratios: slate-black-on-canvas 16.94:1, charcoal-on-white 7.53:1, forest-green-on-white 7.30:1.

### 3.2 Header

```
┌─────────────────────────────────────────────────────────┐
│  my/tax           Suomeksi | På svenska | In English  👤 M. Virtanen / Kirjaudu ulos │
│──────────────────────── border-b-4 border-[#006436] ─────────────────────────────────│
```

Full-width white `h-16` bar. "my" in charcoal `#4A5568`, "/tax" in bold forest green `#006436`. Presentational only — no routing or auth wired.

### 3.3 Three-Panel Grid Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER (100% width)                                                    │
├──────────────┬────────────────────────────────┬─────────────────────────┤
│  LEFT 25%    │       CENTER 50%               │       RIGHT 25%         │
│              │                                │                         │
│  Case        │  Agent Transparency Tree       │  Adjudication Console   │
│  Context     │  (Agent timeline, statutory    │  (Summary cards,        │
│  Panel       │   matches, deterministic math) │   adjustment table,     │
│  (Subject,   │                                │   decision controls)    │
│   Documents, │                                │                         │
│   Entities)  │                                │                         │
└──────────────┴────────────────────────────────┴─────────────────────────┘
```

Grid: `grid-cols-[25%_50%_25%] gap-8 p-8`. Each column is a floating white card (`rounded-xl border border-slate-200 bg-white shadow-sm p-6`). Content sections inside each panel use `#F8F9FA` inset Cards (`border border-slate-200`).

### 3.4 Typography

- Font: system sans-serif stack (no web font loaded). Inter or equivalent is specified in the design but not yet bundled.
- Hierarchy: `font-semibold text-[#0F172A]` for values/headings, `text-[#4A5568]` for labels, `font-mono` for IDs and codes.
- Line heights and padding are generous (min 24px padding via `p-6`).

---

## 4. Backend Architecture: How It Works

### 4.1 Route Map (`/api/v1/*` — all from `juryai/main.py`)

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness probe; echoes LLM config |
| `GET` | `/api/v1/llm/status` | Probes `LOCAL_LLM_URL`; returns `mode: live\|offline_fallback` |
| `POST` | `/api/v1/trials/run` | **Full streaming trial** — streams 11 NDJSON events |
| `POST` | `/api/v1/trials/run-sync` | Same pipeline, single JSON response (CasePacket) |
| `GET` | `/api/v1/trials` | Lists persisted trials, newest first |
| `GET` | `/api/v1/trials/{id}` | Retrieves a CasePacket by `trial_id` |
| `GET` | `/api/v1/trials/{id}/events` | Replays the full ordered event trail |
| `POST` | `/api/v1/trials/{id}/decision` | Records human final decision; 409 if already closed |

Plus `backend/server.py` adds: `GET /api/`, `POST /api/status`, `GET /api/status` (MongoDB health/status checks).

### 4.2 Trial Pipeline (the 11 NDJSON events)

```
trial.started
    │
    ▼ middleware.py (deterministic, no LLM)
firewall.applied        ← PII stripped, SUBJECT-XXXX token issued

    ▼ agents.py (concurrent async)
agent.started × 2       ← DecisionWitnessAgent + FactCheckerAgent manifests declared
agent.completed × 2     ← Findings (LLM if reachable, else deterministic fallback)

    ▼ middleware.py (deterministic, no LLM)
counterfactual.evaluated ← Postal geography proxy test; detects outcome flips

    ▼ agents.py (isolated)
agent.started           ← BiasPrivacyChallengerAgent manifest
agent.completed         ← Residual PII + proxy sensitivity verdict

    ▼ clerk.py (deterministic, no LLM)
clerk.compiled          ← risk_level + aggregated_risk_flags

    ▼ enforced stop
trial.awaiting_human    ← CasePacket sealed; status = "awaiting_human"; human MUST act
```

### 4.3 LLM Integration

Agents call `AsyncOpenAI(base_url=LOCAL_LLM_URL)` — any OpenAI-compatible server (vLLM, Ollama, LM Studio, llama.cpp). Current `.env` points at `http://localhost:8000/v1` with `mock-key`. **If unreachable, every agent gracefully returns a fully deterministic fallback finding** with `used_llm: false`. The pipeline completes and produces a valid `CasePacket` in either mode. This is the "Sovereign Offline Mode" guarantee.

### 4.4 Persistence

`store.py` is dual-mode:
- **In-memory** (default when `MONGO_URL` not set): process-scoped, lost on restart.
- **MongoDB** (`motor` async driver): persistent across restarts. `backend/.env` configures `mongodb://localhost:27017`, `DB_NAME=test_database`. Collections: `juryai_case_packets`, `juryai_audit_events`.

---

## 5. What Currently Works ✅

| Component | Status |
|---|---|
| Vite frontend — full build | ✅ `npm run build` exits 0, zero errors |
| Vite frontend — 78/78 Vitest tests | ✅ All property tests and contract tests pass |
| OmaVero light theme | ✅ WCAG AA compliant, Property 27 green |
| Three-panel responsive layout | ✅ 25/50/25 grid, floating white cards |
| OmaVero top navigation header | ✅ Presentational: logomark, language selector, user token |
| Mock API gateway (`taxAuditApi.js`) | ✅ Deterministic, sub-800ms, Requirement 14.3 compliant |
| Client-side net-tax recalculation | ✅ Pure function, deterministic, property-tested |
| Finnish tax fixture data (`mockData.js`) | ✅ Three rich fixtures (CASE-2024-0001/0002/0099) |
| Article 14 Compliance Confirmation | ✅ Gated checkbox, defensive block, payload builder |
| Dashboard load/retry state machine | ✅ 10s timeout, error state, retry |
| Dashboard submission lifecycle | ✅ 30s timeout, Article 14 block, field retention |
| `juryai/` Python pipeline — offline mode | ✅ Runs entirely without an LLM; all unit tests pass offline |
| `juryai/` identity firewall | ✅ Deterministic PII strip + pseudonymisation, fully tested |
| `juryai/` counterfactual engine | ✅ Deterministic, no LLM, tested |
| `juryai/` CourtClerk assembler | ✅ Deterministic, enforces human-handoff status |
| `juryai/` all 10 unit tests | ✅ `pytest juryai/tests/test_trial.py` passes offline |
| `backend/server.py` mounts `juryai_router` | ✅ Routes are registered correctly |
| Live-mode env toggle in `taxAuditApi.js` | ✅ `VITE_USE_LIVE_BACKEND=true` activates live path |

---

## 6. What Currently Does Not Work ❌

### 6.1 The Frontend and Backend Are On Different Data Domains

This is the **most fundamental issue**. The Vite UI is a Finnish tax-audit system (Tuloverolaki paragraphs, EUR deductions, GenTax receipts, statutory matches). The Python backend is a loan creditworthiness auditor (DTI ratios, credit scores, postal geography proxy testing, approve/decline/refer_back). They share no meaningful data contract.

- `fetchActiveCase(caseId)` in mock mode returns a `CasePacket` with `agentDebate`, `statutoryMatches`, `adjustmentLineItems`, `capPercentages`, etc. — fields the backend does not produce.
- `POST /api/v1/trials/run` produces a `CasePacket` with `identity_firewall_audit`, `counterfactual`, `findings`, `residual_risk_level`, `verdict_tally` — fields the frontend does not render.
- The live-mode `fetchActiveCase` in `taxAuditApi.js` attempts a shape translation (maps the backend's packet over a skeleton) but this is best-effort and untested, and the frontend panels will render mostly placeholders.

### 6.2 `backend/seed.py` Has a Syntax Error and Is Broken

The seed script has a syntax error on line 34:
```python
if response.status_code in:    # ← SyntaxError: missing collection after 'in'
```
It also targets `BACKEND_URL = "http://127.0.0"` — a malformed IP address. It cannot be executed as-is.

### 6.3 `backend/tests/backend_test.py` Cannot Run in This Environment

The integration test reads from `/app/frontend/.env` (a Linux deploy path) and `/app/juryai/examples/sample_case.json`. The `frontend/` directory was deleted from this workspace. The test requires a running backend server with a live MongoDB instance and will not pass in offline or Windows developer environments without setup.

### 6.4 No LLM Is Connected

`juryai/.env` sets `LOCAL_LLM_URL=http://localhost:8000/v1` with `LOCAL_LLM_API_KEY=mock-key`. No actual LLM server is running at that address (port 8000 is also where the backend would run). Agents fall back to deterministic mode (`used_llm: false`), which is functional but means reasoning output in the UI reads as templated strings rather than genuine LLM reasoning.

### 6.5 The Frontend Never Triggers a Real HTTP Request by Default

`VITE_USE_LIVE_BACKEND` is not set in `.env.local` or anywhere. The live path in `taxAuditApi.js` is dead code unless explicitly enabled. The dashboard has never connected to the Python backend in its current state.

### 6.6 Domain Mismatch in `submitAuditorDecision` Live Path

Even with `VITE_USE_LIVE_BACKEND=true`, the decision payload translation is imperfect:
- Vite sends `{status: "approved", adjustedCalculations, caseworkerNotes, timestamp}`.
- Backend expects `{decision: "approve"|"decline"|"refer_back", reviewer, notes}`.
- `reviewer` is derived from `adjustedCalculations.auditorSignature` which may be absent.
- The translated payload targets `POST /api/v1/trials/{caseId}/decision` but `caseId` in the Vite domain (e.g. `CASE-2024-0001`) is not a `trial_id` in the backend domain (e.g. `a3f9b1c2de04`).

### 6.7 MongoDB Is Not Running in This Workspace

`backend/.env` points at `mongodb://localhost:27017`. No MongoDB instance is confirmed running. If it is not, `backend/server.py` will crash on startup at the `AsyncIOMotorClient` connection line before any request is served. The `juryai` package defaults gracefully to in-memory storage if `MONGO_URL` is absent, but `server.py` imports `MONGO_URL` without a fallback.

---

## 7. What Is Needed for an IBM Demo

The current system has strong individual components but requires alignment work to function as a coherent, impressive demo. The following items are **required for a demo**:

### 7.1 Required — Critical Path

**A. Align the data domain (highest priority)**

Choose one of two strategies:

| Option | Effort | Outcome |
|---|---|---|
| **A1. Retarget the UI** — Replace the tax-audit Finnish content in `mockData.js` and the panel components with a loan-audit / AI-governance domain matching the Python backend. Rewrite `agentDebate`, `statutoryMatches`, `adjustmentSummary` etc. to map to `findings`, `counterfactual`, `identity_firewall_audit` from the `CasePacket`. | 2–3 days | UI and backend on the same story |
| **A2. Retarget the backend** — Add a Finnish tax-audit route set to `juryai/main.py` that produces `CasePacket`s matching the Vite frontend's TypeScript interfaces. Requires new agent prompts, statutory-match data structures, and EUR calculation logic. | 3–5 days | Backend extended to serve the UI |

For an IBM demo, **Option A1** is strongly recommended: the Python backend's AI governance story (zero-trust firewall, isolated agents, counterfactual bias detection, mandatory human handoff, Article 14) is the impressive, differentiated work. The UI should visualise that pipeline, not a separate fictional one.

**B. Fix `backend/server.py` MongoDB fallback**

Make `MONGO_URL` optional in `server.py` so it can start without MongoDB:
```python
mongo_url = os.environ.get('MONGO_URL')  # was os.environ['MONGO_URL']
if mongo_url:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
```
Without this, the backend cannot start unless MongoDB is running.

**C. Fix `backend/seed.py`**

Correct the syntax error and the malformed URL. This is a minor fix but the file must be runnable for demo seeding.

**D. Set `VITE_USE_LIVE_BACKEND=true` in `.env.local`**

Create `c:\kiro\juryai\.env.local`:
```
VITE_USE_LIVE_BACKEND=true
VITE_API_URL=http://localhost:8000/api/v1
```
This activates the live path in `taxAuditApi.js`. Without this the frontend never talks to the backend regardless of what else is running.

**E. Confirm Python dependency installation**

```bash
pip install -r juryai/requirements.txt
```
Required before the backend can start. The `juryai/requirements.txt` is minimal and clean. The `backend/requirements.txt` is large (includes litellm, google-genai, etc.) but is only needed if those features are used.

### 7.2 Required — Before Going Live

**F. Configure an LLM (or explicitly demo offline mode)**

Two acceptable paths:
- **Live LLM**: Set `LOCAL_LLM_URL`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_MODEL` in `juryai/.env` pointing at a running Ollama/vLLM instance. Agents will produce real reasoning.
- **Demo offline mode explicitly**: Leave the LLM unconfigured. Agents will return deterministic findings tagged `"used_llm": false`. Frame this as "sovereign offline mode — the system guarantees auditability even without an LLM connection." This is a legitimate and differentiating governance claim.

**G. Run the Python backend**

```bash
cd juryai
uvicorn juryai.main:app --host 0.0.0.0 --port 8000 --reload
# or via backend/server.py:
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 7.3 High-Value Demo Enhancements (not strictly required but impactful for IBM)

**H. Wire `AuditTimeline` / streaming events to the UI in real-time**

Currently `streamTrial` in `taxAuditApi.js` reads the full stream to completion and returns a single resolved `CasePacket`. For demo impact — showing the 11 events arrive live as the pipeline runs (firewall applied → agents thinking → counterfactual result → human handoff) — refactor the Dashboard to accept a streaming callback and render each event as it arrives in the `AgentTransparencyTree`. The backend already supports this perfectly.

**I. Add a `TrialHistory` panel**

The backend's `GET /api/v1/trials` returns a list of past audits. A replay panel showing historical cases and their outcomes would demonstrate persistence and the "full audit trail" guarantee compellingly.

**J. Add a human-facing IBM Consulting brand context to the header**

The OmaVero header (`my/tax`) looks like a product screen. For an IBM Consulting demo, frame it as "AI-Governance Demonstration — Built on IBM Technology" or retain the OmaVero context but add a slide/overlay explaining that this is a reference implementation of EU AI Act Article 14 compliance.

**K. Add `.env.local` to `.gitignore`**

It's already in `.gitignore` via `*.local` — no action needed, but confirm before sharing the repo.

---

## 8. Summary Verdict

| Layer | State | Verdict |
|---|---|---|
| Vite UI (visual, layout, theme) | Implemented, tests pass | ✅ Demo-ready as a visual shell |
| Vite UI (data integration) | Mock-only, wrong domain | ❌ Not connected to backend |
| Python backend — pipeline | Fully implemented, offline-tested | ✅ Production-quality |
| Python backend — LLM | Not configured | ⚠️ Offline fallback works; live LLM needs setup |
| Python backend — MongoDB | Optional, not confirmed running | ⚠️ In-memory fallback works; `server.py` startup bug must be fixed |
| End-to-end integration | Never exercised | ❌ Domain mismatch; no shared data contract |
| `backend/seed.py` | Syntax error | ❌ Broken |
| `backend/tests/` | Requires running server + deleted `frontend/` path | ❌ Cannot run in current environment |
| `juryai/tests/` | Fully offline | ✅ 10/10 pass without any external services |

**The single most important action before an IBM demo:** align the data domain between the UI and the Python backend. The Python backend's AI governance pipeline — zero-trust identity firewall, compartmentalized multi-agent reasoning, deterministic counterfactual bias detection, mandatory human-final-authority Article 14 enforcement — is the IP worth demonstrating. The UI should visualise that pipeline end-to-end, not a disconnected mock of a different system.
