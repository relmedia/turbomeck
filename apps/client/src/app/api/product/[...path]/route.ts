import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@repo/auth";
import { LOCALE_COOKIE_NAME } from "@/i18n/context";
import {
  internalProductApiAuthHeaders,
  requireInternalProductApiSecret,
} from "@/lib/internal-product-api";

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

/** Storefront may only mutate catalog via admin; checkout uses these paths. */
function assertStorefrontMutationAllowed(
  method: string,
  pathStr: string,
): NextResponse | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }
  const ok =
    (method === "POST" && pathStr === "orders") ||
    (method === "PATCH" && /^orders\/\d+\/balance-paid$/.test(pathStr));
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "Forbidden: catalog changes must go through the admin app’s API (/api/product on the admin host), not the storefront.",
      },
      { status: 403 },
    );
  }
  return null;
}

function withInternalAuth(init: RequestInit = {}): RequestInit {
  const headers = internalProductApiAuthHeaders();
  const h = new Headers(init.headers);
  h.set("Authorization", headers.Authorization);
  return { ...init, headers: h };
}

/**
 * Checkout must attach the signed-in user on the server so orders show up under /account
 * (client-sent userId can be missing — e.g. Stripe return + sessionStorage snapshot, or session still loading).
 * Guests: strip any spoofed userId.
 */
async function applySessionUserIdToCheckoutBody(pathStr: string, body: string): Promise<string> {
  if (pathStr !== "orders" || !body.trim()) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const session = await auth();
    if (session?.user?.id) {
      parsed.userId = session.user.id;
    } else {
      delete parsed.userId;
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function parseUpstreamJson(text: string, pathStr: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error("Product proxy: invalid JSON from upstream", pathStr);
    return { error: "Invalid upstream response" };
  }
}

function misconfiguredResponse() {
  return NextResponse.json(
    {
      error:
        "Produkt-API är inte konfigurerat (INTERNAL_PRODUCT_API_SECRET). Kontakta administratören.",
    },
    { status: 503 },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const searchParams = new URLSearchParams(req.nextUrl.searchParams);
  const locale = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (locale === "en" || locale === "sv") {
    searchParams.set("locale", locale);
  }
  const search = searchParams.toString();
  const url = `${PRODUCT_SERVICE}/api/${pathStr}${search ? `?${search}` : ""}`;
  try {
    const res = await fetch(url, withInternalAuth({ cache: "no-store" }));
    const text = await res.text();
    const data = parseUpstreamJson(text, pathStr);
    // #region agent log
    if (process.env.NODE_ENV === "development") {
      try {
        const logPath = join(process.cwd(), "..", "..", "debug-e93869.log");
        const arrLen = Array.isArray(data) ? data.length : null;
        const errKey =
          data && typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : null;
        appendFileSync(
          logPath,
          `${JSON.stringify({
            sessionId: "e93869",
            hypothesisId: "H9",
            location: "api/product/[...path]/GET",
            message: "proxy upstream response",
            data: {
              pathStr,
              upstreamStatus: res.status,
              upstreamOk: res.ok,
              arrayLength: arrLen,
              errorField: errKey,
            },
            timestamp: Date.now(),
          })}\n`,
        );
      } catch {
        /* ignore */
      }
    }
    // #endregion
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy GET error:", err);
    if (process.env.NODE_ENV === "development") {
      try {
        const logPath = join(process.cwd(), "..", "..", "debug-e93869.log");
        appendFileSync(
          logPath,
          `${JSON.stringify({
            sessionId: "e93869",
            hypothesisId: "H9",
            location: "api/product/[...path]/GET",
            message: "proxy fetch threw",
            data: {
              pathStr,
              errorMessage: String((err as Error)?.message ?? err),
            },
            timestamp: Date.now(),
          })}\n`,
        );
      } catch {
        /* ignore */
      }
    }
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
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const forbidden = assertStorefrontMutationAllowed("POST", pathStr);
  if (forbidden) return forbidden;
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: FormData | string;
    if (contentType.includes("multipart/form-data")) {
      body = await req.formData();
    } else {
      body = await req.text();
    }
    let forwardBody: BodyInit | undefined = body || undefined;
    if (typeof body === "string" && pathStr === "orders") {
      forwardBody = await applySessionUserIdToCheckoutBody(pathStr, body);
    }
    const fetchInit: RequestInit = {
      method: "POST",
      body: forwardBody,
    };
    if (typeof body === "string") {
      fetchInit.headers = { "Content-Type": contentType || "application/json" };
    }
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth(fetchInit),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text, pathStr);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy POST error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const forbidden = assertStorefrontMutationAllowed("PATCH", pathStr);
  if (forbidden) return forbidden;
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
    const data = parseUpstreamJson(text, pathStr);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PATCH error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const forbidden = assertStorefrontMutationAllowed("PUT", pathStr);
  if (forbidden) return forbidden;
  try {
    const body = await req.text();
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth({
        method: "PUT",
        headers: {
          "Content-Type": req.headers.get("content-type") || "application/json",
        },
        body: body || undefined,
      }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text, pathStr);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PUT error:", err);
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
  try {
    requireInternalProductApiSecret();
  } catch {
    return misconfiguredResponse();
  }
  const { path } = await params;
  const pathStr = path.join("/");
  const forbidden = assertStorefrontMutationAllowed("DELETE", pathStr);
  if (forbidden) return forbidden;
  try {
    const res = await fetch(
      `${PRODUCT_SERVICE}/api/${pathStr}`,
      withInternalAuth({ method: "DELETE" }),
    );
    const text = await res.text();
    const data = parseUpstreamJson(text, pathStr);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy DELETE error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 },
    );
  }
}
