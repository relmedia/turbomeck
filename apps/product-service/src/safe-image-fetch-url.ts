/**
 * SSRF mitigation for server-side image URL fetch (remove-background).
 */

function isPrivateOrReservedHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "0.0.0.0" ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 0) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    return false;
  }

  if (h.includes(":")) {
    const compact = h.replace(/^::ffff:/i, "");
    if (compact === "::1") return true;
    if (/^fe80:/i.test(compact)) return true;
    if (/^fc/i.test(compact) || /^fd/i.test(compact)) return true;
  }

  const lower = h.toLowerCase();
  if (
    lower.includes("metadata.google.internal") ||
    lower.endsWith(".metadata.google.internal")
  ) {
    return true;
  }

  return false;
}

function collectAllowedHosts(): Set<string> {
  const set = new Set<string>();
  const extra = process.env.ALLOWED_REMOVE_BG_FETCH_HOSTS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const p = part.trim().toLowerCase();
      if (p) set.add(p);
    }
  }
  const r2 = process.env.R2_PUBLIC_URL?.trim();
  if (r2) {
    try {
      set.add(new URL(r2).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return set;
}

const allowedHosts = collectAllowedHosts();

/**
 * @throws Error with message for API responses
 */
export function assertAllowedRemoveBackgroundUrl(urlString: string): URL {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  if (process.env.ALLOW_INSECURE_HTTP_REMOVE_BG !== "1" && u.protocol === "http:") {
    throw new Error("HTTPS is required for image URLs");
  }

  if (isPrivateOrReservedHostname(u.hostname)) {
    throw new Error("URL host is not allowed");
  }

  if (allowedHosts.size === 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      "Configure R2_PUBLIC_URL or ALLOWED_REMOVE_BG_FETCH_HOSTS for remove-background URLs",
    );
  }

  if (allowedHosts.size > 0) {
    const host = u.hostname.toLowerCase();
    if (!allowedHosts.has(host)) {
      throw new Error("URL host is not on the allowlist");
    }
  }

  return u;
}
