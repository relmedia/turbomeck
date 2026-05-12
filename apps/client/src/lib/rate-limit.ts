import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal per-process, in-memory rate limiter for Next.js Route Handlers.
 *
 * SECURITY (audit M4): this is intentionally simple — it gives every Node
 * worker its own counter, so when the storefront is deployed behind multiple
 * instances each instance enforces the limit independently. That is fine for
 * the abuse patterns we care about (coupon enumeration, password reset spam,
 * etc.) but is not a substitute for a real distributed limiter (Redis/Upstash)
 * for stricter use cases. If we later need cluster-wide limits, swap the
 * `Map` for an Upstash-backed store and keep the same public surface.
 *
 * Keys default to the first hop in `x-forwarded-for`, falling back to
 * `x-real-ip` and finally to a literal "unknown" bucket (which intentionally
 * shares the limit between all unknown clients so it cannot be bypassed by
 * stripping headers).
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Periodic cleanup to avoid the map growing unbounded for sparse keys.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function clientIpFrom(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface RateLimitOptions {
  /** Distinct bucket name; used as a prefix so multiple limiters share the Map without collisions. */
  bucket: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests per window per key. */
  max: number;
  /** Optional custom key (defaults to client IP). */
  key?: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);
  const key = `${options.bucket}:${options.key ?? clientIpFrom(request)}`;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: options.max - 1, resetAt };
  }
  existing.count += 1;
  if (existing.count > options.max) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }
  return {
    ok: true,
    remaining: options.max - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Helper that returns a 429 response when the limit is exceeded, or `null`
 * when the request is allowed through.
 */
export function rateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): NextResponse | null {
  const result = checkRateLimit(request, options);
  if (result.ok) return null;
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests, please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
