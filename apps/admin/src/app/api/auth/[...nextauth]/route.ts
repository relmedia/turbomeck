import { handlers } from "@repo/auth";
import type { NextRequest } from "next/server";
import { syncAuthPublicUrlFromRequest } from "@/lib/sync-auth-public-url";

export async function GET(req: NextRequest) {
  syncAuthPublicUrlFromRequest(req);
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  syncAuthPublicUrlFromRequest(req);
  return handlers.POST(req);
}
