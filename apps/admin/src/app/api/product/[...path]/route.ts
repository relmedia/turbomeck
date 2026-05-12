import { NextRequest, NextResponse } from "next/server";
import {
  internalProductApiAuthHeaders,
  requireInternalProductApiSecret,
} from "@/lib/internal-product-api";
import { requireAdmin } from "@/lib/require-admin";

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

function withInternalAuth(init: RequestInit = {}): RequestInit {
  const auth = internalProductApiAuthHeaders();
  const h = new Headers(init.headers);
  h.set("Authorization", auth.Authorization);
  return { ...init, headers: h };
}

function parseUpstreamJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: "Invalid upstream response" };
  }
}

function misconfiguredResponse() {
  return NextResponse.json(
    {
      error:
        "INTERNAL_PRODUCT_API_SECRET saknas. Lägg till samma hemliga värde som i product-service.",
    },
    { status: 503 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth({ cache: "no-store" }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy GET error:", err);
    return NextResponse.json(
      {
        error:
          "Kunde inte ansluta till produkt-tjänsten. Kontrollera att den körs på port 8000.",
      },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const isUpload = pathStr.startsWith("upload");
  const isRemoveBackground = pathStr === "remove-background";
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: FormData | string;
    if (contentType.includes("multipart/form-data")) {
      body = await req.formData();
    } else {
      body = await req.text();
    }
    const fetchInit: RequestInit = {
      method: "POST",
      body: body || undefined,
    };
    if (typeof body === "string") {
      (fetchInit as Record<string, unknown>).headers = {
        "Content-Type": contentType || "application/json",
      };
    }
    if (isUpload || isRemoveBackground) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      (fetchInit as RequestInit).signal = controller.signal;
      const maxRetries = isRemoveBackground ? 2 : 0;
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const res = await fetch(
              `${PRODUCT_SERVICE}/api/${pathStr}`,
              withInternalAuth(fetchInit),
            );
            const text = await res.text();
            const data = parseUpstreamJson(text);
            return NextResponse.json(data, { status: res.status });
          } catch (e) {
            const isConnReset =
              (e as Error)?.cause &&
              String((e as Error).cause).includes("ECONNRESET");
            if (attempt < maxRetries && isConnReset) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth(fetchInit),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy POST error:", err);
    const msg =
      (err as Error)?.cause &&
      String((err as Error).cause).includes("ECONNRESET")
        ? "Anslutningen avbröts. Bildbehandling kan ta lång tid – försök igen eller kontrollera att product-service körs."
        : "Kunde inte ansluta till produkt-tjänsten.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const body = await req.text();
    const url = `${PRODUCT_SERVICE}/api/${pathStr}`;
    const res = await fetch(
      url,
      withInternalAuth({
        method: "PUT",
        headers: {
          "Content-Type": req.headers.get("content-type") || "application/json",
        },
        body: body || undefined,
      }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text) as { error?: string };
    if (!res.ok) {
      console.error(`Product PUT ${url} failed ${res.status}:`, data?.error ?? data);
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PUT error:", err);
    return NextResponse.json(
      {
        error:
          "Kunde inte ansluta till produkt-tjänsten. Kontrollera att den körs på port 8000.",
      },
      { status: 502 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const body = await req.text();
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth({
        method: "PATCH",
        headers: {
          "Content-Type": req.headers.get("content-type") || "application/json",
        },
        body: body || undefined,
      }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PATCH error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth({ method: "DELETE" }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy DELETE error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 },
    );
  }
}
