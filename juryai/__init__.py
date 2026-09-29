"""JuryAI - Sovereign Multi-Agent AI Decision-Assurance Backend.

A zero-platform-dependency, standalone Python package implementing the JuryAI
decision-assurance architecture:

    * middleware.py - Zero-trust identity firewall + deterministic counterfactual engine.
    * agents.py     - Compartmentalized, context-capped witness/reasoner agents.
    * clerk.py      - Deterministic case assembly (no LLM logic).
    * main.py       - FastAPI REST service with NDJSON audit event streaming.

All LLM routing is decoupled and read from local environment variables. No
proprietary runtime wrappers, vendor SDKs, or hosting decorators are used.
"""

__version__ = "1.0.0"
