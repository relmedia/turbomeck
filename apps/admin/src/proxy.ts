import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";

const isPublicRoute = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/logga-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/access-denied") ||
  pathname.startsWith("/api/auth");

const isAdminRoute = (pathname: string) =>
  pathname.startsWith("/studio") || pathname.startsWith("/api");

function isAdmin(userId: string, email: string | undefined, role: string | undefined): boolean {
  const allowlist = process.env.ADMIN_ALLOWLIST?.split(",").map((id) => id.trim()) ?? [];
  if (allowlist.includes(userId)) return true;
  if (email && allowlist.includes(email)) return true;
  return role === "admin";
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicRoute(pathname)) return;

  const session = req.auth;
  if (!session?.user) {
    return NextResponse.redirect(new URL("/logga-in", req.url));
  }

  if (isAdminRoute(pathname)) {
    const { id, email, role } = session.user;
    if (!id || !isAdmin(id, email ?? undefined, role)) {
      return NextResponse.redirect(new URL("/access-denied", req.url));
    }
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
