/**
 * SECURITY: single source of truth for "which IP is this request from".
 *
 * The previous implementations in this repo read the FIRST hop of
 * `x-forwarded-for`. That value is attacker-controlled: nginx *appends* to the
 * header (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`), so a
 * client sending `X-Forwarded-For: 1.2.3.4` produced `1.2.3.4, <real ip>` and
 * every rate limiter keyed on `1.2.3.4`. Rotating that one header defeated
 * sign-up limits, password-reset limits and the credentials brute-force
 * throttle alike.
 *
 * Trust order:
 *
 *   1. `x-real-ip` — our nginx sets this from `$remote_addr` on every proxy
 *      block (see `deploy/nginx-turbomeck.se.conf`), so it is the connecting
 *      peer and cannot be forged by the client.
 *   2. The LAST `TRUSTED_PROXY_HOPS` entries of `x-forwarded-for` — the hops
 *      our own proxies appended. With the default of 1 that is the final entry,
 *      which nginx wrote. Anything the client put in the header sits to the
 *      left of it and is ignored.
 *   3. The literal `"unknown"` bucket, deliberately shared by all header-less
 *      callers so stripping headers makes the limit stricter, not looser.
 *
 * Set `TRUSTED_PROXY_HOPS=2` if another proxy (Cloudflare, a load balancer) is
 * put in front of nginx, so the hop it appended is skipped too.
 */

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

function trustedProxyHops(): number {
  const raw = process.env["TRUSTED_PROXY_HOPS"];
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return parsed;
}

/** Minimal header bag, so this works with both `Headers` and Next's wrappers. */
type HeaderLike = { get(name: string): string | null };

export function clientIpFromHeaders(headers: HeaderLike | undefined): string {
  if (!headers) return "unknown";

  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // Count back from the end: the right-most entries were added by our own
      // proxies, the left-most by whoever called us.
      const index = Math.max(0, hops.length - trustedProxyHops());
      const chosen = hops[index];
      if (chosen) return chosen;
    }
  }

  return "unknown";
}
