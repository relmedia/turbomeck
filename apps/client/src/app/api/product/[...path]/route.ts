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
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Product proxy GET error:", err);
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
