# AML Alert Triage (Node.js Boilerplate)

A working boilerplate for an **AI-assisted AML alert triage system** that:
1. Ingests alert + transaction data
2. Applies deterministic risk logic (0-100)
3. Runs an LLM reasoning layer (or offline heuristic fallback)
4. Produces one final decision with traceable reasoning:
   - `AUTO_CLOSE`
   - `ANALYST_REVIEW`
   - `ESCALATE`

## Quick Start

```bash
npm install
npm start
```

Server starts on `http://localhost:3000`.

## API

### `POST /api/triage`

Request body example:

```json
{
  "customer_profile": {
    "risk_category": "Medium",
    "kyc_status": "Completed",
    "account_age_months": 14,
    "occupation": "Retail",
    "expected_monthly_volume": 150000
  },
  "alert": {
    "alert_type": "High Velocity Transactions",
    "triggered_rules": ["R-102", "R-311"]
  },
  "transactions": [
    {"amount": 98000, "type": "credit", "channel": "UPI", "timestamp": "2025-01-01T10:00:00Z"},
    {"amount": 97000, "type": "credit", "channel": "UPI", "timestamp": "2025-01-01T10:03:00Z"},
    {"amount": 99000, "type": "credit", "channel": "UPI", "timestamp": "2025-01-01T10:05:00Z"}
  ]
}
```

Response format:

```json
{
  "decision": "ANALYST_REVIEW",
  "risk_score": 50,
  "reason_codes": ["VELOCITY_PATTERN", "THRESHOLD_AVOIDANCE", "MEDIUM_RISK_CUSTOMER", "STABLE_ACCOUNT", "MULTI_RULE_TRIGGER"],
  "llm_disagreement": false,
  "explanation": "Behavioral analysis is broadly consistent with deterministic score.",
  "confidence": 0.8,
  "trace": [
    {
      "signal": "Multiple transactions in a short window",
      "weight": 25,
      "why": "Higher chance of velocity-based laundering behavior."
    }
  ],
  "llm_patterns": ["Potential structuring / threshold avoidance", "Velocity pattern across multiple transactions"],
  "missing_signals": []
}
```

## Deterministic Risk Logic (Transparent)

Implemented in `src/triageEngine.js` with explicit weighted signals:

- +25 multiple transactions in short window
- +20 repeated near-threshold amounts (90k-99,999)
- +20 high-risk customer / +10 medium-risk customer
- +15 KYC not completed
- -15 account age > 12 months
- +10 very new account (<=3 months)
- +10 large cash activity
- +8 multi-channel movement
- +10 multiple rules triggered

Score is clamped to 0-100 and returned with full `trace`.

## LLM Reasoning Layer

Implemented in `src/llmReasoner.js`:
- **Default:** heuristic reasoning (offline-safe)
- **Optional:** real OpenAI call when `OPENAI_API_KEY` is set

Optional environment variables:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

## Decision Logic (Hard Rule Included)

Implemented in `finalDecision()`:
- `ESCALATE` when score >= 80
- `ANALYST_REVIEW` when score 45-79
- `AUTO_CLOSE` only when:
  - score < 45, **and**
  - LLM does **not** disagree (`llm_disagreement = false`)

If LLM disagrees, low score cases are routed to `ANALYST_REVIEW`.

## Simple UI

Open `http://localhost:3000` for a basic input/output UI (`public/index.html`).

## Sample Data

Use `samples/sample-alert.json` as a starting point.

CLI test:

```bash
curl -s http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d @samples/sample-alert.json | jq
```
