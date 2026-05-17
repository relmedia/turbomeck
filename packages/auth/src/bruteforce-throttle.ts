/**
 * SECURITY (audit M4): per-process in-memory throttle for the Credentials
 * sign-in path. The storefront's Route Handlers have a Next.js-flavored
 * limiter in `apps/client/src/lib/rate-limit.ts`, but the `Credentials.
 * authorize` callback runs inside `@repo/auth` where we don't have access to
 * `next/server` types and where both apps share the same code.
 *
 * Why per-IP only:
 *
 *   1. Keying on (email) would let an attacker lock real users out by
 *      pre-spamming their address.
 *   2. Keying on (IP + email) doesn't help — an attacker with one IP can
 *      still walk through millions of emails with one bcrypt.compare each.
 *      The bcrypt cost factor is what makes guessing infeasible; the
 *      throttle exists to cap CPU usage, not to gate guessing.
 *
 * Why in-memory and per-process:
 *
 *   Matches the rest of the repo's posture. Each Node worker enforces the
 *   limit independently; for the abuse patterns we care about (sustained
 *   bcrypt CPU load from one host) that is good enough. Swap to a shared
 *   store (Redis/Upstash) if we ever fan out to many workers.
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
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface CredentialsThrottleOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests per window per IP. */
  max: number;
  /** Distinct bucket name; lets us share the Map between throttles. */
  bucket: string;
}

/**
 * Returns `true` when the caller should be allowed through, `false` when the
 * limit has been exceeded. We intentionally do NOT throw — the caller still
 * needs to return `null` from `authorize` so NextAuth surfaces the canonical
 * "CredentialsSignin" error and we don't reveal whether the email exists.
 */
export function consumeCredentialsAttempt(
  request: Request | undefined,
  options: CredentialsThrottleOptions,
): boolean {
  const headers =
    request?.headers ?? (new Headers() as unknown as Headers);
  const ip = clientIpFromHeaders(headers as Headers);
  const now = Date.now();
  maybeCleanup(now);
  const key = `${options.bucket}:${ip}`;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }
  existing.count += 1;
  if (existing.count > options.max) {
    return false;
  }
  return true;
}
