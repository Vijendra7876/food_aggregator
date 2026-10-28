# FoodLens Backend

FoodLens is a cross-provider food comparison project for the Indian delivery market. The currently connected app flow searches the committed synthetic provider and menu CSVs, groups provider listings by canonical restaurant, and returns search cards to React through Express.

> **Important:** This starter backend uses synthetic demo data only. It does not scrape delivery platforms, verify checkout prices, place orders, or represent real restaurant availability. Admin routes are not authenticated and are for local development only.

## Highlights

### Current connected functionality
- Express exposes health and search routes and forwards them to the Python service.
- Python groups matching CSV rows by canonical restaurant, searches restaurant names and menu items, and returns provider prices, ratings, ETAs, and freshness for the frontend search page.
- The Python module also contains basket pricing and reputation helpers; detail and compare are not yet connected to Express or the current React contract.

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

The React app calls Express at `http://localhost:4000`; Express forwards `/api/search` and `/api/health` to Python at `http://localhost:8000`. Set `PYTHON_API_URL` if Python runs elsewhere.

```bash
npm run typecheck
```

The backend test script is present in `package.json`, but this branch has no committed `src/tests` suite yet.

## API reference

All endpoints are prefixed with `/api`. The Express service currently exposes the working search path and its health check; other routes described by the larger product design are not yet implemented in this branch.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Express and Python data-service health |
| GET | `/search?q=biryani` | Search canonical restaurants and menu items; supports `cuisine`, `provider`, `city`, and `limit` |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `DATA_MODE` | `synthetic` | Data mode banner |
| `PYTHON_API_URL` | `http://localhost:8000` | Base URL for the FastAPI data service |

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
- In-memory state resets after restart; review decisions are not durable.
- Admin endpoints are open and must not be exposed publicly.
- Review sentiment is English word-list based and can miss sarcasm, context, and non-English reviews.
- Ranking and GST/discount assumptions have not been validated against real checkout data.
- No accounts, payments, orders, or real provider integrations.
- Entity-resolution review decisions are only an MVP in-memory workflow; persist decisions before real use.

## License

Add the licence appropriate for your project before publishing.
