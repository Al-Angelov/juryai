# backend/seed.py
import asyncio
import httpx

# Fixed: Full API endpoint URL on local uvicorn server
BACKEND_URL = "http://127.0.0.1:8000/api/v1/trials/run-sync"

mock_cases = [
    {
        "case_id": "FI-2026-X982",
        "raw_data": {
            "name": "Jane Doe",
            "national_id": "010190-A123",
            "gross_income": 45000,
            "postal_code": "00100",
            "unstructured_claims": (
                "Claiming travel deductions for daily commute from Espoo to"
                " Helsinki using private vehicle due to irregular shift hours."
            ),
        },
    },
    {
        "case_id": "FI-2026-X114",
        "raw_data": {
            "name": "Matti Meikäläinen",
            "national_id": "151185-B456",
            "gross_income": 62000,
            "postal_code": "02100",
            "unstructured_claims": (
                "Deducting custom home office hardware and high-speed broadband"
                " upgrade required for full-time remote software engineering."
            ),
        },
    },
]


async def seed_database():
    print("⏳ Connecting to local sovereign backend engine...")
    async with httpx.AsyncClient(timeout=10.0) as client:
        for case in mock_cases:
            try:
                print(f"📦 Seeding Case Ingestion Profile: {case['case_id']}...")
                response = await client.post(BACKEND_URL, json=case)
                # Fixed: Corrected SyntaxError by providing valid tuple of success status codes
                if response.status_code in (200, 201):
                    print(
                        f"✅ Case {case['case_id']} successfully registered"
                        " in-memory."
                    )
                else:
                    print(
                        "⚠️ Server returned status code:"
                        f" {response.status_code}"
                    )
            except Exception as e:
                print(f"❌ Failed to connect to server loop: {str(e)}")
                print(
                    "👉 Ensure your uvicorn backend server is fully running"
                    " on port 8000 first!"
                )


if __name__ == "__main__":
    asyncio.run(seed_database())