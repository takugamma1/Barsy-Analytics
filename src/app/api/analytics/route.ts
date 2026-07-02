import { NextRequest, NextResponse } from "next/server";
import { BarsyError, getLoadDetailRows, LoadDetailRow } from "@/lib/barsy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ArticleAgg {
  articleId: string;
  articleName: string;
  unit: string;
  quantity: number;
  total: number;
  totalTax: number;
  avgPrice: number;
  lastPrice: number;
  lastDate: string;
}

interface LoadAgg {
  id: number;
  date: string;
  docDate: string;
  docNum: string;
  total: number;
  totalTax: number;
  rows: LoadDetailRow[];
}

interface SupplierAgg {
  supplierId: string;
  supplierName: string;
  loadCount: number;
  total: number;
  totalTax: number;
  articles: ArticleAgg[];
  loads: LoadAgg[];
}

// Repeated dashboard hits within 5 min reuse the same Barsy sweep
const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || defaultFrom();
  const to = searchParams.get("to") || today();
  const supplierId = searchParams.get("supplier") || "";

  const key = `${from}|${to}|${supplierId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { "x-cache": "hit" } });
  }

  try {
    let rows = await getLoadDetailRows({ from, to });
    if (supplierId) rows = rows.filter((r) => r.supplierId === supplierId);

    const bySupplier = new Map<string, SupplierAgg>();
    for (const r of rows) {
      const sKey = r.supplierId || r.supplierName || "—";
      let s = bySupplier.get(sKey);
      if (!s) {
        s = {
          supplierId: r.supplierId,
          supplierName: r.supplierName || "Без доставчик",
          loadCount: 0,
          total: 0,
          totalTax: 0,
          articles: [],
          loads: [],
        };
        bySupplier.set(sKey, s);
      }
      s.total += r.total;
      s.totalTax += r.totalTax;

      // Load bucket (one зареждане = one store_load_id)
      let load = s.loads.find((l) => l.id === r.storeLoadId);
      if (!load) {
        load = { id: r.storeLoadId, date: r.date, docDate: r.docDate, docNum: r.docNum, total: 0, totalTax: 0, rows: [] };
        s.loads.push(load);
        s.loadCount += 1;
      }
      load.total += r.total;
      load.totalTax += r.totalTax;
      load.rows.push(r);

      // Article aggregate across the supplier's loads
      const aKey = r.articleId || r.articleName;
      let a = s.articles.find((x) => (x.articleId || x.articleName) === aKey);
      if (!a) {
        a = {
          articleId: r.articleId,
          articleName: r.articleName,
          unit: r.unit,
          quantity: 0,
          total: 0,
          totalTax: 0,
          avgPrice: 0,
          lastPrice: 0,
          lastDate: "",
        };
        s.articles.push(a);
      }
      a.quantity += r.quantity;
      a.total += r.total;
      a.totalTax += r.totalTax;
      if (r.date >= a.lastDate) {
        a.lastDate = r.date;
        a.lastPrice = r.unitPrice;
      }
    }

    const suppliers = [...bySupplier.values()]
      .map((s) => ({
        ...s,
        total: round2(s.total),
        totalTax: round2(s.totalTax),
        articles: s.articles
          .map((a) => ({
            ...a,
            total: round2(a.total),
            totalTax: round2(a.totalTax),
            avgPrice: a.quantity ? round2(a.total / a.quantity) : 0,
          }))
          .sort((x, y) => y.total - x.total),
        loads: s.loads
          .map((l) => ({ ...l, total: round2(l.total), totalTax: round2(l.totalTax) }))
          .sort((x, y) => (x.date < y.date ? 1 : -1)),
      }))
      .sort((x, y) => y.total - x.total);

    const payload = {
      from,
      to,
      currency: "EUR",
      totals: {
        loadCount: new Set(rows.map((r) => r.storeLoadId)).size,
        supplierCount: suppliers.length,
        articleRowCount: rows.length,
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
        totalTax: round2(rows.reduce((s, r) => s + r.totalTax, 0)),
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
