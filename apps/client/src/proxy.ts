import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";

/**
 * Next.js 16 uses `proxy.ts` as the edge entrypoint (not `middleware.ts`).
 * Keep account-related redirects here so legacy “change password” links never apply
 * after that UI was removed (magic link / OAuth only).
 */
export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname === "/account/password") {
    return NextResponse.redirect(new URL("/account", req.url));
  }

  if (pathname === "/account" && searchParams.get("section") === "password") {
    return NextResponse.redirect(new URL("/account", req.url));
  }

  const res = NextResponse.next();
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    res.headers.set("Cache-Control", "no-store, private, must-revalidate");
  }
  return res;
}) as unknown as NextMiddleware;

export const config = {
  matcher: [
    // Exclude /api/product/* (product-service proxy) — no auth needed; avoids extra session work / edge redirects
    "/((?!_next|api/product|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api\\/(?!product)|trpc)(.*)",
  ],
};
