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

- `Reports_storeloads_details` (action_type `values`) — the СКЛАД → ЗАРЕЖДАНИЯ →
  ВСИЧКИ report: one row per article per load, incl. supplier, quantity, unit
  and delivery prices with/without VAT. **The period filter (`ref_date`) applies
  to the document date (`doc_date`), not the entry date** — same as the Barsy UI.
- `Suppliers_getlist` — supplier dropdown

Verified against the live install (2026-07-02): primary currency is **EUR**
(`*__sec_curr` columns are BGN at 1.95583). Pagination via `page_num`/`rows`
(response `total` = page count). See [src/lib/barsy.ts](src/lib/barsy.ts).

### Auth

Clerk is used when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` are
set (unauthenticated visitors are redirected to the hosted sign-in). Without
Clerk keys, it falls back to HTTP Basic Auth via `DASH_USER`/`DASH_PASS`.
