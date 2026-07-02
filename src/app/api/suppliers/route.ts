import { NextResponse } from "next/server";
import { BarsyError, getSuppliers } from "@/lib/barsy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const suppliers = await getSuppliers();
    return NextResponse.json({ suppliers });
  } catch (e) {
    if (e instanceof BarsyError) {
      return NextResponse.json({ error: e.message, barsyBody: e.body }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
