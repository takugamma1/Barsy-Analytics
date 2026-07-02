# Barsy Analytics — Зареждания

Vercel-hosted dashboard for **СКЛАД → ЗАРЕЖДАНИЯ → ВСИЧКИ** from Barsy (bm-habits.barsy.bg).

Shows warehouse loads (зареждания) grouped **by supplier**, with the **items inside each supplier's loads by name and price**:

- KPI cards: total loads, supplier count, total value for the period
- Per-supplier card with total value bar, expandable into:
  - **Артикули** tab — aggregated items: quantity, average delivery price, last price, total value
  - **Зареждания** tab — individual loads, each expandable to its item rows (name, qty, unit price, total)
- Filters: date range + supplier dropdown

## Setup

```bash
npm install
cp .env.example .env.local   # fill in BARSY_USER / BARSY_PASS
npm run dev
```

### Environment variables

| Variable | Description |
|---|---|
| `BARSY_BASE_URL` | e.g. `https://bm-habits.barsy.bg` |
| `BARSY_USER` / `BARSY_PASS` | Barsy API basic-auth credentials |
| `BARSY_BID` | Barsy business ID (usually `1`) |
| `DASH_USER` / `DASH_PASS` | Optional — if both set, the dashboard is protected with HTTP Basic Auth |

## Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Add the environment variables above (set `DASH_USER`/`DASH_PASS` — the data is sensitive)
3. Deploy

## API routes

| Route | Description |
|---|---|
| `GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&supplier=ID` | Aggregated loads by supplier (cached 5 min) |
| `GET /api/storeloads?from=&to=&supplier=` | Raw normalized load list |
| `GET /api/suppliers` | Supplier list |
| `GET /api/debug?method=Storeloads_getlist&params={"filters":{},"length":2}` | Raw Barsy probe (read-only methods only) — use this to inspect the exact response shape of your Barsy install |

## Barsy API methods used

- `Storeloads_getlist` — list of loads for the period
- `Storeloads_get` — item rows per load (fetched with bounded concurrency)
- `Suppliers_getlist` — supplier dropdown

Field names vary between Barsy installs, so responses are normalized through
candidate-key lookups in [src/lib/barsy.ts](src/lib/barsy.ts). If a column shows
empty, hit `/api/debug` to see the raw payload and extend the `F` field map.
