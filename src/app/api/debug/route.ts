import { NextRequest, NextResponse } from "next/server";
import { barsyCall, BarsyError } from "@/lib/barsy";

export const dynamic = "force-dynamic";

/**
 * Raw Barsy probe — inspect actual response shapes of any read method.
 * Usage: /api/debug?method=Storeloads_getlist&params={"filters":{},"length":2}
 * Only *_getlist / *_get methods are allowed (read-only guard).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const method = searchParams.get("method") || "Storeloads_getlist";
  if (!/^[A-Za-z_]+_(getlist|get|getgrouplist)$/i.test(method)) {
    return NextResponse.json({ error: "Only read methods (*_get, *_getlist) are allowed" }, { status: 400 });
  }
  let params: Record<string, unknown> = { filters: {}, start: 0, length: 2 };
  const rawParams = searchParams.get("params");
  if (rawParams) {
    try {
      params = JSON.parse(rawParams);
    } catch {
      return NextResponse.json({ error: "params must be valid JSON" }, { status: 400 });
    }
  }
  try {
    const result = await barsyCall(method, params);
    return NextResponse.json({ method, params, result });
  } catch (e) {
    if (e instanceof BarsyError) {
      return NextResponse.json({ error: e.message, barsyBody: e.body }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
