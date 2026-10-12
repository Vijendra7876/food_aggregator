# FoodLens: cross-provider food comparison (MVP)

All provider data is **synthetic** (fictional providers FoodHub, QuickBite, DineDash). Nothing is scraped; nothing is ordered.

## Run it (two terminals, Node 18+)
```bash
# terminal 1: API on :4000
cd backend && npm install && npm run dev
# terminal 2: UI on :5173
cd frontend && npm install && npm run dev
```
Open http://localhost:5173. Tests: `cd backend && npm test`.

## How it connects
```
Adapters (data/synthetic.ts)  --Raw listings-->  validate -> resolve (entity matching) -> reconcile + menu match   [Data Truth Layer: src/pipeline]
                                                         |  canonical restaurants + observations + conflicts (Store, in memory)
                                                         v
                    reputation (reviews->aspects, Bayesian ratings)  ->  pricing (total)  ->  ranking (weights + explanation)   [Intelligence: src/intelligence]
                                                         v
                         Express routes (src/server.ts) /api/*  <--proxy-->  React pages (frontend/src)                      [Application]
```
Real providers: write a class implementing `Adapter` (`src/types.ts`) and add it to `new Store([...])`. Nothing else changes.
Swap in-memory store for PostgreSQL using `backend/db/schema.sql`.
