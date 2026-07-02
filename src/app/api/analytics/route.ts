import { NextRequest, NextResponse } from "next/server";
import { BarsyError, getLoadsWithRows, getStoreLoads, LoadRow, StoreLoad } from "@/lib/barsy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ArticleAgg {
  articleId: string;
  articleName: string;
  quantity: number;
  total: number;
  avgPrice: number;
  lastPrice: number;
}

interface SupplierAgg {
  supplierId: string;
  supplierName: string;
  loadCount: number;
  total: number;
  articles: ArticleAgg[];
  loads: StoreLoad[];
}

// Cache: repeated dashboard hits within 5 min reuse the same Barsy sweep
const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || defaultFrom();
  const to = searchParams.get("to") || today();
  const supplierId = searchParams.get("supplier") || "";
  const withRows = searchParams.get("rows") !== "0";

  const key = `${from}|${to}|${supplierId}|${withRows}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { "x-cache": "hit" } });
  }

  try {
    let loads = await getStoreLoads({ from, to, supplierId: supplierId || undefined });
    // Filter client-side too, in case the install ignores the supplier_id filter
    if (supplierId) {
      loads = loads.filter((l) => !l.supplierId || l.supplierId === supplierId);
    }
    if (withRows) {
      loads = await getLoadsWithRows(loads);
    }

    const bySupplier = new Map<string, SupplierAgg>();
    for (const load of loads) {
      const k = load.supplierId || load.supplierName || "—";
      let agg = bySupplier.get(k);
      if (!agg) {
        agg = {
          supplierId: load.supplierId,
          supplierName: load.supplierName || "Без доставчик",
          loadCount: 0,
          total: 0,
          articles: [],
          loads: [],
        };
        bySupplier.set(k, agg);
      }
      agg.loadCount += 1;
      agg.total += load.total;
      agg.loads.push(load);
      mergeArticles(agg, load.rows);
    }

    const suppliers = [...bySupplier.values()]
      .map((s) => ({
        ...s,
        total: round2(s.total),
        articles: s.articles
          .map((a) => ({ ...a, total: round2(a.total), avgPrice: round2(a.quantity ? a.total / a.quantity : a.avgPrice) }))
          .sort((a, b) => b.total - a.total),
        loads: s.loads.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .sort((a, b) => b.total - a.total);

    const payload = {
      from,
      to,
      totals: {
        loadCount: loads.length,
        supplierCount: suppliers.length,
        total: round2(loads.reduce((s, l) => s + l.total, 0)),
      },
      suppliers,
    };
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload, { headers: { "x-cache": "miss" } });
  } catch (e) {
    if (e instanceof BarsyError) {
      return NextResponse.json({ error: e.message, barsyBody: e.body }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

function mergeArticles(agg: SupplierAgg, rows: LoadRow[]) {
  for (const r of rows) {
    const key = r.articleId || r.articleName;
    if (!key) continue;
    let a = agg.articles.find((x) => (x.articleId || x.articleName) === key);
    if (!a) {
      a = { articleId: r.articleId, articleName: r.articleName, quantity: 0, total: 0, avgPrice: 0, lastPrice: 0 };
      agg.articles.push(a);
    }
    a.quantity += r.quantity;
    a.total += r.total;
    a.lastPrice = r.unitPrice || a.lastPrice;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
