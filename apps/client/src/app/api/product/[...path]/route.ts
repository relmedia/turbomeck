import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE_NAME } from "@/i18n/context";

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL || process.env.NEXT_PUBLIC_PRODUCT_API_URL || "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
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
    const res = await fetch(url, {
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    // #region agent log
    if (process.env.NODE_ENV === "development") {
      try {
        const logPath = join(process.cwd(), "..", "..", "debug-e93869.log");
        const arrLen = Array.isArray(data) ? data.length : null;
        const errKey =
          data && typeof data === "object" && "error" in data
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
    // #region agent log
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
    // #endregion
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten. Kontrollera att den körs på port 8000." },
      { status: 502 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
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
      (fetchInit as Record<string, unknown>).headers = { "Content-Type": contentType || "application/json" };
    }
    const res = await fetch(`${PRODUCT_SERVICE}/api/${pathStr}`, fetchInit);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy POST error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const body = await req.text();
    const res = await fetch(`${PRODUCT_SERVICE}/api/${pathStr}`, {
      method: "PATCH",
      headers: { "Content-Type": req.headers.get("content-type") || "application/json" },
      body: body || undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PATCH error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const body = await req.text();
    const res = await fetch(`${PRODUCT_SERVICE}/api/${pathStr}`, {
      method: "PUT",
      headers: { "Content-Type": req.headers.get("content-type") || "application/json" },
      body: body || undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy PUT error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  try {
    const res = await fetch(`${PRODUCT_SERVICE}/api/${pathStr}`, {
      method: "DELETE",
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy DELETE error:", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till produkt-tjänsten." },
      { status: 502 }
    );
  }
}
