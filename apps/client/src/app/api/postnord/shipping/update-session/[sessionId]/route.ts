import { NextRequest, NextResponse } from "next/server";
import { buildPostNordSessionBody } from "@/lib/postnord-session-payload";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;

/**
 * PUT /api/postnord/shipping/update-session/[sessionId]
 * Updates a PostNord Shipping Module session when address/cart changes.
 * Forwards the per-session token from the client when present (PostNord prefers session token over apikey).
 */
export async function PUT(
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

  // SECURITY: require the per-session token; never fall back to the master
  // API_KEY (it can mutate any session by id). See `session/[sessionId]/route.ts`.
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized: missing PostNord session token" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const payload = buildPostNordSessionBody(body, "update");

    const res = await fetch(
      `${API_URL.replace(/\/+$/, "")}/update-session/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[PostNord update-session]", res.status, text);
      return NextResponse.json(
        { error: "Failed to update PostNord session", details: text },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PostNord update-session]", err);
    return NextResponse.json(
      { error: "Failed to update PostNord session" },
      { status: 500 }
    );
  }
}
