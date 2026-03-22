import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";

export default auth((_req) => {
  // No route protection - session is available for server components
  return NextResponse.next();
}) as unknown as NextMiddleware;

export const config = {
  matcher: [
    // Exclude /api/product/* (product-service proxy) — no auth needed; avoids extra session work / edge redirects
    "/((?!_next|api/product|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api\\/(?!product)|trpc)(.*)",
  ],
};
