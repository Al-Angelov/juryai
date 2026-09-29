# JuryAI — Sovereign Multi-Agent AI Decision-Assurance Backend

Zero-platform-dependency, standalone Python 3.11+ backend implementing the
JuryAI decision-assurance architecture for high-risk AI decision auditing.

## Guarantees

- **Zero-trust PII redaction** — direct identifiers stripped + pseudonymized (`SUBJECT-XXXX`).
- **Compartmentalized agents** — explicit manifests; `receives_other_agent_findings = False`.
- **Deterministic sensitivity testing** — counterfactual proxy testing with no LLM.
- **Mandatory human final authority** — every trial ends at `status = "awaiting_human"`.
- **Decoupled LLM routing** — all clients read `LOCAL_LLM_URL` / `LOCAL_LLM_API_KEY` / `LOCAL_LLM_MODEL`.
- **Graceful sovereign offline mode** — if the local LLM is unreachable, agents return deterministic findings.

## Files

| File | Responsibility |
|------|----------------|
| `middleware.py` | Zero-trust identity firewall + deterministic counterfactual engine. **No LLM.** |
| `agents.py`     | Context-capped witness/reasoner agents (`AsyncOpenAI` → `LOCAL_LLM_URL`). |
| `clerk.py`      | Deterministic `CasePacket` assembly. **No LLM, no opinion.** |
| `main.py`       | FastAPI service; `POST /api/v1/trials/run` streams NDJSON audit events. |

## Run standalone

```bash
cp juryai/.env.example juryai/.env         # optional: point at a real vLLM server
python -m pip install -r juryai/requirements.txt
uvicorn juryai.main:app --host 0.0.0.0 --port 8000
```

## LLM configuration (decoupled)

Any OpenAI-compatible local server works — vLLM, Ollama (`http://localhost:11434/v1`),
LM Studio, llama.cpp server. If unreachable, agents fall back to deterministic findings
and each `AgentFinding.used_llm` is `false`.

```bash
export LOCAL_LLM_URL="http://localhost:11434/v1"    # e.g. Ollama
export LOCAL_LLM_API_KEY="ollama"
export LOCAL_LLM_MODEL="llama3.1:8b"
```

## Endpoints

- `GET  /api/v1/health` — liveness + LLM config echo.
- `GET  /api/v1/llm/status` — probes `LOCAL_LLM_URL`; reports `mode: live | offline_fallback`.
- `POST /api/v1/trials/run` — run a trial, **stream** typed events as `application/x-ndjson`.
- `POST /api/v1/trials/run-sync` — run a trial, return the final `CasePacket` in one response.
- `GET  /api/v1/trials` — list persisted trials (newest first).
- `GET  /api/v1/trials/{trial_id}` — retrieve a persisted `CasePacket`.
- `GET  /api/v1/trials/{trial_id}/events` — replay the full persisted audit trail.
- `POST /api/v1/trials/{trial_id}/decision` — record the mandatory human final decision
  (`approve | decline | refer_back`, `reviewer`, `notes`); status becomes `human_decided`. 409 if already closed.

## Persistence (store.py)

Set `MONGO_URL` + `DB_NAME` to persist packets/events in MongoDB
(`juryai_case_packets`, `juryai_audit_events`). Without `MONGO_URL` an in-memory store is used.

## Operator console

A React dashboard (`/app/frontend`) visualizes the live NDJSON stream, the sealed
CasePacket (risk band, firewall audit, counterfactual, per-agent findings), the
human decision panel and a replayable trial history.

## Example

```bash
./juryai/examples/run_trial.sh
```

Or directly:

```bash
curl -N -X POST http://localhost:8000/api/v1/trials/run \
  -H "Content-Type: application/json" \
  --data-binary @juryai/examples/sample_case.json
```

## Tests

```bash
python -m pytest juryai/tests/test_trial.py -v
```
