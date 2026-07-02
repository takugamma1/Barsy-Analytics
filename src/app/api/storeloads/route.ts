import { NextRequest, NextResponse } from "next/server";
import { BarsyError, getLoadDetailRows } from "@/lib/barsy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Raw normalized article rows (one row = article × зареждане) for the period. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const supplierId = searchParams.get("supplier") || "";
  try {
    let rows = await getLoadDetailRows({ from, to });
    if (supplierId) rows = rows.filter((r) => r.supplierId === supplierId);
    return NextResponse.json({ from, to, count: rows.length, rows });
  } catch (e) {
    if (e instanceof BarsyError) {
      return NextResponse.json({ error: e.message, barsyBody: e.body }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
