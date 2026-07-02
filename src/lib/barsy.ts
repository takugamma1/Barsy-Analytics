/**
 * Barsy API client — read-only access to СКЛАД → ЗАРЕЖДАНИЯ data.
 *
 * Calling convention (same as the bridge at bridge.habits.bg):
 *   POST {BARSY_BASE_URL}/endpoints/json/{Method}?bid={BARSY_BID}
 *   HTTP Basic Auth with BARSY_USER / BARSY_PASS, JSON body.
 *
 * Data source: Reports_storeloads_details (СКЛАД → ЗАРЕЖДАНИЯ → ВСИЧКИ,
 * "Списък на доставките") with action_type "values" — returns one row per
 * article per load, incl. supplier, quantity, and delivery prices.
 * Verified against the live install on 2026-07-02:
 *   - filters.ref_date = [from, to] filters by DOCUMENT date (doc_date)
 *   - `columns` selects fields; `page_num`/`rows` paginate (`total` = page count)
 *   - primary currency is EUR; *_sec_curr columns are BGN (×1.95583)
 * Suppliers come from Suppliers_getlist ({supplier_id, supplier_name}).
 */

const BASE = () => process.env.BARSY_BASE_URL || "";
const BID = () => process.env.BARSY_BID || "1";

function authHeader(): string {
  const user = process.env.BARSY_USER || "";
  const pass = process.env.BARSY_PASS || "";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export class BarsyError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body.slice(0, 2000);
  }
}

export async function barsyCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const url = `${BASE()}/endpoints/json/${method}?bid=${BID()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BarsyError(`Barsy ${method} failed: HTTP ${res.status}`, res.status, text);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BarsyError(`Barsy ${method} returned non-JSON: ${text.slice(0, 200)}`, res.status, text);
  }
}

/* ─── Domain types ───────────────────────────────────────────────────── */

/** One article row inside a зареждане (from Reports_storeloads_details). */
export interface LoadDetailRow {
  storeLoadId: number;
  date: string; // entry datetime
  docDate: string; // document date (what the period filter applies to)
  docNum: string;
  supplierId: string;
  supplierName: string;
  articleId: string;
  articleName: string;
  unit: string; // мерна единица (бр, кг, л…)
  quantity: number;
  unitPrice: number; // per unit, EUR, without VAT
  total: number; // row total, EUR, without VAT
  unitPriceTax: number; // per unit, EUR, with VAT
  totalTax: number; // row total, EUR, with VAT
}

export interface Supplier {
  id: string;
  name: string;
}

/* ─── Fetchers ───────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export async function getSuppliers(): Promise<Supplier[]> {
  const raw = await barsyCall("Suppliers_getlist", { filters: {}, start: 0, length: 1000 });
  const list: AnyObj[] = Array.isArray(raw) ? raw : (raw as AnyObj)?.data ?? [];
  return list
    .map((o) => ({ id: String(o.supplier_id ?? o.id ?? ""), name: String(o.supplier_name ?? o.name ?? "") }))
    .filter((s) => s.id && s.name);
}

const REPORT_COLUMNS = [
  "store_load_id",
  "date",
  "doc_date",
  "doc_num",
  "supplier_id",
  "supplier_name",
  "article_id",
  "article_name",
  "amount",
  "amount_type_name_short",
  "current_price",
  "current_price_total",
  "current_price_tax",
  "current_price_tax_total",
];

const PAGE_ROWS = 500;
const MAX_PAGES = 40; // 20k article rows per query — far above normal volume

export interface DetailFilters {
  from: string; // YYYY-MM-DD (doc_date)
  to: string; // YYYY-MM-DD (doc_date)
}

/** All article rows of all зареждания in the period (one row = article × load). */
export async function getLoadDetailRows(f: DetailFilters): Promise<LoadDetailRow[]> {
  const rows: LoadDetailRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const raw = (await barsyCall("Reports_storeloads_details", {
      action_type: "values",
      active_struct_id: "eStructList_1",
      filters: { ref_date: [f.from, f.to] },
      page_num: page,
      rows: PAGE_ROWS,
      columns: REPORT_COLUMNS,
    })) as AnyObj;
    const pageRows: AnyObj[] = Array.isArray(raw?.rows) ? raw.rows : [];
    for (const r of pageRows) {
      rows.push({
        storeLoadId: Number(r.store_load_id) || 0,
        date: String(r.date ?? ""),
        docDate: String(r.doc_date ?? "").slice(0, 10),
        docNum: String(r.doc_num ?? ""),
        supplierId: r.supplier_id != null ? String(r.supplier_id) : "",
        supplierName: String(r.supplier_name ?? ""),
        articleId: r.article_id != null ? String(r.article_id) : "",
        articleName: String(r.article_name ?? ""),
        unit: String(r.amount_type_name_short ?? ""),
        quantity: num(r.amount),
        unitPrice: num(r.current_price),
        total: num(r.current_price_total) || num(r.amount) * num(r.current_price),
        unitPriceTax: num(r.current_price_tax),
        totalTax: num(r.current_price_tax_total) || num(r.amount) * num(r.current_price_tax),
      });
    }
    const totalPages = Number(raw?.total) || 1;
    if (page >= totalPages || pageRows.length === 0) break;
  }
  return rows;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
