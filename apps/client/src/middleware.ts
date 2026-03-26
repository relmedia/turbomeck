import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Password change was removed (magic link / OAuth only). Old bookmarks and cached
 * HTML may still link here — redirect so users never see a dead or legacy screen.
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/account/password") {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  if (pathname === "/account" && searchParams.get("section") === "password") {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account/password", "/account"],
};
