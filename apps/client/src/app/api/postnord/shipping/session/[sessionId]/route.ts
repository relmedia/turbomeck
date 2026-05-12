import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;

/**
 * GET /api/postnord/shipping/session/[sessionId]
 * Fetches PostNord session to get selected shipping option and price.
 * Forwards session token from the client when present.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!API_URL || !API_KEY || !sessionId) {
    return NextResponse.json(
      { error: "PostNord Shipping Module not configured or missing session ID" },
      { status: 503 }
    );
  }

  // SECURITY: do NOT fall back to the master API_KEY here. The PostNord master
  // key can read any session by id, so falling back lets anyone who guesses a
  // sessionId read someone else's checkout PII. Per-session calls must carry
  // the session token returned by create-session.
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized: missing PostNord session token" },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(
      `${API_URL.replace(/\/+$/, "")}/get-session/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: { Authorization: auth },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Failed to fetch PostNord session", details: text },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PostNord get-session]", err);
    return NextResponse.json(
      { error: "Failed to fetch PostNord session" },
      { status: 500 }
    );
  }
}
