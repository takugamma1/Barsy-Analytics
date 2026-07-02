/**
 * Barsy API client — read-only access to СКЛАД → ЗАРЕЖДАНИЯ data.
 *
 * Calling convention (same as the bridge at bridge.habits.bg):
 *   GET/POST {BARSY_BASE_URL}/endpoints/json/{Method}?bid={BARSY_BID}
 *   HTTP Basic Auth with BARSY_USER / BARSY_PASS.
 *
 * Methods used:
 *   STORELOADS_getlist — list of warehouse loads (зареждания)
 *   STORELOADS_get     — a single load incl. its item rows
 *   SUPPLIERS_getlist  — supplier catalog
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

/**
 * Low-level call. Barsy getlist methods accept `filters`, `start`, `length`
 * as JSON in a POST body (query-string style also works, but JSON is cleaner).
 */
export async function barsyCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const url = `${BASE()}/endpoints/json/${method}?bid=${BID()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    // Vercel: cache at the route level, not here
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BarsyError(`Barsy ${method} failed: HTTP ${res.status}`, res.status, text);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BarsyError(`Barsy ${method} returned non-JSON`, res.status, text);
  }
}

/* ─── Response normalization ────────────────────────────────────────────
 * Barsy responses vary between a bare array, {data: [...]}, and
 * DataTables-style {aaData: [...]} envelopes. Field names also vary per
 * install/version, so lookups go through candidate lists.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export function unwrapList(raw: unknown): AnyObj[] {
  if (Array.isArray(raw)) return raw as AnyObj[];
  if (raw && typeof raw === "object") {
    const o = raw as AnyObj;
    for (const key of ["data", "aaData", "rows", "list", "result", "storeloads", "suppliers"]) {
      if (Array.isArray(o[key])) return o[key];
    }
    // Single-object result (e.g. STORELOADS_get) — caller handles it
  }
  return [];
}

export function pick(obj: AnyObj | null | undefined, candidates: string[]): unknown {
  if (!obj) return undefined;
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
}

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

/* ─── Domain types ───────────────────────────────────────────────────── */

export interface LoadRow {
  articleId: string;
  articleName: string;
  quantity: number;
  unitPrice: number; // delivery price per unit
  total: number;
}

export interface StoreLoad {
  id: string;
  date: string;
  supplierId: string;
  supplierName: string;
  depotName: string;
  documentNum: string;
  total: number;
  rows: LoadRow[];
}

export interface Supplier {
  id: string;
  name: string;
}

/* ─── Normalizers ────────────────────────────────────────────────────── */

const F = {
  loadId: ["storeload_id", "store_load_id", "load_id", "id", "doc_id"],
  loadDate: ["load_date", "date", "doc_date", "document_date", "created", "date_created", "load_time"],
  supplierId: ["supplier_id", "supplierid"],
  supplierName: ["supplier_name", "supplier", "suppliername"],
  depotName: ["depot_name", "depot", "warehouse_name"],
  documentNum: ["doc_num", "document_num", "invoice_num", "num", "doc_number"],
  loadTotal: ["total", "total_sum", "sum", "total_price", "load_sum", "amount_total", "total_delivery_price"],
  rowsKey: ["rows", "details", "articles", "items", "storeload_rows", "load_rows"],
  articleId: ["article_id", "articleid"],
  articleName: ["article_name", "name", "articlename"],
  qty: ["amount", "quantity", "qty", "load_amount"],
  unitPrice: ["delivery_price", "single_price", "price", "unit_price", "single_delivery_price"],
  rowTotal: ["total", "total_price", "sum", "row_total", "total_delivery_price"],
};

export function normalizeLoad(o: AnyObj): StoreLoad {
  const rawRows = (pick(o, F.rowsKey) as AnyObj[] | undefined) ?? [];
  const rows: LoadRow[] = (Array.isArray(rawRows) ? rawRows : []).map((r) => {
    const quantity = num(pick(r, F.qty));
    const unitPrice = num(pick(r, F.unitPrice));
    const explicitTotal = num(pick(r, F.rowTotal));
    return {
      articleId: str(pick(r, F.articleId)),
      articleName: str(pick(r, F.articleName)),
      quantity,
      unitPrice,
      total: explicitTotal || quantity * unitPrice,
    };
  });
  const explicitTotal = num(pick(o, F.loadTotal));
  return {
    id: str(pick(o, F.loadId)),
    date: str(pick(o, F.loadDate)),
    supplierId: str(pick(o, F.supplierId)),
    supplierName: str(pick(o, F.supplierName)),
    depotName: str(pick(o, F.depotName)),
    documentNum: str(pick(o, F.documentNum)),
    total: explicitTotal || rows.reduce((s, r) => s + r.total, 0),
    rows,
  };
}

export function normalizeSupplier(o: AnyObj): Supplier {
  return {
    id: str(pick(o, ["supplier_id", "id"])),
    name: str(pick(o, ["supplier_name", "name"])),
  };
}

/* ─── High-level fetchers ────────────────────────────────────────────── */

export async function getSuppliers(): Promise<Supplier[]> {
  const raw = await barsyCall("Suppliers_getlist", { filters: {}, start: 0, length: 1000 });
  return unwrapList(raw).map(normalizeSupplier).filter((s) => s.id || s.name);
}

export interface LoadListFilters {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  supplierId?: string;
}

export async function getStoreLoads(f: LoadListFilters): Promise<StoreLoad[]> {
  const filters: AnyObj = {};
  if (f.from) filters.date_from = `${f.from} 00:00:00`;
  if (f.to) filters.date_to = `${f.to} 23:59:59`;
  if (f.supplierId) filters.supplier_id = f.supplierId;

  const all: AnyObj[] = [];
  const PAGE = 500;
  for (let start = 0; start < 10000; start += PAGE) {
    const raw = await barsyCall("Storeloads_getlist", { filters, start, length: PAGE });
    const page = unwrapList(raw);
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all.map(normalizeLoad);
}

export async function getStoreLoad(id: string): Promise<StoreLoad> {
  const raw = await barsyCall("Storeloads_get", { storeload_id: id, id });
  const obj = Array.isArray(raw) ? (raw[0] as AnyObj) : (raw as AnyObj);
  // Some installs wrap the object in {data: {...}}
  const inner = obj && typeof obj === "object" && !Array.isArray(obj) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
    ? (obj.data as AnyObj)
    : obj;
  return normalizeLoad(inner ?? {});
}

/** Fetch details for many loads with bounded concurrency. */
export async function getLoadsWithRows(loads: StoreLoad[], concurrency = 5): Promise<StoreLoad[]> {
  const out: StoreLoad[] = new Array(loads.length);
  let idx = 0;
  async function worker() {
    while (idx < loads.length) {
      const i = idx++;
      const l = loads[i];
      if (l.rows.length > 0 || !l.id) {
        out[i] = l;
        continue;
      }
      try {
        const detail = await getStoreLoad(l.id);
        // Keep header fields from the list when the detail lacks them
        out[i] = {
          ...l,
          rows: detail.rows,
          total: detail.total || l.total,
          supplierName: l.supplierName || detail.supplierName,
          supplierId: l.supplierId || detail.supplierId,
        };
      } catch {
        out[i] = l; // keep header-only on failure
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, loads.length) }, worker));
  return out;
}
