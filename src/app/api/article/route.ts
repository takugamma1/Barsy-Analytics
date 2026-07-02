import { NextRequest, NextResponse } from "next/server";
import { BarsyError, getLoadDetailRows } from "@/lib/barsy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Price history for one article: every purchase (зареждане ред) in the period,
 * plus monthly and yearly aggregates of the unit delivery price.
 */

interface PeriodAgg {
  period: string; // "2026-06" or "2026"
  purchases: number;
  quantity: number;
  total: number;
  totalTax: number;
  avgPrice: number; // weighted: total / quantity
  minPrice: number;
  maxPrice: number;
}

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "id (numeric article_id) is required" }, { status: 400 });
  }
  const from = searchParams.get("from") || "2024-01-01";
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);

  const key = `${id}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { "x-cache": "hit" } });
  }

  try {
    const rows = (await getLoadDetailRows({ from, to, articleId: id }))
      .filter((r) => r.articleId === id) // belt-and-braces on top of the server filter
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const purchases = rows.map((r) => ({
      date: r.date,
      docDate: r.docDate,
      docNum: r.docNum,
      storeLoadId: r.storeLoadId,
      supplierName: r.supplierName,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      unitPriceTax: r.unitPriceTax,
      total: round2(r.total),
      totalTax: round2(r.totalTax),
    }));

    const byMonth = aggregate(rows, (r) => r.docDate.slice(0, 7) || r.date.slice(0, 7));
    const byYear = aggregate(rows, (r) => r.docDate.slice(0, 4) || r.date.slice(0, 4));

    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const totalSum = rows.reduce((s, r) => s + r.total, 0);
    const prices = rows.map((r) => r.unitPrice).filter((p) => p > 0);

    const payload = {
      article: {
        id,
        name: rows[0]?.articleName || "",
        unit: rows[0]?.unit || "",
      },
      from,
      to,
      summary: {
        purchases: rows.length,
        quantity: round2(totalQty),
        total: round2(totalSum),
        totalTax: round2(rows.reduce((s, r) => s + r.totalTax, 0)),
        avgPrice: totalQty ? round4(totalSum / totalQty) : 0,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        lastPrice: rows.length ? rows[rows.length - 1].unitPrice : 0,
        lastDate: rows.length ? rows[rows.length - 1].date : "",
      },
      purchases,
      byMonth,
      byYear,
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

function aggregate<T extends { quantity: number; total: number; totalTax: number; unitPrice: number }>(
  rows: T[],
  keyFn: (r: T) => string
): PeriodAgg[] {
  const map = new Map<string, PeriodAgg>();
  for (const r of rows) {
    const k = keyFn(r);
    let a = map.get(k);
    if (!a) {
      a = { period: k, purchases: 0, quantity: 0, total: 0, totalTax: 0, avgPrice: 0, minPrice: Infinity, maxPrice: 0 };
      map.set(k, a);
    }
    a.purchases += 1;
    a.quantity += r.quantity;
    a.total += r.total;
    a.totalTax += r.totalTax;
    if (r.unitPrice > 0) {
      a.minPrice = Math.min(a.minPrice, r.unitPrice);
      a.maxPrice = Math.max(a.maxPrice, r.unitPrice);
    }
  }
  return [...map.values()]
    .map((a) => ({
      ...a,
      quantity: round2(a.quantity),
      total: round2(a.total),
      totalTax: round2(a.totalTax),
      avgPrice: a.quantity ? round4(a.total / a.quantity) : 0,
      minPrice: a.minPrice === Infinity ? 0 : a.minPrice,
    }))
    .sort((x, y) => (x.period < y.period ? 1 : -1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
