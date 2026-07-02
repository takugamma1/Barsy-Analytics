import { NextRequest, NextResponse } from "next/server";
import { BarsyError, getStoreLoads } from "@/lib/barsy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  try {
    const loads = await getStoreLoads({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      supplierId: searchParams.get("supplier") || undefined,
    });
    return NextResponse.json({ count: loads.length, loads });
  } catch (e) {
    if (e instanceof BarsyError) {
      return NextResponse.json({ error: e.message, barsyBody: e.body }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
