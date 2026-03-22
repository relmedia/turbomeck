import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

/** Dev-only: append one NDJSON line to monorepo `debug-e93869.log` (same-origin, no CORS). */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const body = await req.json();
    const logPath = join(process.cwd(), "..", "..", "debug-e93869.log");
    appendFileSync(
      logPath,
      `${JSON.stringify({ ...body, timestamp: Date.now() })}\n`,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
