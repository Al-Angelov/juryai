"""Backend integration tests for JuryAI mounted at /api/v1 via public URL."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from /app/frontend/.env
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api/v1"
SAMPLE = json.loads(Path("/app/juryai/examples/sample_case.json").read_text())


# --- llm status probe --------------------------------------------------------
def test_llm_status_offline_fallback():
    r = requests.get(f"{API}/llm/status", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "offline_fallback"
    assert body["reachable"] is False
    for k in ("endpoint", "model", "detail"):
        assert k in body and body[k] is not None


# --- run-sync ---------------------------------------------------------------
@pytest.fixture(scope="module")
def sync_packet():
    r = requests.post(f"{API}/trials/run-sync", json=SAMPLE, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def test_run_sync_case_packet(sync_packet):
    p = sync_packet
    assert p["status"] == "awaiting_human"
    assert p["residual_risk_level"] == "high"
    assert len(p["findings"]) == 3
    assert p["human_decision"] is None
    assert p["trial_id"] and isinstance(p["trial_id"], str)


# --- stream endpoint ---------------------------------------------------------
def test_run_streaming_ndjson():
    r = requests.post(f"{API}/trials/run", json=SAMPLE, timeout=60, stream=False)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    lines = [json.loads(l) for l in r.text.splitlines() if l.strip()]
    assert lines[0]["type"] == "trial.started"
    assert "trial_id" in lines[0]["data"]
    assert lines[-1]["type"] == "trial.awaiting_human"
    assert "trial_id" in lines[-1]["data"]
    assert "case_packet" in lines[-1]["data"]
    assert len(lines) == 11


# --- listing / detail / events ----------------------------------------------
def test_list_and_get_and_events(sync_packet):
    tid = sync_packet["trial_id"]

    lst = requests.get(f"{API}/trials", timeout=15).json()
    assert any(x["trial_id"] == tid for x in lst)

    got = requests.get(f"{API}/trials/{tid}", timeout=15)
    assert got.status_code == 200
    assert got.json()["trial_id"] == tid

    evs = requests.get(f"{API}/trials/{tid}/events", timeout=15)
    assert evs.status_code == 200
    events = evs.json()
    assert len(events) == 11
    assert events[-1]["type"] == "trial.awaiting_human"
    # Ordered by seq.
    assert [e["seq"] for e in events] == list(range(1, 12))

    assert requests.get(f"{API}/trials/unknown-id", timeout=15).status_code == 404
    assert requests.get(f"{API}/trials/unknown-id/events", timeout=15).status_code == 404


# --- human decision ---------------------------------------------------------
def _fresh_trial():
    r = requests.post(f"{API}/trials/run-sync", json=SAMPLE, timeout=60)
    return r.json()["trial_id"]


def test_decision_invalid_value_422():
    tid = _fresh_trial()
    r = requests.post(f"{API}/trials/{tid}/decision",
                      json={"decision": "yes", "reviewer": "x"}, timeout=15)
    assert r.status_code == 422


def test_decision_empty_reviewer_422():
    tid = _fresh_trial()
    r = requests.post(f"{API}/trials/{tid}/decision",
                      json={"decision": "approve", "reviewer": ""}, timeout=15)
    assert r.status_code == 422


def test_decision_happy_and_conflict_and_event_appended():
    tid = _fresh_trial()
    r = requests.post(f"{API}/trials/{tid}/decision",
                      json={"decision": "decline", "reviewer": "auditor-01", "notes": "n"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "human_decided"
    assert body["human_decision"]["decision"] == "decline"
    assert body["human_decision"]["reviewer"] == "auditor-01"

    # Second call -> 409
    r2 = requests.post(f"{API}/trials/{tid}/decision",
                       json={"decision": "approve", "reviewer": "x"}, timeout=15)
    assert r2.status_code == 409

    evs = requests.get(f"{API}/trials/{tid}/events", timeout=15).json()
    assert evs[-1]["type"] == "human.decided"
    assert len(evs) == 12


def test_decision_unknown_trial_404():
    r = requests.post(f"{API}/trials/does-not-exist/decision",
                      json={"decision": "approve", "reviewer": "x"}, timeout=15)
    assert r.status_code == 404


# --- persistence check via mongosh ------------------------------------------
def test_mongo_persistence():
    import subprocess
    def count(coll):
        out = subprocess.run(
            ["mongosh", "mongodb://localhost:27017/test_database", "--quiet",
             "--eval", f"db.{coll}.countDocuments({{}})"],
            capture_output=True, text=True, timeout=10)
        return int(out.stdout.strip().splitlines()[-1])

    before_packets = count("juryai_case_packets")
    before_events = count("juryai_audit_events")
    requests.post(f"{API}/trials/run-sync", json=SAMPLE, timeout=60)
    after_packets = count("juryai_case_packets")
    after_events = count("juryai_audit_events")
    assert after_packets > before_packets
    assert after_events >= before_events + 11
