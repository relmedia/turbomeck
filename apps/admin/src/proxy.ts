import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";

const isPublicRoute = (pathname: string) =>
  pathname === "/" ||
  pathname === "/login" ||
  pathname === "/verify" ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/access-denied") ||
  pathname.startsWith("/api/auth");

/** Cron validates CRON_SECRET in-route; skip session gate. */
const isCronApiRoute = (pathname: string) => pathname.startsWith("/api/cron/");

function isAdmin(userId: string, email: string | undefined, role: string | undefined): boolean {
  const allowlist = process.env.ADMIN_ALLOWLIST?.split(",").map((id) => id.trim()) ?? [];
  if (allowlist.includes(userId)) return true;
  if (email && allowlist.includes(email)) return true;
  return role === "admin";
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicRoute(pathname)) return;
  if (isCronApiRoute(pathname)) return NextResponse.next();

  const session = req.auth;
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const { id, email, role } = session.user;
  if (!id || !isAdmin(id, email ?? undefined, role)) {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
