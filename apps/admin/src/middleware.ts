import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/access-denied"]);
const isAdminRoute = createRouteMatcher(["/studio(.*)", "/api(.*)"]);

function isAdmin(userId: string, sessionClaims: Record<string, unknown> | null): boolean {
  // Allowlist: comma-separated Clerk user IDs in env (e.g. ADMIN_ALLOWLIST=user_2abc,user_2xyz)
  const allowlist = process.env.ADMIN_ALLOWLIST?.split(",").map((id) => id.trim()) ?? [];
  if (allowlist.includes(userId)) return true;

  // publicMetadata.role: set role: "admin" on admin users in Clerk Dashboard → Users → [user] → Public metadata
  // JWT template: add "role": "{{user.public_metadata.role}}" (separate claim; full metadata can hit token size limit)
  const role =
    sessionClaims?.role ??
    (sessionClaims?.metadata as { role?: string })?.role ??
    (sessionClaims?.publicMetadata as { role?: string })?.role;
  return role === "admin";
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  await auth.protect({ unauthenticatedUrl: "/sign-in" });

  if (isAdminRoute(req)) {
    const { userId, sessionClaims } = await auth();
    if (!userId || !isAdmin(userId, sessionClaims as Record<string, unknown> | null)) {
      return NextResponse.redirect(new URL("/access-denied", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
