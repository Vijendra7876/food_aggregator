# FoodLens Backend

FoodLens is a cross-provider food comparison project for the Indian delivery market. Express is the frontend-facing API gateway; Python processes the committed synthetic provider, menu, offer, and review CSVs.

> **Important:** This backend uses synthetic demo data only. It does not scrape delivery platforms, verify checkout prices, place orders, or represent real restaurant availability. Admin decisions are local demo actions kept in memory and do not alter canonical assignments.

## Highlights

### Current connected functionality
- Express exposes health, metadata, search, restaurant detail, basket comparison, and data-quality routes and forwards them to Python.
- Python returns the exact search/detail/compare shapes consumed by React, groups provider listings by canonical identity, and retains provider-specific menu, price, rating, review, freshness, and offer facts.
- Admin review cards come from synthetic benchmark rows marked `manual_review`; choices only hide a sample for the current Python process and never rewrite source datasets.

## Stack and architecture

- **Application API:** Node.js, TypeScript, Express
- **Data and intelligence API:** Python, FastAPI, pandas, reading the committed CSV datasets
- **Current data store:** synthetic CSV files; admin decisions are not yet durable
- **Persistence target:** PostgreSQL (not yet implemented in this branch)
- **Frontend:** React + Vite can call `/api/*`; configure its dev proxy to `http://localhost:4000`

Data flow:

```text
Committed CSV datasets -> Python/FastAPI search and data operations
                                      |
                                      v
                               Express REST API -> React/Vite
```

## Requirements

- Node.js 20+ recommended
- npm
- Python 3.10+ and pip

## Run locally

Install the Python service dependencies from `backend/`:

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

In a second terminal, start Express:

```bash
npm install
npm run dev
```

The React app calls Express at `http://127.0.0.1:4000`; Express forwards API requests to Python at `http://127.0.0.1:8000`. Set `PYTHON_API_URL` if Python runs elsewhere.

Administrative write actions are disabled by default. To enable them for a local demo, set `ADMIN_DEMO_MODE=true` in both service environments while keeping Express and Python bound to loopback. Express also refuses these writes in production or when configured to listen on a non-loopback host.

```bash
npm run typecheck
```

Run Python tests from `backend/` after installing the development test requirements:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
```

## API reference

All endpoints are prefixed with `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Express and Python data-service health |
| GET | `/meta` | Data mode, synthetic-data notice, provider list, and demo-write status |
| GET | `/search?q=biryani` | Search canonical restaurants and menu items; supports `cuisine`, `provider`, `city`, and `limit` |
| GET | `/restaurants/:id` | Complete canonical restaurant detail, listings, menu offers, sentiment summary, conflicts, and observations |
| POST | `/compare` | Accepts `restaurantId`, `selections: [{itemId, qty}]`, `priority`, and optional `maxEta`; returns ranked `options` and `excluded` providers |
| GET | `/admin/review-queue` | Synthetic `manual_review` benchmark examples; explicitly marked demo-only |
| GET | `/admin/pipeline` | Listing/canonical counts and CSV validation issues |
| POST | `/admin/review-queue/:id/decision` | Local demo-only `merge` or `keep_separate` action, disabled by default and not persisted |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `HOST` | `127.0.0.1` | Express bind host; non-loopback hosts disable demo admin writes |
| `PYTHON_API_URL` | `http://127.0.0.1:8000` | Base URL for the FastAPI data service |
| `ADMIN_DEMO_MODE` | `false` | Enables process-local demo decisions outside production only |

## Standout features to build next

1. **Price movement alerts:** compare timestamped observations and flag meaningful price changes.
2. **Confidence-aware review intelligence:** add a labelled review set and report evaluation metrics before using an ML model.
3. **Suspicious-review signals:** surface duplicate text, unusual timing, rating bursts, and repeated phrases as *signals for review*, never automatic fraud verdicts.
4. **Demand forecasting:** start with time-of-day/day-of-week baselines; compare against a held-out time period.
5. **Personalised ranking:** accept explicit user preferences and keep the ranking explanation visible.
6. **PostgreSQL persistence:** replace in-memory state and save every ingestion/reconciliation decision.
7. **Admin protection:** add authentication, role checks, audit logging, rate limiting, and request validation before deployment.
8. **Provider integrations:** use authorised partner APIs, feeds, restaurant partnerships, or ONDC-compatible integrations; do not depend on unrestricted scraping.

## Current limitations

- Synthetic provider data only.
- Review decisions are in-memory demo state, reset after restart, and do not change the canonical datasets.
- Provider links and exact delivery/platform fees are absent from the CSV data; comparison totals are marked as lower bounds when fees are unknown.
- Review sentiment is English word-list based and can miss sarcasm, context, and non-English reviews.
- Ranking and GST/discount assumptions have not been validated against real checkout data.
- No accounts, payments, orders, or real provider integrations.
- Entity-resolution review decisions are only an MVP in-memory workflow; persist decisions before real use.

## License

Add the licence appropriate for your project before publishing.
